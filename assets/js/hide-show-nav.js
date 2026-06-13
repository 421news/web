document.addEventListener("DOMContentLoaded", function() {
    const header = document.querySelector(".site-header");
    const mobileSubButton = document.querySelector(".hero-mobile-suscribite-button");

    // Medir el alto REAL de la barra fija y exponerlo en --nav-h, para que los
    // heros arranquen exactamente donde termina la nav (sin hueco ni tapar).
    function setNavH() {
        if (!header) return;
        const h = header.getBoundingClientRect().height;
        if (h) document.documentElement.style.setProperty("--nav-h", Math.round(h) + "px");
    }
    setNavH();
    window.addEventListener("resize", setNavH, { passive: true });
    window.addEventListener("load", setNavH);

    let lastScrollY = window.scrollY;
    let scrollThreshold = 50;
    let isScrolling = false;

    // Use matchMedia instead of window.innerWidth to avoid reflow on every scroll
    var mobileQuery = window.matchMedia("(max-width: 768px)");
    var isMobile = mobileQuery.matches;
    mobileQuery.addEventListener("change", function(e) { isMobile = e.matches; });

    // Sticky pill transitoria: oculta arriba (no ensucia el hero), aparece mientras
    // se scrollea y se esconde sola ~4s después de que el usuario para de scrollear.
    var STICKY_SHOW_AT = 200;
    var stickyTimer = null;
    function showStickyWhileScrolling() {
        if (!mobileSubButton) return;
        mobileSubButton.classList.remove("nav-hidden");
        clearTimeout(stickyTimer);
        stickyTimer = setTimeout(function() { mobileSubButton.classList.add("nav-hidden"); }, 4000);
    }
    function hideSticky() {
        if (!mobileSubButton) return;
        clearTimeout(stickyTimer);
        mobileSubButton.classList.add("nav-hidden");
    }
    hideSticky(); // estado inicial: oculta

    // auto-hide nav scroll
    function handleScroll() {
        const currentScrollY = window.scrollY;

        // only process scroll if the user moved more than a few pxs
        if (Math.abs(currentScrollY - lastScrollY) < 3) return;

        // determine scroll direction
        const scrollingDown = currentScrollY > lastScrollY;
        const scrollingUp = currentScrollY < lastScrollY;

        // --- nav fija: se esconde al bajar, vuelve al subir / arriba ---
        if (scrollingDown && currentScrollY > scrollThreshold) {
            if (header) header.classList.add("nav-hidden");
        }
        if (currentScrollY <= scrollThreshold) {
            if (header) header.classList.remove("nav-hidden");
        } else if (scrollingUp && !isMobile) {
            if (header) header.classList.remove("nav-hidden");
        }

        // --- sticky pill: visible mientras se scrollea, oculta arriba ---
        if (currentScrollY <= STICKY_SHOW_AT) hideSticky();
        else showStickyWhileScrolling();

        lastScrollY = currentScrollY;
    }

    function throttledScrollHandler() {
        if (!isScrolling) {
            requestAnimationFrame(function() {
                handleScroll();
                isScrolling = false;
            });
            isScrolling = true;
        }
    }

    window.addEventListener("scroll", throttledScrollHandler, { passive: true });
});
