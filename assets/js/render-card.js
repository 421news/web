// Shared post card rendering utilities + event delegation for hover + lazy texture
// Redesign: .pc (v1 editorial) / .pc--featured (v2 foil for canon/rutas)
(function () {
    var TEXTURA = '/assets/images/textura.webp';
    // Ghost genera variantes redimensionadas on-the-fly insertando /size/wN/ en la
    // ruta, pero la Content API devuelve SIEMPRE el original — que puede pesar MB.
    // Sin esto, cada card servia la imagen entera. Ver "Imagenes responsive" en CLAUDE.md.
    // Idempotente y a prueba de orden de carga: la definen los 4 scripts que la usan.
    window.ghostImg = window.ghostImg || function (url, w) {
        if (!url || url.indexOf('/content/images/') === -1) return url || '';
        if (url.indexOf('/content/images/size/') !== -1) return url;
        return url.replace('/content/images/', '/content/images/size/w' + w + '/');
    };



    window.escHtml = function (s) {
        if (!s) return '';
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };

    window.formatPostDate = function (iso) {
        if (!iso) return '';
        var d = new Date(iso);
        return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
    };

    // El idioma de una nota vive en su tag interno #{lang}. Antes esto era
    // `isEn ? 'en' : 'es'`, asi que TODA tarjeta intl (pt/fr/zh/ja/ko/tr) se
    // renderizaba como si fuera española: el chip de tag linkeaba a /es/tag/... y
    // el badge a /es/canon/, sacando al lector de su idioma de un click.
    var CARD_LANGS = ['en', 'pt', 'fr', 'zh', 'ja', 'ko', 'tr'];
    window.postLang = function (tags) {
        for (var i = 0; i < (tags || []).length; i++) {
            var idx = CARD_LANGS.indexOf(String(tags[i].slug).replace('hash-', ''));
            if (idx !== -1) return CARD_LANGS[idx];
        }
        return 'es';
    };

    // La seccion de rutas es /en/routes/ en ingles y /{lang}/rutas/ en el resto.
    // Con la URL generica salia /en/rutas/, que es un 404.
    window.rutasUrl = function (lang) {
        return lang === 'en' ? '/en/routes/' : '/' + lang + '/rutas/';
    };

    var CT_LABELS = {
        es: { ensayo: 'ensayo', guia: 'guía', resena: 'reseña', cronica: 'crónica', entrevista: 'entrevista', novedades: 'novedades', ruta: 'ruta' },
        en: { ensayo: 'essay', guia: 'guide', resena: 'review', cronica: 'reportage', entrevista: 'interview', novedades: 'news', ruta: 'path' },
        pt: { ensayo: 'ensaio', guia: 'guia', resena: 'resenha', cronica: 'crônica', entrevista: 'entrevista', novedades: 'novidades', ruta: 'rota' },
        fr: { ensayo: 'essai', guia: 'guide', resena: 'critique', cronica: 'chronique', entrevista: 'entretien', novedades: 'actualités', ruta: 'parcours' },
        zh: { ensayo: '随笔', guia: '指南', resena: '评论', cronica: '纪实', entrevista: '访谈', novedades: '新闻', ruta: '路线' },
        ja: { ensayo: 'エッセイ', guia: 'ガイド', resena: 'レビュー', cronica: 'ルポ', entrevista: 'インタビュー', novedades: 'ニュース', ruta: 'ルート' },
        ko: { ensayo: '에세이', guia: '가이드', resena: '리뷰', cronica: '르포', entrevista: '인터뷰', novedades: '소식', ruta: '루트' },
        tr: { ensayo: 'deneme', guia: 'rehber', resena: 'inceleme', cronica: 'anlatı', entrevista: 'söyleşi', novedades: 'haberler', ruta: 'rota' }
    };
    window.cardLabel = function (lang, clave) {
        return (CT_LABELS[lang] || CT_LABELS.es)[clave] || '';
    };

    window.getContentType = function (tags, lang) {
        if (!tags) return '';
        var claves = ['ensayo', 'guia', 'resena', 'cronica', 'entrevista', 'novedades'];
        lang = lang || window.postLang(tags);
        for (var i = 0; i < tags.length; i++) {
            var c = String(tags[i].slug).replace('hash-', '');
            if (claves.indexOf(c) !== -1) return window.cardLabel(lang, c);
        }
        return '';
    };

    window.renderCard = function (post, opts) {
        opts = opts || {};
        var tag = post.primary_tag || {};
        var author = post.primary_author || {};
        var tags = post.tags || [];
        var isCanon = tags.some(function (t) { return t.slug === 'hash-canon'; });
        var isRuta = tags.some(function (t) { return (t.slug || '').indexOf('hash-ruta-') === 0; });
        var featured = isCanon || isRuta;
        var lang = window.postLang(tags);

        var ct = window.getContentType(tags, lang);
        var ctHtml = ct ? '<span class="pc__type"> · ' + window.escHtml(ct) + '</span>' : '';
        var tagUrl = tag.slug ? '/' + lang + '/tag/' + tag.slug + '/' : '';
        var tagName = window.escHtml(tag.name || 'Uncategorized');
        var rt = post.reading_time ? (' <span class="pc__sep">·</span> ' + post.reading_time + ' min') : '';
        var meta = window.escHtml(author.name || '') + rt;
        var imgRaw = post.feature_image || '';
        var title = window.escHtml(post.title);
        var overlay = '<div class="pc__overlay" style="background-size:cover;background-position:center"></div>';
        var tagSpan = '<span class="pc__tag"' + (tag.slug ? ' data-tag-url="' + window.escHtml(tagUrl) + '"' : '') + '>' + tagName + ctHtml + '</span>';
        var body = '<div class="pc__body">' + tagSpan +
            '<h3 class="pc__title">' + title + '</h3>' +
            '<div class="pc__meta">' + meta + '</div></div>';

        // Foil (canon/ruta) = SIEMPRE formato magazine: imagen vertical, título sobre
        // la imagen, foil. La grilla (auto-rows 1fr + equalize) iguala alturas por fila.
        if (featured) {
            var badge = isCanon
                ? '<span class="pc__badge" data-href="/' + lang + '/canon/"><span class="pc__star">★</span> canon</span>'
                : '<span class="pc__badge" data-href="' + window.rutasUrl(lang) + '"><span class="pc__star">★</span> ' + window.cardLabel(lang, 'ruta') + '</span>';
            var tagPill = tag.slug
                ? '<span class="pc__tag pc__tag--pill" data-tag-url="' + window.escHtml(tagUrl) + '">' + tagName + ctHtml + '</span>'
                : '';
            return '<div role="listitem" class="w-dyn-item">' +
                '<a href="' + post.url + '" class="pc pc__link pc--featured">' +
                '<div class="pc__cover">' +
                '<img src="' + window.escHtml(window.ghostImg(imgRaw, 1000)) + '" alt="' + title + '" class="pc__img" loading="lazy" width="600" height="800" />' +
                overlay + '<div class="pc__mask"></div>' + badge + tagPill +
                '<div class="pc__titlebox"><h3 class="pc__title">' + title + '</h3>' +
                '<div class="pc__meta pc__meta--over">' + meta + '</div></div>' +
                '</div></a></div>';
        }

        return '<div role="listitem" class="w-dyn-item">' +
            '<a href="' + post.url + '" class="pc pc__link">' +
            '<div class="pc__cover">' +
            '<img src="' + window.escHtml(window.ghostImg(imgRaw, 600)) + '" alt="' + title + '" class="pc__img" loading="lazy" width="600" height="375" />' +
            overlay + '</div>' +
            body + '</a></div>';
    };

    // --- Lazy-load textura.webp via IntersectionObserver ---
    var textureObserver = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) {
                entries[i].target.style.backgroundImage = "url('" + TEXTURA + "')";
                textureObserver.unobserve(entries[i].target);
            }
        }
    }, { rootMargin: '200px' });

    function observeOverlay(el) {
        if (!el.dataset.txObs) {
            el.dataset.txObs = '1';
            textureObserver.observe(el);
        }
    }

    // .pc__overlay = redesign cards · .post-card_overlay = tag-page hero (legacy)
    var OVERLAY_SEL = '.pc__overlay, .post-card_overlay';
    function isOverlay(n) {
        return n.classList && (n.classList.contains('pc__overlay') || n.classList.contains('post-card_overlay'));
    }

    // Scan overlays already in the DOM (server-rendered cards + tag hero)
    document.querySelectorAll(OVERLAY_SEL).forEach(observeOverlay);

    // Watch for new overlays added to the DOM (pagination, rutas, related posts, etc.)
    new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
            var added = mutations[i].addedNodes;
            for (var j = 0; j < added.length; j++) {
                var node = added[j];
                if (node.nodeType !== 1) continue;
                if (isOverlay(node)) observeOverlay(node);
                var overlays = node.querySelectorAll && node.querySelectorAll(OVERLAY_SEL);
                if (overlays) {
                    for (var k = 0; k < overlays.length; k++) observeOverlay(overlays[k]);
                }
            }
        }
    }).observe(document.documentElement, { childList: true, subtree: true });

    // Event delegation for post card hover (server-rendered + JS-rendered cards).
    // Keeps mix-blend-mode:difference (set in CSS); only swaps the texture for a
    // verde→amarillo wash, same color-inversion effect as before.
    document.addEventListener('mouseover', function (e) {
        var card = e.target.closest('.pc');
        if (!card) return;
        var overlay = card.querySelector('.pc__overlay');
        if (overlay) {
            overlay.style.backgroundImage = 'linear-gradient(180deg,var(--verde),var(--amarillo)),url(' + TEXTURA + ')';
            overlay.style.backgroundBlendMode = 'overlay';
        }
    });
    document.addEventListener('mouseout', function (e) {
        var card = e.target.closest('.pc');
        if (!card) return;
        var related = e.relatedTarget;
        if (related && card.contains(related)) return;
        var overlay = card.querySelector('.pc__overlay');
        if (overlay) {
            overlay.style.backgroundImage = "url('" + TEXTURA + "')";
            overlay.style.backgroundBlendMode = '';
        }
    });

    // Event delegation: tag chip → tag page · badge → canon/rutas (inside card link)
    document.addEventListener('click', function (e) {
        var tagEl = e.target.closest('.pc__tag');
        var badgeEl = e.target.closest('.pc__badge');
        var url = (tagEl && tagEl.dataset.tagUrl) || (badgeEl && badgeEl.dataset.href);
        if (!url) return;
        e.preventDefault();
        e.stopPropagation();
        window.location.href = url;
    });

    // Equalize card heights per row (Safari fix — grid auto-rows 1fr + stretch
    // don't reliably equalize across browsers when content varies).
    function equalizeCardRows() {
        var cards = document.querySelectorAll('.pc');
        cards.forEach(function (c) { c.style.minHeight = ''; });
        if (window.innerWidth <= 600) return; // single column on mobile
        var rows = {};
        cards.forEach(function (c) {
            var top = Math.round(c.getBoundingClientRect().top + window.scrollY);
            if (!rows[top]) rows[top] = [];
            rows[top].push(c);
        });
        Object.keys(rows).forEach(function (key) {
            var group = rows[key];
            if (group.length < 2) return;
            var maxH = 0;
            group.forEach(function (c) { if (c.offsetHeight > maxH) maxH = c.offsetHeight; });
            group.forEach(function (c) { c.style.minHeight = maxH + 'px'; });
        });
    }

    var equalizeTimer = null;
    function scheduleEqualize() {
        clearTimeout(equalizeTimer);
        equalizeTimer = setTimeout(equalizeCardRows, 50);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        scheduleEqualize();
    } else {
        window.addEventListener('DOMContentLoaded', scheduleEqualize);
    }
    window.addEventListener('load', scheduleEqualize);
    window.addEventListener('resize', scheduleEqualize);

    // Re-equalize when cards are added/removed dynamically (pagination, rutas, etc.)
    new MutationObserver(function (mutations) {
        var relevant = false;
        for (var i = 0; i < mutations.length; i++) {
            var added = mutations[i].addedNodes;
            for (var j = 0; j < added.length; j++) {
                var node = added[j];
                if (node.nodeType !== 1) continue;
                if ((node.classList && node.classList.contains('pc')) ||
                    (node.querySelector && node.querySelector('.pc'))) {
                    relevant = true;
                    break;
                }
            }
            if (relevant) break;
        }
        if (relevant) scheduleEqualize();
    }).observe(document.documentElement, { childList: true, subtree: true });

    window.equalizeCardRows = equalizeCardRows;
})();
