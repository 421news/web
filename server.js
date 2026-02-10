const express = require("express");
const exphbs = require("express-handlebars");
const path = require("path");

const app = express();

const blocks = {};

// Mock site data (simulates Ghost @site)
const siteData = {
    title: "421",
    description: "Tecnomagia para la vida real",
    url: "http://localhost:3000",
    logo: "/assets/images/favicon.svg",
    icon: null,
    lang: "es"
};

// Mock posts
const mockPosts = [
    {
        id: "1",
        title: "El futuro de la inteligencia artificial en Argentina",
        slug: "futuro-ia-argentina",
        excerpt: "Un análisis profundo sobre cómo la IA está transformando la industria tecnológica en el país.",
        feature_image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=840",
        url: "/futuro-ia-argentina",
        primary_tag: { name: "Tecnología", slug: "tecnologia", url: "/tag/tecnologia" },
        primary_author: {
            name: "Juan Ruocco",
            slug: "juan-ruocco",
            profile_image: "/assets/images/juan-img.png",
            url: "/author/juan-ruocco",
            bio: "Editor de 421.news",
            twitter: "realjuanruocco"
        },
        published_at: new Date("2025-12-15"),
        updated_at: new Date("2025-12-20"),
        featured: true,
        tags: [
            { name: "Tecnología", slug: "tecnologia", url: "/tag/tecnologia" },
            { name: "Argentina", slug: "argentina", url: "/tag/argentina" }
        ],
        content: "<p>Este es el contenido completo del artículo sobre IA en Argentina.</p>",
        reading_time: 5
    },
    {
        id: "2",
        title: "Los mejores juegos indie de 2025",
        slug: "mejores-juegos-indie-2025",
        excerpt: "Una selección de los títulos independientes que marcaron el año.",
        feature_image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=840",
        url: "/mejores-juegos-indie-2025",
        primary_tag: { name: "Juegos", slug: "juegos", url: "/tag/juegos" },
        primary_author: {
            name: "Luis",
            slug: "luis",
            profile_image: "/assets/images/luis-img.png",
            url: "/author/luis",
            bio: "Redactor de 421.news"
        },
        published_at: new Date("2025-11-20"),
        updated_at: new Date("2025-11-25"),
        featured: true,
        tags: [
            { name: "Juegos", slug: "juegos", url: "/tag/juegos" },
            { name: "Videojuegos", slug: "videojuegos", url: "/tag/videojuegos" }
        ],
        content: "<p>Los mejores juegos indie que jugamos este año.</p>",
        reading_time: 8
    },
    {
        id: "3",
        title: "Cannabis medicinal: guía completa",
        slug: "cannabis-medicinal-guia",
        excerpt: "Todo lo que necesitás saber sobre el uso medicinal del cannabis.",
        feature_image: "https://images.unsplash.com/photo-1503262028195-93c528f03218?w=840",
        url: "/cannabis-medicinal-guia",
        primary_tag: { name: "Vida real", slug: "vida-real", url: "/tag/vida-real" },
        primary_author: {
            name: "Juanma",
            slug: "juanma",
            profile_image: "/assets/images/juanma-img.png",
            url: "/author/juanma",
            bio: "Redactor de 421.news"
        },
        published_at: new Date("2025-10-05"),
        updated_at: new Date("2025-10-10"),
        featured: false,
        tags: [
            { name: "Vida real", slug: "vida-real", url: "/tag/vida-real" },
            { name: "Cannabis", slug: "cannabis", url: "/tag/cannabis" }
        ],
        content: "<p>Una guía completa sobre cannabis medicinal.</p>",
        reading_time: 12
    },
    {
        id: "4",
        title: "Cine argentino: las películas que vienen",
        slug: "cine-argentino-peliculas",
        excerpt: "Adelanto de los estrenos más esperados del cine nacional.",
        feature_image: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=840",
        url: "/cine-argentino-peliculas",
        primary_tag: { name: "Cultura", slug: "cultura", url: "/tag/cultura" },
        primary_author: {
            name: "Juan Ruocco",
            slug: "juan-ruocco",
            profile_image: "/assets/images/juan-img.png",
            url: "/author/juan-ruocco",
            bio: "Editor de 421.news",
            twitter: "realjuanruocco"
        },
        published_at: new Date("2025-09-12"),
        updated_at: new Date("2025-09-15"),
        featured: true,
        tags: [
            { name: "Cultura", slug: "cultura", url: "/tag/cultura" },
            { name: "Películas", slug: "peliculas", url: "/tag/peliculas" }
        ],
        content: "<p>Las películas argentinas más esperadas.</p>",
        reading_time: 6
    },
    {
        id: "5",
        title: "How AI is shaping the future of gaming",
        slug: "ai-future-gaming",
        excerpt: "An in-depth look at artificial intelligence in modern video games.",
        feature_image: "https://images.unsplash.com/photo-1535223289827-42f1e9919769?w=840",
        url: "/en/ai-future-gaming",
        primary_tag: { name: "Tech", slug: "tech", url: "/tag/tech" },
        primary_author: {
            name: "Juan Ruocco",
            slug: "juan-ruocco",
            profile_image: "/assets/images/juan-img.png",
            url: "/author/juan-ruocco",
            bio: "Editor at 421.news",
            twitter: "realjuanruocco"
        },
        published_at: new Date("2025-12-01"),
        updated_at: new Date("2025-12-05"),
        featured: true,
        tags: [
            { name: "#en", slug: "hash-en", url: "/tag/hash-en" },
            { name: "Tech", slug: "tech", url: "/tag/tech" }
        ],
        content: "<p>How AI is changing the gaming industry.</p>",
        reading_time: 7
    }
];

