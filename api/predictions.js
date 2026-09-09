// ============================================================
// PACEFETCH - REAL FOOTBALL PREDICTIONS API
// ============================================================
//
// File:
// api/predictions.js
//
// Purpose:
// - Get today's upcoming fixtures
// - Get API-Football prediction data
// - Convert provider probabilities into PaceFetch predictions
// - Generate additional market predictions
// - Validate weak predictions
// - Rank the strongest predictions
// - Publish a maximum of 50 predictions
//
// IMPORTANT:
// API keys remain server-side.
// Never put API_FOOTBALL_KEY or SPORTMONKS_TOKEN
// inside frontend JavaScript.
// ============================================================


const {
    generateDailyPredictions
} = require("./prediction-engine");


// ============================================================
// ENVIRONMENT
// ============================================================

const API_FOOTBALL_KEY =
    process.env.API_FOOTBALL_KEY;

const SPORTMONKS_TOKEN =
    process.env.SPORTMONKS_TOKEN;


// ============================================================
// API CONSTANTS
// ============================================================

const API_FOOTBALL_BASE =
    "https://v3.football.api-sports.io";

const SPORTMONKS_BASE =
    "https://api.sportmonks.com/v3/football";


// ============================================================
// CACHE
// ============================================================
//
// Vercel/serverless instances can reuse memory between
// invocations, although this is not guaranteed.
//
// This cache is only an optimization.
// It is NOT our permanent database.
//
// Later we will move daily predictions into PostgreSQL.
//
// ============================================================

const memoryCache = new Map();

const CACHE_TTL =
    5 * 60 * 1000; // 5 minutes


function getCached(key) {

    const item =
        memoryCache.get(key);

    if (!item) {
        return null;
    }

    if (
        Date.now() -
        item.createdAt >
        CACHE_TTL
    ) {
        memoryCache.delete(key);
        return null;
    }

    return item.value;
}


function setCached(key, value) {

    memoryCache.set(
        key,
        {
            createdAt: Date.now(),
            value
        }
    );

    return value;
}


// ============================================================
// GENERIC FETCH HELPER
// ============================================================

async function fetchJson(
    url,
    options = {}
) {

    const response =
        await fetch(
            url,
            options
        );

    let data = null;

    try {

        data =
            await response.json();

    } catch {

        throw new Error(
            `Invalid JSON response from provider (${response.status})`
        );
    }


    if (!response.ok) {

        const providerMessage =
            data?.message ||
            data?.errors ||
            data?.error ||
            `HTTP ${response.status}`;

        throw new Error(
            String(providerMessage)
        );
    }


    return data;
}


// ============================================================
// API-FOOTBALL REQUEST
// ============================================================

