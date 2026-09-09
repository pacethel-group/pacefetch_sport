// api/prediction-engine.js

const {
    clamp,
    getConfidenceTier,
    calculateConfidence
} = require("./confidence");

const { validatePredictionSet } = require("./validator");
const { getTopPredictions } = require("./ranking");


/* -------------------------------------------------------
   BASIC HELPERS
------------------------------------------------------- */

function round(value, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.round(Number(value) * factor) / factor;
}

function safeNumber(value, fallback = null) {
    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
}

function validProbability(value) {
    const n = Number(value);

    return Number.isFinite(n) &&
        n >= 0 &&
        n <= 100;
}

function normalizePercentages(values) {
    const clean = {};

    for (const [key, value] of Object.entries(values)) {
        clean[key] = safeNumber(value, 0);
    }

    const total = Object.values(clean).reduce(
        (sum, value) => sum + value,
        0
    );

    if (total <= 0) {
        return clean;
    }

    const result = {};

    for (const [key, value] of Object.entries(clean)) {
        result[key] = round(
            (value / total) * 100
        );
    }

    return result;
}


/* -------------------------------------------------------
   PROVIDER PROBABILITY EXTRACTION
------------------------------------------------------- */

/*
 * API-Football's prediction response normally gives
 * home / draw / away percentages.
 *
 * This function accepts several possible formats so the
 * engine remains compatible with our provider adapter.
 */

function extractProvider1X2(providerPrediction) {

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

    for (const source of sources) {

        const home = safeNumber(
            source.home ??
            source.Home ??
            source["home"]
        );

        const draw = safeNumber(
            source.draw ??
            source.Draw ??
            source["draw"]
        );

        const away = safeNumber(
            source.away ??
            source.Away ??
            source["away"]
        );

        if (
            validProbability(home) &&
            validProbability(draw) &&
            validProbability(away)
        ) {
            return normalizePercentages({
                home,
                draw,
                away
            });
        }
    }

    return null;
}


/* -------------------------------------------------------
   OPTIONAL PROVIDER MARKETS
------------------------------------------------------- */

function getProviderMarket(providerPrediction, names) {

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

    for (const source of sources) {

        for (const name of names) {

            const value = source[name];

            if (validProbability(value)) {
                return round(value);
            }
        }
    }

    return null;
}


/* -------------------------------------------------------
   CONFIDENCE
------------------------------------------------------- */

function addConfidence(prediction) {

    const confidence = calculateConfidence({
        probability: prediction.probability,
        dataQuality: prediction.dataQuality,
        providerAgreement: prediction.providerAgreement,
        sampleQuality: prediction.sampleQuality
    });

    const tier = getConfidenceTier(confidence);

    return {
        ...prediction,

        probability: round(
            prediction.probability
        ),

        confidence: round(
            confidence
        ),

        confidenceTier: tier.tier,

        confidenceLabel: tier.label,

        confidenceColor: tier.color,

        modelVersion: "PF-1.1"
    };
}


