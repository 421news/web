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
            var rutasKey = 'rutas';
            if (lang !== 'es') {
                var tryKey = 'rutas_' + lang;
                if (data[tryKey]) rutasKey = tryKey;
            }
            var rutas = data[rutasKey];
            if (!rutas || !rutas.length) return;

            var weekIndex = (Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) + 5) % rutas.length;
            var ruta = rutas[weekIndex];
            var slugs = ruta.slugs.slice(0, 8);

            // For intl langs, the translated posts share the same slug
            var langTag = '';
            var intlLangs = ['zh','ja','ko','tr','pt','fr'];
            if (intlLangs.indexOf(lang) !== -1) {
                langTag = '+tag:hash-' + lang;
            }

            var fetchPromise;
            if (intlLangs.indexOf(lang) !== -1) {
                // Intl: fetch all posts for this lang, match by slug prefix
                fetchPromise = fetch(API_BASE + '/posts/?key=' + CONTENT_KEY + '&include=tags,authors&limit=all&filter=' + encodeURIComponent('tag:hash-' + lang), { headers: { 'Accept-Version': 'v5.0' } })
                    .then(function (r) { return r.json(); })
                    .then(function (d) {
                        var allPosts = d.posts || [];
                        var postMap = {};
                        slugs.forEach(function (targetSlug) {
                            for (var j = 0; j < allPosts.length; j++) {
                                var p = allPosts[j];
                                if (p.slug === targetSlug || (p.slug.indexOf(targetSlug) === 0 && /^-\d+$/.test(p.slug.slice(targetSlug.length)))) {
                                    postMap[targetSlug] = p;
                                    break;
                                }
                            }
                        });
                        return postMap;
                    });
            } else {
                var filter = 'slug:[' + slugs.join(',') + ']';
                fetchPromise = fetch(API_BASE + '/posts/?key=' + CONTENT_KEY + '&include=tags,authors&limit=8&filter=' + encodeURIComponent(filter), { headers: { 'Accept-Version': 'v5.0' } })
                    .then(function (r) { return r.json(); })
                    .then(function (d) {
                        var posts = d.posts || [];
                        var postMap = {};
                        posts.forEach(function (p) { postMap[p.slug] = p; });
                        return postMap;
                    });
            }

            return fetchPromise.then(function (postMap) {

                    var i18n = {
                        es: { texts: 'textos', title: 'Rutas de lectura', sub: 'Si esta es tu primera vez en 421 ac\u00E1 ten\u00E9s un camino por d\u00F3nde empezar a leer.', cta: 'Explorar las 7 rutas \u2192', href: '/es/rutas/' },
                        en: { texts: 'texts', title: 'Reading routes', sub: 'If this is your first time at 421, here\u2019s a path to start reading.', cta: 'Explore all 7 routes \u2192', href: '/en/routes/' },
                        pt: { texts: 'textos', title: 'Rotas de leitura', sub: 'Se \u00e9 a sua primeira vez no 421, aqui est\u00e1 um caminho para come\u00e7ar.', cta: 'Explorar as 7 rotas \u2192', href: '/pt/rutas/' },
                        fr: { texts: 'textes', title: 'Parcours de lecture', sub: 'Si c\u2019est votre premi\u00e8re visite au 421, voici un chemin pour commencer.', cta: 'Explorer les 7 parcours \u2192', href: '/fr/rutas/' },
                        zh: { texts: '\u7bc7', title: '\u9605\u8bfb\u8def\u7ebf', sub: '\u5982\u679c\u4f60\u662f\u7b2c\u4e00\u6b21\u6765\u5230421\uff0c\u8fd9\u91cc\u6709\u4e00\u6761\u5f00\u59cb\u9605\u8bfb\u7684\u8def\u5f84\u3002', cta: '\u63a2\u7d22\u5168\u90e87\u6761\u8def\u7ebf \u2192', href: '/zh/rutas/' },
                        ja: { texts: '\u8a18\u4e8b', title: '\u8aad\u66f8\u30eb\u30fc\u30c8', sub: '421\u304c\u521d\u3081\u3066\u306a\u3089\u3001\u3053\u3053\u304b\u3089\u8aad\u307f\u59cb\u3081\u307e\u3057\u3087\u3046\u3002', cta: '7\u3064\u306e\u30eb\u30fc\u30c8\u3092\u63a2\u7d22 \u2192', href: '/ja/rutas/' },
                        ko: { texts: '\uae00', title: '\ub9ac\ub529 \ub8e8\ud2b8', sub: '421\uc774 \ucc98\uc74c\uc774\ub77c\uba74, \uc5ec\uae30\uc11c \uc77d\uae30 \uc2dc\uc791\ud558\uc138\uc694.', cta: '7\uac1c \ub8e8\ud2b8 \ud0d0\uc0c9 \u2192', href: '/ko/rutas/' },
                        tr: { texts: 'yaz\u0131', title: 'Okuma rotalar\u0131', sub: '421\u2019e ilk kez geliyorsan\u0131z, i\u015fte ba\u015flamak i\u00e7in bir yol.', cta: '7 rotay\u0131 ke\u015ffet \u2192', href: '/tr/rutas/' }
                    };
                    var t = i18n[lang] || i18n.en;
                    var labelTexts = t.texts;
                    var sectionTitle = t.title;
                    var sectionSub = t.sub;
                    var ctaText = t.cta;
                    var ctaHref = t.href;

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
