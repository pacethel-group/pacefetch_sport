/* =========================================================
   PaceFetch - Main Application
   ========================================================= */

(function () {
    "use strict";

    const PaceFetch = {
        API_BASE: "",

        getApiUrl(path) {
            return `${this.API_BASE}${path}`;
        },

        async fetchJSON(path, options = {}) {
            const response = await fetch(this.getApiUrl(path), {
                ...options,
                headers: {
                    "Accept": "application/json",
                    ...(options.headers || {})
                }
            });

            if (!response.ok) {
                throw new Error(`Request failed: ${response.status}`);
            }

            return response.json();
        },

        escapeHTML(value) {
            const div = document.createElement("div");
            div.textContent = value ?? "";
            return div.innerHTML;
        },

        formatDate(dateString, options = {}) {
            if (!dateString) return "";

            const date = new Date(dateString);

            if (Number.isNaN(date.getTime())) {
                return dateString;
            }

            return new Intl.DateTimeFormat(
                "en-NG",
                {
                    timeZone: "Africa/Lagos",
                    dateStyle: options.dateStyle || "medium",
                    timeStyle: options.timeStyle || undefined
                }
            ).format(date);
        },

        formatNigeriaTime(dateString) {
            if (!dateString) return "";

            const date = new Date(dateString);

            if (Number.isNaN(date.getTime())) {
                return dateString;
            }

            return new Intl.DateTimeFormat("en-NG", {
                timeZone: "Africa/Lagos",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true
            }).format(date);
        },

        showToast(message, type = "info") {
            let toast = document.querySelector(".pf-toast");

            if (!toast) {
                toast = document.createElement("div");
                toast.className = "pf-toast";
                document.body.appendChild(toast);
            }

            toast.textContent = message;
            toast.dataset.type = type;
            toast.classList.add("show");

            clearTimeout(this.toastTimer);

            this.toastTimer = setTimeout(() => {
                toast.classList.remove("show");
            }, 2800);
        }
    };

    window.PaceFetch = PaceFetch;


    /* =====================================================
       Mobile Menu
       ===================================================== */

    function initMobileMenu() {
        const menuButton = document.querySelector(
            "[data-mobile-menu], .mobile-menu-btn, #mobileMenuBtn"
        );

        const mobileMenu = document.querySelector(
            "[data-mobile-nav], .mobile-nav, #mobileNav"
        );

        if (!menuButton || !mobileMenu) return;

        menuButton.addEventListener("click", () => {
            mobileMenu.classList.toggle("active");

            const expanded =
                mobileMenu.classList.contains("active");

            menuButton.setAttribute(
                "aria-expanded",
                expanded ? "true" : "false"
            );
        });
    }


    /* =====================================================
       Search
       ===================================================== */

    function initSearch() {
        const searchButtons = document.querySelectorAll(
            "[data-search], .search-btn, #searchBtn"
        );

        const overlay = document.querySelector(
            "[data-search-overlay], .search-overlay, #searchOverlay"
        );

        if (!overlay) return;

        const input = overlay.querySelector(
            "input[type='search'], input[type='text']"
        );

        const closeButton = overlay.querySelector(
            "[data-search-close], .search-close, #searchClose"
        );

        function openSearch() {
            overlay.classList.add("active");

            setTimeout(() => {
                if (input) input.focus();
            }, 100);
        }

        function closeSearch() {
            overlay.classList.remove("active");
        }

        searchButtons.forEach(button => {
            button.addEventListener("click", openSearch);
        });

        if (closeButton) {
            closeButton.addEventListener("click", closeSearch);
        }

        overlay.addEventListener("click", event => {
            if (event.target === overlay) {
                closeSearch();
            }
        });

        if (input) {
            input.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    const query = input.value.trim();

                    if (!query) return;

                    window.location.href =
                        `/news/?search=${encodeURIComponent(query)}`;
                }
            });
        }

        document.addEventListener("keydown", event => {
            if (
                event.key === "/" &&
                document.activeElement.tagName !== "INPUT" &&
                document.activeElement.tagName !== "TEXTAREA"
            ) {
                event.preventDefault();
                openSearch();
            }

            if (event.key === "Escape") {
                closeSearch();
            }
        });
    }


    /* =====================================================
       Smooth Internal Links
       ===================================================== */

    function initLinks() {
        document.addEventListener("click", event => {
            const link = event.target.closest("a");

            if (!link) return;

            const href = link.getAttribute("href");

            if (!href || href.startsWith("#")) return;

            if (
                href.startsWith("http") &&
                !href.includes(window.location.hostname)
            ) {
                return;
            }
        });
    }


    /* =====================================================
       Active Navigation
       ===================================================== */

    function setActiveNavigation() {
        const path = window.location.pathname;

        document.querySelectorAll(
            "nav a, .desktop-nav a, .mobile-bottom-nav a"
        ).forEach(link => {
            const href = link.getAttribute("href");

            if (!href) return;

            if (
                href !== "/" &&
                path.startsWith(href.replace("index.html", ""))
            ) {
                link.classList.add("active");
            }

            if (
                href === "/" &&
                path === "/"
            ) {
                link.classList.add("active");
            }
        });
    }


    /* =====================================================
       Start
       ===================================================== */

    document.addEventListener("DOMContentLoaded", () => {
        initMobileMenu();
        initSearch();
        initLinks();
        setActiveNavigation();
    });

})();
