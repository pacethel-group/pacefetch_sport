// api/history.js

"use strict";


/* --------------------------------------------------------------
   PaceFetch Prediction History API
-------------------------------------------------------------- */

/*
 * This endpoint provides persistent prediction history through
 * Upstash Redis REST API.
 *
 * Required Vercel environment variables:
 *
 *     UPSTASH_REDIS_REST_URL
 *     UPSTASH_REDIS_REST_TOKEN
 *
 * The endpoint supports:
 *
 *     GET  /api/history
 *     POST /api/history
 *
 * GET:
 *     Returns stored prediction history.
 *
 * POST:
 *     Stores one prediction or an array of predictions.
 *
 * Predictions should be stored before kickoff so the original
 * prediction cannot be changed after the match begins.
 */


/* --------------------------------------------------------------
   Configuration
-------------------------------------------------------------- */

const REDIS_URL =
    process.env.UPSTASH_REDIS_REST_URL;

const REDIS_TOKEN =
    process.env.UPSTASH_REDIS_REST_TOKEN;


const HISTORY_KEY =
    "pacefetch:prediction-history";


const MAX_HISTORY_RECORDS =
    10000;



/* --------------------------------------------------------------
   JSON response helper
-------------------------------------------------------------- */

function sendJSON(
    res,
    status,
    payload
) {

    return res
        .status(status)
        .json(payload);

}



/* --------------------------------------------------------------
   Redis configuration
-------------------------------------------------------------- */

function ensureRedisConfigured() {

    if (
        !REDIS_URL ||
        !REDIS_TOKEN
    ) {

        throw new Error(
            "History storage is not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to Vercel environment variables."
        );

    }

}



/* --------------------------------------------------------------
   Redis request
-------------------------------------------------------------- */

async function redisRequest(
    command
) {

    ensureRedisConfigured();


    const response =
        await fetch(
            REDIS_URL,
            {
                method:
                    "POST",

                headers: {

                    "Authorization":
                        `Bearer ${REDIS_TOKEN}`,

                    "Content-Type":
                        "application/json"

                },

                body:
                    JSON.stringify(
                        command
                    )

            }
        );


    let data;

    try {

        data =
            await response.json();

    } catch {

        throw new Error(
            "Invalid response received from history storage."
        );

    }


    if (
        !response.ok
    ) {

        throw new Error(
            data?.error ||
            `History storage returned HTTP ${response.status}.`
        );

    }


    if (
        data?.error
    ) {

        throw new Error(
            data.error
        );

    }


    return data;

}



/* --------------------------------------------------------------
   Read history
-------------------------------------------------------------- */

async function readHistory() {

    const result =
        await redisRequest(
            [
                "GET",
                HISTORY_KEY
            ]
        );


    if (
        !result ||
        result.result === null ||
        result.result === undefined
    ) {

        return [];

    }


    let records =
        result.result;


    /*
     * Upstash normally returns the stored JSON string.
     */

    if (
        typeof records ===
        "string"
    ) {

        try {

            records =
                JSON.parse(
                    records
                );

        } catch {

            return [];

        }

    }


    if (
        !Array.isArray(
            records
        )
    ) {

        return [];

    }


    return records;

}



/* --------------------------------------------------------------
   Write history
-------------------------------------------------------------- */

async function writeHistory(
    records
) {

    const limited =
        records
            .slice(
                0,
                MAX_HISTORY_RECORDS
            );


    await redisRequest(
        [
            "SET",
            HISTORY_KEY,
            JSON.stringify(
                limited
            )
        ]
    );


    return limited;

}



/* --------------------------------------------------------------
   Parse request body
-------------------------------------------------------------- */

function parseBody(
    req
) {

    if (
        !req.body
    ) {

        return null;

    }


    if (
        typeof req.body ===
        "object"
    ) {

        return req.body;

    }


    if (
        typeof req.body ===
        "string"
    ) {

        try {

            return JSON.parse(
                req.body
            );

        } catch {

            return null;

        }

    }


    return null;

}



