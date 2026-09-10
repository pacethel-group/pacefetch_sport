// api/cron/predictions.js


const {
    generateDailyPredictions
} = require("../prediction-engine");


const API_URL =
    "https://v3.football.api-sports.io";


/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/


function sendJSON(
    res,
    status,
    payload
) {

    return res
        .status(status)
        .json(payload);

}


function getNigeriaDate() {

    return new Intl.DateTimeFormat(
        "en-CA",
        {
            timeZone:
                "Africa/Lagos",

            year:
                "numeric",

            month:
                "2-digit",

            day:
                "2-digit"
        }
    ).format(
        new Date()
    );

}


function parsePercentage(
    value
) {

    if (
        typeof value ===
        "string"
    ) {

        value =
            value
                .replace(
                    "%",
                    ""
                )
                .trim();

    }


    const number =
        Number(value);


    if (
        !Number.isFinite(
            number
        )
    ) {

        return null;

    }


    if (
        number < 0 ||
        number > 100
    ) {

        return null;

    }


    return number;

}


/*
|--------------------------------------------------------------------------
| API-Football request
|--------------------------------------------------------------------------
*/


async function apiFootball(
    path
) {

    const key =
        process.env.API_FOOTBALL_KEY;


    if (!key) {

        throw new Error(
            "API_FOOTBALL_KEY is not configured."
        );

    }


    const response =
        await fetch(
            `${API_URL}${path}`,
            {
                method:
                    "GET",

                headers: {
                    "x-apisports-key":
                        key
                }
            }
        );


    let data;

    try {

        data =
            await response.json();

    } catch (
        error
    ) {

        throw new Error(
            `API-Football returned invalid JSON. HTTP ${response.status}.`
        );

    }


    if (!response.ok) {

        throw new Error(
            `API-Football HTTP ${response.status}`
        );

    }


    if (
        data &&
        data.errors &&
        Object.keys(
            data.errors
        ).length
    ) {

        throw new Error(
            JSON.stringify(
                data.errors
            )
        );

    }


    return data;

}


/*
|--------------------------------------------------------------------------
| Normalize fixture
|--------------------------------------------------------------------------
*/


function normalizeFixture(
    item
) {

    const fixture =
        item.fixture ||
        {};


    const teams =
        item.teams ||
        {};


    const league =
        item.league ||
        {};


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

        kickoff:
            fixture.date ||
            null,

        status:
            fixture.status?.short ||
            "NS",

        league:
            league.name ||
            "Unknown League",

        country:
            league.country ||
            "Unknown",

        leagueId:
            league.id ||
            null,

        season:
            league.season ||
            null

    };

}


/*
|--------------------------------------------------------------------------
| Check whether fixture is upcoming
|--------------------------------------------------------------------------
*/


function isUpcoming(
    fixture
) {

    if (
        !fixture ||
        !fixture.kickoff
    ) {

        return false;

    }


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


    const status =
        String(
            fixture.status ||
            ""
        ).toUpperCase();


    if (
        finishedStatuses.includes(
            status
        )
    ) {

        return false;

    }


    const kickoff =
        new Date(
            fixture.kickoff
        ).getTime();


    if (
        !Number.isFinite(
            kickoff
        )
    ) {

        return false;

    }


    return (
        kickoff >
        Date.now()
    );

}


/*
|--------------------------------------------------------------------------
| Normalize provider prediction
|--------------------------------------------------------------------------
*/


function normalizePrediction(
    data
) {

    const response =
        Array.isArray(
            data.response
        )
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


    if (
        home === null ||
        draw === null ||
        away === null
    ) {

        return null;

    }


    return {

        home,

        draw,

        away

    };

}


/*
|--------------------------------------------------------------------------
| Get provider prediction
|--------------------------------------------------------------------------
*/


async function getPrediction(
    fixtureId
) {

    const data =
        await apiFootball(
            `/predictions?fixture=${fixtureId}`
        );


    return normalizePrediction(
        data
    );

}


/*
|--------------------------------------------------------------------------
| Create history records
|--------------------------------------------------------------------------
*/


