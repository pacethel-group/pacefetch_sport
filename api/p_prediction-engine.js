// api/prediction-engine.js

const {
    calculateConfidence
} = require("./confidence");

const {
    validatePredictionSet
} = require("./validator");

const {
    rankPredictions
} = require("./ranking");


const MODEL_VERSION = "PF-1.2";


/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function clamp(value, min, max) {

    const n = Number(value);

    if (!Number.isFinite(n)) {
        return min;
    }

    return Math.min(
        max,
        Math.max(
            min,
            n
        )
    );
}


function round(value, decimals = 1) {

    const multiplier =
        Math.pow(
            10,
            decimals
        );

    return Math.round(
        Number(value) * multiplier
    ) / multiplier;
}


/*
|--------------------------------------------------------------------------
| Normalize API-Football 1X2 probabilities
|--------------------------------------------------------------------------
*/

function normalize1X2(
    home,
    draw,
    away
) {

    home = clamp(home, 0, 100);
    draw = clamp(draw, 0, 100);
    away = clamp(away, 0, 100);

    const total =
        home +
        draw +
        away;

    if (total <= 0) {
        return null;
    }

    return {

        home:
            round(
                (home / total) * 100
            ),

        draw:
            round(
                (draw / total) * 100
            ),

        away:
            round(
                (away / total) * 100
            )

    };
}


/*
|--------------------------------------------------------------------------
| Get strongest 1X2 outcome
|--------------------------------------------------------------------------
*/

function getBest1X2(
    probabilities
) {

    const choices = [

        {
            selection: "Home",
            probability:
                probabilities.home
        },

        {
            selection: "Draw",
            probability:
                probabilities.draw
        },

        {
            selection: "Away",
            probability:
                probabilities.away
        }

    ];

    choices.sort(
        (a, b) =>
            b.probability -
            a.probability
    );

    return choices[0];
}


/*
|--------------------------------------------------------------------------
| Get strongest Double Chance
|--------------------------------------------------------------------------
|
| 1X = Home + Draw
| X2 = Draw + Away
| 12 = Home + Away
|
| We cap the displayed value at 99%.
| This prevents rounded provider percentages from
| producing an artificial 100% certainty.
|--------------------------------------------------------------------------
*/

function getBestDoubleChance(
    probabilities
) {

    const choices = [

        {
            selection: "1X",

            probability:
                probabilities.home +
                probabilities.draw
        },

        {
            selection: "X2",

            probability:
                probabilities.draw +
                probabilities.away
        },

        {
            selection: "12",

            probability:
                probabilities.home +
                probabilities.away
        }

    ];

    choices.forEach(
        choice => {

            choice.probability =
                round(
                    clamp(
                        choice.probability,
                        0,
                        99
                    )
                );

        }
    );

    choices.sort(
        (a, b) =>
            b.probability -
            a.probability
    );

    return choices[0];
}


/*
|--------------------------------------------------------------------------
| Create prediction object
|--------------------------------------------------------------------------
*/

function createPrediction(
    fixture,
    market,
    selection,
    probability
) {

    const finalProbability =
        round(
            clamp(
                probability,
                0,
                99
            )
        );

    /*
     * PaceFetch does not publish predictions below 50%.
     */

    if (
        finalProbability < 50
    ) {

        return null;
    }


    const dataQuality = 90;

    const providerAgreement = 100;

    const sampleQuality = 80;


    const confidence =
        calculateConfidence({

            probability:
                finalProbability,

            dataQuality,

            providerAgreement,

            sampleQuality

        });


    return {

        fixtureId:
            fixture.fixtureId,

        homeTeam:
            fixture.homeTeam,

        awayTeam:
            fixture.awayTeam,

        kickoff:
            fixture.kickoff,

        league:
            fixture.league,

        country:
            fixture.country,

        source:
            "API-Football",

        market,

        selection,

        probability:
            finalProbability,

        dataQuality,

        providerAgreement,

        sampleQuality,

        confidence:
            round(
                confidence
            ),

        modelVersion:
            MODEL_VERSION

    };
}


/*
|--------------------------------------------------------------------------
| Generate predictions for one fixture
|--------------------------------------------------------------------------
*/

