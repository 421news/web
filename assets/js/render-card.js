// Shared post card rendering utilities + event delegation for hover + lazy texture
// Redesign: .pc (v1 editorial) / .pc--featured (v2 foil for canon/rutas)
(function () {
    var TEXTURA = '/assets/images/textura.webp';

    window.escHtml = function (s) {
        if (!s) return '';
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };

    window.formatPostDate = function (iso) {
        if (!iso) return '';
        var d = new Date(iso);
        return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
    };

    window.getContentType = function (tags) {
        if (!tags) return '';
        var map = {
            'hash-ensayo': 'ensayo',
            'hash-guia': 'guía',
            'hash-resena': 'reseña',
            'hash-cronica': 'crónica',
            'hash-entrevista': 'entrevista',
            'hash-novedades': 'novedades'
        };
        for (var i = 0; i < tags.length; i++) {
            if (map[tags[i].slug]) return map[tags[i].slug];
        }
        return '';
    };

    window.renderCard = function (post) {
        var tag = post.primary_tag || {};
        var author = post.primary_author || {};
        var tags = post.tags || [];
        var isEn = tags.some(function (t) { return t.slug === 'hash-en'; });
        var isCanon = tags.some(function (t) { return t.slug === 'hash-canon'; });
        var isRuta = tags.some(function (t) { return (t.slug || '').indexOf('hash-ruta-') === 0; });
        var featured = isCanon || isRuta;
        var lang = isEn ? 'en' : 'es';

        var ct = window.getContentType(tags);
        var ctHtml = ct ? '<span class="pc__type"> · ' + window.escHtml(ct) + '</span>' : '';
        var tagUrl = tag.slug ? '/' + lang + '/tag/' + tag.slug + '/' : '';
        var tagName = window.escHtml(tag.name || 'Uncategorized');
        var rt = post.reading_time ? (' <span class="pc__sep">·</span> ' + post.reading_time + ' min') : '';
        var meta = window.escHtml(author.name || '') + rt;
        var img = window.escHtml(post.feature_image || '');
        var title = window.escHtml(post.title);
        var overlay = '<div class="pc__overlay" style="background-size:cover;background-position:center"></div>';
        var tagSpan = '<span class="pc__tag"' + (tag.slug ? ' data-tag-url="' + window.escHtml(tagUrl) + '"' : '') + '>' + tagName + ctHtml + '</span>';
        var body = '<div class="pc__body">' + tagSpan +
            '<h3 class="pc__title">' + title + '</h3>' +
            '<div class="pc__meta">' + meta + '</div></div>';

        // v2 = misma geometría que v1 + foil + badge pill (canon/ruta) en el cover
        var featuredCls = '', badge = '';
        if (featured) {
            featuredCls = ' pc--featured';
            badge = isCanon
                ? '<span class="pc__badge" data-href="/' + lang + '/canon/"><span class="pc__star">★</span> canon</span>'
                : '<span class="pc__badge" data-href="/' + lang + '/rutas/"><span class="pc__star">★</span> ruta</span>';
        }
        return '<div role="listitem" class="w-dyn-item">' +
            '<a href="' + post.url + '" class="pc pc__link' + featuredCls + '">' +
            '<div class="pc__cover">' +
            '<img src="' + img + '" alt="' + title + '" class="pc__img" loading="lazy" width="600" height="375" />' +
            overlay + badge + '</div>' +
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
