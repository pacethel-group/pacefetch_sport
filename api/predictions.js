// api/predictions.js
// PaceFetch - Safe Prediction Diagnostic Endpoint

export default async function handler(req, res) {
  // --------------------------------------------------
  // CORS
  // --------------------------------------------------
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  const API_KEY = process.env.API_FOOTBALL_KEY;

  // --------------------------------------------------
  // Check environment variable
  // --------------------------------------------------
  if (!API_KEY) {
    return res.status(500).json({
      success: false,
      stage: "environment",
      error: "API_FOOTBALL_KEY is missing"
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  const result = {
    success: false,
    date: today,
    stages: {},
    errors: []
  };

  // --------------------------------------------------
  // Helper
  // --------------------------------------------------
  async function apiFootball(endpoint) {
    const response = await fetch(
      "https://v3.football.api-sports.io" + endpoint,
      {
        method: "GET",
        headers: {
          "x-apisports-key": API_KEY
        }
      }
    );

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        "API-Football returned non-JSON response. HTTP " +
        response.status
      );
    }

    if (!response.ok) {
      throw new Error(
        "API-Football HTTP " +
        response.status +
        ": " +
        JSON.stringify(data.errors || data.message || data)
      );
    }

    if (data.errors && Object.keys(data.errors).length > 0) {
      throw new Error(
        "API-Football error: " +
        JSON.stringify(data.errors)
      );
    }

    return data;
  }

  // --------------------------------------------------
  // STAGE 1
  // Test API connection
  // --------------------------------------------------
  try {
    const test = await apiFootball(
      "/fixtures?date=" + encodeURIComponent(today)
    );

    result.stages.apiConnection = {
      success: true,
      status: test.response?.status || "fixtures",
      results: test.results || 0
    };
  } catch (error) {
    result.errors.push({
      stage: "apiConnection",
      error: error.message
    });

    return res.status(500).json(result);
  }

  // --------------------------------------------------
  // STAGE 2
  // Get today's fixtures
  // --------------------------------------------------
  let fixturesResponse;

  try {
    fixturesResponse = await apiFootball(
      "/fixtures?date=" + encodeURIComponent(today)
    );

    result.stages.fixtures = {
      success: true,
      count: fixturesResponse.results || 0
    };
  } catch (error) {
    result.errors.push({
      stage: "fixtures",
      error: error.message
    });

    return res.status(500).json(result);
  }

  const rawFixtures = Array.isArray(fixturesResponse.response)
    ? fixturesResponse.response
    : [];

  // --------------------------------------------------
  // STAGE 3
  // Filter upcoming fixtures
  // --------------------------------------------------

  const now = Date.now();

  const upcoming = rawFixtures.filter((fixture) => {
    const timestamp = fixture?.fixture?.timestamp;

    if (!timestamp) return false;

    const status = fixture?.fixture?.status?.short;

    const finishedStatuses = [
      "FT",
      "AET",
      "PEN",
      "CANC",
      "PST",
      "ABD",
      "AWD",
      "WO"
    ];

    if (finishedStatuses.includes(status)) {
      return false;
    }

    return timestamp * 1000 > now;
  });

  result.stages.upcomingFixtures = {
    success: true,
    count: upcoming.length
  };

  if (upcoming.length === 0) {
    return res.status(200).json({
      ...result,
      success: true,
      message: "No upcoming fixtures remaining today.",
      predictions: []
    });
  }

  // --------------------------------------------------
  // Only inspect a small number initially.
  //
  // This prevents the diagnostic endpoint from
  // consuming your API quota.
  // --------------------------------------------------

  const sample = upcoming.slice(0, 3);

  result.stages.sampleFixtures = sample.map((fixture) => ({
    fixtureId: fixture.fixture?.id,
    home: fixture.teams?.home?.name,
    away: fixture.teams?.away?.name,
    league: fixture.league?.name,
    country: fixture.league?.country,
    kickoff: fixture.fixture?.date,
    status: fixture.fixture?.status?.short
  }));

  // --------------------------------------------------
  // STAGE 4
  // Test provider predictions
  // --------------------------------------------------

  const providerTests = [];

  for (const fixture of sample) {
    const fixtureId = fixture.fixture?.id;

    if (!fixtureId) continue;

    try {
      const prediction = await apiFootball(
        "/predictions?fixture=" +
        encodeURIComponent(fixtureId)
      );

      providerTests.push({
        fixtureId,
        success: true,
        results: prediction.results || 0,
        hasResponse:
          Array.isArray(prediction.response) &&
          prediction.response.length > 0
      });
    } catch (error) {
      providerTests.push({
        fixtureId,
        success: false,
        error: error.message
      });
    }
  }

  result.stages.providerPredictions = providerTests;

  // --------------------------------------------------
  // STAGE 5
  // Test team statistics
  // --------------------------------------------------

  const statisticsTests = [];

  for (const fixture of sample) {
    const fixtureId = fixture.fixture?.id;
    const leagueId = fixture.league?.id;
    const season = fixture.league?.season;

    const homeId = fixture.teams?.home?.id;
    const awayId = fixture.teams?.away?.id;

    const teams = [
      {
        side: "home",
        teamId: homeId
      },
      {
        side: "away",
        teamId: awayId
      }
    ];

    for (const team of teams) {
      if (!team.teamId || !leagueId || !season) {
        statisticsTests.push({
          fixtureId,
          side: team.side,
          success: false,
          error: "Missing team, league or season ID"
        });

        continue;
      }

      try {
        const stats = await apiFootball(
          "/teams/statistics?league=" +
          encodeURIComponent(leagueId) +
          "&season=" +
          encodeURIComponent(season) +
          "&team=" +
          encodeURIComponent(team.teamId)
        );

        statisticsTests.push({
          fixtureId,
          side: team.side,
          teamId: team.teamId,
          success: true,
          results: stats.results || 0,
          hasResponse:
            !!stats.response
        });
      } catch (error) {
        statisticsTests.push({
          fixtureId,
          side: team.side,
          teamId: team.teamId,
          success: false,
          error: error.message
        });
      }
    }
  }

  result.stages.teamStatistics = statisticsTests;

  // --------------------------------------------------
  // FINAL DIAGNOSTIC RESULT
  // --------------------------------------------------

  result.success = true;

  result.message =
    "Diagnostic completed. The prediction endpoint itself is not crashing now because the heavy prediction engine has been isolated.";

  result.predictions = [];

  result.nextStep =
    "Send this entire JSON response back so the exact failing stage can be fixed.";

  return res.status(200).json(result);
}
