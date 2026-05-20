(function () {
    var CONTENT_KEY = '420da6f85b5cc903b347de9e33';
    var API_BASE = '/ghost/api/content';

    var rutasContainer = document.getElementById('rutas-container');
    var canonContainer = document.getElementById('canon-container');
    if (!rutasContainer && !canonContainer) return;

    var container = rutasContainer || canonContainer;
    var JSON_PATH = container.getAttribute('data-json') || '/assets/data/rutas.json';
    var langMatch = window.location.pathname.match(/^\/([a-z]{2})\//);
    var pageLang = langMatch ? langMatch[1] : 'es';
    var intlLangs = ['zh', 'ja', 'ko', 'tr', 'pt', 'fr'];
    var isIntl = intlLangs.indexOf(pageLang) !== -1;
    var isEN = pageLang === 'en';
    // Lang filter for tag queries: ES = exclude all lang tags, EN = include #en, intl = include #{lang}
    var LANG_HASH_TAGS = ['hash-en', 'hash-pt', 'hash-fr', 'hash-zh', 'hash-ja', 'hash-ko', 'hash-tr'];
    function appendLangFilter(tagFilter) {
        if (pageLang === 'es') {
            // Exclude all intl/EN posts (NQL: tag:-X for "NOT this tag")
            return tagFilter + '+' + LANG_HASH_TAGS.map(function (t) { return 'tag:-' + t; }).join('+');
        }
        return tagFilter + '+tag:hash-' + pageLang;
    }

    var jsonPromise = window.__rutasJson || fetch(JSON_PATH).then(function (r) { return r.json(); });

    jsonPromise
        .then(function (data) {
            var rutasKey = 'rutas';
            var canonKey = 'canon';
            if (pageLang !== 'es') {
                if (data['rutas_' + pageLang]) rutasKey = 'rutas_' + pageLang;
                if (data['canon_' + pageLang]) canonKey = 'canon_' + pageLang;
            }

            if (rutasContainer && data[rutasKey]) {
                // For rutas: pass ES (canonical) rutas for order + lang-specific for nombres/tesis
                loadRutas(data['rutas'] || [], data[rutasKey]);
            }
            if (canonContainer && data[canonKey]) {
                loadCanon(data['canon'] || [], data[canonKey]);
            }
        })
        .catch(function () {});

    // --- Fetch all posts matching an NQL filter (handles pagination) ---
    function fetchPostsByFilter(filter) {
        var url = API_BASE + '/posts/?key=' + CONTENT_KEY + '&include=tags,authors&limit=100&filter=' + encodeURIComponent(filter);
        return fetch(url + '&page=1', { headers: { 'Accept-Version': 'v5.0' } })
            .then(function (r) { return r.json(); })
            .then(function (first) {
                var posts = first.posts || [];
                var pages = (first.meta && first.meta.pagination && first.meta.pagination.pages) || 1;
                if (pages <= 1) return posts;
                var rest = [];
                for (var p = 2; p <= pages; p++) {
                    rest.push(fetch(url + '&page=' + p, { headers: { 'Accept-Version': 'v5.0' } })
                        .then(function (r) { return r.json(); })
                        .then(function (d) { return d.posts || []; })
                        .catch(function () { return []; }));
                }
                return Promise.all(rest).then(function (arrs) {
                    return posts.concat.apply(posts, arrs);
                });
            })
            .catch(function () { return []; });
    }

    // For intl: map an intl post's slug to its canonical (ES) slug via prefix matching
    function canonicalSlug(post, knownEsSlugs) {
        if (!isIntl) return post.slug;
        for (var i = 0; i < knownEsSlugs.length; i++) {
            var es = knownEsSlugs[i];
            if (post.slug === es) return es;
            if (post.slug.indexOf(es) === 0 && /^-\d+$/.test(post.slug.slice(es.length))) return es;
        }
        return null;
    }

    // --- CANON ---
    function loadCanon(canonEs, canonLang) {
        // canonEs: [{slug, razon}, ...] in ES (order source)
        // canonLang: same shape but razones in current lang (for ES, same as canonEs)
        var orderMap = {};
        var razonMap = {};
        canonEs.forEach(function (c, i) { orderMap[c.slug] = i; });
        // canonLang[i] corresponds to canonEs[i] (same order, translated razones)
        canonEs.forEach(function (c, i) {
            var langItem = canonLang[i] || c;
            razonMap[c.slug] = langItem.razon || c.razon;
        });
        var esSlugList = canonEs.map(function (c) { return c.slug; });

        fetchPostsByFilter(appendLangFilter('tag:hash-canon'))
            .then(function (posts) {
                posts.sort(function (a, b) {
                    var ca = canonicalSlug(a, esSlugList);
                    var cb = canonicalSlug(b, esSlugList);
                    var oa = (ca && orderMap[ca] !== undefined) ? orderMap[ca] : Infinity;
                    var ob = (cb && orderMap[cb] !== undefined) ? orderMap[cb] : Infinity;
                    if (oa !== ob) return oa - ob;
                    return new Date(b.published_at) - new Date(a.published_at);
                });

                var items = posts.map(function (p) {
                    var cs = canonicalSlug(p, esSlugList);
                    return { slug: p.slug, razon: (cs && razonMap[cs]) ? razonMap[cs] : '' };
                });
                var postMap = {};
                posts.forEach(function (p) { postMap[p.slug] = p; });
                canonContainer.innerHTML = renderCanonItems(items, 0, postMap);
            });
    }

    function renderCanonItems(items, startIndex, postMap) {
        var html = startIndex === 0 ? '<div class="canon-list">' : '';
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
            if (item.razon) html += '<p class="canon-reason">' + esc(item.razon) + '</p>';
            html += '</div></a>';
        });
        if (startIndex === 0) html += '</div>';
        return html;
    }

    // --- RUTAS ---
    function loadRutas(rutasEs, rutasLang) {
        // rutasEs: [{id, nombre, tesis, slugs}, ...] (ES, order source)
        // rutasLang: same shape but nombres/tesis translated
        // We render each ruta in the order from rutasEs, with one tag query per ruta
        // Use Promise.all to fetch all rutas' posts in parallel, then render in order

        var rutaPromises = rutasEs.map(function (ruta, idx) {
            var esSlugs = ruta.slugs || [];
            var orderMap = {};
            esSlugs.forEach(function (s, i) { orderMap[s] = i; });
            return fetchPostsByFilter(appendLangFilter('tag:hash-ruta-' + ruta.id))
                .then(function (posts) {
                    posts.sort(function (a, b) {
                        var ca = canonicalSlug(a, esSlugs);
                        var cb = canonicalSlug(b, esSlugs);
                        var oa = (ca && orderMap[ca] !== undefined) ? orderMap[ca] : Infinity;
                        var ob = (cb && orderMap[cb] !== undefined) ? orderMap[cb] : Infinity;
                        if (oa !== ob) return oa - ob;
                        return new Date(b.published_at) - new Date(a.published_at);
                    });
                    return { ruta: ruta, rutaLang: rutasLang[idx] || ruta, idx: idx, posts: posts };
                });
        });

        Promise.all(rutaPromises).then(function (results) {
            var html = '';
            results.forEach(function (r) {
                html += renderOneRuta(r.rutaLang, r.idx, r.posts);
            });
            rutasContainer.innerHTML = html;
        });
    }

    function renderOneRuta(ruta, index, posts) {
        var routeLabels = {
            es: { route: 'Ruta', texts: 'textos' },
            en: { route: 'Path', texts: 'texts' },
            pt: { route: 'Rota', texts: 'textos' },
            fr: { route: 'Parcours', texts: 'textes' },
            zh: { route: '路线', texts: '篇' },
            ja: { route: 'ルート', texts: '記事' },
            ko: { route: '‘루트', texts: '글' },
            tr: { route: 'Rota', texts: 'yazı' }
        };
        var rl = routeLabels[pageLang] || routeLabels.en;
        var num = String(index + 1).length < 2 ? '0' + (index + 1) : String(index + 1);
        var html = '<div class="ruta-section">';
        html += '<div class="ruta-header">';
        html += '<div class="ruta-number">' + rl.route + ' ' + num + '</div>';
        if (ruta.link) {
            html += '<h2 class="ruta-nombre"><a href="' + esc(ruta.link) + '" class="gradient-link">' + esc(ruta.nombre) + '</a></h2>';
        } else {
            html += '<h2 class="ruta-nombre">' + esc(ruta.nombre) + '</h2>';
        }
        html += '<p class="ruta-tesis">' + esc(ruta.tesis) + '</p>';
        html += '<div class="ruta-posts-count">' + posts.length + ' ' + rl.texts + '</div>';
        html += '</div>';
        html += '<div class="ruta-cards post-cols">';
        posts.forEach(function (post) {
            html += window.renderCard(post);
        });
        html += '</div></div>';
        return html;
    }

    function esc(s) { return window.escHtml(s); }

})();