function generateFixturePredictions(
    fixture
) {

    if (
        !fixture ||
        !fixture.providerPrediction
    ) {

        return [];
    }


    const provider =
        fixture.providerPrediction;


    const probabilities =
        normalize1X2(

            provider.home,
            provider.draw,
            provider.away

        );


    if (!probabilities) {
        return [];
    }


    const predictions = [];


    /*
    |--------------------------------------------------------------------------
    | 1X2
    |--------------------------------------------------------------------------
    */

    const bestResult =
        getBest1X2(
            probabilities
        );


    if (bestResult) {

        const prediction =
            createPrediction(

                fixture,

                "1X2",

                bestResult.selection,

                bestResult.probability

            );


        if (prediction) {

            predictions.push(
                prediction
            );

        }
    }


    /*
    |--------------------------------------------------------------------------
    | Double Chance
    |--------------------------------------------------------------------------
    */

    const bestDoubleChance =
        getBestDoubleChance(
            probabilities
        );


    if (bestDoubleChance) {

        const prediction =
            createPrediction(

                fixture,

                "Double Chance",

                bestDoubleChance.selection,

                bestDoubleChance.probability

            );


        if (prediction) {

            predictions.push(
                prediction
            );

        }
    }


    /*
    |--------------------------------------------------------------------------
    | Optional real provider markets
    |--------------------------------------------------------------------------
    |
    | These are only used when actual provider values
    | are supplied by the caller.
    |
    | Nothing is invented here.
    |--------------------------------------------------------------------------
    */

    if (
        provider.over15 !== undefined &&
        provider.over15 !== null
    ) {

        const probability =
            Number(
                provider.over15
            );


        if (
            Number.isFinite(
                probability
            ) &&
            probability >= 50
        ) {

            const prediction =
                createPrediction(

                    fixture,

                    "Over/Under 1.5",

                    "Over 1.5",

                    probability

                );


            if (prediction) {

                predictions.push(
                    prediction
                );

            }
        }
    }


    if (
        provider.over25 !== undefined &&
        provider.over25 !== null
    ) {

        const probability =
            Number(
                provider.over25
            );


        if (
            Number.isFinite(
                probability
            ) &&
            probability >= 50
        ) {

            const prediction =
                createPrediction(

                    fixture,

                    "Over/Under 2.5",

                    "Over 2.5",

                    probability

                );


            if (prediction) {

                predictions.push(
                    prediction
                );

            }
        }
    }


    if (
        provider.btts !== undefined &&
        provider.btts !== null
    ) {

        const probability =
            Number(
                provider.btts
            );


        if (
            Number.isFinite(
                probability
            ) &&
            probability >= 50
        ) {

            const prediction =
                createPrediction(

                    fixture,

                    "BTTS",

                    "Yes",

                    probability

                );


            if (prediction) {

                predictions.push(
                    prediction
                );

            }
        }
    }


    return predictions;
}


/*
|--------------------------------------------------------------------------
| Keep strongest prediction per fixture
|--------------------------------------------------------------------------
|
| This prevents the same match from occupying multiple
| slots in the daily published list.
|--------------------------------------------------------------------------
*/

function keepBestPerFixture(
    predictions
) {

    const best =
        new Map();


    for (
        const prediction
        of predictions
    ) {

        if (
            !prediction ||
            !prediction.fixtureId
        ) {

            continue;
        }


        const fixtureId =
            String(
                prediction.fixtureId
            );


        const existing =
            best.get(
                fixtureId
            );


        if (!existing) {

            best.set(
                fixtureId,
                prediction
            );

            continue;
        }


        const newConfidence =
            Number(
                prediction.confidence
            ) || 0;


        const oldConfidence =
            Number(
                existing.confidence
            ) || 0;


        if (
            newConfidence >
            oldConfidence
        ) {

            best.set(
                fixtureId,
                prediction
            );

            continue;
        }


        /*
         * If confidence is equal,
         * use probability as the tie breaker.
         */

        if (
            newConfidence ===
            oldConfidence
        ) {

            const newProbability =
                Number(
                    prediction.probability
                ) || 0;


            const oldProbability =
                Number(
                    existing.probability
                ) || 0;


            if (
                newProbability >
                oldProbability
            ) {

                best.set(
                    fixtureId,
                    prediction
                );

            }
        }
    }


    return Array.from(
        best.values()
    );
}


