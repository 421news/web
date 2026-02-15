document.addEventListener("DOMContentLoaded", () => {
    const feed = document.querySelector('.last-posts-section');
    const btn = document.querySelector('#load-more-author');
    if (!feed || !btn) return;

    const API_KEY = "420da6f85b5cc903b347de9e33";
    const LIMIT = 24;
    let nextPage = 2;
    let loading = false;
    let prefetched = null;

    const authorSlug = location.pathname.match(/\/author\/([^/]+)/)?.[1] || '';

    const textureURL = (() => {
        const el = document.querySelector('.post-card_overlay');
        if (!el) return "";
        const m = el.style.backgroundImage.match(/url\((['"]?)(.*?)\1\)/);
        return m ? m[2] : "";
    })();

    function formatDate(iso) {
        const d = new Date(iso);
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const yy = d.getFullYear();
        return dd + "/" + mm + "/" + yy;
    }

    function buildURL(page) {
        var url = new URL('/ghost/api/content/posts/', location.origin);
        var params = new URLSearchParams({
            key: API_KEY,
            page: String(page),
            limit: String(LIMIT),
            include: "authors,tags",
            fields: "title,primary_tag,slug,published_at,feature_image,feature_image_alt,excerpt,url",
            filter: "tag:-hash-en+primary_author:" + authorSlug,
            order: "published_at desc"
        });
        url.search = params.toString();
        return url;
    }

    async function fetchPage(page) {
        var res = await fetch(buildURL(page), { headers: { 'Accept-Version': 'v5.0' }});
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
    }

    function prefetchNext() {
        if (!nextPage) return;
        prefetched = fetchPage(nextPage);
    }

    function renderPostCard(p) {
        var primaryAuthor = p.primary_author?.name || p.authors?.[0]?.name || "";
        var primaryTag = p.primary_tag?.name || "Uncategorized";
        var primaryTagIco = p.primary_tag?.feature_image || "";

        var listItem = document.createElement("div");
        listItem.setAttribute("role", "listitem");
        listItem.className = "w-dyn-item";
        listItem.dataset.postId = p.id;

        var a = document.createElement("a");
        a.className = "post-card_link w-inline-block";
        a.href = new URL(p.url || "/" + p.slug + "/", location.origin).toString();
        listItem.appendChild(a);

        var card = document.createElement('div');
        card.className = "post-card";
        a.appendChild(card);

        var cover = document.createElement("div");
        cover.className = "post-card_cover";
        if (p.feature_image) {
            cover.style.backgroundImage = 'url("' + p.feature_image + '")';
        }
        card.appendChild(cover);

        var ico = document.createElement("div");
        ico.className = "post-card_ico";
        if (primaryTagIco) {
            var img = document.createElement("img");
            img.src = primaryTagIco;
            img.alt = (p.primary_tag?.name || "") + " featured image";
            img.className = "primary-tag-image";
            img.width = 28;
            ico.appendChild(img);
        }
        cover.appendChild(ico);

        var overlay = document.createElement("div");
        overlay.className = "post-card_overlay";
        if (textureURL) {
            overlay.style.backgroundImage = 'url("' + textureURL + '")';
            overlay.style.backgroundSize = "cover";
            overlay.style.backgroundPosition = "center";
            overlay.addEventListener("mouseover", function() {
                overlay.style.backgroundImage = 'linear-gradient(180deg, var(--verde), var(--amarillo)), url("' + textureURL + '")';
                overlay.style.backgroundBlendMode = 'overlay';
            });
            overlay.addEventListener("mouseout", function() {
                overlay.style.backgroundImage = 'url("' + textureURL + '")';
                overlay.style.backgroundBlendMode = '';
            });
        }
        cover.appendChild(overlay);

        var tagBox = document.createElement("div");
        tagBox.className = "tag-box";
        tagBox.textContent = primaryTag;
        cover.appendChild(tagBox);

        var info = document.createElement('div');
        info.className = 'post-card_info';
        card.appendChild(info);

        var h3 = document.createElement('h3');
        h3.textContent = p.title;
        info.appendChild(h3);

        var metaWrap = document.createElement('div');
        metaWrap.className = 'pt-xsmall';
        info.appendChild(metaWrap);

        var by = document.createElement('div');
        by.className = 'is-italic';
        by.textContent = primaryAuthor;
        metaWrap.appendChild(by);

        var date = document.createElement('div');
        date.className = 'is-italic';
        date.textContent = formatDate(p.published_at);
        metaWrap.appendChild(date);

        return listItem;
    }

    function renderPosts(posts) {
        var frag = document.createDocumentFragment();
        posts.forEach(function(p) { frag.appendChild(renderPostCard(p)); });
        feed.appendChild(frag);
    }

    async function loadMore() {
        if (loading || !nextPage) return;
        loading = true;

        var prev = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Cargando...";

        try {
            var data = await (prefetched || fetchPage(nextPage));
            prefetched = null;
            var posts = data.posts || [];

            if (posts.length) renderPosts(posts);

            var next = data.meta?.pagination?.next || null;
            nextPage = next;

            if (!nextPage || posts.length === 0) {
                btn.remove();
            } else {
                btn.disabled = false;
                btn.textContent = prev;
                prefetchNext();
            }
        } catch (err) {
            prefetched = null;
            btn.disabled = false;
            btn.textContent = prev;
        } finally {
            loading = false;
        }
    }

    btn.addEventListener("click", loadMore);
    prefetchNext();
});