function createHistoryRecords(
    predictions
) {

    if (
        !Array.isArray(
            predictions
        )
    ) {

        return [];

    }


    return predictions
        .map(
            prediction => {

                if (
                    !prediction ||
                    !prediction.fixtureId
                ) {

                    return null;

                }


                const historyId =
                    [
                        prediction.fixtureId,

                        prediction.market,

                        prediction.selection,

                        prediction.modelVersion
                    ]
                    .join(
                        "-"
                    );


                return {

                    historyId,

                    fixtureId:
                        prediction.fixtureId,

                    homeTeam:
                        prediction.homeTeam,

                    awayTeam:
                        prediction.awayTeam,

                    kickoff:
                        prediction.kickoff,

                    league:
                        prediction.league,

                    country:
                        prediction.country,

                    market:
                        prediction.market,

                    selection:
                        prediction.selection,

                    probability:
                        prediction.probability,

                    confidence:
                        prediction.confidence,

                    source:
                        prediction.source ||
                        "API-Football",

                    modelVersion:
                        prediction.modelVersion ||
                        null,

                    dataQuality:
                        prediction.dataQuality,

                    providerAgreement:
                        prediction.providerAgreement,

                    sampleQuality:
                        prediction.sampleQuality,

                    rank:
                        prediction.rank,

                    result:
                        "pending",

                    actualResult:
                        null,

                    finalScore:
                        null,

                    createdAt:
                        new Date().toISOString(),

                    evaluatedAt:
                        null

                };

            }
        )
        .filter(
            Boolean
        );

}


/*
|--------------------------------------------------------------------------
| Save history
|--------------------------------------------------------------------------
*/


