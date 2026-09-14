// tracker.js — Put in root /tracker.js
// Add <script src="/tracker.js"></script> to index.html, predictions.html, history.html, etc. before </body>

(function() {
  try {
    const page = location.pathname || '/';
    // Get real IP location free via ipapi.co
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(j => {
        const country = j.country_code || 'NG';
        const state = j.region || j.city || 'Lagos';
        fetch('/api/track?page=' + encodeURIComponent(page) + '&country=' + country + '&state=' + encodeURIComponent(state))
          .catch(() => {});
      })
      .catch(() => {
        // fallback without geo
        fetch('/api/track?page=' + encodeURIComponent(page)).catch(() => {});
      });
  } catch (e) {}
})();
      
