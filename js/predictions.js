/* =========================================================
   PaceFetch Predictions
   ========================================================= */

(function () {
    "use strict";

    const fallbackPredictions = [
        {
            id: 1,
            match_name: "Arsenal vs Chelsea",
            home_team: "Arsenal",
            away_team: "Chelsea",
            prediction: "Arsenal Win",
            confidence: 78,
            home_score: null,
            away_score: null,
            result: "pending",
            match_date: new Date().toISOString().slice(0, 10)
        },
        {
            id: 2,
            match_name: "Liverpool vs Newcastle",
            home_team: "Liverpool",
            away_team: "Newcastle",
            prediction: "Liverpool Win",
            confidence: 81,
            home_score: null,
            away_score: null,
            result: "pending",
            match_date: new Date().toISOString().slice(0, 10)
        },
        {
            id: 3,
            match_name: "Barcelona vs Sevilla",
            home_team: "Barcelona",
            away_team: "Sevilla",
            prediction: "Over 1.5 Goals",
            confidence: 84,
            home_score: null,
            away_score: null,
            result: "pending",
            match_date: new Date().toISOString().slice(0, 10)
        }
    ];


    function getContainer() {
        return document.querySelector(
            "#predictionList, [data-predictions], .prediction-list"
        );
    }


    function resultClass(result) {
        if (!result) return "pending";

        const value = result.toLowerCase();

        if (
            value === "won" ||
            value === "win" ||
            value === "correct"
        ) {
            return "won";
        }

        if (
            value === "lost" ||
            value === "loss" ||
            value === "incorrect"
        ) {
            return "lost";
        }

        return "pending";
    }


    function createPredictionCard(prediction) {

        const card =
            document.createElement("article");

        card.className = "prediction-card";

        const top =
            document.createElement("div");

        top.className = "prediction-card-top";

        const date =
            document.createElement("span");

        date.textContent =
            prediction.match_date || "";

        const status =
            document.createElement("span");

        status.className =
            `prediction-status ${resultClass(prediction.result)}`;

        status.textContent =
            prediction.result === "pending"
                ? "Pending"
                : prediction.result;

        top.appendChild(date);
        top.appendChild(status);


        const teams =
            document.createElement("div");

        teams.className = "prediction-teams";

        const home =
            document.createElement("strong");

        home.textContent =
            prediction.home_team;

        const vs =
            document.createElement("span");

        vs.textContent = "VS";

        const away =
            document.createElement("strong");

        away.textContent =
            prediction.away_team;

        teams.appendChild(home);
        teams.appendChild(vs);
        teams.appendChild(away);


        const pick =
            document.createElement("div");

        pick.className = "prediction-pick";

        const pickLabel =
            document.createElement("span");

        pickLabel.textContent =
            "PaceFetch Pick";

        const pickValue =
            document.createElement("strong");

        pickValue.textContent =
            prediction.prediction;

        pick.appendChild(pickLabel);
        pick.appendChild(pickValue);


        const confidence =
            document.createElement("div");

        confidence.className =
            "prediction-confidence";

        const confidenceText =
            document.createElement("span");

        confidenceText.textContent =
            `Confidence ${Number(prediction.confidence || 0)}%`;

        const bar =
            document.createElement("div");

        bar.className =
            "confidence-bar";

        const fill =
            document.createElement("span");

        fill.style.width =
            `${Math.max(
                0,
                Math.min(
                    100,
                    Number(prediction.confidence || 0)
                )
            )}%`;

        bar.appendChild(fill);

        confidence.appendChild(confidenceText);
        confidence.appendChild(bar);


        const scores =
            document.createElement("div");

        scores.className =
            "prediction-score";

        if (
            prediction.home_score !== null &&
            prediction.home_score !== undefined
        ) {
            scores.textContent =
                `Final: ${prediction.home_score} - ${prediction.away_score}`;
        } else {
            scores.textContent =
                "Match not finished";
        }


        card.appendChild(top);
        card.appendChild(teams);
        card.appendChild(pick);
        card.appendChild(confidence);
        card.appendChild(scores);

        return card;
    }


    function renderPredictions(predictions) {

        const container =
            getContainer();

        if (!container) return;

        container.innerHTML = "";

        if (!predictions.length) {

            const empty =
                document.createElement("div");

            empty.className =
                "prediction-empty";

            empty.textContent =
                "No predictions available for this date.";

            container.appendChild(empty);

            return;
        }

        predictions.forEach(prediction => {
            container.appendChild(
                createPredictionCard(prediction)
            );
        });
    }


    async function loadPredictions() {

        const params =
            new URLSearchParams(
                window.location.search
            );

        const date =
            params.get("date");

        let endpoint =
            "/api/predictions?limit=100";

        if (date) {
            endpoint =
                `/api/predictions?date=${encodeURIComponent(date)}&limit=100`;
        }

        try {

            const response =
                await PaceFetch.fetchJSON(endpoint);

            if (
                response.success &&
                Array.isArray(response.predictions)
            ) {
                renderPredictions(
                    response.predictions
                );

                return;
            }

            renderPredictions(
                fallbackPredictions
            );

        } catch (error) {

            console.warn(
                "Prediction API unavailable.",
                error
            );

            renderPredictions(
                fallbackPredictions
            );
        }
    }


    document.addEventListener(
        "DOMContentLoaded",
        loadPredictions
    );

})();
