// js/predictions.js

document.addEventListener("DOMContentLoaded", () => {
    loadRealPredictions();
});


async function loadRealPredictions() {

    const container =
        document.getElementById(
            "predictions-container"
        );

    const loading =
        document.getElementById(
            "predictions-loading"
        );

    const empty =
        document.getElementById(
            "predictions-empty"
        );

    if (!container) {
        return;
    }

    try {

        if (loading) {
            loading.style.display = "block";
        }

        container.innerHTML = "";


        const response =
            await fetch(
                "/api/predictions"
            );


        if (!response.ok) {
            throw new Error(
                `Server returned ${response.status}`
            );
        }


        const data =
            await response.json();


        if (!data.success) {
            throw new Error(
                data.error ||
                "Unable to load predictions"
            );
        }


        if (!data.predictions?.length) {

            if (empty) {
                empty.style.display = "block";
            }

            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⚽</div>

                    <h3>
                        No qualifying predictions today
                    </h3>

                    <p>
                        PaceFetch found no predictions
                        strong enough to publish today.
                    </p>
                </div>
            `;

            return;
        }


        container.innerHTML =
            data.predictions
                .map(createRealPredictionCard)
                .join("");


        /*
         * Update result count if the element exists.
         */
        const count =
            document.getElementById(
                "prediction-count"
            );

        if (count) {
            count.textContent =
                `${data.published} predictions`;
        }


    } catch (error) {

        console.error(
            "PaceFetch predictions:",
            error
        );


        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚠️</div>

                <h3>
                    Predictions temporarily unavailable
                </h3>

                <p>
                    We couldn't load today's
                    predictions. Please try again shortly.
                </p>
            </div>
        `;

    } finally {

        if (loading) {
            loading.style.display = "none";
        }
    }
}


function getConfidenceClass(confidence) {

    const value =
        Number(confidence) || 0;

    if (value >= 80) {
        return "confidence-strong";
    }

    if (value >= 70) {
        return "confidence-good";
    }

    if (value >= 50) {
        return "confidence-moderate";
    }

    return "confidence-weak";
}


function createRealPredictionCard(prediction) {

    const confidenceClass =
        getConfidenceClass(
            prediction.confidence
        );


    return `
        <article
            class="prediction-card ${confidenceClass}"
            data-market="${escapeHtml(
                prediction.market
            )}"
        >

            <div class="prediction-card-top">

                <span class="prediction-league">
                    ${escapeHtml(
                        prediction.country || ""
                    )}
                    ${prediction.country ? " • " : ""}
                    ${escapeHtml(
                        prediction.league || ""
                    )}
                </span>

                <span class="confidence-badge">
                    ${Number(
                        prediction.confidence
                    ).toFixed(0)}%
                </span>

            </div>


            <div class="prediction-match">

                <strong>
                    ${escapeHtml(
                        prediction.homeTeam
                    )}
                </strong>

                <span>vs</span>

                <strong>
                    ${escapeHtml(
                        prediction.awayTeam
                    )}
                </strong>

            </div>


            <div class="prediction-selection">

                <span class="market">
                    ${escapeHtml(
                        prediction.market
                    )}
                </span>

                <span class="selection">
                    ${escapeHtml(
                        prediction.selection
                    )}
                </span>

                <strong class="probability">
                    ${Number(
                        prediction.probability
                    ).toFixed(1)}%
                </strong>

            </div>


            <div class="prediction-footer">

                <span>
                    ${escapeHtml(
                        prediction.confidenceLabel
                    )}
                </span>

                <span>
                    Model ${escapeHtml(
                        prediction.modelVersion
                    )}
                </span>

            </div>

        </article>
    `;
}


function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
