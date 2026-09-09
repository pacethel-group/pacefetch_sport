// api/predictions.js
// PaceFetch Production Predictions API
// Uses API-Football predictions.
// IMPORTANT: Does NOT use /teams/statistics because the current
// API-Football Free plan does not provide 2026 team statistics.

const {
    generateDailyPredictions
} = require("./prediction-engine");

const API_URL = "https://v3.football.api-sports.io";

function getNigeriaDate() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Lagos",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());
}

function safeNumber(value, fallback = null) {
    if (typeof value === "string") {
        value = value.replace("%", "").trim();
    }

    const number = Number(value);

    return Number.isFinite(number) ? number : fallback;
}

function parsePercentage(value) {
    const number = safeNumber(value);

    if (number === null) {
        return null;
    }

    if (number < 0 || number > 100) {
        return null;
    }

    return number;
}

async function apiFootball(path) {
    const apiKey = process.env.API_FOOTBALL_KEY;

    if (!apiKey) {
        throw new Error("API_FOOTBALL_KEY is not configured.");
    }

    const response = await fetch(`${API_URL}${path}`, {
        method: "GET",
        headers: {
            "x-apisports-key": apiKey
        }
    });

    const text = await response.text();

    let data;

    try {
        data = JSON.parse(text);
    } catch (error) {
        throw new Error(
            `API-Football returned invalid JSON. HTTP ${response.status}`
        );
    }

    if (!response.ok) {
        throw new Error(
            `API-Football HTTP ${response.status}: ${JSON.stringify(data)}`
        );
    }

    if (data.errors && Object.keys(data.errors).length > 0) {
        throw new Error(
            `API-Football error: ${JSON.stringify(data.errors)}`
        );
    }

    return data;
}

