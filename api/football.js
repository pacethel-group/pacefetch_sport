// api/football.js

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
    data
) {

    return res
        .status(status)
        .json(data);

}


function parsePositiveInteger(
    value
) {

    const number =
        Number(value);

    if (
        !Number.isInteger(number) ||
        number <= 0
    ) {

        return null;

    }

    return number;
}


function getQueryValue(
    req,
    key
) {

    if (
        !req ||
        !req.query
    ) {

        return null;

    }

    const value =
        req.query[key];

    if (
        Array.isArray(value)
    ) {

        return value[0];

    }

    return value || null;

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
                method: "GET",

                headers: {
                    "x-apisports-key":
                        key,

                    "Accept":
                        "application/json"
                }
            }
        );


    let data;


    try {

        data =
            await response.json();

    } catch (error) {

        throw new Error(
            "API-Football returned an invalid response."
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
        typeof data.errors ===
            "object" &&
        Object.keys(
            data.errors
        ).length > 0
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
| Fixtures
|--------------------------------------------------------------------------
*/

async function getFixtures(
    date
) {

    if (!date) {

        throw new Error(
            "A fixture date is required."
        );

    }


    return apiFootball(
        `/fixtures?date=${encodeURIComponent(
            date
        )}`
    );

}


/*
|--------------------------------------------------------------------------
| Single fixture
|--------------------------------------------------------------------------
*/

async function getFixture(
    fixtureId
) {

    const id =
        parsePositiveInteger(
            fixtureId
        );


    if (!id) {

        throw new Error(
            "A valid fixture ID is required."
        );

    }


    return apiFootball(
        `/fixtures?id=${id}`
    );

}


/*
|--------------------------------------------------------------------------
| Prediction
|--------------------------------------------------------------------------
*/

async function getPrediction(
    fixtureId
) {

    const id =
        parsePositiveInteger(
            fixtureId
        );


    if (!id) {

        throw new Error(
            "A valid fixture ID is required."
        );

    }


    return apiFootball(
        `/predictions?fixture=${id}`
    );

}


/*
|--------------------------------------------------------------------------
| Head-to-head
|--------------------------------------------------------------------------
*/

async function getH2H(
    teamA,
    teamB
) {

    const firstTeam =
        parsePositiveInteger(
            teamA
        );

    const secondTeam =
        parsePositiveInteger(
            teamB
        );


    if (
        !firstTeam ||
        !secondTeam
    ) {

        throw new Error(
            "Two valid team IDs are required for H2H."
        );

    }


    /*
     * API-Football H2H format:
     *
     * h2h=TEAM_A-TEAM_B
     */

    return apiFootball(
        `/fixtures/headtohead?h2h=${firstTeam}-${secondTeam}`
    );

}


/*
|--------------------------------------------------------------------------
| Team statistics
|--------------------------------------------------------------------------
*/

async function getTeamStatistics(
    teamId,
    leagueId,
    season
) {

    const team =
        parsePositiveInteger(
            teamId
        );

    const league =
        parsePositiveInteger(
            leagueId
        );


    if (!team) {

        throw new Error(
            "A valid team ID is required."
        );

    }


    if (!league) {

        throw new Error(
            "A valid league ID is required."
        );

    }


    /*
     * The season is optional.
     *
     * If supplied, it is passed
     * directly to API-Football.
     */

    let path =
        `/teams/statistics?league=${league}&team=${team}`;


    if (season) {

        path +=
            `&season=${encodeURIComponent(
                season
            )}`;

    }


    return apiFootball(
        path
    );

}


/*
|--------------------------------------------------------------------------
| Fixture events
|--------------------------------------------------------------------------
*/

async function getFixtureEvents(
    fixtureId
) {

    const id =
        parsePositiveInteger(
            fixtureId
        );


    if (!id) {

        throw new Error(
            "A valid fixture ID is required."
        );

    }


    return apiFootball(
        `/fixtures/events?fixture=${id}`
    );

}


/*
|--------------------------------------------------------------------------
| Fixture lineups
|--------------------------------------------------------------------------
*/

async function getFixtureLineups(
    fixtureId
) {

    const id =
        parsePositiveInteger(
            fixtureId
        );


    if (!id) {

        throw new Error(
            "A valid fixture ID is required."
        );

    }


    return apiFootball(
        `/fixtures/lineups?fixture=${id}`
    );

}


/*
|--------------------------------------------------------------------------
| Fixture statistics
|--------------------------------------------------------------------------
*/

async function getFixtureStatistics(
    fixtureId
) {

    const id =
        parsePositiveInteger(
            fixtureId
        );


    if (!id) {

        throw new Error(
            "A valid fixture ID is required."
        );

    }


    return apiFootball(
        `/fixtures/statistics?fixture=${id}`
    );

}


/*
|--------------------------------------------------------------------------
| Teams
|--------------------------------------------------------------------------
*/

async function getTeam(
    teamId
) {

    const id =
        parsePositiveInteger(
            teamId
        );


    if (!id) {

        throw new Error(
            "A valid team ID is required."
        );

    }


    return apiFootball(
        `/teams?id=${id}`
    );

}


/*
|--------------------------------------------------------------------------
| Handler
|--------------------------------------------------------------------------
*/

module.exports =
async function handler(
    req,
    res
) {

    /*
     * CORS
     */

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


    /*
     * OPTIONS
     */

    if (
        req.method ===
        "OPTIONS"
    ) {

        return res
            .status(204)
            .end();

    }


    /*
     * GET only
     */

    if (
        req.method !==
        "GET"
    ) {

        return sendJSON(
            res,
            405,
            {
                success: false,

                error:
                    "Method not allowed."
            }
        );

    }


    try {

        /*
         * Action
         */

        const action =
            String(
                getQueryValue(
                    req,
                    "action"
                ) ||
                "fixtures"
            )
            .toLowerCase();


        /*
         * --------------------------------------------------------------
         * Fixtures
         * --------------------------------------------------------------
         */

        if (
            action ===
            "fixtures"
        ) {

            const date =
                getQueryValue(
                    req,
                    "date"
                );


            if (!date) {

                return sendJSON(
                    res,
                    400,
                    {
                        success: false,

                        error:
                            "Missing date parameter."
                    }
                );

            }


            const data =
                await getFixtures(
                    date
                );


            return sendJSON(
                res,
                200,
                {

                    success: true,

                    action:
                        "fixtures",

                    date,

                    response:
                        data.response ||
                        [],

                    results:
                        data.results ||
                        0

                }
            );

        }


        /*
         * --------------------------------------------------------------
         * Single fixture
         * --------------------------------------------------------------
         */

        if (
            action ===
            "fixture"
        ) {

            const fixtureId =
                getQueryValue(
                    req,
                    "id"
                ) ||
                getQueryValue(
                    req,
                    "fixture"
                );


            if (!fixtureId) {

                return sendJSON(
                    res,
                    400,
                    {
                        success: false,

                        error:
                            "Missing fixture ID."
                    }
                );

            }


            const data =
                await getFixture(
                    fixtureId
                );


            return sendJSON(
                res,
                200,
                {

                    success: true,

                    action:
                        "fixture",

                    fixtureId:
                        Number(
                            fixtureId
                        ),

                    response:
                        data.response ||
                        [],

                    results:
                        data.results ||
                        0

                }
            );

        }


        /*
         * --------------------------------------------------------------
         * Prediction
         * --------------------------------------------------------------
         */

        if (
            action ===
            "prediction" ||
            action ===
            "predictions"
        ) {

            const fixtureId =
                getQueryValue(
                    req,
                    "fixture"
                ) ||
                getQueryValue(
                    req,
                    "id"
                );


            if (!fixtureId) {

                return sendJSON(
                    res,
                    400,
                    {
                        success: false,

                        error:
                            "Missing fixture ID."
                    }
                );

            }


            const data =
                await getPrediction(
                    fixtureId
                );


            return sendJSON(
                res,
                200,
                {

                    success: true,

                    action:
                        "prediction",

                    fixtureId:
                        Number(
                            fixtureId
                        ),

                    response:
                        data.response ||
                        [],

                    results:
                        data.results ||
                        0

                }
            );

        }


        /*
         * --------------------------------------------------------------
         * H2H
         * --------------------------------------------------------------
         */

        if (
            action ===
            "h2h"
        ) {

            const teamA =
                getQueryValue(
                    req,
                    "teamA"
                ) ||
                getQueryValue(
                    req,
                    "home"
                );


            const teamB =
                getQueryValue(
                    req,
                    "teamB"
                ) ||
                getQueryValue(
                    req,
                    "away"
                );


            if (
                !teamA ||
                !teamB
            ) {

                return sendJSON(
                    res,
                    400,
                    {
                        success: false,

                        error:
                            "Both teamA and teamB are required."
                    }
                );

            }


            const data =
                await getH2H(
                    teamA,
                    teamB
                );


            return sendJSON(
                res,
                200,
                {

                    success: true,

                    action:
                        "h2h",

                    teamA:
                        Number(
                            teamA
                        ),

                    teamB:
                        Number(
                            teamB
                        ),

                    response:
                        data.response ||
                        [],

                    results:
                        data.results ||
                        0

                }
            );

        }


        /*
         * --------------------------------------------------------------
         * Team statistics
         * --------------------------------------------------------------
         */

        if (
            action ===
            "statistics"
        ) {

            const teamId =
                getQueryValue(
                    req,
                    "team"
                );


            const leagueId =
                getQueryValue(
                    req,
                    "league"
                );


            const season =
                getQueryValue(
                    req,
                    "season"
                );


            if (
                !teamId ||
                !leagueId
            ) {

                return sendJSON(
                    res,
                    400,
                    {
                        success: false,

                        error:
                            "team and league parameters are required."
                    }
                );

            }


            const data =
                await getTeamStatistics(

                    teamId,

                    leagueId,

                    season

                );


            return sendJSON(
                res,
                200,
                {

                    success: true,

                    action:
                        "statistics",

                    teamId:
                        Number(
                            teamId
                        ),

                    leagueId:
                        Number(
                            leagueId
                        ),

                    season:
                        season ||
                        null,

                    response:
                        data.response ||
                        [],

                    results:
                        data.results ||
                        0

                }
            );

        }


        /*
         * --------------------------------------------------------------
         * Fixture events
         * --------------------------------------------------------------
         */

        if (
            action ===
            "events"
        ) {

            const fixtureId =
                getQueryValue(
                    req,
                    "fixture"
                ) ||
                getQueryValue(
                    req,
                    "id"
                );


            if (!fixtureId) {

                return sendJSON(
                    res,
                    400,
                    {
                        success: false,

                        error:
                            "Missing fixture ID."
                    }
                );

            }


            const data =
                await getFixtureEvents(
                    fixtureId
                );


            return sendJSON(
                res,
                200,
                {

                    success: true,

                    action:
                        "events",

                    fixtureId:
                        Number(
                            fixtureId
                        ),

                    response:
                        data.response ||
                        [],

                    results:
                        data.results ||
                        0

                }
            );

        }


        /*
         * --------------------------------------------------------------
         * Fixture lineups
         * --------------------------------------------------------------
         */

        if (
            action ===
            "lineups"
        ) {

            const fixtureId =
                getQueryValue(
                    req,
                    "fixture"
                ) ||
                getQueryValue(
                    req,
                    "id"
                );


            if (!fixtureId) {

                return sendJSON(
                    res,
                    400,
                    {
                        success: false,

                        error:
                            "Missing fixture ID."
                    }
                );

            }


            const data =
                await getFixtureLineups(
                    fixtureId
                );


            return sendJSON(
                res,
                200,
                {

                    success: true,

                    action:
                        "lineups",

                    fixtureId:
                        Number(
                            fixtureId
                        ),

                    response:
                        data.response ||
                        [],

                    results:
                        data.results ||
                        0

                }
            );

        }


        /*
         * --------------------------------------------------------------
         * Fixture statistics
         * --------------------------------------------------------------
         */

        if (
      
