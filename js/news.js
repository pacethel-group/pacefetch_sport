/* =========================================================
   PaceFetch News
   ========================================================= */

(function () {
    "use strict";

    const fallbackNews = [
        {
            id: 1,
            slug: "premier-league-latest",
            title: "Premier League latest: key talking points ahead of the weekend",
            description:
                "The latest football developments, team news and major talking points from the Premier League.",
            category: "Premier League",
            content:
                "PaceFetch brings you the latest football developments, team news and major talking points.",
            source: "PaceFetch",
            author: "PaceFetch",
            published_at: new Date().toISOString()
        },
        {
            id: 2,
            slug: "transfer-centre",
            title: "Transfer Centre: latest football moves and rumours",
            description:
                "Follow the latest confirmed transfers, negotiations and major football transfer rumours.",
            category: "Transfers",
            content:
                "Follow PaceFetch for the latest transfer developments from around the football world.",
            source: "PaceFetch",
            author: "PaceFetch",
            published_at: new Date().toISOString()
        },
        {
            id: 3,
            slug: "premier-league-roundup",
            title: "Premier League roundup: what you need to know",
            description:
                "A quick look at the latest Premier League news and major developments.",
            category: "Premier League",
            content:
                "PaceFetch provides a concise roundup of the latest Premier League developments.",
            source: "PaceFetch",
            author: "PaceFetch",
            published_at: new Date().toISOString()
        },
        {
            id: 4,
            slug: "champions-league",
            title: "Champions League: latest European football updates",
            description:
                "The latest Champions League news, fixtures and major European football developments.",
            category: "Champions League",
            content:
                "Stay updated with major Champions League developments on PaceFetch.",
            source: "PaceFetch",
            author: "PaceFetch",
            published_at: new Date().toISOString()
        },
        {
            id: 5,
            slug: "african-football",
            title: "African Football: latest news and major developments",
            description:
                "The latest updates from African football, clubs, leagues and national teams.",
            category: "African Football",
            content:
                "PaceFetch covers major football developments across Africa.",
            source: "PaceFetch",
            author: "PaceFetch",
            published_at: new Date().toISOString()
        }
    ];


    function getContainer() {
        return document.querySelector(
            "#latestNews, [data-news-list], .news-list"
        );
    }


    function createNewsCard(article) {
        const card = document.createElement("article");

        card.className = "news-card";

        const category = document.createElement("span");
        category.className = "news-category";
        category.textContent = article.category || "Football";

        const title = document.createElement("h3");

        const link = document.createElement("a");

        link.href =
            `/article/?slug=${encodeURIComponent(article.slug)}`;

        link.textContent = article.title || "Football News";

        title.appendChild(link);

        const description = document.createElement("p");

        description.textContent =
            article.description || "";

        const meta = document.createElement("div");

        meta.className = "news-meta";

        meta.textContent =
            `${article.source || "PaceFetch"} • ` +
            PaceFetch.formatDate(article.published_at);

        card.appendChild(category);
        card.appendChild(title);
        card.appendChild(description);
        card.appendChild(meta);

        return card;
    }


    function renderNews(news) {
        const container = getContainer();

        if (!container) return;

        container.innerHTML = "";

        news.forEach(article => {
            container.appendChild(
                createNewsCard(article)
            );
        });
    }


    async function loadNews() {
        try {
            const response =
                await PaceFetch.fetchJSON("/api/news?limit=20");

            if (
                response.success &&
                Array.isArray(response.news) &&
                response.news.length
            ) {
                renderNews(response.news);
                return;
            }

            renderNews(fallbackNews);

        } catch (error) {
            console.warn(
                "PaceFetch API unavailable. Using fallback news.",
                error
            );

            renderNews(fallbackNews);
        }
    }


    function searchNews() {
        const params =
            new URLSearchParams(window.location.search);

        const query =
            params.get("search");

        if (!query) return;

        const normalized =
            query.toLowerCase();

        const filtered =
            fallbackNews.filter(article =>
                `${article.title} ${article.description} ${article.category}`
                    .toLowerCase()
                    .includes(normalized)
            );

        if (filtered.length) {
            renderNews(filtered);
        }
    }


    document.addEventListener(
        "DOMContentLoaded",
        async () => {
            await loadNews();
            searchNews();
        }
    );

})();
