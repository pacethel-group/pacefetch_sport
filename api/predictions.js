const {
    generateDailyPredictions
} = require("./prediction-engine");

const API_URL =
    "https://v3.football.api-sports.io";


/* =========================================================
   DATE
========================================================= */

function getNigeriaDate() {

    return new Intl.DateTimeFormat(
        "en-CA",
        {
            timeZone: "Africa/Lagos",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }
    ).format(new Date());

}


/* =========================================================
   API-FOOTBALL REQUEST
========================================================= */

async function apiFootball(path) {

    const apiKey =
        process.env.API_FOOTBALL_KEY;

    if (!apiKey) {

        throw new Error(
            "API_FOOTBALL_KEY is not configured."
        );

    }


    const response =
        await fetch(
            `${API_URL}${path}`,
            {
                method: "GET",
                headers: {
                    "x-apisports-key":
                        apiKey,
                    "Accept":
                        "application/json"
                }
            }
        );


    const text =
        await response.text();


    let data;

    try {

        data =
            JSON.parse(text);

    } catch {

        throw new Error(
            `API-Football returned invalid JSON. HTTP ${response.status}`
        );

    }


    if (!response.ok) {

        throw new Error(
            `API-Football HTTP ${response.status}: ${JSON.stringify(data)}`
        );

    }


    if (
        data.errors &&
        Object.keys(data.errors).length > 0
    ) {

        throw new Error(
            `API-Football error: ${JSON.stringify(data.errors)}`
        );

    }


    return data;

}


/* =========================================================
   FIXTURE NORMALIZATION
========================================================= */

function normalizeFixture(item) {

    const fixture =
        item.fixture || {};

    const teams =
        item.teams || {};

    const league =
        item.league || {};


    return {

        id:
            fixture.id,

        fixtureId:
            fixture.id,

        homeTeam:
            teams.home?.name ||
            "Home",

        awayTeam:
            teams.away?.name ||
            "Away",

        homeTeamId:
            teams.home?.id ||
            null,

        awayTeamId:
            teams.away?.id ||
            null,

        kickoff:
            fixture.date ||
            null,

        status:
            fixture.status?.short ||
            "NS",

        league:
            league.name ||
            "Unknown League",

        leagueId:
            league.id ||
            null,

        country:
            league.country ||
            "Unknown",

        season:
            league.season ||
            null,

        venue:
            fixture.venue?.name ||
            null

    };

}


/* =========================================================
   FIXTURE STATUS
========================================================= */

function isFinishedStatus(status) {

    return [

        "FT",
        "AET",
        "PEN",
        "CANC",
        "PST",
        "ABD",
        "AWD",
        "WO"

    ].includes(
        String(status || "")
            .toUpperCase()
    );

}


function isUpcomingFixture(fixture) {

    if (
        !fixture ||
        !fixture.kickoff
    ) {

        return false;

    }


    if (
        isFinishedStatus(
            fixture.status
        )
    ) {

        return false;

    }


    const kickoff =
        new Date(
            fixture.kickoff
        ).getTime();


    if (
        !Number.isFinite(kickoff)
    ) {

        return false;

    }


    return kickoff > Date.now();

}


/* =========================================================
   NUMBER / PERCENTAGE HELPERS
========================================================= */

function safeNumber(
    value,
    fallback = null
) {

    if (
        typeof value ===
        "string"
    ) {

        value =
            value
                .replace("%", "")
                .trim();

    }


    const number =
        Number(value);


    return Number.isFinite(number)
        ? number
        : fallback;

}


function parsePercentage(value) {

    const number =
        safeNumber(value);


    if (
        number === null ||
        number < 0 ||
        number > 100
    ) {

        return null;

    }


    return number;

}


/* =========================================================
   NORMALIZE API-FOOTBALL PREDICTION
========================================================= */