/* -------------------------------------------------------
   BUILD PROVIDER-BASED PREDICTIONS
------------------------------------------------------- */

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


    /* ---------------------------------------------------
       1X2
    --------------------------------------------------- */

    const provider1X2 =
        extractProvider1X2(
            providerPrediction
        );


    /*
     * We do NOT manufacture a 1X2 probability.
     *
     * If API-Football doesn't provide usable
     * probabilities, this fixture produces no
     * prediction rather than a fake one.
     */

    if (provider1X2) {

        const winnerEntries = [
            {
                selection: homeTeam,
                probability: provider1X2.home
            },
            {
                selection: "Draw",
                probability: provider1X2.draw
            },
            {
                selection: awayTeam,
                probability: provider1X2.away
            }
        ];

        winnerEntries.sort(
            (a, b) =>
                b.probability -
                a.probability
        );

        const strongest =
            winnerEntries[0];


        predictions.push(
            addConfidence({
                ...base,

                market: "1X2",

                selection:
                    strongest.selection,

                probability:
                    strongest.probability,

                /*
                 * Real provider prediction is being used.
                 */
                dataQuality: 90,

                providerAgreement: 100,

                /*
                 * This is provider data rather
                 * than our unavailable historical
                 * statistics.
                 */
                sampleQuality: 80
            })
        );


        /* ------------------------------------------------
           DOUBLE CHANCE
        ------------------------------------------------ */

        const oneX =
            provider1X2.home +
            provider1X2.draw;

        const xTwo =
            provider1X2.draw +
            provider1X2.away;

        const twelve =
            provider1X2.home +
            provider1X2.away;


        const doubleChance = [
            {
                selection: "1X",
                probability: oneX
            },
            {
                selection: "X2",
                probability: xTwo
            },
            {
                selection: "12",
                probability: twelve
            }
        ].sort(
            (a, b) =>
                b.probability -
                a.probability
        )[0];


        predictions.push(
            addConfidence({
                ...base,

                market: "Double Chance",

                selection:
                    doubleChance.selection,

                probability:
                    doubleChance.probability,

                dataQuality: 90,

                providerAgreement: 100,

                sampleQuality: 80
            })
        );
    }


    /* ---------------------------------------------------
       OPTIONAL PROVIDER MARKETS
       Only publish these if the provider actually gives
       us a probability.
    --------------------------------------------------- */

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

    if (over15 !== null) {

        predictions.push(
            addConfidence({
                ...base,

                market: "Over/Under 1.5",

                selection: "Over 1.5",

                probability: over15,

                dataQuality: 90,

                providerAgreement: 100,

                sampleQuality: 80
            })
        );
    }


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

    if (over25 !== null) {

        predictions.push(
            addConfidence({
                ...base,

                market: "Over/Under 2.5",

                selection: "Over 2.5",

                probability: over25,

                dataQuality: 90,

                providerAgreement: 100,

                sampleQuality: 80
            })
        );
    }


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

    if (bttsYes !== null) {

        predictions.push(
            addConfidence({
                ...base,

                market: "BTTS",

                selection: "BTTS Yes",

                probability: bttsYes,

                dataQuality: 90,

                providerAgreement: 100,

                sampleQuality: 80
            })
        );
    }


    return predictions;
}


/* -------------------------------------------------------
   MAIN ENGINE
------------------------------------------------------- */

function generatePredictions({
    fixture,
    teamStats = {},
    providerPrediction = null
}) {

    /*
     * teamStats is intentionally NOT required anymore.
     *
     * API-Football's current free-plan restriction means
     * 2026 team statistics cannot reliably be requested.
     *
     * Therefore the production engine uses real provider
     * probabilities instead of invented fallback statistics.
     */

    const predictions =
        buildPredictionList({
            fixture,
            providerPrediction
        });


    return {
        fixture,

        expectedGoals: null,

        markets: null,

        predictions
    };
}


/* -------------------------------------------------------
   DAILY ENGINE
------------------------------------------------------- */

function generateDailyPredictions(
    fixtures = [],
    maximum = 50
) {

    const allPredictions = [];

    for (const fixture of fixtures) {

        if (!fixture) {
            continue;
        }


        const result =
            generatePredictions({
                fixture,

                /*
                 * Kept for backwards compatibility.
                 * It is no longer required.
                 */
                teamStats:
                    fixture.teamStats || {},

                providerPrediction:
                    fixture.providerPrediction ||
                    null
            });


        allPredictions.push(
            ...result.predictions
        );
    }


    /*
     * Remove anything that doesn't have a valid
     * probability.
     */

    const usable =
        allPredictions.filter(
            prediction =>
                validProbability(
                    prediction.probability
                )
        );


    /*
     * Your existing validator handles:
     *
     * - missing fields
     * - probability below 50%
     * - bad data quality
     * - invalid prediction objects
     */

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


/* -------------------------------------------------------
   EXPORTS
------------------------------------------------------- */

module.exports = {
    generatePredictions,

    generateDailyPredictions,

    /*
     * Kept for compatibility with any existing imports.
     *
     * The production engine no longer depends on Poisson
     * calculations because we don't have reliable 2026
     * team statistics on the current API plan.
     */
    calculateMarkets: function () {
        return null;
    },

    calculateExpectedGoals: function () {
        return null;
    }
};
