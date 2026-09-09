// ============================================================
// PaceFetch - Temporary Prediction Connection Test
// ============================================================

const API_FOOTBALL_KEY =
    process.env.API_FOOTBALL_KEY;

const API_FOOTBALL_BASE =
    "https://v3.football.api-sports.io";


// ============================================================
// API-FOOTBALL REQUEST
// ============================================================

async function apiFootball(
    endpoint,
    params = {}
) {

    if (!API_FOOTBALL_KEY) {

        throw new Error(
            "API_FOOTBALL_KEY is missing from Vercel Environment Variables."
        );

    }


    const url =
        new URL(
            `${API_FOOTBALL_BASE}${endpoint}`
        );


    Object.entries(params).forEach(
        ([key, value]) => {

            if (
                value !== undefined &&
                value !== null &&
                value !== ""
            ) {

                url.searchParams.set(
                    key,
                    String(value)
                );

            }

        }
    );


    const response =
        await fetch(
            url.toString(),
            {
                method: "GET",

                headers: {
                    "x-apisports-key":
                        API_FOOTBALL_KEY,

                    Accept:
                        "application/json"
                }
            }
        );


    const text =
        await response.text();


    let data = null;


    try {

        data =
            text
                ? JSON.parse(text)
                : null;

    } catch {

        throw new Error(
            `API-Football returned invalid JSON. HTTP ${response.status}`
        );

    }


    if (!response.ok) {

        throw new Error(
            data?.message ||
            `API-Football returned HTTP ${response.status}`
        );

    }


    return data;

}


// ============================================================
// NIGERIA DATE
// ============================================================

function getNigeriaDate() {

    return new Intl.DateTimeFormat(
        "en-CA",
        {
            timeZone: "Africa/Lagos",

            year: "numeric",

            month: "2-digit",

            day: "2-digit"
        }
    ).format(
        new Date()
    );

}


// ============================================================
// MAIN HANDLER
// ============================================================

export default async function handler(
    req,
    res
) {

    // --------------------------------------------------------
    // CORS
    // --------------------------------------------------------

    res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
    );


    res.setHeader(
        "Cache-Control",
        "no-store"
    );


    // --------------------------------------------------------
    // ONLY GET
    // --------------------------------------------------------

    if (
        req.method !== "GET"
    ) {

        return res
            .status(405)
            .json({

                success: false,

                error:
                    "Only GET requests are allowed."

            });

    }


    try {

        // ----------------------------------------------------
        // TODAY IN NIGERIA
        // ----------------------------------------------------

        const date =
            getNigeriaDate();


        // ----------------------------------------------------
        // TEST API-FOOTBALL
        // ----------------------------------------------------

        const data =
            await apiFootball(
                "/fixtures",
                {
                    date
                }
            );


        // ----------------------------------------------------
        // EXTRACT FIXTURES
        // ----------------------------------------------------

        const fixtures =
            Array.isArray(
                data?.response
            )
                ? data.response
                : [];


        // ----------------------------------------------------
        // RETURN SAFE TEST RESULT
        // ----------------------------------------------------

        return res
            .status(200)
            .json({

                success: true,

                message:
                    "PaceFetch is successfully connected to API-Football.",

                date,

                apiFootballStatus:
                    data?.get ||
                    null,

                results:
                    data?.results ??
                    fixtures.length,

                fixtureCount:
                    fixtures.length,

                errors:
                    data?.errors ||
                    {},

                sampleFixtures:
                    fixtures
                        .slice(0, 5)
                        .map(
                            fixture => ({

                                fixtureId:
                                    fixture.fixture?.id,

                                home:
                                    fixture.teams
                                        ?.home
                                        ?.name,

                                away:
                                    fixture.teams
                                        ?.away
                                        ?.name,

                                league:
                                    fixture.league
                                        ?.name,

                                country:
                                    fixture.league
                                        ?.country,

                                kickoff:
                                    fixture.fixture
                                        ?.date,

                                status:
                                    fixture.fixture
                                        ?.status
                                        ?.short

                            })
                        )

            });

    } catch (error) {

        console.error(
            "PaceFetch API-Football test failed:",
            error
        );


        return res
            .status(500)
            .json({

                success: false,

                message:
                    "PaceFetch could not connect to API-Football.",

                error:
                    error?.message ||
                    "Unknown error."

            });

    }

}