/* --------------------------------------------------------------
   String helper
-------------------------------------------------------------- */

function cleanString(
    value,
    fallback = ""
) {

    if (
        value ===
        undefined ||
        value ===
        null
    ) {

        return fallback;

    }


    return String(
        value
    )
    .trim();

}



/* --------------------------------------------------------------
   Number helper
-------------------------------------------------------------- */

function cleanNumber(
    value
) {

    const number =
        Number(
            value
        );


    return Number.isFinite(
        number
    )
        ? number
        : null;

}



/* --------------------------------------------------------------
   Normalize result
-------------------------------------------------------------- */

function normalizeResult(
    value
) {

    const result =
        cleanString(
            value,
            "pending"
        )
        .toLowerCase();


    if (
        [
            "win",
            "won",
            "correct"
        ].includes(
            result
        )
    ) {

        return "win";

    }


    if (
        [
            "loss",
            "lost",
            "incorrect"
        ].includes(
            result
        )
    ) {

        return "loss";

    }


    if (
        [
            "void",
            "cancelled",
            "canceled"
        ].includes(
            result
        )
    ) {

        return "void";

    }


    return "pending";

}



/* --------------------------------------------------------------
   Normalize prediction
-------------------------------------------------------------- */

function normalizePrediction(
    prediction
) {

    if (
        !prediction ||
        typeof prediction !==
        "object"
    ) {

        return null;

    }


    const fixtureId =
        prediction.fixtureId ??
        prediction.id;


    if (
        fixtureId ===
        undefined ||
        fixtureId ===
        null
    ) {

        return null;

    }


    const probability =
        cleanNumber(
            prediction.probability
        );


    const confidence =
        cleanNumber(
            prediction.confidence
        );


    const record = {

        historyId:
            cleanString(
                prediction.historyId
            ) ||
            `${fixtureId}-${cleanString(
                prediction.market,
                "market"
            )}-${cleanString(
                prediction.selection,
                "selection"
            )}`,

        fixtureId:
            Number.isFinite(
                Number(
                    fixtureId
                )
            )
                ? Number(
                    fixtureId
                )
                : String(
                    fixtureId
                ),

        homeTeam:
            cleanString(
                prediction.homeTeam,
                "Home"
            ),

        awayTeam:
            cleanString(
                prediction.awayTeam,
                "Away"
            ),

        kickoff:
            cleanString(
                prediction.kickoff
            ),

        league:
            cleanString(
                prediction.league,
                "Unknown League"
            ),

        country:
            cleanString(
                prediction.country,
                "Unknown"
            ),

        market:
            cleanString(
                prediction.market,
                "Unknown Market"
            ),

        selection:
            cleanString(
                prediction.selection
            ),

        probability,

        confidence,

        source:
            cleanString(
                prediction.source,
                "API-Football"
            ),

        modelVersion:
            cleanString(
                prediction.modelVersion,
                "PF-1.2"
            ),

        dataQuality:
            cleanNumber(
                prediction.dataQuality
            ),

        providerAgreement:
            cleanNumber(
                prediction.providerAgreement
            ),

        sampleQuality:
            cleanNumber(
                prediction.sampleQuality
            ),

        rank:
            cleanNumber(
                prediction.rank
            ),

        result:
            normalizeResult(
                prediction.result
            ),

        actualResult:
            cleanString(
                prediction.actualResult
            ),

        finalScore:
            cleanString(
                prediction.finalScore
            ),

        createdAt:
            cleanString(
                prediction.createdAt
            ) ||
            new Date().toISOString(),

        evaluatedAt:
            cleanString(
                prediction.evaluatedAt
            ) ||
            null

    };


    return record;

}



/* --------------------------------------------------------------
   Remove duplicate history records
-------------------------------------------------------------- */

