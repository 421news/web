const express = require("express");
const exphbs = require("express-handlebars");
const path = require("path");

const app = express();

const blocks = {};

// handlebars config
const hbs = exphbs.create({
    extname: ".hbs",
    defaultLayout: "default",
    layoutsDir: path.join(__dirname, 'layouts'),
    partialsDir: path.join(__dirname, 'partials'),
    helpers: {
        asset: function(path) {
            return `/assets/${path}`
        },
        foreach: function(arr, options) {
            if (!arr) return options.inverse(this);
            return arr.map(item => options.fn(item)).join('');
        },
        get: function(type, options) {
            // simulamos la helper get de ghost
            return options.fn(mockData[type] || {});
        },
        contentFor: function(name, options) {
            const block = blocks[name];
            blocks[name] = options.fn(this);
            return null;
        },
        block: function(name) {
            const val = (blocks[name] || '');
            blocks[name] = '';
            return val;
        },
        // Ghost helpers stubs for dev
        ghost_head: function() { return ''; },
        ghost_foot: function() { return ''; },
        meta_title: function() { return '421 Dev'; },
        body_class: function() { return ''; }
    }
})

app.engine(".hbs", hbs.engine);
app.set("view engine", ".hbs");
app.set("views", __dirname);

app.use("/assets", express.static(path.join(__dirname, "assets")))

// Datos mock para simular Ghost
const mockData = {
    posts: [
        {
            title: "Artículo de ejemplo 1",
            excerpt: "Este es un extracto de ejemplo",
            feature_image: "/assets/images/example1.jpg",
            url: "#",
            primary_tag: {
                name: "Tecnología",
                url: "/tag/tecnologia"
            },
            primary_author: {
                name: "Juan Ruocco",
                profile_image: "/assets/images/juan-img.png",
                url: "/author/juan-ruocco"
            },
            published_at: new Date(),
            tags: [
                { name: "Tecnología", url: "/tag/tecnologia" },
                { name: "Desarrollo", url: "/tag/desarrollo" }
            ]
        }
    ],
    tags: [
        { name: "Tecnología", url: "/tag/tecnologia", count: { posts: 10 } },
        { name: "Cultura", url: "/tag/cultura", count: { posts: 15 } },
        { name: "Cannabis", url: "/tag/cannabis", count: { posts: 8 } }
    ],
    authors: [
        {
            name: "Juan Ruocco",
            profile_image: "/assets/images/juan-img.png",
            bio: "Biografía de ejemplo",
            twitter: "realjuanruocco"
        }
    ]
};

// rutas
app.get("/", (req, res) => {
    res.render("index", {
        posts: mockData.posts,
        site: {
            title: "421",
            description: "Description"
        }
    })
})

// ruta aislada para probar el file browser
app.get("/file-browser", (req, res) => {
    res.render("file-browser-preview", {
        layout: false
    })
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`)
})