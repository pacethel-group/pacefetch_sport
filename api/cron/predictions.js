// ============================================================
// PaceFetch - Daily Prediction Cron
// ============================================================

import {
    generateDailyPredictions
} from "../prediction-engine.js";


// ============================================================
// ENVIRONMENT
// ============================================================

const API_FOOTBALL_KEY =
    process.env.API_FOOTBALL_KEY;

const CRON_SECRET =
    process.env.CRON_SECRET || "";


// ============================================================
// API CONFIGURATION
// ============================================================

const API_FOOTBALL_BASE =
    "https://v3.football.api-sports.io";


// ============================================================
// FETCH HELPER
// ============================================================

async function fetchJson(url, options = {}) {

    const response = await fetch(
        url,
        {
            ...options,

            headers: {
                Accept: "application/json",

                ...(options.headers || {})
            }
        }
    );


    const text =
        await response.text();


    let data;

    try {

        data =
            text
                ? JSON.parse(text)
                : null;

    } catch {

        throw new Error(
            `Invalid JSON response. HTTP ${response.status}`
        );

    }


    if (!response.ok) {

        throw new Error(
            data?.message ||
            `Provider returned HTTP ${response.status}`
        );

    }


    return data;

}


// ============================================================
// API-FOOTBALL
// ============================================================

async function apiFootball(
    endpoint,
    params = {}
) {

    if (!API_FOOTBALL_KEY) {

        throw new Error(
            "API_FOOTBALL_KEY is missing."
        );

    }


    const url =
        new URL(
            `${API_FOOTBALL_BASE}${endpoint}`
        );


    Object.entries(params)
        .forEach(
            ([key, value]) => {

                if (
                    value !== undefined &&
                    value !== null &&
                    value !== ""
                ) {

                    url.searchParams.set(
                        key,
                        String(value)
                    );

                }

            }
        );


    return fetchJson(
        url.toString(),
        {
            headers: {
                "x-apisports-key":
                    API_FOOTBALL_KEY
            }
        }
    );

}


// ============================================================
// NIGERIA DATE
// ============================================================

function getNigeriaDate() {

    return new Intl.DateTimeFormat(
        "en-CA",
        {
            timeZone: "Africa/Lagos",

            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }
    ).format(
        new Date()
    );

}


// ============================================================
// FIXTURE NORMALIZER
// ============================================================

function normalizeFixture(
    fixture
) {

    const fixtureData =
        fixture.fixture || {};

    const teams =
        fixture.teams || {};

    const league =
        fixture.league || {};


    return {

        fixtureId:
            fixtureData.id,

        date:
            fixtureData.date,

        timestamp:
            fixtureData.timestamp,

        status:
            fixtureData.status?.short ||
            "NS",


        homeTeam: {

            id:
                teams.home?.id,

            name:
                teams.home?.name ||
                "Unknown",

            logo:
                teams.home?.logo ||
                null

        },


        awayTeam: {

            id:
                teams.away?.id,

            name:
                teams.away?.name ||
                "Unknown",

            logo:
                teams.away?.logo ||
                null

        },


        league: {

            id:
                league.id,

            name:
                league.name ||
                "Unknown",

            country:
                league.country ||
                "",

            season:
                league.season

        }

    };

}


// ============================================================
// GET TODAY'S FIXTURES
// ============================================================

async function getFixtures(
    date
) {

    const data =
        await apiFootball(
            "/fixtures",
            {
                date
            }
        );


    const fixtures =
        Array.isArray(
            data?.response
        )
            ? data.response
            : [];


    return fixtures
        .filter(
            fixture => {

                const status =
                    fixture
                        ?.fixture
                        ?.status
                        ?.short;

                return [
                    "NS",
                    "TBD"
                ].includes(
                    status
                );

            }
        )
        .map(
            normalizeFixture
        )
        .filter(
            fixture =>
                fixture.fixtureId &&
                fixture.homeTeam.id &&
                fixture.awayTeam.id
        );

}


// ============================================================
// GET PROVIDER PREDICTION
// ============================================================

