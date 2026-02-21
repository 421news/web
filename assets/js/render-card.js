// Shared post card rendering utilities + event delegation for hover + lazy texture
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

    window.renderCard = function (post) {
        var tag = post.primary_tag || {};
        var author = post.primary_author || {};
        var date = window.formatPostDate(post.published_at);
        var tagImg = tag.feature_image
            ? '<img src="' + tag.feature_image + '" alt="' + window.escHtml(tag.name) + '" class="primary-tag-image" width="28" />'
            : '';

        return '<div role="listitem" class="w-dyn-item">' +
            '<a href="' + post.url + '" class="post-card_link w-inline-block">' +
            '<div class="post-card">' +
            '<div class="post-card_cover" style="background-image:url(\'' + window.escHtml(post.feature_image || '') + '\')">' +
            '<div class="post-card_ico">' + tagImg + '</div>' +
            '<div class="post-card_overlay" style="background-size:cover;background-position:center"></div>' +
            '<div class="tag-box">' + window.escHtml(tag.name || 'Uncategorized') + '</div>' +
            '</div>' +
            '<div class="post-card_info">' +
            '<h3>' + window.escHtml(post.title) + '</h3>' +
            '<div class="pt-xsmall">' +
            '<div class="is-italic">' + window.escHtml(author.name || '') + '</div>' +
            '<div class="is-italic">' + date + '</div>' +
            '</div></div></div></a></div>';
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

    // Watch for new overlays added to the DOM (pagination, rutas, related posts, etc.)
    new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
            var added = mutations[i].addedNodes;
            for (var j = 0; j < added.length; j++) {
                var node = added[j];
                if (node.nodeType !== 1) continue;
                if (node.classList && node.classList.contains('post-card_overlay')) {
                    observeOverlay(node);
                }
                var overlays = node.querySelectorAll && node.querySelectorAll('.post-card_overlay');
                if (overlays) {
                    for (var k = 0; k < overlays.length; k++) observeOverlay(overlays[k]);
                }
            }
        }
    }).observe(document.documentElement, { childList: true, subtree: true });

    // Event delegation for post card hover (covers both server-rendered and JS-rendered cards)
    document.addEventListener('mouseover', function (e) {
        var card = e.target.closest('.post-card');
        if (!card) return;
        var overlay = card.querySelector('.post-card_overlay');
        if (overlay) {
            overlay.style.backgroundImage = 'linear-gradient(180deg,var(--verde),var(--amarillo)),url(' + TEXTURA + ')';
            overlay.style.backgroundBlendMode = 'overlay';
        }
    });
    document.addEventListener('mouseout', function (e) {
        var card = e.target.closest('.post-card');
        if (!card) return;
        var related = e.relatedTarget;
        if (related && card.contains(related)) return;
        var overlay = card.querySelector('.post-card_overlay');
        if (overlay) {
            overlay.style.backgroundImage = "url('" + TEXTURA + "')";
            overlay.style.backgroundBlendMode = '';
        }
    });
})();
