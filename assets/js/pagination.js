// Unified pagination: auto-detects page type from URL
document.addEventListener('DOMContentLoaded', function () {
    var feed = document.querySelector('.last-posts-section');
    var btn = document.getElementById('load-more-home') || document.getElementById('load-more') || document.getElementById('load-more-author');
    if (!feed || !btn) return;

    var API_KEY = '420da6f85b5cc903b347de9e33';
    var path = location.pathname.replace(/\/+$/, '');
    var isEnglish = path.startsWith('/en');

    // Detect page type and configure
    var tagMatch = path.match(/\/(es|en)\/tag\/([^/]+)$/);
    var authorMatch = path.match(/\/author\/([^/]+)$/);
    var limit, filter;

    if (authorMatch) {
        limit = 24;
        filter = 'tag:-hash-en+primary_author:' + authorMatch[1];
    } else if (tagMatch) {
        limit = 15;
        var langTag = tagMatch[1] === 'en' ? 'tag:hash-en' : 'tag:-hash-en';
        filter = 'tag:' + tagMatch[2] + '+' + langTag;
    } else {
        limit = 20;
        filter = isEnglish ? 'tag:hash-en' : 'tag:-hash-en';
    }

    var nextPage = 2;
    var loading = false;
    var prefetched = null;

    function buildURL(page) {
        return '/ghost/api/content/posts/?key=' + API_KEY +
            '&page=' + page +
            '&limit=' + limit +
            '&include=authors,tags' +
            '&filter=' + encodeURIComponent(filter);
    }

    function fetchPage(page) {
        return fetch(buildURL(page), { headers: { 'Accept-Version': 'v5.0' } })
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            });
    }

    function prefetchNext() {
        if (nextPage) prefetched = fetchPage(nextPage);
    }

    function renderPosts(posts) {
        var html = posts.map(window.renderCard).join('');
        feed.insertAdjacentHTML('beforeend', html);
    }

    function loadMore() {
        if (loading || !nextPage) return;
        loading = true;

        var prev = btn.textContent;
        btn.disabled = true;
        btn.textContent = isEnglish ? 'Loading...' : 'Cargando...';

        (prefetched || fetchPage(nextPage))
            .then(function (data) {
                prefetched = null;
                var posts = data.posts || [];
                if (posts.length) renderPosts(posts);

                var next = data.meta && data.meta.pagination ? data.meta.pagination.next : null;
                nextPage = next;

                if (!nextPage || posts.length === 0) {
                    btn.remove();
                } else {
                    btn.disabled = false;
                    btn.textContent = prev;
                    prefetchNext();
                }
            })
            .catch(function () {
                prefetched = null;
                btn.disabled = false;
                btn.textContent = prev;
            })
            .then(function () { loading = false; });
    }

    btn.addEventListener('click', loadMore);
    prefetchNext();
});
