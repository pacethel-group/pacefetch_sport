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

function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function normalizePercentages(values) {
    const total = Object.values(values).reduce(
        (sum, value) => sum + safeNumber(value),
        0
    );

    if (total <= 0) {
        return values;
    }

    const result = {};

    for (const [key, value] of Object.entries(values)) {
        result[key] = round(
            (safeNumber(value) / total) * 100
        );
    }

    return result;
}


/* -------------------------------------------------------
   POISSON
------------------------------------------------------- */

function factorial(n) {
    if (n <= 1) return 1;

    let result = 1;

    for (let i = 2; i <= n; i++) {
        result *= i;
    }

    return result;
}

function poissonProbability(lambda, goals) {
    lambda = Math.max(0.01, safeNumber(lambda));

    return (
        Math.exp(-lambda) *
        Math.pow(lambda, goals) /
        factorial(goals)
    );
}

function createGoalMatrix(homeExpectedGoals, awayExpectedGoals) {
    const matrix = [];

    for (let home = 0; home <= 8; home++) {
        for (let away = 0; away <= 8; away++) {
            const probability =
                poissonProbability(homeExpectedGoals, home) *
                poissonProbability(awayExpectedGoals, away);

            matrix.push({
                home,
                away,
                probability
            });
        }
    }

    return matrix;
}


/* -------------------------------------------------------
   MARKET CALCULATIONS
------------------------------------------------------- */

function calculateMarkets(homeExpectedGoals, awayExpectedGoals) {

    const matrix = createGoalMatrix(
        homeExpectedGoals,
        awayExpectedGoals
    );

    let homeWin = 0;
    let draw = 0;
    let awayWin = 0;

    let bttsYes = 0;

    let over05 = 0;
    let over15 = 0;
    let over25 = 0;
    let over35 = 0;

    for (const result of matrix) {
        const {
            home,
            away,
            probability
        } = result;

        if (home > away) {
            homeWin += probability;
        }

        if (home === away) {
            draw += probability;
        }

        if (home < away) {
            awayWin += probability;
        }

        if (home >= 1 && away >= 1) {
            bttsYes += probability;
        }

        const totalGoals = home + away;

        if (totalGoals >= 1) {
            over05 += probability;
        }

        if (totalGoals >= 2) {
            over15 += probability;
        }

        if (totalGoals >= 3) {
            over25 += probability;
        }

        if (totalGoals >= 4) {
            over35 += probability;
        }
    }

    const oneX = homeWin + draw;
    const xTwo = draw + awayWin;
    const twelve = homeWin + awayWin;

    return {
        oneX2: normalizePercentages({
            home: homeWin * 100,
            draw: draw * 100,
            away: awayWin * 100
        }),

        doubleChance: {
            "1X": round(oneX * 100),
            "X2": round(xTwo * 100),
            "12": round(twelve * 100)
        },

        overUnder: {
            "over_0_5": round(over05 * 100),
            "under_0_5": round((1 - over05) * 100),

            "over_1_5": round(over15 * 100),
            "under_1_5": round((1 - over15) * 100),

            "over_2_5": round(over25 * 100),
            "under_2_5": round((1 - over25) * 100),

            "over_3_5": round(over35 * 100),
            "under_3_5": round((1 - over35) * 100)
        },

        btts: {
            yes: round(bttsYes * 100),
            no: round((1 - bttsYes) * 100)
        }
    };
}


/* -------------------------------------------------------
   EXPECTED GOALS
------------------------------------------------------- */

function calculateExpectedGoals({
    homeGoalsFor,
    homeGoalsAgainst,
    awayGoalsFor,
    awayGoalsAgainst
}) {

    /*
     * Conservative baseline.
     *
     * Later this will be upgraded with:
     * xG
     * home/away strength
     * league averages
     * injuries
     * lineups
     * provider model probabilities
     */

    const homeAttack = safeNumber(homeGoalsFor, 1.3);
    const homeDefense = safeNumber(homeGoalsAgainst, 1.2);

    const awayAttack = safeNumber(awayGoalsFor, 1.1);
    const awayDefense = safeNumber(awayGoalsAgainst, 1.3);

    const homeExpected =
        (homeAttack + awayDefense) / 2;

    const awayExpected =
        (awayAttack + homeDefense) / 2;

    return {
        home: clamp(homeExpected, 0.2, 4),
        away: clamp(awayExpected, 0.2, 4)
    };
}


/* -------------------------------------------------------
   PROVIDER PROBABILITY BLENDING
------------------------------------------------------- */

function blendProbability(modelProbability, providerProbability) {

    if (
        providerProbability === undefined ||
        providerProbability === null
    ) {
        return modelProbability;
    }

    const provider = safeNumber(providerProbability);

    /*
     * Provider model receives slightly greater weight
     * when it is available.
     */
    return round(
        (modelProbability * 0.40) +
        (provider * 0.60)
    );
}


/* -------------------------------------------------------
   BUILD PREDICTIONS
------------------------------------------------------- */