function normalizeFixture(item) {
    const fixture = item.fixture || {};
    const teams = item.teams || {};
    const league = item.league || {};

    return {
        id: fixture.id,

        fixtureId: fixture.id,

        homeTeam:
            teams.home?.name ||
            "Home",

        awayTeam:
            teams.away?.name ||
            "Away",

        homeTeamId:
            teams.home?.id || null,

        awayTeamId:
            teams.away?.id || null,

        kickoff:
            fixture.date || null,

        status:
            fixture.status?.short ||
            "NS",

        league:
            league.name ||
            "Unknown League",

        leagueId:
            league.id || null,

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

function isFinishedStatus(status) {
    const finishedStatuses = [
        "FT",
        "AET",
        "PEN",
        "CANC",
        "PST",
        "ABD",
        "AWD",
        "WO"
    ];

    return finishedStatuses.includes(
        String(status || "").toUpperCase()
    );
}

function isUpcomingFixture(fixture) {
    if (!fixture || !fixture.kickoff) {
        return false;
    }

    if (isFinishedStatus(fixture.status)) {
        return false;
    }

    const kickoffTime = new Date(fixture.kickoff).getTime();

    if (!Number.isFinite(kickoffTime)) {
        return false;
    }

    return kickoffTime > Date.now();
}

/*
 * API-Football returns predictions in a structure similar to:
 *
 * response[0].predictions.percent.home
 * response[0].predictions.percent.draw
 * response[0].predictions.percent.away
 *
 * Values may be strings such as "56%" or "31%".
 *
 * We normalize that into the structure expected by
 * prediction-engine.js.
 */
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
        response.predictions ||
        {};

    const percent =
        predictions.percent ||
        {};

    const home = parsePercentage(percent.home);
    const draw = parsePercentage(percent.draw);
    const away = parsePercentage(percent.away);

    if (
        home === null ||
        draw === null ||
        away === null
    ) {
        return null;
    }

    const normalized = {
        home,
        draw,
        away
    };

    /*
     * Optional markets.
     *
     * We only add these when API-Football actually provides
     * usable probability values. We never invent them.
     */

    const possibleMarkets = [
        ["over_1_5", predictions.over_1_5],
        ["over_2_5", predictions.over_2_5],
        ["btts_yes", predictions.btts_yes],
        ["btts", predictions.btts]
    ];

    for (const [key, value] of possibleMarkets) {
        const parsed = parsePercentage(value);

        if (parsed !== null) {
            normalized[key] = parsed;
        }
    }

    return normalized;
}

async function getFixturePrediction(fixtureId) {
    const data = await apiFootball(
        `/predictions?fixture=${encodeURIComponent(fixtureId)}`
    );

    return normalizeProviderPrediction(data);
}

module.exports = async function handler(req, res) {
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

    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    if (req.method !== "GET") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed."
        });
    }

    const date = getNigeriaDate();

    try {
        /*
         * STEP 1
         * Get all fixtures for today's Nigerian date.
         */
        const fixtureData = await apiFootball(
            `/fixtures?date=${date}`
        );

        const rawFixtures =
            Array.isArray(fixtureData.response)
                ? fixtureData.response
                : [];

        /*
         * STEP 2
         * Normalize fixtures.
         */
        const fixtures =
            rawFixtures
                .map(normalizeFixture)
                .filter(fixture => fixture.id);

        /*
         * STEP 3
         * Keep only fixtures that have not started.
         */
        const upcomingFixtures =
            fixtures.filter(isUpcomingFixture);

        /*
         * STEP 4
         *
         * API-Football Free plan allows roughly 100 requests/day.
         *
         * We currently have no need for team-statistics calls.
         *
         * Today's fixture request = 1 request.
         * Prediction calls = maximum 40 here.
         *
         * This keeps the daily prediction process within
         * the available request budget in normal operation.
         */
        const fixturesToProcess =
            upcomingFixtures.slice(0, 40);

        const predictionResults = [];

        /*
         * STEP 5
         * Get real API-Football prediction data for each fixture.
         *
         * One failed fixture must NOT crash the entire endpoint.
         */
        for (const fixture of fixturesToProcess) {
            try {
                const providerPrediction =
                    await getFixturePrediction(
                        fixture.fixtureId
                    );

                if (!providerPrediction) {
                    predictionResults.push({
                        fixtureId: fixture.fixtureId,
                        success: false,
                        reason:
                            "API-Football returned no usable probability data."
                    });

                    continue;
                }

                predictionResults.push({
                    fixture,
                    providerPrediction,
                    success: true
                });

            } catch (error) {
                predictionResults.push({
                    fixtureId: fixture.fixtureId,
                    success: false,
                    reason: error.message
                });
            }
        }

        /*
         * STEP 6
         * Convert successful provider results into the
         * structure expected by prediction-engine.js.
         */
        const engineFixtures =
            predictionResults
                .filter(item => item.success)
                .map(item => ({
                    ...item.fixture,
                    providerPrediction:
                        item.providerPrediction
                }));

        /*
         * STEP 7
         * Generate, validate and rank predictions.
         *
         * prediction-engine.js:
         * - uses real provider probabilities
         * - rejects invalid probabilities
         * - rejects probabilities below 50%
         * - ranks strongest predictions
         * - limits publication to 50
         */
        const result =
            generateDailyPredictions(
                engineFixtures,
                50
            );

        /*
         * STEP 8
         * Return production response.
         */
        return res.status(200).json({
            success: true,

            source: "API-Football",

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
                    predictionResults.filter(
                        item => item.success
                    ).length,

                providerFailures:
                    predictionResults.filter(
                        item => !item.success
                    ).length,

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

            failedFixtures:
                predictionResults
                    .filter(item => !item.success)
                    .map(item => ({
                        fixtureId:
                            item.fixtureId,
                        reason:
                            item.reason
                    })),

            message:
                result.published > 0
                    ? "PaceFetch production predictions generated successfully."
                    : "No qualifying predictions are available today. No predictions were manufactured."
        });

    } catch (error) {
        console.error(
            "PaceFetch predictions error:",
            error
        );

        return res.status(500).json({
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
