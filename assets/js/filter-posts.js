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
    var langFilter = isEN ? 'tag:hash-en+tag:-hash-satelite' : 'tag:-hash-en+tag:-hash-satelite';
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

    // Populate tag dropdown (using native tags endpoint instead of fetching all posts)
    fetch(API_BASE + '/tags/?key=' + CONTENT_KEY + '&limit=all&filter=visibility:public&include=count.posts')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var tags = (data.tags || []).filter(function (t) {
                return t.count && t.count.posts > 0;
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
                    grid.insertAdjacentHTML('beforeend', window.renderCard(post));
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

})();
