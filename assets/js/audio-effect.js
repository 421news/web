document.addEventListener("DOMContentLoaded", function() {
    const hoverSound = new Audio("/assets/audio/balatro.mp3");

    hoverSound.preload = "auto";
    hoverSound.volume = 0.3;

    let audioEnabled = false;

    function enableAudio() {
        if (!audioEnabled) {
            hoverSound.play().then(function() {
                hoverSound.pause();
                hoverSound.currentTime = 0;
                audioEnabled = true;
            })
        }
    }

    // enable audio on first click or scroll
    document.addEventListener("click", enableAudio, { once: true });
    document.addEventListener("scroll", enableAudio, { once: true });
    document.addEventListener("mousemove", enableAudio, { once: true });

    const navLinks = document.querySelectorAll(".nav_categories .nav_category");

    navLinks.forEach(function(link) {
        link.addEventListener("mouseenter", function() {
            hoverSound.currentTime = 0;

            hoverSound.play().catch(function(error) {
                console.log("Audio playback failed", error);
            })
        })
    })

    hoverSound.addEventListener("error", function() {
        console.log("Failed to load audio file: assets/audio/balatro.mp3")
    })
})