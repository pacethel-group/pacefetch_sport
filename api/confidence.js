// api/confidence.js

function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Converts a probability into a PaceFetch confidence tier.
 *
 * 80+  = strong green
 * 70-79 = yellow/lime
 * 50-69 = amber
 * <50 = red
 */
function getConfidenceTier(probability) {
    const p = Number(probability) || 0;

    if (p >= 80) {
        return {
            tier: "strong",
            label: "Strong",
            color: "green"
        };
    }

    if (p >= 70) {
        return {
            tier: "good",
            label: "Good",
            color: "lime"
        };
    }

    if (p >= 50) {
        return {
            tier: "moderate",
            label: "Moderate",
            color: "amber"
        };
    }

    return {
        tier: "weak",
        label: "Weak",
        color: "red"
    };
}

/**
 * Confidence is deliberately separate from probability.
 *
 * A prediction can have a high probability but poor supporting
 * data quality. This score considers:
 *
 * - probability
 * - data availability
 * - provider agreement
 * - sample quality
 */
function calculateConfidence({
    probability,
    dataQuality = 0,
    providerAgreement = 0,
    sampleQuality = 0
}) {
    const p = clamp(Number(probability) || 0);

    const confidence =
        (p * 0.60) +
        (clamp(dataQuality) * 0.15) +
        (clamp(providerAgreement) * 0.15) +
        (clamp(sampleQuality) * 0.10);

    return Math.round(clamp(confidence) * 100) / 100;
}

module.exports = {
    clamp,
    getConfidenceTier,
    calculateConfidence
};
