// api/predictions.js

const {
    generateDailyPredictions
} = require("./prediction-engine");

const API_URL =
    "https://v3.football.api-sports.io";


function getNigeriaDate() {

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


async function apiFootball(path) {

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
                headers: {
                    "x-apisports-key": key
                }
            }
        );


    const data =
        await response.json();


    if (!response.ok) {

        throw new Error(
            `API-Football HTTP ${response.status}`
        );

    }


    if (
        data.errors &&
        Object.keys(data.errors).length
    ) {

        throw new Error(
            JSON.stringify(data.errors)
        );

    }


    return data;

}


function normalizeFixture(item) {

    const fixture =
        item.fixture || {};

    const teams =
        item.teams || {};

    const league =
        item.league || {};


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


function isUpcoming(fixture) {

    if (!fixture.kickoff) {
        return false;
    }


    const finished = [

        "FT",
        "AET",
        "PEN",
        "CANC",
        "PST",
        "ABD",
        "AWD",
        "WO"

    ];


    if (
        finished.includes(
            String(fixture.status)
                .toUpperCase()
        )
    ) {

        return false;

    }


    return (
        new Date(
            fixture.kickoff
        ).getTime() > Date.now()
    );

}


function parsePercentage(value) {

    if (
        typeof value ===
        "string"
    ) {

        value =
            value.replace(
                "%",
                ""
            ).trim();

    }


    const number =
        Number(value);


    if (
        !Number.isFinite(number) ||
        number < 0 ||
        number > 100
    ) {

        return null;

    }


    return number;

}


function normalizePrediction(data) {

    const response =
        Array.isArray(data.response)
            ? data.response[0]
            : data.response;


    if (!response) {
        return null;
    }


    const predictions =
        response.predictions || {};

    const percent =
        predictions.percent || {};


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


module.exports =
async function handler(
    req,
    res
) {

    res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
    );


    if (
        req.method !== "GET"
    ) {

        return res
            .status(405)
            .json({
                success: false,
                error: "Method not allowed."
            });

    }


    try {

        const date =
            getNigeriaDate();


        /*
         * Get today's fixtures.
         */

        const fixtureData =
            await apiFootball(
                `/fixtures?date=${date}`
            );


        const fixtures =
            (fixtureData.response || [])
                .map(normalizeFixture)
                .filter(
                    fixture =>
                        fixture.id
                );


        /*
         * Only upcoming matches.
         */

        const upcoming =
            fixtures.filter(
                isUpcoming
            );


        /*
         * API-Football Free plan:
         * keep provider calls controlled.
         */

        const selected =
            upcoming.slice(
                0,
                20
            );


        const engineFixtures = [];


        /*
         * Get real API-Football
         * predictions.
         */

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

                    continue;

                }


                engineFixtures.push({

                    ...fixture,

                    providerPrediction:
                        prediction

                });


            } catch (error) {

                console.error(
                    `Prediction failed for ${fixture.fixtureId}:`,
                    error.message
                );

            }

        }


        /*
         * Generate final PaceFetch
         * predictions.
         */

        const result =
            generateDailyPredictions(
                engineFixtures,
                50
            );


        return res
            .status(200)
            .json({

                success: true,

                source:
                    "API-Football",

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

                message:
                    result.published > 0

                        ? "PaceFetch production predictions generated successfully."

                        : "No qualifying predictions are available today. No predictions were manufactured."

            });


    } catch (error) {

        console.error(
            "PaceFetch predictions:",
            error
        );


        return res
            .status(500)
            .json({

                success: false,

                date:
                    getNigeriaDate(),

                error:
                    error.message,

                message:
                    "PaceFetch could not generate today's predictions."

            });

    }

};