function normalizeProviderPrediction(data) {

    if (!data) {
        return null;
    }


    const response =
        Array.isArray(data.response)
            ? data.response[0]
            : data.response;


    if (!response) {
        return null;
    }


    const predictions =
        response.predictions || {};

    const percent =
        predictions.percent || {};


    const home =
        parsePercentage(
            percent.home
        );

    const draw =
        parsePercentage(
            percent.draw
        );

    const away =
        parsePercentage(
            percent.away
        );


    /*
     * We require all three 1X2
     * probabilities.
     */

    if (
        home === null ||
        draw === null ||
        away === null
    ) {

        return null;

    }


    const result = {

        home,
        draw,
        away

    };


    /*
     * Optional markets.
     *
     * Only use them if API-Football
     * actually supplies a numeric
     * probability.
     */

    const optionalMarkets = {

        over_1_5:
            predictions.over_1_5,

        over_2_5:
            predictions.over_2_5,

        btts_yes:
            predictions.btts_yes,

        btts:
            predictions.btts

    };


    for (
        const [key, value]
        of Object.entries(
            optionalMarkets
        )
    ) {

        const parsed =
            parsePercentage(value);


        if (
            parsed !== null
        ) {

            result[key] =
                parsed;

        }

    }


    return result;

}


/* =========================================================
   GET PROVIDER PREDICTION
========================================================= */

async function getFixturePrediction(
    fixtureId
) {

    const data =
        await apiFootball(
            `/predictions?fixture=${encodeURIComponent(
                fixtureId
            )}`
        );


    return normalizeProviderPrediction(
        data
    );

}


/* =========================================================
   HANDLER
========================================================= */

module.exports =
async function handler(
    req,
    res
) {

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


    if (
        req.method ===
        "OPTIONS"
    ) {

        return res
            .status(204)
            .end();

    }


    if (
        req.method !==
        "GET"
    ) {

        return res
            .status(405)
            .json({

                success: false,

                error:
                    "Method not allowed."

            });

    }


    const date =
        getNigeriaDate();


    try {

        /* =================================================
           1. GET TODAY'S FIXTURES
        ================================================= */

        const fixtureData =
            await apiFootball(
                `/fixtures?date=${date}`
            );


        const rawFixtures =
            Array.isArray(
                fixtureData.response
            )
                ? fixtureData.response
                : [];


        const fixtures =
            rawFixtures
                .map(
                    normalizeFixture
                )
                .filter(
                    fixture =>
                        fixture.id
                );


        /* =================================================
           2. ONLY UPCOMING FIXTURES
        ================================================= */

        const upcomingFixtures =
            fixtures.filter(
                isUpcomingFixture
            );


        /*
         * Process at most 40 fixtures
         * per public request.
         *
         * This protects the API-Football
         * request quota.
         */

        const fixturesToProcess =
            upcomingFixtures
                .slice(0, 40);


        /* =================================================
           3. GET REAL PROVIDER PREDICTIONS
        ================================================= */

        const engineFixtures = [];


        for (
            const fixture
            of fixturesToProcess
        ) {

            try {

                const providerPrediction =
                    await getFixturePrediction(
                        fixture.fixtureId
                    );


                if (
                    !providerPrediction
                ) {

                    continue;

                }


                engineFixtures.push({

                    ...fixture,

                    providerPrediction

                });


            } catch (error) {

                /*
                 * One failed fixture must
                 * never destroy the entire
                 * daily prediction response.
                 */

                console.error(
                    "Prediction provider error:",
                    fixture.fixtureId,
                    error.message
                );

            }

        }


        /* =================================================
           4. GENERATE QUALIFYING PREDICTIONS
        ================================================= */

        const result =
            generateDailyPredictions(
                engineFixtures,
                50
            );


        /* =================================================
           5. PRODUCTION RESPONSE
        ================================================= */

        return res
            .status(200)
            .json({

                success: true,

                source:
                    "API-Football",

                date,

                generatedAt:
                    new Date().toISOString(),

                summary: {

                    totalFixtures:
                        fixtures.length,

                    upcomingFixtures:
                        upcomingFixtures.length,

                    fixturesProcessed:
                        fixturesToProcess.length,

                    providerSuccesses:
                        engineFixtures.length,

                    generated:
                        result.generated,

                    usable:
                        result.usable,

                    rejected:
                        result.rejected,

                    published:
                        result.published

                },

                predictions:
                    result.predictions || [],

                message:
                    result.published > 0

                        ? "PaceFetch production predictions generated successfully."

                        : "No qualifying predictions are available today. No predictions were manufactured."

            });


    } catch (error) {

        console.error(
            "PaceFetch production prediction error:",
            error
        );


        return res
            .status(500)
            .json({

                success: false,

                date,

                error:
                    error.message ||
                    "Prediction service failed.",

                message:
                    "PaceFetch could not generate today's predictions."

            });

    }

};