async function saveHistory(
    records
) {

    if (
        !Array.isArray(
            records
        ) ||
        !records.length
    ) {

        return {

            success:
                true,

            saved:
                0

        };

    }


    const secret =
        process.env.CRON_SECRET;


    if (!secret) {

        throw new Error(
            "CRON_SECRET is not configured."
        );

    }


    const historyURL =
        process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}/api/history`
            : null;


    if (!historyURL) {

        throw new Error(
            "VERCEL_URL is not available."
        );

    }


    const response =
        await fetch(
            historyURL,
            {
                method:
                    "POST",

                headers: {

                    "Content-Type":
                        "application/json",

                    "Authorization":
                        `Bearer ${secret}`

                },

                body:
                    JSON.stringify({
                        predictions:
                            records
                    })

            }
        );


    let data;

    try {

        data =
            await response.json();

    } catch (
        error
    ) {

        throw new Error(
            `History API returned invalid JSON. HTTP ${response.status}.`
        );

    }


    if (!response.ok) {

        throw new Error(
            data?.error ||
            `History API HTTP ${response.status}`
        );

    }


    return data;

}


/*
|--------------------------------------------------------------------------
| Cron authorization
|--------------------------------------------------------------------------
*/


function isAuthorizedCron(
    req
) {

    const secret =
        process.env.CRON_SECRET;


    if (!secret) {

        return false;

    }


    const authorization =
        req.headers.authorization ||
        "";


    if (
        authorization ===
        `Bearer ${secret}`
    ) {

        return true;

    }


    /*
    |--------------------------------------------------------------------------
    | Vercel Cron automatically sends:
    | Authorization: Bearer <CRON_SECRET>
    |
    | We intentionally require the secret here.
    |--------------------------------------------------------------------------
    */


    return false;

}


/*
|--------------------------------------------------------------------------
| Cron handler
|--------------------------------------------------------------------------
*/


module.exports =
async function handler(
    req,
    res
) {

    /*
    |--------------------------------------------------------------------------
    | CORS
    |--------------------------------------------------------------------------
    */

    res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
    );


    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET"
    );


    /*
    |--------------------------------------------------------------------------
    | Method
    |--------------------------------------------------------------------------
    */

    if (
        req.method !== "GET"
    ) {

        return sendJSON(
            res,
            405,
            {

                success:
                    false,

                error:
                    "Method not allowed."

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | Authorization
    |--------------------------------------------------------------------------
    */

    if (
        !isAuthorizedCron(
            req
        )
    ) {

        return sendJSON(
            res,
            401,
            {

                success:
                    false,

                error:
                    "Unauthorized."

            }
        );

    }


    try {

        /*
        |--------------------------------------------------------------------------
        | Nigeria date
        |--------------------------------------------------------------------------
        */

        const date =
            getNigeriaDate();


        /*
        |--------------------------------------------------------------------------
        | Get today's fixtures
        |--------------------------------------------------------------------------
        */

        const fixtureData =
            await apiFootball(
                `/fixtures?date=${date}`
            );


        const fixtures =
            (
                fixtureData.response ||
                []
            )
            .map(
                normalizeFixture
            )
            .filter(
                fixture =>
                    fixture.id
            );


        /*
        |--------------------------------------------------------------------------
        | Only upcoming fixtures
        |--------------------------------------------------------------------------
        */

        const upcoming =
            fixtures.filter(
                isUpcoming
            );


        /*
        |--------------------------------------------------------------------------
        | Free API plan protection
        |
        | One fixtures request + maximum
        | 20 prediction requests.
        |--------------------------------------------------------------------------
        */

        const selected =
            upcoming.slice(
                0,
                20
            );


        /*
        |--------------------------------------------------------------------------
        | Fetch provider predictions
        |--------------------------------------------------------------------------
        */

        const engineFixtures =
            [];


        let providerFailures =
            0;


        for (
            const fixture
            of selected
        ) {

            try {

                const prediction =
                    await getPrediction(
                        fixture.fixtureId
                    );


                if (
                    !prediction
                ) {

                    providerFailures++;

                    continue;

                }


                engineFixtures.push({

                    ...fixture,

                    providerPrediction:
                        prediction

                });

            } catch (
                error
            ) {

                providerFailures++;


                console.error(
                    `Cron prediction failed for fixture ${fixture.fixtureId}:`,
                    error.message
                );

            }

        }


        /*
        |--------------------------------------------------------------------------
        | Generate PaceFetch predictions
        |--------------------------------------------------------------------------
        */

        const result =
            generateDailyPredictions(
                engineFixtures,
                50
            );


        const predictions =
            Array.isArray(
                result.predictions
            )
                ? result.predictions
                : [];


        /*
        |--------------------------------------------------------------------------
        | Convert to history records
        |--------------------------------------------------------------------------
        */

        const historyRecords =
            createHistoryRecords(
                predictions
            );


        /*
        |--------------------------------------------------------------------------
        | Save before kickoff
        |--------------------------------------------------------------------------
        */

        let historyResult =
            null;


        if (
            historyRecords.length
        ) {

            historyResult =
                await saveHistory(
                    historyRecords
                );

        }


        /*
        |--------------------------------------------------------------------------
        | Final response
        |--------------------------------------------------------------------------
        */

        return sendJSON(
            res,
            200,
            {

                success:
                    true,

                source:
                    "PaceFetch Daily Cron",

                date,

                generatedAt:
                    new Date().toISOString(),

                summary: {

                    totalFixtures:
                        fixtures.length,

                    upcomingFixtures:
                        upcoming.length,

                    fixturesProcessed:
                        selected.length,

                    providerSuccesses:
                        engineFixtures.length,

                    providerFailures,

                    generated:
                        result.generated,

                    usable:
                        result.usable,

                    rejected:
                        result.rejected,

                    published:
                        result.published,

                    historyRecords:
                        historyRecords.length,

                    historySaved:
                        historyResult
                            ? true
                            : false

                },

                predictions,

                message:
                    predictions.length > 0
                        ? "PaceFetch daily predictions generated and saved successfully."
                        : "No qualifying predictions are available today. No predictions were manufactured."

            }
        );

    } catch (
        error
    ) {

        console.error(
            "PaceFetch daily cron error:",
            error
        );


        return sendJSON(
            res,
            500,
            {

                success:
                    false,

                date:
                    getNigeriaDate(),

                error:
                    error.message ||
                    "Daily prediction cron failed.",

                message:
                    "PaceFetch could not complete the daily prediction process."

            }
        );

    }

};