function buildPredictionList({
    fixture,
    markets,
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
        fixtureId: fixture.id,
        homeTeam,
        awayTeam,
        kickoff: fixture.kickoff,
        league: fixture.league,
        country: fixture.country,
        source: fixture.source || "PaceFetch Model"
    };


    /* 1X2 */

    const homeProbability = blendProbability(
        markets.oneX2.home,
        providerPrediction?.home
    );

    const drawProbability = blendProbability(
        markets.oneX2.draw,
        providerPrediction?.draw
    );

    const awayProbability = blendProbability(
        markets.oneX2.away,
        providerPrediction?.away
    );

    const oneX2 = normalizePercentages({
        home: homeProbability,
        draw: drawProbability,
        away: awayProbability
    });


    const winnerEntries = [
        {
            selection: homeTeam,
            probability: oneX2.home,
            market: "1X2"
        },
        {
            selection: "Draw",
            probability: oneX2.draw,
            market: "1X2"
        },
        {
            selection: awayTeam,
            probability: oneX2.away,
            market: "1X2"
        }
    ];

    const strongestWinner =
        winnerEntries.sort(
            (a, b) => b.probability - a.probability
        )[0];


    predictions.push({
        ...base,
        market: "1X2",
        selection: strongestWinner.selection,
        probability: round(strongestWinner.probability),
        dataQuality: 75,
        sampleQuality: 70,
        providerAgreement: providerPrediction ? 85 : 50
    });


    /* OVER 1.5 */

    predictions.push({
        ...base,
        market: "Over/Under 1.5",
        selection: "Over 1.5",
        probability: markets.overUnder.over_1_5,
        dataQuality: 75,
        sampleQuality: 70,
        providerAgreement: 50
    });


    /* OVER 2.5 */

    predictions.push({
        ...base,
        market: "Over/Under 2.5",
        selection: "Over 2.5",
        probability: markets.overUnder.over_2_5,
        dataQuality: 75,
        sampleQuality: 70,
        providerAgreement: 50
    });


    /* BTTS */

    predictions.push({
        ...base,
        market: "BTTS",
        selection: "BTTS Yes",
        probability: markets.btts.yes,
        dataQuality: 75,
        sampleQuality: 70,
        providerAgreement: 50
    });


    /* DOUBLE CHANCE */

    const doubleChance = [
        {
            selection: "1X",
            probability: markets.doubleChance["1X"]
        },
        {
            selection: "X2",
            probability: markets.doubleChance["X2"]
        },
        {
            selection: "12",
            probability: markets.doubleChance["12"]
        }
    ].sort(
        (a, b) => b.probability - a.probability
    )[0];

    predictions.push({
        ...base,
        market: "Double Chance",
        selection: doubleChance.selection,
        probability: doubleChance.probability,
        dataQuality: 75,
        sampleQuality: 70,
        providerAgreement: 50
    });


    /* ---------------------------------------------------
       CONFIDENCE
    --------------------------------------------------- */

    return predictions.map(prediction => {

        const confidence = calculateConfidence({
            probability: prediction.probability,
            dataQuality: prediction.dataQuality,
            providerAgreement: prediction.providerAgreement,
            sampleQuality: prediction.sampleQuality
        });

        const tier = getConfidenceTier(confidence);

        return {
            ...prediction,
            probability: round(prediction.probability),
            confidence: round(confidence),
            confidenceTier: tier.tier,
            confidenceLabel: tier.label,
            confidenceColor: tier.color,
            modelVersion: "PF-1.0"
        };
    });
}


/* -------------------------------------------------------
   MAIN ENGINE
------------------------------------------------------- */

function generatePredictions({
    fixture,
    teamStats = {},
    providerPrediction = null
}) {

    const expectedGoals = calculateExpectedGoals({
        homeGoalsFor: teamStats.homeGoalsFor,
        homeGoalsAgainst: teamStats.homeGoalsAgainst,

        awayGoalsFor: teamStats.awayGoalsFor,
        awayGoalsAgainst: teamStats.awayGoalsAgainst
    });

    const markets = calculateMarkets(
        expectedGoals.home,
        expectedGoals.away
    );

    const predictions = buildPredictionList({
        fixture,
        markets,
        providerPrediction
    });

    return {
        fixture,
        expectedGoals,
        markets,
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

        if (!fixture) continue;

        /*
         * Team statistics should be populated by the
         * provider adapter before reaching this function.
         */
        const result = generatePredictions({
            fixture,
            teamStats: fixture.teamStats || {},
            providerPrediction: fixture.providerPrediction || null
        });

        allPredictions.push(
            ...result.predictions
        );
    }


    const validation =
        validatePredictionSet(
            allPredictions,
            maximum
        );

    const ranked =
        getTopPredictions(
            validation.valid,
            maximum
        );

    return {
        generated: allPredictions.length,
        rejected: validation.rejected.length,
        published: ranked.length,
        predictions: ranked
    };
}


module.exports = {
    generatePredictions,
    generateDailyPredictions,
    calculateMarkets,
    calculateExpectedGoals
};
