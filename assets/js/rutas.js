(function () {
    var CONTENT_KEY = '420da6f85b5cc903b347de9e33';
    var API_BASE = '/ghost/api/content';
    var BATCH_SIZE = 50;
    var CANON_FIRST_SCREEN = 8;

    var rutasContainer = document.getElementById('rutas-container');
    var canonContainer = document.getElementById('canon-container');
    if (!rutasContainer && !canonContainer) return;

    var container = rutasContainer || canonContainer;
    var JSON_PATH = container.getAttribute('data-json') || '/assets/data/rutas.json';
    var isEN = window.location.pathname.indexOf('/en/') === 0;

    // Use pre-fetched promise from inline script, or fetch now as fallback
    var jsonPromise = window.__rutasJson || fetch(JSON_PATH).then(function (r) { return r.json(); });

    jsonPromise
        .then(function (data) {
            var rutasKey = (isEN && data.rutas_en) ? 'rutas_en' : 'rutas';
            var canonKey = (isEN && data.canon_en) ? 'canon_en' : 'canon';

            if (rutasContainer && data[rutasKey]) {
                loadRutasProgressive(data[rutasKey]);
            }
            if (canonContainer && data[canonKey]) {
                loadCanonProgressive(data[canonKey]);
            }
        })
        .catch(function () {});

    function fetchPostsBySlugs(slugs) {
        var chunks = [];
        for (var i = 0; i < slugs.length; i += BATCH_SIZE) {
            chunks.push(slugs.slice(i, i + BATCH_SIZE));
        }
        return Promise.all(chunks.map(function (chunk) {
            var filter = 'slug:[' + chunk.join(',') + ']';
            return fetch(API_BASE + '/posts/?key=' + CONTENT_KEY + '&include=tags,authors&limit=' + chunk.length + '&filter=' + encodeURIComponent(filter))
                .then(function (r) { return r.json(); })
                .then(function (d) { return d.posts || []; })
                .catch(function () { return []; });
        })).then(function (results) {
            var map = {};
            results.forEach(function (posts) {
                posts.forEach(function (p) { if (p) map[p.slug] = p; });
            });
            return map;
        });
    }

    // --- RUTAS: load first route, render, then load rest ---
    function loadRutasProgressive(rutas) {
        if (!rutas.length) return;

        // First route slugs
        var firstRoute = rutas[0];
        var firstSlugs = firstRoute.slugs.slice();

        // Use pre-fetched posts from inline script, or fetch now as fallback
        var firstPostsPromise = window.__firstPosts || fetchPostsBySlugs(firstSlugs);

        firstPostsPromise.then(function (postMap) {
            // Render first route immediately
            rutasContainer.innerHTML = renderOneRuta(firstRoute, 0, postMap);

            // Now fetch and render the rest
            if (rutas.length > 1) {
                var restSlugs = [];
                for (var i = 1; i < rutas.length; i++) {
                    rutas[i].slugs.forEach(function (s) {
                        if (restSlugs.indexOf(s) === -1 && !postMap[s]) restSlugs.push(s);
                    });
                }

                fetchPostsBySlugs(restSlugs).then(function (restMap) {
                    // Merge maps
                    var fullMap = {};
                    var k;
                    for (k in postMap) fullMap[k] = postMap[k];
                    for (k in restMap) fullMap[k] = restMap[k];

                    var html = '';
                    for (var j = 1; j < rutas.length; j++) {
                        html += renderOneRuta(rutas[j], j, fullMap);
                    }
                    rutasContainer.insertAdjacentHTML('beforeend', html);
                });
            }
        });
    }

    function renderOneRuta(ruta, index, postMap) {
        var labelRoute = isEN ? 'Path' : 'Ruta';
        var labelTexts = isEN ? 'texts' : 'textos';
        var num = String(index + 1).length < 2 ? '0' + (index + 1) : String(index + 1);
        var html = '<div class="ruta-section">';
        html += '<div class="ruta-header">';
        html += '<div class="ruta-number">' + labelRoute + ' ' + num + '</div>';
        if (ruta.link) {
            html += '<h2 class="ruta-nombre"><a href="' + esc(ruta.link) + '" class="gradient-link">' + esc(ruta.nombre) + '</a></h2>';
        } else {
            html += '<h2 class="ruta-nombre">' + esc(ruta.nombre) + '</h2>';
        }
        html += '<p class="ruta-tesis">' + esc(ruta.tesis) + '</p>';
        html += '<div class="ruta-posts-count">' + ruta.slugs.length + ' ' + labelTexts + '</div>';
        html += '</div>';
        html += '<div class="ruta-cards post-cols">';
        ruta.slugs.forEach(function (slug) {
            var post = postMap[slug];
            if (post) html += window.renderCard(post);
        });
        html += '</div></div>';
        return html;
    }

    // --- CANON: load first N items, render, then load rest ---
    function loadCanonProgressive(canon) {
        if (!canon.length) return;

        var firstItems = canon.slice(0, CANON_FIRST_SCREEN);
        var restItems = canon.slice(CANON_FIRST_SCREEN);

        var firstSlugs = firstItems.map(function (c) { return c.slug; });

        // Use pre-fetched posts from inline script, or fetch now as fallback
        var firstPostsPromise = window.__firstPosts || fetchPostsBySlugs(firstSlugs);

        firstPostsPromise.then(function (postMap) {
            // Render first screen immediately
            canonContainer.innerHTML = renderCanonItems(firstItems, 0, postMap);

            // Fetch and append the rest
            if (restItems.length) {
                var restSlugs = restItems.map(function (c) { return c.slug; });

                fetchPostsBySlugs(restSlugs).then(function (restMap) {
                    var html = renderCanonItems(restItems, CANON_FIRST_SCREEN, restMap);
                    var list = canonContainer.querySelector('.canon-list');
                    if (list) {
                        list.insertAdjacentHTML('beforeend', html);
                    }
                });
            }
        });
    }

    function renderCanonItems(items, startIndex, postMap) {
        var isFirst = startIndex === 0;
        var html = isFirst ? '<div class="canon-list">' : '';
        items.forEach(function (item, i) {
            var post = postMap[item.slug];
            if (!post) return;
            var tag = post.primary_tag || {};
            var img = post.feature_image || '';
            html += '<a href="' + post.url + '" class="canon-item">';
            html += '<div class="canon-number-badge">' + (startIndex + i + 1) + '</div>';
            if (img) {
                html += '<div class="canon-cover" style="background-image:url(\'' + esc(img) + '\')"></div>';
            }
            html += '<div class="canon-info">';
            if (tag.name) {
                html += '<div class="canon-tag">' + esc(tag.name) + '</div>';
            }
            html += '<h3>' + esc(post.title) + '</h3>';
            html += '<p class="canon-reason">' + esc(item.razon) + '</p>';
            html += '</div></a>';
        });
        if (isFirst) html += '</div>';
        return html;
    }

    function esc(s) { return window.escHtml(s); }

})();