async function getProviderPrediction(
    fixtureId
) {

    const data =
        await apiFootball(
            "/predictions",
            {
                fixture:
                    fixtureId
            }
        );


    const prediction =
        data
            ?.response
            ?.[0]
            ?.predictions;


    if (!prediction) {

        return null;

    }


    return {

        home:
            prediction.percent?.home ||
            null,

        draw:
            prediction.percent?.draw ||
            null,

        away:
            prediction.percent?.away ||
            null,

        winner:
            prediction.winner ||
            null,

        advice:
            prediction.advice ||
            null,

        underOver:
            prediction.under_over ||
            null,

        goals:
            prediction.goals ||
            null

    };

}


// ============================================================
// GET TEAM STATISTICS
// ============================================================

async function getTeamStatistics(
    teamId,
    leagueId,
    season
) {

    if (
        !teamId ||
        !leagueId ||
        !season
    ) {

        return null;

    }


    const data =
        await apiFootball(
            "/teams/statistics",
            {
                team:
                    teamId,

                league:
                    leagueId,

                season
            }
        );


    return data?.response || null;

}


// ============================================================
// EXTRACT GOAL AVERAGES
// ============================================================

function extractGoals(
    statistics
) {

    if (!statistics) {

        return null;

    }


    const goals =
        statistics.goals || {};


    const forGoals =
        goals.for || {};

    const againstGoals =
        goals.against || {};


    const homeFor =
        Number(
            forGoals.total?.home
        );

    const awayFor =
        Number(
            forGoals.total?.away
        );

    const homeAgainst =
        Number(
            againstGoals.total?.home
        );

    const awayAgainst =
        Number(
            againstGoals.total?.away
        );


    const homePlayed =
        Number(
            statistics.fixtures
                ?.played
                ?.home
        );

    const awayPlayed =
        Number(
            statistics.fixtures
                ?.played
                ?.away
        );


    return {

        homeGoalsFor:
            Number.isFinite(
                homeFor
            ) &&
            homePlayed > 0
                ? homeFor / homePlayed
                : null,

        homeGoalsAgainst:
            Number.isFinite(
                homeAgainst
            ) &&
            homePlayed > 0
                ? homeAgainst / homePlayed
                : null,

        awayGoalsFor:
            Number.isFinite(
                awayFor
            ) &&
            awayPlayed > 0
                ? awayFor / awayPlayed
                : null,

        awayGoalsAgainst:
            Number.isFinite(
                awayAgainst
            ) &&
            awayPlayed > 0
                ? awayAgainst / awayPlayed
                : null

    };

}


// ============================================================
// GET REAL TEAM DATA
// ============================================================

async function getTeamData(
    fixture
) {

    const leagueId =
        fixture.league.id;

    const season =
        fixture.league.season;


    if (
        !leagueId ||
        !season
    ) {

        return null;

    }


    const [
        homeStats,
        awayStats
    ] = await Promise.all([

        getTeamStatistics(
            fixture.homeTeam.id,
            leagueId,
            season
        ),

        getTeamStatistics(
            fixture.awayTeam.id,
            leagueId,
            season
        )

    ]);


    const homeGoals =
        extractGoals(
            homeStats
        );

    const awayGoals =
        extractGoals(
            awayStats
        );


    if (
        !homeGoals ||
        !awayGoals
    ) {

        return null;

    }


    const valid =
        Number.isFinite(
            homeGoals.homeGoalsFor
        ) &&
        Number.isFinite(
            homeGoals.homeGoalsAgainst
        ) &&
        Number.isFinite(
            awayGoals.awayGoalsFor
        ) &&
        Number.isFinite(
            awayGoals.awayGoalsAgainst
        );


    if (!valid) {

        return null;

    }


    return {

        available: true,

        homeGoalsFor:
            homeGoals.homeGoalsFor,

        homeGoalsAgainst:
            homeGoals.homeGoalsAgainst,

        awayGoalsFor:
            awayGoals.awayGoalsFor,

        awayGoalsAgainst:
            awayGoals.awayGoalsAgainst

    };

}


// ============================================================
// ENRICH FIXTURE
// ============================================================

async function enrichFixture(
    fixture
) {

    const [
        providerPrediction,
        teamStats
    ] = await Promise.all([

        getProviderPrediction(
            fixture.fixtureId
        ),

        getTeamData(
            fixture
        )

    ]);


    return {

        ...fixture,

        providerPrediction,

        teamStats

    };

}


// ============================================================
// BUILD PREDICTIONS
// ============================================================

