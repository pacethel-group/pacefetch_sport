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

}const {
    getConfidenceTier,
    calculateConfidence
} = require("./confidence");

const {
    validatePredictionSet
} = require("./validator");

const {
    getTopPredictions
} = require("./ranking");


function round(value, decimals = 2) {

    const factor =
        Math.pow(10, decimals);

    return Math.round(
        Number(value) * factor
    ) / factor;

}


function safeNumber(
    value,
    fallback = null
) {

    const number =
        Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;

}


function validProbability(value) {

    const number =
        Number(value);

    return (
        Number.isFinite(number) &&
        number >= 0 &&
        number <= 100
    );

}


/*
 * API-Football probabilities can be
 * rounded. We normalize the three
 * 1X2 values so they always represent
 * a complete 100% distribution.
 */

function normalize1X2(
    home,
    draw,
    away
) {

    const values = {

        home:
            safeNumber(home, 0),

        draw:
            safeNumber(draw, 0),

        away:
            safeNumber(away, 0)

    };


    const total =
        values.home +
        values.draw +
        values.away;


    if (total <= 0) {
        return null;
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


/*
 * Extract API-Football's actual
 * 1X2 prediction structure.
 */

function extractProvider1X2(
    providerPrediction
) {

    if (!providerPrediction) {
        return null;
    }


    const sources = [

        providerPrediction,

        providerPrediction.percent,

        providerPrediction.percentages,

        providerPrediction.probabilities,

        providerPrediction.predictions,

        providerPrediction.data

    ].filter(Boolean);


    for (
        const source
        of sources
    ) {

        const home =
            safeNumber(
                source.home ??
                source.Home ??
                source["home"]
            );

        const draw =
            safeNumber(
                source.draw ??
                source.Draw ??
                source["draw"]
            );

        const away =
            safeNumber(
                source.away ??
                source.Away ??
                source["away"]
            );


        if (
            validProbability(home) &&
            validProbability(draw) &&
            validProbability(away)
        ) {

            return normalize1X2(
                home,
                draw,
                away
            );

        }

    }


    return null;

}


/*
 * Extract an optional provider market
 * only when an actual probability is
 * supplied by the provider.
 */

function getProviderMarket(
    providerPrediction,
    names
) {

    if (!providerPrediction) {
        return null;
    }


    const sources = [

        providerPrediction,

        providerPrediction.markets,

        providerPrediction.probabilities,

        providerPrediction.predictions,

        providerPrediction.percent,

        providerPrediction.percentages

    ].filter(Boolean);


    for (
        const source
        of sources
    ) {

        for (
            const name
            of names
        ) {

            const value =
                source[name];


            if (
                validProbability(value)
            ) {

                return round(value);

            }

        }

    }


    return null;

}


/*
 * Confidence is based on the actual
 * provider probability and quality
 * indicators.
 */

function addConfidence(
    prediction
) {

    const confidence =
        calculateConfidence({

            probability:
                prediction.probability,

            dataQuality:
                prediction.dataQuality,

            providerAgreement:
                prediction.providerAgreement,

            sampleQuality:
                prediction.sampleQuality

        });


    const tier =
        getConfidenceTier(
            confidence
        );


    return {

        ...prediction,

        probability:
            round(
                prediction.probability
            ),

        confidence:
            round(
                confidence
            ),

        confidenceTier:
            tier.tier,

        confidenceLabel:
            tier.label,

        confidenceColor:
            tier.color,

        modelVersion:
            "PF-1.2"

    };

}


/*
 * Build all supported predictions
 * for one fixture.
 */

function buildPredictionList({

    fixture,

    providerPrediction = null

}) {

    const predictions = [];


    const homeTeam =
        fixture.homeTeam ||
        fixture.teams?.home?.name ||
        "Home";


    const awayTeam =
        fixture.awayTeam ||
        fixture.teams?.away?.name ||
        "Away";


    const base = {

        fixtureId:
            fixture.id ||
            fixture.fixtureId,

        homeTeam,

        awayTeam,

        kickoff:
            fixture.kickoff ||
            fixture.date,

        league:
            fixture.league,

        country:
            fixture.country,

        source:
            "API-Football"

    };


    const provider1X2 =
        extractProvider1X2(
            providerPrediction
        );


    /* =====================================================
       1X2
    ===================================================== */

    if (provider1X2) {

        const winnerEntries = [

            {
                selection:
                    homeTeam,

                probability:
                    provider1X2.home,

                priority:
                    1

            },

            {
                selection:
                    "Draw",

                probability:
                    provider1X2.draw,

                priority:
                    2

            },

            {
                selection:
                    awayTeam,

                probability:
                    provider1X2.away,

                priority:
                    3

            }

        ];


        /*
         * If probabilities are tied,
         * use a deterministic ordering
         * instead of depending on sort
         * implementation behaviour.
         */

        winnerEntries.sort(
            (a, b) => {

                if (
                    b.probability !==
                    a.probability
                ) {

                    return (
                        b.probability -
                        a.probability
                    );

                }

                return (
                    a.priority -
                    b.priority
                );

            }
        );


        const strongest =
            winnerEntries[0];


        predictions.push(
            addConfidence({

                ...base,

                market:
                    "1X2",

                selection:
                    strongest.selection,

                probability:
                    strongest.probability,

                dataQuality:
                    90,

                providerAgreement:
                    100,

                sampleQuality:
                    80

            })
        );


        /* =================================================
           DOUBLE CHANCE

           These are mathematically derived from
           the normalized 1X2 distribution.

           We deliberately cap derived Double
           Chance at 99% so PaceFetch never
           presents artificial 100% certainty.
        ================================================= */

        const oneX =
            Math.min(
                99,
                provider1X2.home +
                provider1X2.draw
            );


        const xTwo =
            Math.min(
                99,
                provider1X2.draw +
                provider1X2.away
            );


        const twelve =
            Math.min(
                99,
                provider1X2.home +
                provider1X2.away
            );


        const doubleChanceEntries = [

            {
                selection:
                    "1X",

                probability:
                    oneX,

                priority:
                    1

            },

            {
                selection:
                    "X2",

                probability:
                    xTwo,

                priority:
                    2

            },

            {
                selection:
                    "12",

                probability:
                    twelve,

                priority:
                    3

            }

        ];


        doubleChanceEntries.sort(
            (a, b) => {

                if (
                    b.probability !==
                    a.probability
                ) {

                    return (
                        b.probability -
                        a.probability
                    );

                }

                return (
                    a.priority -
                    b.priority
                );

            }
        );


        const strongestDoubleChance =
            doubleChanceEntries[0];


        predictions.push(
            addConfidence({

                ...base,

                market:
                    "Double Chance",

                selection:
                    strongestDoubleChance.selection,

                probability:
                    strongestDoubleChance.probability,

                dataQuality:
                    90,

                providerAgreement:
                    100,

                sampleQuality:
                    80

            })
        );

    }


    /* =====================================================
       OVER 1.5
    ===================================================== */

    const over15 =
        getProviderMarket(
            providerPrediction,
            [
                "over_1_5",
                "over1_5",
                "over15",
                "OVER_1_5"
            ]
        );


    if (
        over15 !== null
    ) {

        predictions.push(
            addConfidence({

                ...base,

                market:
                    "Over/Under 1.5",

                selection:
                    "Over 1.5",

                probability:
                    over15,

                dataQuality:
                    90,

                providerAgreement:
                    100,

                sampleQuality:
                    80

            })
        );

    }


    /* =====================================================
       OVER 2.5
    ===================================================== */

    const over25 =
        getProviderMarket(
            providerPrediction,
            [
                "over_2_5",
                "over2_5",
                "over25",
                "OVER_2_5"
            ]
        );


    if (
        over25 !== null
    ) {

        predictions.push(
            addConfidence({

                ...base,

                market:
                    "Over/Under 2.5",

                selection:
                    "Over 2.5",

                probability:
                    over25,

                dataQuality:
                    90,

                providerAgreement:
                    100,

                sampleQuality:
                    80

            })
        );

    }


    /* =====================================================
       BTTS
    ===================================================== */

    const bttsYes =
        getProviderMarket(
            providerPrediction,
            [
                "btts_yes",
                "bttsYes",
                "BTTS_YES",
                "btts"
            ]
        );


    if (
        bttsYes !== null
    ) {

        predictions.push(
            addConfidence({

                ...base,

                market:
                    "BTTS",

                selection:
                    "BTTS Yes",

                probability:
                    bttsYes,

                dataQuality:
                    90,

                providerAgreement:
                    100,

                sampleQuality:
                    80

            })
        );

    }


    return predictions;

}


/* =========================================================
   SINGLE FIXTURE
========================================================= */

function generatePredictions({

    fixture,

    teamStats = {},

    providerPrediction = null

}) {

    const predictions =
        buildPredictionList({

            fixture,

            providerPrediction

        });


    return {

        fixture,

        expectedGoals:
            null,

        markets:
            null,

        predictions

    };

}


/* =========================================================
   DAILY PREDICTIONS
========================================================= */

function generateDailyPredictions(
    fixtures = [],
    maximum = 50
) {

    const allPredictions = [];


    for (
        const fixture
        of fixtures
    ) {

        if (!fixture) {
            continue;
        }


        const result =
            generatePredictions({

                fixture,

                teamStats:
                    fixture.teamStats ||
                    {},

                providerPrediction:
                    fixture.providerPrediction ||
                    null

            });


        allPredictions.push(
            ...result.predictions
        );

    }


    const usable =
        allPredictions.filter(
            prediction =>
                validProbability(
                    prediction.probability
                )
        );


    const validation =
        validatePredictionSet(
            usable,
            maximum
        );


    const ranked =
        getTopPredictions(
            validation.valid,
            maximum
        );


    return {

        generated:
            allPredictions.length,

        usable:
            usable.length,

        rejected:
            validation.rejected.length,

        published:
            ranked.length,

        predictions:
            ranked

    };

}


module.exports = {

    generatePredictions,

    generateDailyPredictions,

    /*
     * Kept for compatibility with
     * any older files that may import
     * these functions.
     */

    calculateMarkets:
        function () {
            return null;
        },

    calculateExpectedGoals:
        function () {
            return null;
        }

};