// handlebars config
const hbs = exphbs.create({
    extname: ".hbs",
    defaultLayout: "default",
    layoutsDir: path.join(__dirname, 'layouts'),
    partialsDir: path.join(__dirname, 'partials'),
    helpers: {
        asset: function(p) {
            return `/assets/${p}`;
        },
        foreach: function(arr, options) {
            if (!arr || !arr.length) {
                return options.inverse ? options.inverse(this) : '';
            }
            var out = '';
            for (var i = 0; i < arr.length; i++) {
                var data = {};
                if (options.data) {
                    data = Object.create(options.data);
                }
                data.index = i;
                data.first = i === 0;
                data.last = i === arr.length - 1;
                out += options.fn(arr[i], { data: data });
            }
            return out;
        },
        get: function() {
            var args = Array.prototype.slice.call(arguments);
            var options = args[args.length - 1];
            var type = args[0] || 'posts';
            var hash = options.hash || {};
            var limit = parseInt(hash.limit) || 100;
            var filter = hash.filter || '';

            var data = [];
            if (type === 'posts') {
                data = mockPosts.slice();
                if (filter.indexOf("-hash-en") !== -1 || filter.indexOf("-'hash-en'") !== -1) {
                    data = data.filter(function(p) {
                        return !p.tags.some(function(t) { return t.slug === 'hash-en'; });
                    });
                } else if (filter.indexOf("hash-en") !== -1 || filter.indexOf("'hash-en'") !== -1) {
                    data = data.filter(function(p) {
                        return p.tags.some(function(t) { return t.slug === 'hash-en'; });
                    });
                }
                if (filter.indexOf("featured:true") !== -1) {
                    data = data.filter(function(p) { return p.featured; });
                }
                data = data.slice(0, limit);
            }

            var ctx = { posts: data };
            if (options.fn) {
                return options.fn(ctx, { blockParams: [data] });
            }
            return '';
        },
        has: function() {
            var args = Array.prototype.slice.call(arguments);
            var options = args[args.length - 1];
            var hash = options.hash || {};

            if (hash.tag) {
                var checkTag = hash.tag.replace(/^#/, 'hash-');
                var tags = this.tags || [];
                var hasTag = tags.some(function(t) { return t.slug === checkTag || t.name === hash.tag; });
                return hasTag ? options.fn(this) : (options.inverse ? options.inverse(this) : '');
            }
            return options.inverse ? options.inverse(this) : '';
        },
        date: function() {
            var args = Array.prototype.slice.call(arguments);
            var options = args[args.length - 1];
            var val = args.length > 1 ? args[0] : this;
            if (val instanceof Date) {
                var fmt = (options.hash && options.hash.format) || 'DD/MM/YYYY';
                var y = val.getFullYear();
                return fmt
                    .replace('YYYY', y)
                    .replace('YY', String(y).slice(-2))
                    .replace('MM', String(val.getMonth() + 1).padStart(2, '0'))
                    .replace('DD', String(val.getDate()).padStart(2, '0'))
                    .replace('D', val.getDate())
                    .replace('M', val.getMonth() + 1)
                    .replace('HH', String(val.getHours()).padStart(2, '0'))
                    .replace('mm', String(val.getMinutes()).padStart(2, '0'))
                    .replace('ss', String(val.getSeconds()).padStart(2, '0'))
                    .replace('Z', '+00:00');
            }
            return String(val || '');
        },
        reading_time: function() {
            return (this.reading_time || 5) + ' min read';
        },
        img_url: function() {
            return arguments[0] || '';
        },
        url: function() {
            return this.url || '';
        },
        contentFor: function(name, options) {
            blocks[name] = options.fn(this);
            return '';
        },
        block: function(name) {
            var val = (blocks[name] || '');
            blocks[name] = '';
            return val;
        },
        ghost_head: function() { return ''; },
        ghost_foot: function() { return ''; },
        meta_title: function() { return '421 Dev'; },
        body_class: function() { return ''; }
    }
});

app.engine(".hbs", hbs.engine);
app.set("view engine", ".hbs");
app.set("views", __dirname);

app.use("/assets", express.static(path.join(__dirname, "assets")));

// Shared template data
function templateData(extra) {
    var data = {
        posts: mockPosts.filter(function(p) {
            return !p.tags.some(function(t) { return t.slug === 'hash-en'; });
        }),
        "@site": siteData,
        site: siteData
    };
    if (extra) {
        Object.keys(extra).forEach(function(k) { data[k] = extra[k]; });
    }
    return data;
}

// Routes
app.get("/", function(req, res) {
    res.render("index", templateData());
});

app.get("/en", function(req, res) {
    res.render("en", templateData({
        posts: mockPosts.filter(function(p) {
            return p.tags.some(function(t) { return t.slug === 'hash-en'; });
        })
    }));
});

app.get("/en/", function(req, res) {
    res.render("en", templateData({
        posts: mockPosts.filter(function(p) {
            return p.tags.some(function(t) { return t.slug === 'hash-en'; });
        })
    }));
});

// File browser preview (before catch-all)
app.get("/file-browser", function(req, res) {
    res.sendFile(path.join(__dirname, "file-browser-preview.html"));
});

// Mock article route (catch-all) — post.hbs uses Ghost-specific Handlebars
// syntax that express-handlebars can't fully emulate, so we fallback to
// a simple HTML render if the template fails
app.get("/:slug", function(req, res) {
    var post = mockPosts.find(function(p) { return p.slug === req.params.slug; });
    if (!post) {
        return res.status(404).send("Post not found");
    }
    res.render("post", templateData(post), function(err, html) {
        if (!err) return res.send(html);
        // Fallback: render a simple article page
        res.send('<!DOCTYPE html><html lang="es"><head>' +
            '<title>' + post.title + ' | 421 Dev</title>' +
            '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<link href="/assets/css/udesly-ghost.css" rel="stylesheet">' +
            '<link href="/assets/css/globals.css" rel="stylesheet">' +
            '<link href="/assets/css/index.css" rel="stylesheet">' +
            '<link href="/assets/css/file-browser.css" rel="stylesheet">' +
            '</head><body class="post-template">' +
            '<div class="global-container" style="max-width:840px;margin:0 auto;padding:40px 20px">' +
            '<div style="margin-bottom:12px"><a href="/" style="color:#17a583">&#8592; 421</a></div>' +
            '<h1 style="font-size:2.5rem;margin-bottom:16px">' + post.title + '</h1>' +
            '<p style="opacity:0.7;margin-bottom:24px">' + post.primary_author.name +
            ' &mdash; ' + post.published_at.toLocaleDateString('es-AR') + '</p>' +
            (post.feature_image ? '<img src="' + post.feature_image + '" alt="' + post.title + '" style="width:100%;max-width:840px;margin-bottom:24px;border-radius:8px">' : '') +
            '<div class="rich-text w-richtext">' + post.content + '</div>' +
            '</div>' +
            '<script src="/assets/js/file-browser.js"></script>' +
            '</body></html>');
    });
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
    console.log("Servidor corriendo en http://localhost:" + PORT);
});