function mergeRecords(
    existing,
    incoming
) {

    const map =
        new Map();


    existing.forEach(
        record => {

            if (
                !record ||
                !record.historyId
            ) {

                return;

            }


            map.set(
                String(
                    record.historyId
                ),
                record
            );

        }
    );


    incoming.forEach(
        record => {

            if (
                !record ||
                !record.historyId
            ) {

                return;

            }


            const key =
                String(
                    record.historyId
                );


            const previous =
                map.get(
                    key
                );


            /*
             * If the record already exists, preserve the original
             * prediction information while allowing the result
             * evaluator to update result fields.
             */

            if (
                previous
            ) {

                map.set(
                    key,
                    {
                        ...previous,
                        ...record,

                        /*
                         * Original prediction timestamp should
                         * never be replaced by a later update.
                         */

                        createdAt:
                            previous.createdAt ||
                            record.createdAt,

                        /*
                         * Do not allow an accidental empty result
                         * to erase an existing evaluated result.
                         */

                        result:
                            record.result !==
                                "pending"
                                ? record.result
                                : previous.result ||
                                  "pending"

                    }
                );

            } else {

                map.set(
                    key,
                    record
                );

            }

        }
    );


    return Array.from(
        map.values()
    );

}



/* --------------------------------------------------------------
   Sort records
-------------------------------------------------------------- */

function sortRecords(
    records
) {

    return records.sort(
        (
            a,
            b
        ) => {

            const aTime =
                new Date(
                    a.kickoff ||
                    a.createdAt ||
                    0
                ).getTime();


            const bTime =
                new Date(
                    b.kickoff ||
                    b.createdAt ||
                    0
                ).getTime();


            return (
                bTime -
                aTime
            );

        }
    );

}



/* --------------------------------------------------------------
   Filter history
-------------------------------------------------------------- */

function filterHistory(
    records,
    req
) {

    const query =
        req.query ||
        {};


    let filtered =
        records;


    const market =
        cleanString(
            query.market
        );


    const result =
        cleanString(
            query.result
        )
        .toLowerCase();


    const country =
        cleanString(
            query.country
        );


    const days =
        Number(
            query.days
        );


    if (
        market
    ) {

        filtered =
            filtered.filter(
                record =>
                    String(
                        record.market
                    )
                    .toLowerCase() ===
                    market.toLowerCase()
            );

    }


    if (
        result &&
        result !==
        "all"
    ) {

        filtered =
            filtered.filter(
                record =>
                    normalizeResult(
                        record.result
                    ) === result
            );

    }


    if (
        country
    ) {

        filtered =
            filtered.filter(
                record =>
                    String(
                        record.country
                    )
                    .toLowerCase() ===
                    country.toLowerCase()
            );

    }


    if (
        Number.isFinite(
            days
        ) &&
        days > 0
    ) {

        const cutoff =
            Date.now() -
            days *
            24 *
            60 *
            60 *
            1000;


        filtered =
            filtered.filter(
                record => {

                    const time =
                        new Date(
                            record.kickoff ||
                            record.createdAt
                        )
                        .getTime();


                    return (
                        Number.isFinite(
                            time
                        ) &&
                        time >=
                        cutoff
                    );

                }
            );

    }


    return filtered;

}



/* --------------------------------------------------------------
   GET handler
-------------------------------------------------------------- */

async function handleGET(
    req,
    res
) {

    const records =
        await readHistory();


    const filtered =
        filterHistory(
            records,
            req
        );


    const sorted =
        sortRecords(
            filtered
        );


    const total =
        sorted.length;


    const wins =
        sorted.filter(
            record =>
                normalizeResult(
                    record.result
                ) === "win"
        ).length;


    const losses =
        sorted.filter(
            record =>
                normalizeResult(
                    record.result
                ) === "loss"
        ).length;


    const pending =
        sorted.filter(
            record =>
                normalizeResult(
                    record.result
                ) === "pending"
        ).length;


    const voided =
        sorted.filter(
            record =>
                normalizeResult(
                    record.result
                ) === "void"
        ).length;


    const settled =
        wins +
        losses;


    const accuracy =
        settled > 0
            ? (
                wins /
                settled *
                100
            )
            : null;


    return sendJSON(
        res,
        200,
        {

            success:
                true,

            source:
                "PaceFetch History",

            generatedAt:
                new Date().toISOString(),

            summary: {

                total,

                wins,

                losses,

                pending,

                void:
                    voided,

                settled,

                accuracy:
                    accuracy === null
                        ? null
                        : Math.round(
                            accuracy *
                            10
                        ) / 10

            },

            records:
                sorted

        }
    );

}



