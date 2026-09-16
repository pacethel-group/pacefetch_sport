// api/predictions.js
// PaceFetch production prediction endpoint.
// Adds pre-match bookmaker odds while preserving the existing API-Football flow.

const { generateDailyPredictions } = require("./prediction-engine");

const API_URL = "https://v3.football.api-sports.io";

function getNigeriaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}

async function apiFootball(path) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY is not configured.");

  const response = await fetch(`${API_URL}${path}`, {
    headers: { "x-apisports-key": key }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) throw new Error(`API-Football HTTP ${response.status}`);
  if (data.errors && Object.keys(data.errors).length) {
    throw new Error(JSON.stringify(data.errors));
  }
  return data;
}

function normalizeFixture(item) {
  const fixture = item.fixture || {};
  const teams = item.teams || {};
  const league = item.league || {};

  return {
    id: fixture.id,
    fixtureId: fixture.id,
    homeTeam: teams.home?.name || "Home",
    awayTeam: teams.away?.name || "Away",
    kickoff: fixture.date || null,
    status: fixture.status?.short || "NS",
    league: league.name || "Unknown League",
    country: league.country || "Unknown",
    leagueId: league.id || null,
    season: league.season || null
  };
}

function isUpcoming(fixture) {
  if (!fixture.kickoff) return false;

  const finished = ["FT","AET","PEN","CANC","PST","ABD","AWD","WO"];
  if (finished.includes(String(fixture.status).toUpperCase())) return false;

  return new Date(fixture.kickoff).getTime() > Date.now();
}

function parsePercentage(value) {
  if (typeof value === "string") value = value.replace("%", "").trim();
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}

function normalizePrediction(data) {
  const response = Array.isArray(data.response) ? data.response[0] : data.response;
  if (!response) return null;

  const predictions = response.predictions || {};
  const percent = predictions.percent || {};

  const home = parsePercentage(percent.home);
  const draw = parsePercentage(percent.draw);
  const away = parsePercentage(percent.away);

  return {
    home,
    draw,
    away,
    winner: predictions.winner || null,
    advice: predictions.advice || null,
    underOver: predictions.under_over || null,
    goals: predictions.goals || null
  };
}

/*
 * API-Football odds shape:
 * response[].bookmakers[].bets[].values[]
 *
 * We select one bookmaker snapshot rather than mixing prices from
 * different bookmakers into one number. The bookmaker can be selected
 * with PACEFETCH_BOOKMAKER_ID; otherwise the first available bookmaker
 * is used.
 */
function normalizeOdds(data) {
  const rows = Array.isArray(data.response) ? data.response : [];
  if (!rows.length) return null;

  const configured = Number(process.env.PACEFETCH_BOOKMAKER_ID || 0);
  const bookmakers = rows.flatMap(row => Array.isArray(row.bookmakers) ? row.bookmakers : []);

  const bookmaker =
    (configured && bookmakers.find(b => Number(b.id) === configured)) ||
    bookmakers[0];

  if (!bookmaker) return null;

  const markets = [];
  for (const bet of bookmaker.bets || []) {
    const name = String(bet.name || "").trim();
    const values = Array.isArray(bet.values) ? bet.values : [];

    for (const value of values) {
      const odd = Number(value.odd);
      if (!Number.isFinite(odd) || odd <= 1) continue;

      markets.push({
        bookmakerId: bookmaker.id ?? null,
        bookmaker: bookmaker.name || "Unknown bookmaker",
        betId: bet.id ?? null,
        betName: name,
        selection: value.value || "",
        odd,
        handicap: value.handicap ?? null,
        updatedAt: data.response?.[0]?.update || null
      });
    }
  }

  return {
    bookmakerId: bookmaker.id ?? null,
    bookmaker: bookmaker.name || "Unknown bookmaker",
    markets
  };
}

async function getPrediction(fixtureId) {
  const data = await apiFootball(`/predictions?fixture=${fixtureId}`);
  return normalizePrediction(data);
}

async function getOdds(fixtureId) {
  const data = await apiFootball(`/odds?fixture=${fixtureId}`);
  return normalizeOdds(data);
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({ success:false, error:"Method not allowed." });
  }

  try {
    const date = getNigeriaDate();

    const fixtureData = await apiFootball(`/fixtures?date=${date}`);
    const fixtures = (fixtureData.response || [])
      .map(normalizeFixture)
      .filter(fixture => fixture.id);

    const upcoming = fixtures.filter(isUpcoming);
    const selected = upcoming.slice(0, 20);

    const engineFixtures = [];
    let oddsSuccesses = 0;

    /*
     * IMPORTANT:
     * We keep the existing 20-fixture ceiling. Each fixture can now make
     * one prediction request + one odds request. On API-Football Free,
     * the 100/day quota therefore matters.
     */
    for (const fixture of selected) {
      try {
        const [providerPrediction, odds] = await Promise.all([
          getPrediction(fixture.fixtureId),
          getOdds(fixture.fixtureId)
        ]);

        if (!providerPrediction) continue;
        if (odds) oddsSuccesses++;

        engineFixtures.push({
          ...fixture,
          providerPrediction,
          odds
        });
      } catch (error) {
        console.error(
          `PaceFetch fixture ${fixture.fixtureId} failed:`,
          error.message
        );
      }
    }

    const result = generateDailyPredictions(engineFixtures, 50);

    return res.status(200).json({
      success: true,
      source: "API-Football",
      date,
      generatedAt: new Date().toISOString(),
      summary: {
        totalFixtures: fixtures.length,
        upcomingFixtures: upcoming.length,
        fixturesProcessed: selected.length,
        providerSuccesses: engineFixtures.length,
        oddsSuccesses,
        generated: result.generated,
        usable: result.usable,
        rejected: result.rejected,
        published: result.published
      },
      predictions: result.predictions || [],
      message: result.published > 0
        ? "PaceFetch production predictions generated successfully."
        : "No qualifying predictions are available today. No predictions were manufactured."
    });
  } catch (error) {
    console.error("PaceFetch predictions:", error);

    return res.status(500).json({
      success: false,
      date: getNigeriaDate(),
      error: error.message,
      message: "PaceFetch could not generate today's predictions."
    });
  }
};
