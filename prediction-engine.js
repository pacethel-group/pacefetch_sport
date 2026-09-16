// api/prediction-engine.js
// PaceFetch market selection engine.
// This version preserves the existing generateDailyPredictions interface.
//
// IMPORTANT:
// API-Football's prediction endpoint supplies probability percentages for 1X2.
// It does NOT supply independent probability percentages for every bookmaker
// market. Therefore this engine does NOT invent probabilities for O1.5/O2.5/BTTS.
// Those markets are published only when a real probability is available.
// Odds are displayed separately and are never mislabeled as PaceFetch probability.

const MIN_PROBABILITY = 50;
const MAX_PUBLISHED = 50;

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function impliedProbability(odd) {
  const n = number(odd);
  if (!n || n <= 1) return null;
  return Math.round((100 / n) * 10) / 10;
}

function normalizeMarketName(name) {
  const s = String(name || "").toLowerCase();

  if (/match winner|1x2|fulltime result/.test(s)) return "Straight Win";
  if (/both teams to score|btts/.test(s)) return "BTTS";
  if (/over\\/under|total goals|goals over/.test(s)) return "Goals";
  if (/double chance/.test(s)) return "Double Chance";

  return String(name || "").trim();
}

function cleanSelection(selection, market) {
  const s = String(selection || "").trim();

  if (market === "Straight Win") {
    if (/home|1\b/i.test(s)) return "Home Win";
    if (/draw|x\b/i.test(s)) return "Draw";
    if (/away|2\b/i.test(s)) return "Away Win";
  }

  if (market === "BTTS") {
    if (/yes/i.test(s)) return "Yes";
    if (/no/i.test(s)) return "No";
  }

  return s;
}

function findOdds(odds, wantedMarket, wantedSelection) {
  const rows = odds?.markets || [];

  return rows.find(row => {
    const market = normalizeMarketName(row.betName);
    if (market !== wantedMarket) return false;

    const selection = cleanSelection(row.selection, market);
    return selection.toLowerCase() === wantedSelection.toLowerCase();
  }) || null;
}

function makePrediction(fixture, market, selection, probability, oddsRow, model) {
  const p = number(probability);
  if (p === null || p < MIN_PROBABILITY || p > 100) return null;

  const odd = oddsRow ? number(oddsRow.odd) : null;
  const implied = impliedProbability(odd);

  return {
    id: `${fixture.fixtureId}-${market}-${selection}`.replace(/\s+/g, "-").toLowerCase(),
    fixtureId: fixture.fixtureId,
    date: fixture.date || null,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    league: fixture.league,
    country: fixture.country,
    leagueId: fixture.leagueId,
    season: fixture.season,
    kickoff: fixture.kickoff,
    market,
    selection,
    probability: Math.round(p * 10) / 10,

    // Odds are separate from model probability.
    odds: odd,
    impliedProbability: implied,
    bookmaker: oddsRow?.bookmaker || null,
    bookmakerId: oddsRow?.bookmakerId || null,

    // Edge is informational only; null when odds are unavailable.
    edge: implied === null
      ? null
      : Math.round((p - implied) * 10) / 10,

    model: model || "API-Football",
    oddsAvailable: Boolean(odd)
  };
}

function buildCandidates(fixture) {
  const provider = fixture.providerPrediction;
  if (!provider) return [];

  const candidates = [];

  // API-Football provides independent 1X2 probabilities.
  const oneXTwo = [
    ["Home Win", provider.home],
    ["Draw", provider.draw],
    ["Away Win", provider.away]
  ];

  for (const [selection, probability] of oneXTwo) {
    if (number(probability) === null) continue;

    const oddsRow =
      findOdds(fixture.odds, "Straight Win", selection) ||
      findOdds(fixture.odds, "Match Winner", selection);

    candidates.push(
      makePrediction(
        fixture,
        "Straight Win",
        selection,
        probability,
        oddsRow,
        "API-Football"
      )
    );
  }

  /*
   * We deliberately do NOT turn odds into PaceFetch probabilities.
   * When an independent probability model for BTTS/O1.5/O2.5 is added,
   * these markets can be appended here without changing the frontend.
   *
   * provider.underOver may say "Over 2.5", but it has no probability
   * percentage in the current API-Football prediction response.
   */

  return candidates.filter(Boolean);
}

function generateDailyPredictions(fixtures, minimum = MIN_PROBABILITY) {
  const predictions = [];
  let generated = 0;
  let rejected = 0;

  for (const fixture of Array.isArray(fixtures) ? fixtures : []) {
    const candidates = buildCandidates(fixture);
    generated += candidates.length;

    for (const prediction of candidates) {
      if (prediction.probability < minimum) {
        rejected++;
        continue;
      }
      predictions.push(prediction);
    }
  }

  predictions.sort((a, b) => {
    if (b.probability !== a.probability) {
      return b.probability - a.probability;
    }
    return (b.edge ?? -Infinity) - (a.edge ?? -Infinity);
  });

  const published = predictions.slice(0, MAX_PUBLISHED);

  return {
    generated,
    usable: predictions.length,
    rejected,
    published: published.length,
    predictions: published
  };
}

module.exports = {
  generateDailyPredictions,
  impliedProbability,
  normalizeMarketName
};
