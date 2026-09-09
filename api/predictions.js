// api/predictions.js

const {
    generateDailyPredictions
} = require("./prediction-engine");

const API_FOOTBALL_KEY =
    process.env.API_FOOTBALL_KEY;

const API_FOOTBALL_HOST =
    "v3.football.api-sports.io";


async function apiFootball(endpoint, params = {}) {

    const url = new URL(
        `https://${API_FOOTBALL_HOST}/${endpoint}`
    );

    for (const [key, value] of Object.entries(params)) {
        if (
            value !== undefined &&
            value !== null &&
            value !== ""
        ) {
            url.searchParams.set(key, value);
        }
    }

    const response = await fetch(url, {
        headers: {
            "x-apisports-key": API_FOOTBALL_KEY
        }
    });

    if (!response.ok) {
        throw new Error(
            `API-Football returned ${response.status}`
        );
    }

    return response.json();
}


/* -------------------------------------------------------
   DATE
------------------------------------------------------- */

function getTodayNigeriaDate() {

    return new Intl.DateTimeFormat(
        "en-CA",
        {
            timeZone: "Africa/Lagos",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }
    ).format(new Date());
}


/* -------------------------------------------------------
   NORMALIZE FIXTURE
------------------------------------------------------- */

function normalizeFixture(fixture) {

    return {
        id: fixture.fixture?.id,

        kickoff:
            fixture.fixture?.date,

        homeTeam:
            fixture.teams?.home?.name,

        awayTeam:
            fixture.teams?.away?.name,

        homeTeamId:
            fixture.teams?.home?.id,

        awayTeamId:
            fixture.teams?.away?.id,

        league:
            fixture.league?.name,

        leagueId:
            fixture.league?.id,

        country:
            fixture.league?.country,

        source: "API-Football"
    };
}


/* -------------------------------------------------------
   BASIC TEAM FORM EXTRACTION
------------------------------------------------------- */

function extractRecentGoals(fixtures, teamId) {

    const completed =
        (fixtures || [])
            .filter(item => item.fixture?.status?.short === "FT")
            .slice(0, 10);

    let goalsFor = 0;
    let goalsAgainst = 0;

    let count = 0;

    for (const match of completed) {

        const homeId =
            match.teams?.home?.id;

        const awayId =
            match.teams?.away?.id;

        const homeGoals =
            Number(match.goals?.home);

        const awayGoals =
            Number(match.goals?.away);

        if (
            !Number.isFinite(homeGoals) ||
            !Number.isFinite(awayGoals)
        ) {
            continue;
        }

        if (homeId === teamId) {
            goalsFor += homeGoals;
            goalsAgainst += awayGoals;
            count++;
        }

        if (awayId === teamId) {
            goalsFor += awayGoals;
            goalsAgainst += homeGoals;
            count++;
        }
    }

    if (count === 0) {
        return {
            goalsFor: 1.2,
            goalsAgainst: 1.2,
            matches: 0
        };
    }

    return {
        goalsFor: goalsFor / count,
        goalsAgainst: goalsAgainst / count,
        matches: count
    };
}


/* -------------------------------------------------------
   GET TEAM RECENT FORM
------------------------------------------------------- */

async function getTeamForm(teamId, leagueId) {

    if (!teamId) {
        return {
            goalsFor: 1.2,
            goalsAgainst: 1.2,
            matches: 0
        };
    }

    const currentSeason =
        new Date().getFullYear();

    try {

        const result = await apiFootball(
            "fixtures",
            {
                team: teamId,
                season: currentSeason,
                last: 10
            }
        );

        return extractRecentGoals(
            result.response,
            teamId
        );

    } catch (error) {

        console.error(
            "Team form error:",
            error.message
        );

        return {
            goalsFor: 1.2,
            goalsAgainst: 1.2,
            matches: 0
        };
    }
}


/* -------------------------------------------------------
   GET API-FOOTBALL PROVIDER PREDICTION
------------------------------------------------------- */

async function getProviderPrediction(
    fixtureId
) {

    try {

        const result =
            await apiFootball(
                "predictions",
                {
                    fixture: fixtureId
                }
            );

        const prediction =
            result.response?.[0]?.predictions;

        if (!prediction) {
            return null;
        }

        return {
            home:
                Number(
                    prediction.percent?.home
                ) || null,

            draw:
                Number(
                    prediction.percent?.draw
                ) || null,

            away:
                Number(
                    prediction.percent?.away
                ) || null
        };

    } catch (error) {

        console.error(
            "Provider prediction error:",
            error.message
        );

        return null;
    }
}


/* -------------------------------------------------------
   HANDLER
------------------------------------------------------- */

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
        return res.status(200).end();
    }

    try {

        if (!API_FOOTBALL_KEY) {

            return res.status(500).json({
                success: false,
                error:
                    "API_FOOTBALL_KEY is not configured."
            });
        }


        const requestedDate =
            req.query?.date ||
            getTodayNigeriaDate();


        /*
         * Get today's fixtures.
         */
        const fixtureResult =
            await apiFootball(
                "fixtures",
                {
                    date: requestedDate
                }
            );


        const rawFixtures =
            fixtureResult.response || [];


        /*
         * Only upcoming matches.
         */
        const upcoming =
            rawFixtures.filter(
                fixture => {

                    const status =
                        fixture.fixture?.status?.short;

                    return [
                        "NS",
                        "TBD"
                    ].includes(status);
                }
            );


        const normalizedFixtures = [];


        /*
         * Process fixtures.
         *
         * We deliberately keep this conservative.
         * API request limits mean we shouldn't hammer
         * the provider for every possible endpoint.
         */
        for (const rawFixture of upcoming) {

            const fixture =
                normalizeFixture(rawFixture);


            const homeForm =
                await getTeamForm(
                    fixture.homeTeamId,
                    fixture.leagueId
                );


            const awayForm =
                await getTeamForm(
                    fixture.awayTeamId,
                    fixture.leagueId
                );


            const providerPrediction =
                await getProviderPrediction(
                    fixture.id
                );


            fixture.teamStats = {

                homeGoalsFor:
                    homeForm.goalsFor,

                homeGoalsAgainst:
                    homeForm.goalsAgainst,

                awayGoalsFor:
                    awayForm.goalsFor,

                awayGoalsAgainst:
                    awayForm.goalsAgainst
            };


            fixture.providerPrediction =
                providerPrediction;


            normalizedFixtures.push(
                fixture
            );
        }


        /*
         * Generate, validate and rank.
         */
        const result =
            generateDailyPredictions(
                normalizedFixtures,
                50
            );


        return res.status(200).json({

            success: true,

            date: requestedDate,

            totalFixtures:
                normalizedFixtures.length,

            generated:
                result.generated,

            rejected:
                result.rejected,

            published:
                result.published,

            predictions:
                result.predictions
        });


    } catch (error) {

        console.error(
            "Prediction engine error:",
            error
        );

        return res.status(500).json({

            success: false,

            error:
                error.message ||
                "Prediction engine failed."
        });
    }
};