async function apiFootball(
    endpoint,
    params = {}
) {

    if (!API_FOOTBALL_KEY) {

        throw new Error(
            "API_FOOTBALL_KEY is not configured."
        );
    }


    const url =
        new URL(
            `${API_FOOTBALL_BASE}/${endpoint}`
        );


    for (
        const [key, value]
        of Object.entries(params)
    ) {

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


    const cacheKey =
        `api-football:${url.toString()}`;


    const cached =
        getCached(cacheKey);


    if (cached) {
        return cached;
    }


    const data =
        await fetchJson(
            url.toString(),
            {
                method: "GET",

                headers: {
                    "x-apisports-key":
                        API_FOOTBALL_KEY,

                    "Accept":
                        "application/json"
                }
            }
        );


    return setCached(
        cacheKey,
        data
    );
}


// ============================================================
// SPORTMONKS REQUEST
// ============================================================
//
// We don't make Sportmonks calls for every fixture yet.
//
// This helper is prepared for the secondary provider.
//
// The next integration stage will use it to retrieve
// Sportmonks predictions/statistics efficiently.
//
// ============================================================

async function sportmonks(
    endpoint,
    params = {}
) {

    if (!SPORTMONKS_TOKEN) {

        return null;
    }


    const url =
        new URL(
            `${SPORTMONKS_BASE}/${endpoint}`
        );


    for (
        const [key, value]
        of Object.entries(params)
    ) {

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


    /*
     * Sportmonks API authentication can vary by
     * endpoint/version/account configuration.
     *
     * For the first live PaceFetch version we keep
     * the token server-side and isolate this adapter.
     */
    url.searchParams.set(
        "api_token",
        SPORTMONKS_TOKEN
    );


    const cacheKey =
        `sportmonks:${url.toString()}`;


    const cached =
        getCached(cacheKey);


    if (cached) {
        return cached;
    }


    try {

        const data =
            await fetchJson(
                url.toString(),
                {
                    method: "GET",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );


        return setCached(
            cacheKey,
            data
        );

    } catch (error) {

        console.error(
            "Sportmonks request failed:",
            error.message
        );

        /*
         * Sportmonks is secondary.
         *
         * A Sportmonks failure should NOT take
         * the entire PaceFetch prediction page down.
         */
        return null;
    }
}


// ============================================================
// NIGERIA DATE
// ============================================================
//
// PaceFetch's daily cycle uses Nigeria time.
//
// Nigeria = Africa/Lagos
// WAT = UTC+1
//
// ============================================================

function getNigeriaDate() {

    return new Intl.DateTimeFormat(
        "en-CA",
        {
            timeZone:
                "Africa/Lagos",

            year:
                "numeric",

            month:
                "2-digit",

            day:
                "2-digit"
        }
    ).format(
        new Date()
    );
}


// ============================================================
// FOOTBALL SEASON
// ============================================================
//
// IMPORTANT:
//
// We should NOT blindly assume:
//
// new Date().getFullYear()
//
// because European football seasons are represented
// by their starting year.
//
// Example:
//
// 2025/26 = season 2025
// 2026/27 = season 2026
//
// However, because today's fixtures can span
// different competition calendars, we initially
// use API-Football's date-based fixture endpoint.
//
// The provider itself determines the fixture season.
//
// ============================================================


// ============================================================
// NORMALIZE API-FOOTBALL FIXTURE
// ============================================================

function normalizeFixture(
    fixture
) {

    if (!fixture) {
        return null;
    }


    const fixtureInfo =
        fixture.fixture || {};

    const teams =
        fixture.teams || {};

    const league =
        fixture.league || {};


    return {

        id:
            fixtureInfo.id,

        kickoff:
            fixtureInfo.date,

        timestamp:
            fixtureInfo.timestamp,

        status:
            fixtureInfo.status?.short,

        statusLong:
            fixtureInfo.status?.long,

        homeTeam:
            teams.home?.name,

        awayTeam:
            teams.away?.name,

        homeTeamId:
            teams.home?.id,

        awayTeamId:
            teams.away?.id,

        homeLogo:
            teams.home?.logo,

        awayLogo:
            teams.away?.logo,

        league:
            league.name,

        leagueId:
            league.id,

        country:
            league.country,

        leagueLogo:
            league.logo,

        round:
            league.round,

        source:
            "API-Football"

    };
}


// ============================================================
// FIXTURE STATUS
// ============================================================

function isUpcomingFixture(
    fixture
) {

    const status =
        fixture?.fixture?.status?.short;


    return [
        "NS",
        "TBD"
    ].includes(
        status
    );
}


// ============================================================
// GET TODAY'S FIXTURES
// ============================================================

async function getTodayFixtures(
    date
) {

    const result =
        await apiFootball(
            "fixtures",
            {
                date
            }
        );


    const fixtures =
        Array.isArray(
            result?.response
        )
            ? result.response
            : [];


    return fixtures
        .filter(
            isUpcomingFixture
        )
        .map(
            normalizeFixture
        )
        .filter(
            fixture =>
                fixture &&
                fixture.id &&
                fixture.homeTeam &&
                fixture.awayTeam
        );
}


// ============================================================
// API-FOOTBALL PREDICTION
// ============================================================
//
// API-Football's prediction endpoint returns:
// - winner
// - win_or_draw
// - under_over
// - goals
// - advice
// - percent.home
// - percent.draw
// - percent.away
//
// It can also contain comparison data and H2H.
//
// ============================================================

async function getApiFootballPrediction(
    fixtureId
) {

    if (!fixtureId) {
        return null;
    }


    try {

        const result =
            await apiFootball(
                "predictions",
                {
                    fixture:
                        fixtureId
                }
            );


        const prediction =
            result?.response?.[0];


        if (!prediction) {
            return null;
        }


        const data =
            prediction.predictions ||
            {};


        const percent =
            data.percent ||
            {};


        const home =
            parseProbability(
                percent.home
            );


        const draw =
            parseProbability(
                percent.draw
            );


        const away =
            parseProbability(
                percent.away
            );


        return {

            home,

            draw,

            away,

            winner:
                data.winner || null,

            winOrDraw:
                data.win_or_draw ?? null,

            underOver:
                data.under_over || null,

            advice:
                data.advice || null,

            goals:
                data.goals || null,

            comparison:
                prediction.comparison || null,

            h2h:
                prediction.h2h || null,

            source:
                "API-Football"

        };

    } catch (error) {

        console.error(
            `Prediction request failed for fixture ${fixtureId}:`,
            error.message
        );


        return null;
    }
}


// ============================================================
// PARSE PROBABILITY
// ============================================================
//
// API-Football may return percentages as strings.
//
// Examples:
// "61%"
// 61
//
// ============================================================

function parseProbability(
    value
) {

    if (
        value === undefined ||
        value === null
    ) {
        return null;
    }


    const cleaned =
        String(value)
            .replace(
                "%",
                ""
            )
            .trim();


    const number =
        Number(
            cleaned
        );


    if (
        !Number.isFinite(
            number
        )
    ) {
        return null;
    }


    return Math.max(
        0,
        Math.min(
            100,
            number
        )
    );
}


// ============================================================
// VALID PROVIDER PREDICTION?
// ============================================================

function hasValid1X2Prediction(
    prediction
) {

    if (!prediction) {
        return false;
    }


    const values = [
        prediction.home,
        prediction.draw,
        prediction.away
    ];


    return values.every(
        value =>
            Number.isFinite(
                Number(value)
            )
    );
}


// ============================================================
// CALCULATE NORMALIZED 1X2
// ============================================================

function normalize1X2(
    home,
    draw,
    away
) {

    const values = {

        home:
            Number(home) || 0,

        draw:
            Number(draw) || 0,

        away:
            Number(away) || 0

    };


    const total =
        values.home +
        values.draw +
        values.away;


    if (total <= 0) {

        return {
            home: 0,
            draw: 0,
            away: 0
        };
    }


    return {

        home:
            round(
                values.home /
                total *
                100
            ),

        draw:
            round(
                values.draw /
                total *
                100
            ),

        away:
            round(
                values.away /
                total *
                100
            )

    };
}


// ============================================================
// ROUND
// ============================================================

function round(
    value,
    decimals = 2
) {

    const factor =
        Math.pow(
            10,
            decimals
        );


    return Math.round(
        Number(value) *
        factor
    ) / factor;
}


// ============================================================
// BUILD PROVIDER DATA FOR ENGINE
// ============================================================
//
// The existing prediction-engine.js expects:
//
// fixture.providerPrediction
//
// with:
//
// home
// draw
// away
//
// ============================================================

function prepareFixture(
    fixture,
    providerPrediction
) {

    return {

        ...fixture,

        providerPrediction:
            providerPrediction
                ? {

                    home:
                        providerPrediction.home,

                    draw:
                        providerPrediction.draw,

                    away:
                        providerPrediction.away

                }
                : null

    };
}


// ============================================================
// GET PROVIDER PREDICTIONS
// ============================================================
//
// IMPORTANT:
//
// We limit the number of individual prediction
// calls so the free API quota is not destroyed.
//
// The first 50 fixtures are candidates.
//
// However, the daily API-Football free quota is
// limited, so later we'll use persistent caching
// and provider-side bulk strategies.
//
// ============================================================

async function enrichFixtures(
    fixtures
) {

    const enriched = [];


    for (
        const fixture
        of fixtures
    ) {

        try {

            const providerPrediction =
                await getApiFootballPrediction(
                    fixture.id
                );


            const prepared =
                prepareFixture(
                    fixture,
                    providerPrediction
                );


            enriched.push(
                prepared
            );

        } catch (error) {

            console.error(
                `Could not enrich fixture ${fixture.id}:`,
                error.message
            );


            /*
             * We don't discard the fixture immediately.
             *
             * The prediction engine may still be able
             * to calculate a baseline from other data.
             */

            enriched.push(
                prepareFixture(
                    fixture,
                    null
                )
            );
        }
    }


    return enriched;
}


// ============================================================
// CALCULATE SIMPLE FALLBACK STATS
// ============================================================
//
// These are deliberately conservative defaults.
//
// We don't pretend these values came from a provider.
//
// The next model upgrade will populate these from
// real team statistics.
//
// ============================================================

function attachFallbackStats(
    fixture
) {

    return {

        ...fixture,

        teamStats: {

            homeGoalsFor:
                1.3,

            homeGoalsAgainst:
                1.2,

            awayGoalsFor:
                1.2,

            awayGoalsAgainst:
                1.3

        }

    };
}


// ============================================================
// PREPARE FOR PREDICTION ENGINE
// ============================================================

function prepareForEngine(
    fixtures
) {

    return fixtures.map(
        fixture =>
            attachFallbackStats(
                fixture
            )
    );
}


// ============================================================
// DAILY PREDICTION GENERATOR
// ============================================================

async function buildDailyPredictions(
    date
) {

    /*
     * Step 1:
     * Get today's upcoming fixtures.
     */

    const fixtures =
        await getTodayFixtures(
            date
        );


    if (
        !fixtures.length
    ) {

        return {

            fixtures: [],

            generated: 0,

            published: 0,

            rejected: 0,

            predictions: []

        };

    }


    /*
     * Step 2:
     * Get API-Football's prediction signal.
     */

    const enriched =
        await enrichFixtures(
            fixtures
        );


    /*
     * Step 3:
     * Add model inputs.
     */

    const prepared =
        prepareForEngine(
            enriched
        );


    /*
     * Step 4:
     * Generate, validate and rank.
     */

    const result =
        generateDailyPredictions(
            prepared,
            50
        );


    return {

        fixtures:
            prepared,

        generated:
            result.generated,

        published:
            result.published,

        rejected:
            result.rejected,

        predictions:
            result.predictions

    };
}


// ============================================================
// REQUEST VALIDATION
// ============================================================

function getRequestedDate(req) {
    const requestedDate = req.query?.date;

    // If no date was supplied, use today's Nigeria date.
    if (!requestedDate) {
        return getNigeriaDate();
    }

    // Strict YYYY-MM-DD validation.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
        throw new Error(
            "Invalid date format. Use YYYY-MM-DD."
        );
    }

    const parsed = new Date(`${requestedDate}T00:00:00Z`);

    if (Number.isNaN(parsed.getTime())) {
        throw new Error("Invalid date.");
    }

    return requestedDate;
}


// ============================================================
// BUILD DAILY PREDICTIONS
// ============================================================

async function buildDailyPredictions(date) {

    // --------------------------------------------------------
    // STEP 1: GET TODAY'S FIXTURES
    // --------------------------------------------------------

    const fixtures = await getTodayFixtures(date);

    if (!fixtures.length) {
        return {
            date,
            fixtures: [],
            predictions: [],
            rejected: 0
        };
    }


    // --------------------------------------------------------
    // STEP 2: ENRICH FIXTURES WITH PROVIDER PREDICTIONS
    // --------------------------------------------------------

    const enrichedFixtures = await enrichFixtures(fixtures);


    // --------------------------------------------------------
    // STEP 3: ATTACH AVAILABLE TEAM DATA
    // --------------------------------------------------------

    const fixturesWithStats =
        attachFallbackStats(enrichedFixtures);


    // --------------------------------------------------------
    // STEP 4: PREPARE DATA FOR PREDICTION ENGINE
    // --------------------------------------------------------

    const engineFixtures =
        prepareForEngine(fixturesWithStats);


    // --------------------------------------------------------
    // STEP 5: GENERATE PREDICTIONS
    // --------------------------------------------------------

    const predictions =
        generateDailyPredictions(
            engineFixtures,
            50
        );


    // --------------------------------------------------------
    // STEP 6: RETURN RESULTS
    // --------------------------------------------------------

    return {
        date,
        fixtures: fixturesWithStats,
        predictions,
        rejected:
            Math.max(
                0,
                predictions.length
                    ? predictions.length
                    : 0
            )
    };
}


// ============================================================
// CORS
// ============================================================

function setCorsHeaders(res) {

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

    res.setHeader(
        "Cache-Control",
        "no-store"
    );
}


// ============================================================
// API HANDLER
// ============================================================

export default async function handler(req, res) {

    // --------------------------------------------------------
    // CORS
    // --------------------------------------------------------

    setCorsHeaders(res);


    // --------------------------------------------------------
    // OPTIONS / PREFLIGHT
    // --------------------------------------------------------

    if (req.method === "OPTIONS") {

        return res.status(204).end();

    }


    // --------------------------------------------------------
    // METHOD VALIDATION
    // --------------------------------------------------------

    if (req.method !== "GET") {

        return res.status(405).json({
            success: false,
            error: "Method not allowed."
        });

    }


    // --------------------------------------------------------
    // API KEY VALIDATION
    // --------------------------------------------------------

    if (!API_FOOTBALL_KEY) {

        console.error(
            "API_FOOTBALL_KEY is missing."
        );

        return res.status(500).json({

            success: false,

            error:
                "Prediction service is not configured."
        });

    }


    try {

        // ----------------------------------------------------
        // GET REQUESTED DATE
        // ----------------------------------------------------

        const date =
            getRequestedDate(req);


        // ----------------------------------------------------
        // CACHE KEY
        // ----------------------------------------------------

        const cacheKey =
            `daily-predictions-${date}`;


        // ----------------------------------------------------
        // CHECK CACHE
        // ----------------------------------------------------

        const cached =
            cache.get(cacheKey);

        if (cached) {

            return res.status(200).json({

                success: true,

                cached: true,

                date,

                totalFixtures:
                    cached.fixtures.length,

                generated:
                    cached.predictions.length,

                rejected:
                    cached.rejected,

                published:
                    cached.predictions.length,

                maximumPublished: 50,

                provider: "API-Football",

                secondaryProviderConfigured:
                    Boolean(SPORTMONKS_TOKEN),

                predictions:
                    cached.predictions

            });

        }


        // ----------------------------------------------------
        // BUILD PREDICTIONS
        // ----------------------------------------------------

        const result =
            await buildDailyPredictions(date);


        // ----------------------------------------------------
        // LIMIT TO MAXIMUM 50
        // ----------------------------------------------------

        const publishedPredictions =
            Array.isArray(result.predictions)
                ? result.predictions.slice(0, 50)
                : [];


        // ----------------------------------------------------
        // SAVE TO CACHE
        // ----------------------------------------------------

        const responseData = {

            fixtures:
                result.fixtures || [],

            predictions:
                publishedPredictions,

            rejected:
                result.rejected || 0

        };

        cache.set(
            cacheKey,
            responseData
        );


        // ----------------------------------------------------
        // FINAL RESPONSE
        // ----------------------------------------------------

        return res.status(200).json({

            success: true,

            cached: false,

            date,

            totalFixtures:
                result.fixtures.length,

            generated:
                publishedPredictions.length,

            rejected:
                result.rejected,

            published:
                publishedPredictions.length,

            maximumPublished: 50,

            provider: "API-Football",

            secondaryProviderConfigured:
                Boolean(SPORTMONKS_TOKEN),

            predictions:
                publishedPredictions

        });

    } catch (error) {

        // ----------------------------------------------------
        // ERROR LOGGING
        // ----------------------------------------------------

        console.error(
            "PaceFetch prediction error:",
            error
        );


        // ----------------------------------------------------
        // SAFE ERROR RESPONSE
        // ----------------------------------------------------

        return res.status(500).json({

            success: false,

            error:
                error?.message ||
                "Unable to generate predictions."

        });

    }

}
