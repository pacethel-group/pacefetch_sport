/* =========================================================
   PaceFetch Nigeria Clock
   Africa/Lagos = GMT +1
   ========================================================= */

(function () {
    "use strict";

    function updateClock() {
        const now = new Date();

        const formattedTime = new Intl.DateTimeFormat("en-NG", {
            timeZone: "Africa/Lagos",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true
        }).format(now);

        const formattedDate = new Intl.DateTimeFormat("en-NG", {
            timeZone: "Africa/Lagos",
            weekday: "short",
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).format(now);

        document.querySelectorAll(
            "[data-nigeria-time], #nigeriaTime, .nigeria-time"
        ).forEach(element => {
            element.textContent = formattedTime;
        });

        document.querySelectorAll(
            "[data-nigeria-date], #nigeriaDate, .nigeria-date"
        ).forEach(element => {
            element.textContent = formattedDate;
        });

        document.querySelectorAll(
            "[data-gmt-label], .gmt-label"
        ).forEach(element => {
            element.textContent = "GMT +1";
        });
    }

    updateClock();

    setInterval(updateClock, 1000);

})();
