// api/confidence.js - Production Ready

function clamp(value, min = 0, max = 100) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

/**
 * Converts a probability into a PaceFetch confidence tier.
 * Production: validated, frozen return.
 */
function getConfidenceTier(probability) {
    const p = clamp(probability);

    if (p >= 80) {
        return Object.freeze({ tier: "strong", label: "Strong", color: "green", min: 80, max: 100 });
    }
    if (p >= 70) {
        return Object.freeze({ tier: "good", label: "Good", color: "lime", min: 70, max: 79.99 });
    }
    if (p >= 50) {
        return Object.freeze({ tier: "moderate", label: "Moderate", color: "amber", min: 50, max: 69.99 });
    }
    return Object.freeze({ tier: "weak", label: "Weak", color: "red", min: 0, max: 49.99 });
}

/**
 * Confidence = weighted score, separate from raw probability.
 * All inputs expected 0-100 scale.
 */
function calculateConfidence({
    probability,
    dataQuality = 0,
    providerAgreement = 0,
    sampleQuality = 0
} = {}) {
    // Validate required
    if (probability == null) throw new Error("calculateConfidence: probability is required");

    const p = clamp(probability);
    const dq = clamp(dataQuality);
    const pa = clamp(providerAgreement);
    const sq = clamp(sampleQuality);

    // Weighted: 60% probability + 15% + 15% + 10%
    const raw = (p * 0.6) + (dq * 0.15) + (pa * 0.15) + (sq * 0.1);

    // Round to 2 decimals, then clamp final
    const confidence = clamp(Math.round(raw * 100) / 100);

    return confidence;
}

/**
 * Full helper for API - returns everything at once
 */
function buildConfidence(probability, extras = {}) {
    const confidence = calculateConfidence({ probability, ...extras });
    const tier = getConfidenceTier(confidence);
    return {
        probability: clamp(probability),
        confidence,
        confidenceLabel: tier.label,
        tier: tier.tier,
        color: tier.color,
        ...tier
    };
}

module.exports = {
    clamp,
    getConfidenceTier,
    calculateConfidence,
    buildConfidence
};
