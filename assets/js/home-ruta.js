(function () {
    var CONTENT_KEY = '420da6f85b5cc903b347de9e33';
    var API_BASE = '/ghost/api/content';

    var container = document.getElementById('home-ruta-container');
    if (!container) return;

    var lang = container.getAttribute('data-lang') || 'es';
    var JSON_PATH = container.getAttribute('data-json') || '/assets/data/rutas.json';

    fetch(JSON_PATH)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var rutas = (lang === 'en' && data.rutas_en) ? data.rutas_en : data.rutas;
            if (!rutas || !rutas.length) return;

            var weekIndex = (Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) + 5) % rutas.length;
            var ruta = rutas[weekIndex];
            var slugs = ruta.slugs.slice(0, 8);

            var filter = 'slug:[' + slugs.join(',') + ']';
            return fetch(API_BASE + '/posts/?key=' + CONTENT_KEY + '&include=tags,authors&limit=8&filter=' + encodeURIComponent(filter))
                .then(function (r) { return r.json(); })
                .then(function (d) {
                    var posts = d.posts || [];
                    var postMap = {};
                    posts.forEach(function (p) { postMap[p.slug] = p; });

                    var labelTexts = lang === 'en' ? 'texts' : 'textos';
                    var sectionTitle = lang === 'en' ? 'Reading routes' : 'Rutas de lectura';
                    var sectionSub = lang === 'en'
                        ? 'If this is your first time at 421, here\u2019s a path to start reading.'
                        : 'Si esta es tu primera vez en 421 ac\u00E1 ten\u00E9s un camino por d\u00F3nde empezar a leer.';
                    var ctaText = lang === 'en' ? 'Explore all 7 routes \u2192' : 'Explorar las 7 rutas \u2192';
                    var ctaHref = lang === 'en' ? '/en/routes/' : '/rutas/';

                    var html = '<div class="text-center">';
                    html += '<h2 class="home-ruta-nombre"><a href="' + ctaHref + '" class="section-title-link">' + sectionTitle + '</a></h2>';
                    html += '<p class="home-ruta-tesis">' + sectionSub + '</p>';
                    html += '<div class="home-ruta-meta">' + esc(ruta.nombre) + ' \u00B7 ' + ruta.slugs.length + ' ' + labelTexts + '</div>';
                    html += '</div>';

                    html += '<div class="post-grid w-dyn-list"><div role="list" class="post-cols w-dyn-items">';
                    var shown = 0;
                    slugs.forEach(function (slug) {
                        if (shown >= 4) return;
                        var post = postMap[slug];
                        if (post) { html += window.renderCard(post); shown++; }
                    });
                    html += '</div></div>';

                    html += '<div class="home-ruta-cta"><a href="' + ctaHref + '">' + ctaText + '</a></div>';

                    container.innerHTML = html;
                });
        })
        .catch(function () {});

    function esc(s) { return window.escHtml(s); }
})();
