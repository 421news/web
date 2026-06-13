document.addEventListener("DOMContentLoaded", function() {
    const header = document.querySelector(".site-header");
    const mobileSubButton = document.querySelector(".hero-mobile-suscribite-button");

    let lastScrollY = window.scrollY;
    let scrollThreshold = 50;
    let atopThreshold = 20;
    let isScrolling = false;

    // Nav transparente sobre el hero al tope de la página (sólida al scrollear)
    function updateAtop() {
        if (!header) return;
        if (window.scrollY <= atopThreshold) header.classList.add("nav-atop");
        else header.classList.remove("nav-atop");
    }
    updateAtop();

    // Use matchMedia instead of window.innerWidth to avoid reflow on every scroll
    var mobileQuery = window.matchMedia("(max-width: 768px)");
    var isMobile = mobileQuery.matches;
    mobileQuery.addEventListener("change", function(e) { isMobile = e.matches; });

    // auto-hide nav scroll
    function handleScroll() {
        const currentScrollY = window.scrollY;

        // transparente arriba / sólida apenas se scrollea (independiente del guard de 3px)
        updateAtop();

        // only process scroll if the user moved more than a few pxs
        if (Math.abs(currentScrollY - lastScrollY) < 3) return;

        // determine scroll direction
        const scrollingDown = currentScrollY > lastScrollY;
        const scrollingUp = currentScrollY < lastScrollY;

        // hide nav when scrolling down past threshold
        if (scrollingDown && currentScrollY > scrollThreshold) {
            if (header) header.classList.add("nav-hidden");
            if (mobileSubButton) mobileSubButton.classList.add("nav-hidden");
        }

        // show nav when scrolling up (desktop only) or at top of page
        if (currentScrollY <= scrollThreshold) {
            if (header) header.classList.remove("nav-hidden");
            if (mobileSubButton) mobileSubButton.classList.remove("nav-hidden");
        } else if (scrollingUp && !isMobile) {
            if (header) header.classList.remove("nav-hidden");
            if (mobileSubButton) mobileSubButton.classList.remove("nav-hidden");
        }

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
