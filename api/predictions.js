// /api/predictions.js — PRODUCTION PaceFetch v1
// Real API: API-Football (api-sports.io)
// Env vars needed in Vercel: API_FOOTBALL_KEY
// Confidence formula per Terms: 60% probability + 15% dataQuality + 15% providerAgreement + 10% sampleQuality

export default async function handler(req, res) {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];
  const API_KEY = process.env.API_FOOTBALL_KEY || process.env.FOOTBALL_API_KEY || '';

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!API_KEY) {
    return res.status(200).json({
      success: false,
      date: targetDate,
      error: 'Missing API_FOOTBALL_KEY env var in Vercel. Add it: Vercel Dashboard → Settings → Environment Variables → API_FOOTBALL_KEY',
      predictions: [],
      production: false
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    // 1. Fetch fixtures for date
    const fixturesRes = await fetch(`https://v3.football.api-sports.io/fixtures?date=${targetDate}`, {
      headers: { 'x-apisports-key': API_KEY },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!fixturesRes.ok) {
      const txt = await fixturesRes.text();
      throw new Error(`Fixtures API ${fixturesRes.status}: ${txt.slice(0,200)}`);
    }
    const fixturesData = await fixturesRes.json();
    const fixtures = fixturesData.response || [];

    if (fixtures.length === 0) {
      return res.status(200).json({ success: true, date: targetDate, predictions: [], count: 0, source: 'api-football', message: 'No fixtures for date' });
    }

    // 2. For each fixture, get prediction + build markets
    const predictions = [];
    const slice = fixtures.slice(0, 40); // limit to 40 to avoid rate limit

    for (const fx of slice) {
      const fixtureId = fx.fixture?.id;
      const home = fx.teams?.home?.name || 'Home';
      const away = fx.teams?.away?.name || 'Away';
      const league = fx.league?.name || 'League';
      const country = fx.league?.country || 'World';
      const leagueId = fx.league?.id;

      try {
        // Fetch prediction for this fixture
        const predController = new AbortController();
        const predTimeout = setTimeout(() => predController.abort(), 5000);
        const predRes = await fetch(`https://v3.football.api-sports.io/predictions?fixture=${fixtureId}`, {
          headers: { 'x-apisports-key': API_KEY },
          signal: predController.signal
        });
        clearTimeout(predTimeout);

        let predJson = null;
        if (predRes.ok) {
          predJson = await predRes.json();
        }
        const pred = predJson?.response?.[0] || null;

        // Extract probabilities - API-Football gives winner percent
        const homeWinPct = parseInt(pred?.predictions?.winning_percent?.home?.replace('%','') || '33');
        const drawPct = parseInt(pred?.predictions?.winning_percent?.draws?.replace('%','') || '33');
        const awayWinPct = parseInt(pred?.predictions?.winning_percent?.away?.replace('%','') || '33');
        const btts = pred?.predictions?.both_teams_to_score || null;
        const underOver = pred?.predictions?.under_over || null;

        // Build dataQuality metrics per Terms
        const dataQuality = pred ? 85 : 60; // if we got prediction API, higher quality
        const providerAgreement = 75; // we have 1 provider for now, will increase with multi-provider
        const sampleQuality = Math.min(95, 60 + (fx.league?.id ? 20 : 0)); // top leagues = higher sample

        function confidenceFormula(prob, dq, pa, sq) {
          return Math.round((prob * 0.6 + dq * 0.15 + pa * 0.15 + sq * 0.1) * 10) / 10;
        }

        // Market 1: Match Winner
        if (homeWinPct >= 50) {
          const prob = homeWinPct;
          const conf = confidenceFormula(prob, dataQuality, providerAgreement, sampleQuality);
          if (conf >= 50) predictions.push({
            fixtureId, homeTeam: home, awayTeam: away, league, country, leagueId,
            market: '1X2', selection: 'Home', code: '1',
            probability: conf, baseProbability: prob,
            dataQuality, providerAgreement, sampleQuality,
            advice: pred?.predictions?.advice || `${home} win`,
            date: targetDate
          });
        }
        if (awayWinPct >= 50) {
          const prob = awayWinPct;
          const conf = confidenceFormula(prob, dataQuality, providerAgreement, sampleQuality);
          if (conf >= 50) predictions.push({
            fixtureId, homeTeam: home, awayTeam: away, league, country, leagueId,
            market: '1X2', selection: 'Away', code: '2',
            probability: conf, baseProbability: prob,
            dataQuality, providerAgreement, sampleQuality,
            advice: pred?.predictions?.advice || `${away} win`,
            date: targetDate
          });
        }

        // Market 2: BTTS
        if (btts) {
          // btts = {yes: "45%", no: "55%"}
          const yesPct = parseInt((btts.yes || '0%').replace('%',''));
          const noPct = parseInt((btts.no || '0%').replace('%',''));
          if (yesPct >= 55) {
            const conf = confidenceFormula(yesPct, dataQuality, providerAgreement, sampleQuality);
            if (conf >= 50) predictions.push({
              fixtureId, homeTeam: home, awayTeam: away, league, country, leagueId,
              market: 'BTTS', selection: 'Yes', code: 'GG',
              probability: conf, baseProbability: yesPct,
              dataQuality, providerAgreement, sampleQuality,
              advice: 'Both teams to score - Yes',
              date: targetDate
            });
          }
          if (noPct >= 60) {
            const conf = confidenceFormula(noPct, dataQuality, providerAgreement, sampleQuality);
            if (conf >= 50) predictions.push({
              fixtureId, homeTeam: home, awayTeam: away, league, country, leagueId,
              market: 'BTTS', selection: 'No', code: 'NG',
              probability: conf, baseProbability: noPct,
              dataQuality, providerAgreement, sampleQuality,
              advice: 'Both teams to score - No',
              date: targetDate
            });
          }
        }

        // Market 3: Over 2.5
        // API-Football predictions.goals - we approximate from under_over
        const goalsPred = pred?.predictions?.goals || null;
        if (goalsPred) {
          // If predicted goals > 2, Over 2.5 likely
          const overProb = goalsPred.home && goalsPred.away ? Math.min(90, Math.max(40, (Math.abs(parseFloat(goalsPred.home) + Math.abs(parseFloat(goalsPred.away))) * 18))) : 55;
          if (overProb >= 58) {
            const conf = confidenceFormula(overProb, dataQuality, providerAgreement, sampleQuality);
            if (conf >= 50) predictions.push({
              fixtureId, homeTeam: home, awayTeam: away, league, country, leagueId,
              market: 'Goals', selection: 'Over 2.5', code: 'OVER25',
              probability: conf, baseProbability: overProb,
              dataQuality, providerAgreement, sampleQuality,
              advice: pred?.predictions?.advice || 'Over 2.5',
              date: targetDate
            });
          }
        }

      } catch (inner) {
        // continue to next fixture
        continue;
      }
    }

    // Deduplicate, sort by probability desc, filter 50%+ already done
    const sorted = predictions.sort((a,b)=>b.probability - a.probability);

    // Save to history KV if available
    try {
      const { kv } = await import('@vercel/kv');
      await kv.set(`history:${targetDate}`, sorted);
      await kv.set(`predictions:${targetDate}`, sorted);
    } catch {}

    return res.status(200).json({
      success: true,
      date: targetDate,
      predictions: sorted,
      count: sorted.length,
      source: 'api-football-production',
      production: true,
      formula: '60% prob + 15% dataQuality + 15% providerAgreement + 10% sampleQuality',
      threshold: '50%+'
    });

  } catch (e) {
    clearTimeout(timeout);
    return res.status(500).json({
      success: false,
      date: targetDate,
      error: e.name === 'AbortError' ? 'API timeout after 8s' : e.message,
      predictions: [],
      production: false
    });
  }
}

