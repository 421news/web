(function () {
    var CONTENT_KEY = '420da6f85b5cc903b347de9e33';
    var API_BASE = '/ghost/api/content';
    var JSON_PATH = '/assets/data/related-posts.json';

    // Get current post slug from URL
    var slug = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/').pop();
    if (!slug) return;

    var container = document.querySelector('.preview-section .post-cols');
    if (!container) return;

    fetch(JSON_PATH)
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

            container.innerHTML = posts.map(renderCard).join('');
        })
        .catch(function () { /* keep Handlebars fallback on any error */ });

    function renderCard(post) {
        var tag = post.primary_tag || {};
        var author = post.primary_author || {};
        var date = formatDate(post.published_at);
        var tagImg = tag.feature_image
            ? '<img src="' + tag.feature_image + '" alt="' + esc(tag.name) + '" class="primary-tag-image" width="28" />'
            : '';
        var textura = '/assets/images/textura.png';

        return '<div role="listitem" class="w-dyn-item">' +
            '<a href="' + post.url + '" class="post-card_link w-inline-block">' +
            '<div class="post-card"' +
            ' onmouseover="var o=this.querySelector(\'.post-card_overlay\');if(o){o.style.backgroundImage=\'linear-gradient(180deg,var(--verde),var(--amarillo)),url(' + textura + ')\';o.style.backgroundBlendMode=\'overlay\'}"' +
            ' onmouseout="var o=this.querySelector(\'.post-card_overlay\');if(o){o.style.backgroundImage=\'url(' + textura + ')\';o.style.backgroundBlendMode=\'\'}"' +
            '>' +
            '<div class="post-card_cover" style="background-image:url(\'' + esc(post.feature_image || '') + '\')">' +
            '<div class="post-card_ico">' + tagImg + '</div>' +
            '<div class="post-card_overlay" style="background-image:url(\'' + textura + '\');background-size:cover;background-position:center"></div>' +
            '<div class="tag-box">' + esc(tag.name || 'Uncategorized') + '</div>' +
            '</div>' +
            '<div class="post-card_info">' +
            '<h3>' + esc(post.title) + '</h3>' +
            '<div class="pt-xsmall">' +
            '<div class="is-italic">' + esc(author.name || '') + '</div>' +
            '<div class="is-italic">' + date + '</div>' +
            '</div></div></div></a></div>';
    }

    function formatDate(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
    }

    function esc(s) {
        if (!s) return '';
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
})();
