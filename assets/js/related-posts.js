(function () {
    var CONTENT_KEY = '420da6f85b5cc903b347de9e33';
    var API_BASE = '/ghost/api/content';
    // Get current post slug from URL
    var slug = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/').pop();
    if (!slug) return;

    var container = document.querySelector('.preview-section .post-cols');
    if (!container) return;

    // Read JSON URL from data attribute (cache-busted by Ghost's {{asset}})
    var section = document.querySelector('.preview-section[data-json]');
    var THEME_JSON_PATH = section ? section.getAttribute('data-json') : '/assets/data/related-posts.json';
    var RENDER_JSON_URL = 'https://webhook-hreflang.onrender.com/api/related-posts.json';

    // Try Render first (fresh data) with 3s timeout, fall back to theme asset
    function fetchWithTimeout(url, ms) {
        return new Promise(function (resolve, reject) {
            var timer = setTimeout(function () { reject(new Error('timeout')); }, ms);
            fetch(url).then(function (r) {
                clearTimeout(timer);
                if (!r.ok) reject(new Error(r.status));
                else resolve(r);
            }).catch(function (e) { clearTimeout(timer); reject(e); });
        });
    }

    fetchWithTimeout(RENDER_JSON_URL, 3000)
        .catch(function () { return fetch(THEME_JSON_PATH); })
        .then(function (r) { return r.json(); })
        .then(function (map) {
            var related = map[slug];
            if (!related || !related.length) return; // keep Handlebars fallback

            // Fetch all related posts in parallel
            return Promise.all(related.map(function (s) {
                return fetch(API_BASE + '/posts/slug/' + s + '/?key=' + CONTENT_KEY + '&include=tags,authors')
                    .then(function (r) { return r.json(); })
                    .then(function (d) { return d.posts && d.posts[0]; })
                    .catch(function () { return null; });
            }));
        })
        .then(function (posts) {
            if (!posts) return;
            posts = posts.filter(Boolean);
            if (!posts.length) return;

            container.innerHTML = posts.map(window.renderCard).join('');
        })
        .catch(function () { /* keep Handlebars fallback on any error */ });
})();
