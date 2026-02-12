document.addEventListener("DOMContentLoaded", function() {
    const header = document.querySelector(".site-header");
    const mobileSubButton = document.querySelector(".hero-mobile-suscribite-button");

    let lastScrollY = window.scrollY;
    let scrollThreshold = 50;
    let isScrolling = false;

    // auto-hide nav scroll
    function handleScroll() {
        const currentScrollY = window.scrollY;

        // only process scroll if the user moved more than a few pxs
        if (Math.abs(currentScrollY - lastScrollY) < 3) return;

        // determine scroll direction
        const scrollingDown = currentScrollY > lastScrollY;
        const scrollingUp = currentScrollY < lastScrollY;

        // hide nav when scrolling down past threshold
        if (scrollingDown && currentScrollY > scrollThreshold) {
            header.classList.add("nav-hidden");
            mobileSubButton.classList.add("nav-hidden");
        }

        // show nav when scrolling up (desktop only) or at top of page
        var isMobile = window.innerWidth <= 768;
        if (currentScrollY <= scrollThreshold) {
            header.classList.remove("nav-hidden");
            mobileSubButton.classList.remove("nav-hidden");
        } else if (scrollingUp && !isMobile) {
            header.classList.remove("nav-hidden");
            mobileSubButton.classList.remove("nav-hidden");
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
})