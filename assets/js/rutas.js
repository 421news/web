(function () {
    var CONTENT_KEY = '420da6f85b5cc903b347de9e33';
    var API_BASE = '/ghost/api/content';
    var JSON_PATH = '/assets/data/rutas.json';

    var rutasContainer = document.getElementById('rutas-container');
    var canonContainer = document.getElementById('canon-container');
    if (!rutasContainer && !canonContainer) return;

    // Detect language from URL
    var isEN = window.location.pathname.indexOf('/en/') === 0;

    fetch(JSON_PATH)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            // Pick language-appropriate data keys (fallback to ES)
            var rutasKey = (isEN && data.rutas_en) ? 'rutas_en' : 'rutas';
            var canonKey = (isEN && data.canon_en) ? 'canon_en' : 'canon';

            // Collect all unique slugs
            var allSlugs = [];
            if (rutasContainer && data[rutasKey]) {
                data[rutasKey].forEach(function (ruta) {
                    ruta.slugs.forEach(function (s) {
                        if (allSlugs.indexOf(s) === -1) allSlugs.push(s);
                    });
                });
            }
            if (canonContainer && data[canonKey]) {
                data[canonKey].forEach(function (c) {
                    if (allSlugs.indexOf(c.slug) === -1) allSlugs.push(c.slug);
                });
            }

            // Fetch all posts in parallel
            return Promise.all(allSlugs.map(function (s) {
                return fetch(API_BASE + '/posts/slug/' + s + '/?key=' + CONTENT_KEY + '&include=tags,authors')
                    .then(function (r) { return r.json(); })
                    .then(function (d) { return d.posts && d.posts[0]; })
                    .catch(function () { return null; });
            })).then(function (posts) {
                // Build slug -> post map
                var postMap = {};
                posts.forEach(function (p) {
                    if (p) postMap[p.slug] = p;
                });
                return { data: data, postMap: postMap };
            });
        })
        .then(function (result) {
            var data = result.data;
            var postMap = result.postMap;

            var rutasKey = (isEN && data.rutas_en) ? 'rutas_en' : 'rutas';
            var canonKey = (isEN && data.canon_en) ? 'canon_en' : 'canon';

            if (rutasContainer && data[rutasKey]) {
                renderRutas(data[rutasKey], postMap);
            }
            if (canonContainer && data[canonKey]) {
                renderCanon(data[canonKey], postMap);
            }
        })
        .catch(function (err) {
            console.error('Error loading rutas:', err);
        });

    function renderRutas(rutas, postMap) {
        var labelRoute = isEN ? 'Route' : 'Ruta';
        var labelTexts = isEN ? 'texts' : 'textos';
        var html = '';
        rutas.forEach(function (ruta, i) {
            var num = String(i + 1).length < 2 ? '0' + (i + 1) : String(i + 1);
            html += '<div class="ruta-section">';
            html += '<div class="ruta-header">';
            html += '<div class="ruta-number">' + labelRoute + ' ' + num + '</div>';
            html += '<h2 class="ruta-nombre">' + esc(ruta.nombre) + '</h2>';
            html += '<p class="ruta-tesis">' + esc(ruta.tesis) + '</p>';
            html += '<div class="ruta-posts-count">' + ruta.slugs.length + ' ' + labelTexts + '</div>';
            html += '</div>';
            html += '<div class="ruta-cards post-cols">';
            ruta.slugs.forEach(function (slug) {
                var post = postMap[slug];
                if (post) html += renderCard(post);
            });
            html += '</div>';
            html += '</div>';
        });
        rutasContainer.innerHTML = html;
    }

    function renderCanon(canon, postMap) {
        var html = '<div class="canon-list">';
        canon.forEach(function (item, i) {
            var post = postMap[item.slug];
            if (!post) return;
            var tag = post.primary_tag || {};
            var img = post.feature_image || '';
            html += '<a href="' + post.url + '" class="canon-item">';
            html += '<div class="canon-number-badge">' + (i + 1) + '</div>';
            if (img) {
                html += '<div class="canon-cover" style="background-image:url(\'' + esc(img) + '\')"></div>';
            }
            html += '<div class="canon-info">';
            if (tag.name) {
                html += '<div class="canon-tag">' + esc(tag.name) + '</div>';
            }
            html += '<h3>' + esc(post.title) + '</h3>';
            html += '<p class="canon-reason">' + esc(item.razon) + '</p>';
            html += '</div>';
            html += '</a>';
        });
        html += '</div>';
        canonContainer.innerHTML = html;
    }

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
