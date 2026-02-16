(function () {
    var CONTENT_KEY = '420da6f85b5cc903b347de9e33';
    var API_BASE = '/ghost/api/content';
    var LIMIT = 20;

    var grid = document.getElementById('posts-grid');
    var btn = document.getElementById('load-more-posts');
    var authorSelect = document.getElementById('filter-author');
    var tagSelect = document.getElementById('filter-tag');
    var orderSelect = document.getElementById('filter-order');

    if (!grid || !authorSelect) return;

    var isEN = window.location.pathname.indexOf('/en/') === 0;
    var langFilter = isEN ? 'tag:hash-en' : 'tag:-hash-en';
    var nextPage = 2;
    var hasMore = true;
    var loading = false;

    // Populate author dropdown
    fetch(API_BASE + '/authors/?key=' + CONTENT_KEY + '&limit=all&include=count.posts')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var authors = (data.authors || []).filter(function (a) {
                return a.count && a.count.posts > 0;
            });
            authors.sort(function (a, b) { return a.name.localeCompare(b.name); });
            authors.forEach(function (a) {
                var opt = document.createElement('option');
                opt.value = a.slug;
                opt.textContent = a.name;
                authorSelect.appendChild(opt);
            });
        });

    // Populate tag dropdown (only tags used in this language)
    fetch(API_BASE + '/posts/?key=' + CONTENT_KEY + '&limit=all&include=tags&filter=' + encodeURIComponent(langFilter))
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var posts = data.posts || [];
            var tagMap = {};
            posts.forEach(function (p) {
                (p.tags || []).forEach(function (t) {
                    if (t.visibility === 'public' && !tagMap[t.slug]) {
                        tagMap[t.slug] = t.name;
                    }
                });
            });
            var tags = Object.keys(tagMap).map(function (slug) {
                return { slug: slug, name: tagMap[slug] };
            });
            tags.sort(function (a, b) { return a.name.localeCompare(b.name); });
            tags.forEach(function (t) {
                var opt = document.createElement('option');
                opt.value = t.slug;
                opt.textContent = t.name;
                tagSelect.appendChild(opt);
            });
        });

    authorSelect.addEventListener('change', applyFilters);
    tagSelect.addEventListener('change', applyFilters);
    orderSelect.addEventListener('change', applyFilters);
    if (btn) btn.addEventListener('click', loadMore);

    function buildFilter() {
        var parts = [langFilter];
        if (authorSelect.value) parts.push('author:' + authorSelect.value);
        if (tagSelect.value) parts.push('tag:' + tagSelect.value);
        return parts.join('+');
    }

    function applyFilters() {
        nextPage = 1;
        hasMore = true;
        fetchPosts(true);
    }

    function loadMore() {
        if (!hasMore || loading) return;
        fetchPosts(false);
    }

    function fetchPosts(replace) {
        loading = true;
        var filter = buildFilter();
        var order = orderSelect.value || 'published_at desc';

        var url = API_BASE + '/posts/?key=' + CONTENT_KEY
            + '&include=tags,authors&limit=' + LIMIT
            + '&page=' + nextPage
            + '&filter=' + encodeURIComponent(filter)
            + '&order=' + encodeURIComponent(order);

        if (btn) {
            btn.disabled = true;
            btn.textContent = isEN ? 'Loading...' : 'Cargando...';
        }

        fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var posts = data.posts || [];
                var pagination = data.meta && data.meta.pagination;
                var totalPages = pagination ? pagination.pages : 1;

                if (replace) grid.innerHTML = '';

                posts.forEach(function (post) {
                    grid.insertAdjacentHTML('beforeend', renderCard(post));
                });

                nextPage++;
                hasMore = nextPage <= totalPages && posts.length > 0;

                if (btn) {
                    if (!hasMore) {
                        btn.style.display = 'none';
                    } else {
                        btn.style.display = 'block';
                        btn.disabled = false;
                        btn.textContent = isEN ? 'Load more' : 'Cargar más';
                    }
                }

                if (replace && posts.length === 0) {
                    grid.innerHTML = '<div class="filter-empty">' +
                        (isEN ? 'No posts found with these filters.' : 'No se encontraron notas con estos filtros.') +
                        '</div>';
                }

                loading = false;
            })
            .catch(function () {
                loading = false;
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = isEN ? 'Load more' : 'Cargar más';
                }
            });
    }

    function renderCard(post) {
        var tag = post.primary_tag || {};
        var author = post.primary_author || {};
        var date = formatDate(post.published_at);
        var tagImg = tag.feature_image
            ? '<img src="' + tag.feature_image + '" alt="' + esc(tag.name) + '" class="primary-tag-image" width="28" />'
            : '';
        var textura = '/assets/images/textura.webp';

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
