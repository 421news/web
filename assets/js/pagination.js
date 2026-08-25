// Unified pagination: auto-detects page type from URL
document.addEventListener('DOMContentLoaded', function () {
    var feed = document.querySelector('.last-posts-section');
    var btn = document.getElementById('load-more-home') || document.getElementById('load-more') || document.getElementById('load-more-author');
    if (!feed || !btn) return;

    var API_KEY = '420da6f85b5cc903b347de9e33';
    var path = location.pathname.replace(/\/+$/, '');
    var isEnglish = path.startsWith('/en');

    // El filtro puede venir declarado por la plantilla en el propio boton. Es la via
    // preferida: adivinar el tipo de pagina por la URL solo funciona mientras el
    // listado viva en /{lang}/tag/{slug}/, y se rompe callado en cualquier landing
    // con URL propia — /es/resenas/ y /en/reviews/ caian en el `else` y "Cargar mas"
    // traia TODO el sitio. Ademas el data-filter copia textualmente el filtro del
    // {{#get}} de la plantilla, asi que la pagina 2 no puede discrepar de la 1
    // (las paginas de tag filtran por primary_tag y esto filtraba por tag).
    var declarado = btn.getAttribute('data-filter');
    if (declarado) {
        arrancar(declarado, parseInt(btn.getAttribute('data-limit'), 10) || 15);
        return;
    }

    // Detect page type and configure
    var tagMatch = path.match(/\/(es|en)\/tag\/([^/]+)$/);
    var authorMatch = path.match(/\/author\/([^/]+)$/);
    var limit, filter;

    var langMatch = path.match(/^\/(zh|ja|ko|tr|pt|fr)/);

    if (authorMatch) {
        limit = 24;
        var esExclude = 'tag:-hash-en+tag:-hash-zh+tag:-hash-ja+tag:-hash-ko+tag:-hash-tr+tag:-hash-pt+tag:-hash-fr';
        // `authors:`, NO `primary_author:`: este último es solo el PRIMERO de la lista, así
        // que en una nota firmada por dos, el segundo autor no la veía en su página.
        filter = esExclude + '+tag:-hash-satelite+authors:' + authorMatch[1];
    } else if (langMatch) {
        // Intl home pages use their own pagination in last-posts-intl.hbs
        return;
    } else if (tagMatch) {
        limit = 15;
        var langTag = tagMatch[1] === 'en' ? 'tag:hash-en' : 'tag:-hash-en+tag:-hash-zh+tag:-hash-ja+tag:-hash-ko+tag:-hash-tr+tag:-hash-pt+tag:-hash-fr';
        filter = 'tag:' + tagMatch[2] + '+' + langTag + '+tag:-hash-satelite';
    } else {
        limit = 20;
        var esExcludeAll = 'tag:-hash-en+tag:-hash-zh+tag:-hash-ja+tag:-hash-ko+tag:-hash-tr+tag:-hash-pt+tag:-hash-fr';
        filter = isEnglish ? 'tag:hash-en+tag:-hash-satelite' : esExcludeAll + '+tag:-hash-satelite';
    }

    arrancar(filter, limit);

    function arrancar(filter, limit) {
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
    }
});
