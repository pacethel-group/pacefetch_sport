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
