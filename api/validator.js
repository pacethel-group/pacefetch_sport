// api/validator.js

function validatePrediction(prediction) {
    const reasons = [];

    if (!prediction) {
        return {
            valid: false,
            reasons: ["Prediction object is missing"]
        };
    }

    if (!prediction.homeTeam || !prediction.awayTeam) {
        reasons.push("Missing team information");
    }

    if (!prediction.kickoff) {
        reasons.push("Missing kickoff time");
    }

    if (!prediction.market) {
        reasons.push("Missing market");
    }

    if (!prediction.selection) {
        reasons.push("Missing selection");
    }

    const probability = Number(prediction.probability);

    if (!Number.isFinite(probability)) {
        reasons.push("Invalid probability");
    }

    if (probability < 0 || probability > 100) {
        reasons.push("Probability outside 0-100 range");
    }

    /*
     * PaceFetch should not publish weak selections
     * simply to increase the number of daily predictions.
     */
    if (probability < 50) {
        reasons.push("Probability below publication threshold");
    }

    /*
     * Require reasonable supporting data.
     */
    if (
        prediction.dataQuality !== undefined &&
        Number(prediction.dataQuality) < 40
    ) {
        reasons.push("Insufficient supporting data");
    }

    return {
        valid: reasons.length === 0,
        reasons
    };
}

function validatePredictionSet(predictions, maximum = 50) {
    const valid = [];
    const rejected = [];

    for (const prediction of predictions || []) {
        const result = validatePrediction(prediction);

        if (result.valid) {
            valid.push(prediction);
        } else {
            rejected.push({
                prediction,
                reasons: result.reasons
            });
        }
    }

    return {
        valid: valid.slice(0, maximum),
        rejected,
        totalReceived: predictions.length,
        totalValid: valid.length,
        totalPublished: Math.min(valid.length, maximum)
    };
}

module.exports = {
    validatePrediction,
    validatePredictionSet
};
