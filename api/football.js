/**
 * PaceFetch Football API Gateway
 *
 * Providers:
 * 1. API-Football
 * 2. Sportmonks
 *
 * API keys MUST be stored in Vercel Environment Variables.
 */

export default async function handler(req, res) {

  // --------------------------------------------------
  // CORS
  // --------------------------------------------------

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );


  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }


  if (req.method !== "GET") {

    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });

  }


  // --------------------------------------------------
  // ENVIRONMENT VARIABLES
  // --------------------------------------------------

  const apiFootballKey =
    process.env.API_FOOTBALL_KEY;

  const sportmonksToken =
    process.env.SPORTMONKS_TOKEN;


  if (!apiFootballKey) {

    return res.status(500).json({
      success: false,
      error: "API_FOOTBALL_KEY is not configured"
    });

  }


  // --------------------------------------------------
  // REQUEST PARAMETERS
  // --------------------------------------------------

  const {
    action = "fixtures",
    date,
    league,
    team,
    fixture
  } = req.query;


  // --------------------------------------------------
  // API-FOOTBALL HELPER
  // --------------------------------------------------

  async function apiFootball(
    endpoint,
    params = {}
  ) {

    const url =
      new URL(
        `https://v3.football.api-sports.io/${endpoint}`
      );


    Object.entries(params).forEach(
      ([key, value]) => {

        if (
          value !== undefined &&
          value !== null &&
          value !== ""
        ) {

          url.searchParams.set(
            key,
            value
          );

        }

      }
    );


    const response =
      await fetch(url.toString(), {

        headers: {
          "x-apisports-key":
            apiFootballKey
        }

      });


    if (!response.ok) {

      throw new Error(
        `API-Football HTTP ${response.status}`
      );

    }


    return response.json();

  }


  // --------------------------------------------------
  // NORMALIZE FIXTURE
  // --------------------------------------------------

  function normalizeFixture(item) {

    return {

      id:
        item.fixture?.id ?? null,

      referee:
        item.fixture?.referee ?? null,

      timezone:
        item.fixture?.timezone ?? null,

      timestamp:
        item.fixture?.timestamp ?? null,

      date:
        item.fixture?.date ?? null,

      status:
        item.fixture?.status?.short ?? null,

      statusLong:
        item.fixture?.status?.long ?? null,

      elapsed:
        item.fixture?.status?.elapsed ?? null,


      league: {

        id:
          item.league?.id ?? null,

        name:
          item.league?.name ?? null,

        country:
          item.league?.country ?? null,

        logo:
          item.league?.logo ?? null,

        season:
          item.league?.season ?? null,

        round:
          item.league?.round ?? null

      },


      home: {

        id:
          item.teams?.home?.id ?? null,

        name:
          item.teams?.home?.name ?? null,

        logo:
          item.teams?.home?.logo ?? null,

        winner:
          item.teams?.home?.winner ?? null

      },


      away: {

        id:
          item.teams?.away?.id ?? null,

        name:
          item.teams?.away?.name ?? null,

        logo:
          item.teams?.away?.logo ?? null,

        winner:
          item.teams?.away?.winner ?? null

      },


      goals: {

        home:
          item.goals?.home ?? null,

        away:
          item.goals?.away ?? null

      }

    };

  }


  try {

    // ==================================================
    // TODAY'S FIXTURES
    // ==================================================

    if (action === "fixtures") {

      const requestedDate =
        date ||
        new Date()
          .toISOString()
          .slice(0, 10);


      const data =
        await apiFootball(
          "fixtures",
          {
            date: requestedDate,
            league: league,
            team: team
          }
        );


      const fixtures =
        (data.response || [])
          .map(normalizeFixture);


      return res.status(200).json({

        success: true,

        provider:
          "api-football",

        date:
          requestedDate,

        count:
          fixtures.length,

        fixtures

      });

    }


    // ==================================================
    // SINGLE FIXTURE
    // ==================================================

    if (action === "fixture") {

      if (!fixture) {

        return res.status(400).json({

          success: false,

          error:
            "fixture parameter is required"

        });

      }


      const data =
        await apiFootball(
          "fixtures",
          {
            id: fixture
          }
        );


      const result =
        data.response?.[0];


      if (!result) {

        return res.status(404).json({

          success: false,

          error:
            "Fixture not found"

        });

      }


      return res.status(200).json({

        success: true,

        provider:
          "api-football",

        fixture:
          normalizeFixture(result)

      });

    }


    // ==================================================
    // TEAM STATISTICS
    // ==================================================

    if (action === "statistics") {

      if (!team || !league) {

        return res.status(400).json({

          success: false,

          error:
            "team and league parameters are required"

        });

      }


     