/* --------------------------------------------------------------
   POST handler
-------------------------------------------------------------- */

async function handlePOST(
    req,
    res
) {

    const body =
        parseBody(
            req
        );


    if (
        !body
    ) {

        return sendJSON(
            res,
            400,
            {

                success:
                    false,

                error:
                    "Invalid JSON request body."

            }
        );

    }


    let incoming;


    if (
        Array.isArray(
            body.predictions
        )
    ) {

        incoming =
            body.predictions;

    } else if (
        Array.isArray(
            body.records
        )
    ) {

        incoming =
            body.records;

    } else {

        incoming =
            [body];

    }


    const normalized =
        incoming
            .map(
                normalizePrediction
            )
            .filter(
                Boolean
            );


    if (
        normalized.length ===
        0
    ) {

        return sendJSON(
            res,
            400,
            {

                success:
                    false,

                error:
                    "No valid prediction records were supplied."

            }
        );

    }


    const existing =
        await readHistory();


    const merged =
        mergeRecords(
            existing,
            normalized
        );


    const saved =
        await writeHistory(
            sortRecords(
                merged
            )
        );


    return sendJSON(
        res,
        200,
        {

            success:
                true,

            message:
                "Prediction history saved successfully.",

            saved:
                normalized.length,

            total:
                saved.length,

            records:
                normalized

        }
    );

}



/* --------------------------------------------------------------
   Main handler
-------------------------------------------------------------- */