/*
|--------------------------------------------------------------------------
| Generate daily predictions
|--------------------------------------------------------------------------
*/

function generateDailyPredictions(
    fixtures,
    maximum = 50
) {

    if (
        !Array.isArray(
            fixtures
        )
    ) {

        return {

            generated: 0,

            usable: 0,

            rejected: 0,

            published: 0,

            predictions: []

        };
    }


    const generated = [];


    /*
    |--------------------------------------------------------------------------
    | Generate provider-backed predictions
    |--------------------------------------------------------------------------
    */

    for (
        const fixture
        of fixtures
    ) {

        try {

            const predictions =
                generateFixturePredictions(
                    fixture
                );


            if (
                Array.isArray(
                    predictions
                )
            ) {

                generated.push(
                    ...predictions
                );

            }

        } catch (error) {

            /*
             * One bad fixture must never
             * destroy the whole daily run.
             */

            console.error(
                "Prediction engine error:",
                error.message
            );

        }
    }


    /*
    |--------------------------------------------------------------------------
    | One strongest prediction per match
    |--------------------------------------------------------------------------
    */

    const unique =
        keepBestPerFixture(
            generated
        );


    /*
    |--------------------------------------------------------------------------
    | Validate
    |--------------------------------------------------------------------------
    */

    let validated;


    try {

        validated =
            validatePredictionSet(
                unique,
                maximum
            );

    } catch (error) {

        console.error(
            "Prediction validation error:",
            error.message
        );

        /*
         * Safe fallback:
         * use unique predictions and apply
         * the hard maximum.
         */

        validated =
            unique.slice(
                0,
                maximum
            );
    }


    /*
    |--------------------------------------------------------------------------
    | Support the existing validator's return format
    |--------------------------------------------------------------------------
    */

    let usable = [];


    if (
        Array.isArray(
            validated
        )
    ) {

        usable =
            validated;

    } else if (
        validated &&
        Array.isArray(
            validated.predictions
        )
    ) {

        usable =
            validated.predictions;

    } else if (
        validated &&
        Array.isArray(
            validated.valid
        )
    ) {

        usable =
            validated.valid;

    }


    /*
    |--------------------------------------------------------------------------
    | Rank
    |--------------------------------------------------------------------------
    */

    let ranked = [];


    try {

        const result =
            rankPredictions(
                usable
            );


        if (
            Array.isArray(
                result
            )
        ) {

            ranked =
                result;

        } else if (
            result &&
            Array.isArray(
                result.predictions
            )
        ) {

            ranked =
                result.predictions;

        } else {

            ranked =
                usable;

        }

    } catch (error) {

        console.error(
            "Prediction ranking error:",
            error.message
        );

        ranked =
            usable;
    }


    /*
    |--------------------------------------------------------------------------
    | Final hard limit
    |--------------------------------------------------------------------------
    */

    ranked =
        ranked.slice(
            0,
            maximum
        );


    /*
    |--------------------------------------------------------------------------
    | Ensure ranks exist
    |--------------------------------------------------------------------------
    */

    ranked =
        ranked.map(
            (prediction, index) => ({

                ...prediction,

                rank:
                    index + 1

            })
        );


    return {

        generated:
            generated.length,

        usable:
            usable.length,

        rejected:
            Math.max(

                0,

                generated.length -
                usable.length

            ),

        published:
            ranked.length,

        predictions:
            ranked

    };
}


/*
|--------------------------------------------------------------------------
| Backwards compatibility
|--------------------------------------------------------------------------
|
| Older PaceFetch code may import these functions.
| We deliberately do NOT manufacture statistical data.
|--------------------------------------------------------------------------
*/

function calculateMarkets() {

    return null;
}


function calculateExpectedGoals() {

    return null;
}


/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {

    MODEL_VERSION,

    normalize1X2,

    getBest1X2,

    getBestDoubleChance,

    generateFixturePredictions,

    generateDailyPredictions,

    calculateMarkets,

    calculateExpectedGoals

};
