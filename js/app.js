/*
  PaceFetch Frontend
  ------------------
  This file currently uses demo prediction objects.

  Later, these objects will be replaced by data
  returned from our secure PaceFetch backend.
*/


const demoPredictions = [
  {
    league: "Premier League",
    country: "England",
    home: "Arsenal",
    away: "Chelsea",
    time: "18:30",
    market: "Double Chance",
    selection: "Arsenal or Draw",
    probability: 84
  },

  {
    league: "La Liga",
    country: "Spain",
    home: "Barcelona",
    away: "Sevilla",
    time: "20:00",
    market: "Over 1.5 Goals",
    selection: "Over 1.5",
    probability: 82
  },

  {
    league: "Serie A",
    country: "Italy",
    home: "Inter",
    away: "Torino",
    time: "19:45",
    market: "1X2",
    selection: "Inter Win",
    probability: 78
  },

  {
    league: "Bundesliga",
    country: "Germany",
    home: "Bayern Munich",
    away: "Mainz",
    time: "17:30",
    market: "BTTS",
    selection: "BTTS — Yes",
    probability: 71
  },

  {
    league: "Ligue 1",
    country: "France",
    home: "PSG",
    away: "Lyon",
    time: "20:00",
    market: "Over 2.5 Goals",
    selection: "Over 2.5",
    probability: 73
  },

  {
    league: "NPFL",
    country: "Nigeria",
    home: "Enyimba",
    away: "Rangers",
    time: "16:00",
    market: "Double Chance",
    selection: "Enyimba or Draw",
    probability: 69
  }
];


function getConfidenceClass(probability) {

  if (probability >= 80) {
    return "strong";
  }

  if (probability >= 70) {
    return "medium";
  }

  if (probability >= 50) {
    return "amber";
  }

  return "red";
}


function createPredictionCard(prediction) {

  const confidenceClass =
    getConfidenceClass(prediction.probability);

  return `
    <article class="prediction-card">

      <div class="match-meta">
        <span class="league-name">
          ${prediction.country} · ${prediction.league}
        </span>

        <span>${prediction.time}</span>
      </div>

      <div class="teams">

        <div class="team">
          <span>${prediction.home}</span>
          <span class="team-score">—</span>
        </div>

        <div class="team">
          <span>${prediction.away}</span>
          <span class="team-score">—</span>
        </div>

      </div>

      <div class="prediction-main">

        <div class="prediction-selection">

          <div>
            <div class="market-name">
              ${prediction.market}
            </div>

            <div class="selection">
              ${prediction.selection}
            </div>
          </div>

          <div class="confidence ${confidenceClass}">
            ${prediction.probability}%
          </div>

        </div>

      </div>

    </article>
  `;
}


function createTopPick(prediction, index) {

  return `
    <article class="top-pick">

      <div class="pick-rank">
        TOP PICK #${index + 1}
      </div>

      <div class="pick-match">
        ${prediction.home}
        <span style="color:#657180;">vs</span>
        ${prediction.away}
      </div>

      <div class="pick-market">
        ${prediction.market} · ${prediction.selection}
      </div>

      <div class="pick-confidence">

        <span>Model probability</span>

        <span class="pick-percentage">
          ${prediction.probability}%
        </span>

      </div>

    </article>
  `;
}


function renderTodayPredictions() {

  const container =
    document.getElementById("todayPredictions");

  if (!container) {
    return;
  }

  container.innerHTML =
    demoPredictions
      .slice(0, 6)
      .map(createPredictionCard)
      .join("");

  const counter =
    document.getElementById("predictionCount");

  if (counter) {
    counter.textContent = demoPredictions.length;
  }
}


function renderTopPicks() {

  const container =
    document.getElementById("topPicks");

  if (!container) {
    return;
  }

  const picks =
    [...demoPredictions]
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 3);

  container.innerHTML =
    picks
      .map((prediction) => {

        const index =
          picks.indexOf(prediction);

        return createTopPick(prediction, index);

      })
      .join("");
}


function setupMobileMenu() {

  const button =
    document.getElementById("mobileMenu");

  const nav =
    document.getElementById("mobileNav");

  if (!button || !nav) {
    return;
  }

  button.addEventListener("click", () => {

    nav.classList.toggle("open");

    button.textContent =
      nav.classList.contains("open")
        ? "✕"
        : "☰";

  });

}


function initPaceFetch() {

  renderTodayPredictions();

  renderTopPicks();

  setupMobileMenu();

}


document.addEventListener(
  "DOMContentLoaded",
  initPaceFetch
);