module.exports =
async function handler(
    req,
    res
) {

    res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
    );


    res.setHeader(
        "Access-Control-Al
              "Access-Control-Allow-Origin",
        "*"
    );

    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
    );


    if (req.method === "OPTIONS") {

        return res.status(200).end();

    }


    try {

        const method =
            String(req.method || "GET").toUpperCase();


        /*
        |--------------------------------------------------------------------------
        | GET HISTORY
        |--------------------------------------------------------------------------
        */

        if (method === "GET") {

            const market =
                getQueryValue(
                    req,
                    "market"
                );

            const result =
                getQueryValue(
                    req,
                    "result"
                );

            const country =
                getQueryValue(
                    req,
                    "country"
                );

            const daysValue =
                getQueryValue(
                    req,
                    "days"
                );

            const days =
                daysValue
                    ? parsePositiveInteger(
                        daysValue,
                        0
                    )
                    : 0;


            const records =
                await readHistory();


            const now =
                Date.now();


            const filtered =
                records.filter(
                    record => {

                        if (
                            market &&
                            String(
                                record.market
                            ).toLowerCase() !==
                            String(
                                market
                            ).toLowerCase()
                        ) {

                            return false;

                        }


                        if (
                            result &&
                            String(
                                record.result
                            ).toLowerCase() !==
                            String(
                                result
                            ).toLowerCase()
                        ) {

                            return false;

                        }


                        if (
                            country &&
                            String(
                                record.country
                            ).toLowerCase() !==
                            String(
                                country
                            ).toLowerCase()
                        ) {

                            return false;

                        }


                        if (days > 0) {

                            const createdAt =
                                new Date(
                                    record.createdAt ||
                                    record.kickoff ||
                                    0
                                ).getTime();

                            if (
                                !Number.isFinite(
                                    createdAt
                                )
                            ) {

                                return false;

                            }


                            const age =
                                now -
                                createdAt;


                            const limit =
                                days *
                                24 *
                                60 *
                                60 *
                                1000;


                            if (
                                age > limit
                            ) {

                                return false;

                            }

                        }


                        return true;

                    }
                );


            filtered.sort(
                (
                    first,
                    second
                ) => {

                    const firstTime =
                        new Date(
                            first.kickoff ||
                            first.createdAt ||
                            0
                        ).getTime();


                    const secondTime =
                        new Date(
                            second.kickoff ||
                            second.createdAt ||
                            0
                        ).getTime();


                    return (
                        secondTime -
                        firstTime
                    );

                }
            );


            const summary =
                calculateSummary(
                    filtered
                );


            return res.status(200).json({

                success: true,

                source:
                    "PaceFetch Prediction History",

                generatedAt:
                    new Date().toISOString(),

                summary,

                records:
                    filtered

            });

        }


        /*
        |--------------------------------------------------------------------------
        | POST HISTORY
        |--------------------------------------------------------------------------
        */

        if (method === "POST") {

            const authorization =
                req.headers.authorization ||
                "";


            const expectedSecret =
                process.env.CRON_SECRET;


            if (
                !expectedSecret
            ) {

                return res.status(500).json({

                    success: false,

                    error:
                        "CRON_SECRET is not configured."

                });

            }


            if (
                authorization !==
                `Bearer ${expectedSecret}`
            ) {

                return res.status(401).json({

                    success: false,

                    error:
                        "Unauthorized."

                });

            }


            const body =
                await readRequestBody(
                    req
                );


            let incomingRecords = [];


            if (
                body &&
                Array.isArray(
                    body.predictions
                )
            ) {

                incomingRecords =
                    body.predictions;

            } else if (
                body &&
                Array.isArray(
                    body.records
                )
            ) {

                incomingRecords =
                    body.records;

            } else if (
                body &&
                typeof body ===
                "object"
            ) {

                incomingRecords =
                    [body];

            }


            if (
                !incomingRecords.length
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "No prediction records supplied."

                });

            }


            const existing =
                await readHistory();


            const recordMap =
                new Map();


            for (
                const record
                of existing
            ) {

                const normalized =
                    normalizeRecord(
                        record
                    );


                if (
                    normalized.historyId
                ) {

                    recordMap.set(
                        normalized.historyId,
                        normalized
                    );

                }

            }


            let added = 0;
            let updated = 0;


            for (
                const incoming
                of incomingRecords
            ) {

                const normalized =
                    normalizeRecord(
                        incoming
                    );


                if (
                    !normalized.historyId
                ) {

                    continue;

                }


                const previous =
                    recordMap.get(
                        normalized.historyId
                    );


                if (!previous) {

                    recordMap.set(
                        normalized.historyId,
                        normalized
                    );

                    added++;

                    continue;

                }


                const merged =
                    mergeRecords(
                        previous,
                        normalized
                    );


                recordMap.set(
                    normalized.historyId,
                    merged
                );


                updated++;

            }


            const finalRecords =
                Array.from(
                    recordMap.values()
                )
                .sort(
                    (
                        first,
                        second
                    ) => {

                        const firstTime =
                            new Date(
                                first.kickoff ||
                                first.createdAt ||
                                0
                            ).getTime();


                        const secondTime =
                            new Date(
                                second.kickoff ||
                                second.createdAt ||
                                0
                            ).getTime();


                        return (
                            secondTime -
                            firstTime
                        );

                    }
                )
                .slice(
                    0,
                    MAX_HISTORY_RECORDS
                );


            await writeHistory(
                finalRecords
            );


            return res.status(200).json({

                success: true,

                source:
                    "PaceFetch Prediction History",

                added,

                updated,

                total:
                    finalRecords.length,

                generatedAt:
                    new Date().toISOString(),

                message:
                    "Prediction history saved successfully."

            });

        }


        return res.status(405).json({

            success: false,

            error:
                "Method not allowed."

        });


    } catch (error) {

        console.error(
            "PaceFetch history error:",
            error
        );


        return res.status(500).json({

            success: false,

            error:
                error.message ||
                "Unable to process prediction history."

        });

    }

};