async function buildPredictions(
    date
) {

    console.log(
        `[PaceFetch] Starting daily generation for ${date}`
    );


    const fixtures =
        await getFixtures(
            date
        );


    console.log(
        `[PaceFetch] Found ${fixtures.length} upcoming fixtures`
    );


    if (!fixtures.length) {

        return {

            date,

            fixtures: 0,

            enriched: 0,

            predictions: []

        };

    }


    const enriched = [];


    // --------------------------------------------------------
    // Process sequentially to avoid hammering provider limits.
    // --------------------------------------------------------

    for (
        const fixture of fixtures
    ) {

        try {

            console.log(
                `[PaceFetch] Processing fixture ${fixture.fixtureId}: ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`
            );


            const result =
                await enrichFixture(
                    fixture
                );


            enriched.push(
                result
            );

        } catch (error) {

            console.error(
                `[PaceFetch] Fixture ${fixture.fixtureId} failed:`,
                error.message
            );

        }

    }


    // --------------------------------------------------------
    // Only real-statistics fixtures
    // --------------------------------------------------------

    const usableFixtures =
        enriched.filter(
            fixture =>
                fixture.teamStats?.available
        );


    console.log(
        `[PaceFetch] ${usableFixtures.length} fixtures have usable statistics`
    );


    // --------------------------------------------------------
    // Generate predictions
    // --------------------------------------------------------

    const predictions =
        generateDailyPredictions(
            usableFixtures,
            50
        );


    // --------------------------------------------------------
    // Maximum 50
    // --------------------------------------------------------

    const published =
        Array.isArray(predictions)
            ? predictions.slice(
                0,
                50
            )
            : [];


    console.log(
        `[PaceFetch] Generated ${published.length} predictions`
    );


    return {

        date,

        fixtures:
            fixtures.length,

        enriched:
            enriched.length,

        usable:
            usableFixtures.length,

        predictions:
            published

    };

}


// ============================================================
// CRON AUTHENTICATION
// ============================================================

function isAuthorized(
    req
) {

    // If no CRON_SECRET is configured,
    // reject the request rather than
    // exposing the generation endpoint.

    if (!CRON_SECRET) {

        return false;

    }


    const authorization =
        req.headers.authorization ||
        "";


    return (
        authorization ===
        `Bearer ${CRON_SECRET}`
    );

}


// ============================================================
// CORS
// ============================================================

function setHeaders(
    res
) {

    res.setHeader(
        "Cache-Control",
        "no-store"
    );

}


// ============================================================
// CRON HANDLER
// ============================================================

export default async function handler(
    req,
    res
) {

    setHeaders(
        res
    );


    // --------------------------------------------------------
    // GET ONLY
    // --------------------------------------------------------

    if (
        req.method !== "GET"
    ) {

        return res
            .status(405)
            .json({

                success: false,

                error:
                    "Method not allowed."

            });

    }


    // --------------------------------------------------------
    // CRON AUTH
    // --------------------------------------------------------

    if (
        !isAuthorized(req)
    ) {

        return res
            .status(401)
            .json({

                success: false,

                error:
                    "Unauthorized cron request."

            });

    }


    // --------------------------------------------------------
    // API KEY
    // --------------------------------------------------------

    if (!API_FOOTBALL_KEY) {

        console.error(
            "[PaceFetch] API_FOOTBALL_KEY missing."
        );


        return res
            .status(500)
            .json({

                success: false,

                error:
                    "API_FOOTBALL_KEY is not configured."

            });

    }


    try {

        const date =
            getNigeriaDate();


        const result =
            await buildPredictions(
                date
            );


        console.log(
            "[PaceFetch] Daily generation completed.",
            {
                date,
                fixtures:
                    result.fixtures,
                enriched:
                    result.enriched,
                usable:
                    result.usable,
                predictions:
                    result.predictions.length
            }
        );


        return res
            .status(200)
            .json({

                success: true,

                message:
                    "Daily predictions generated successfully.",

                date,

                fixtures:
                    result.fixtures,

                enriched:
                    result.enriched,

                usable:
                    result.usable,

                published:
                    result.predictions.length,

                maximumPublished:
                    50,

                predictions:
                    result.predictions

            });

    } catch (error) {

        console.error(
            "[PaceFetch] CRON ERROR:",
            error
        );


        return res
            .status(500)
            .json({

                success: false,

                error:
                    error?.message ||
                    "Daily prediction generation failed."

            });

    }

}
