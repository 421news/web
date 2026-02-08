/**
 * 421 Desktop - Unix Window System
 * Window manager, file browser, article viewer
 */
(function () {
  "use strict";

  /* ============ CONFIG ============ */
  var LANG = (document.querySelector("[data-fb-lang]") || {}).getAttribute("data-fb-lang") || "es";

  var CFG = {
    es: {
      title: "421 \u2014 Explorador de archivos",
      bookmarks: "Marcadores", system: "Sistema", home: "Inicio",
      subscribe: "Suscribite", magazine: "Revista", latest: "\u00DAltimos posts",
      items: "elementos", emptyMsg: "Carpeta vac\u00EDa", readBtn: "Leer art\u00EDculo \u2192",
      categories: {
        "cultura":     { icon: "\uD83C\uDFA8", subs: ["historieta","libros","musica","peliculas","series","memes"] },
        "tecnologia":  { icon: "\uD83D\uDD0C", subs: ["cripto","internet","tutoriales","soberania"] },
        "juegos":      { icon: "\uD83C\uDFAE", subs: ["magic-the-gathering","videojuegos","warhammer"] },
        "vida-real":   { icon: "\uD83C\uDF0E", subs: ["cannabis","deportes","filosofia","argentina"] }
      },
      files: [
        { name: "suscribite.sh", type: "exec", url: "/suscribite" },
        { name: "revista.pdf",   type: "file", url: "/revista-421" },
        { name: "ultimos.log",   type: "file", url: "/ultimos-posts" }
      ]
    },
    en: {
      title: "421 \u2014 File Browser",
      bookmarks: "Bookmarks", system: "System", home: "Home",
      subscribe: "Subscribe", magazine: "Magazine", latest: "Latest posts",
      items: "items", emptyMsg: "Empty folder", readBtn: "Read article \u2192",
      categories: {
        "culture":    { icon: "\uD83C\uDFA8", subs: ["historieta","libros","musica","peliculas","series","memes"] },
        "tech":       { icon: "\uD83D\uDD0C", subs: ["cripto","internet","tutoriales","soberania"] },
        "games":      { icon: "\uD83C\uDFAE", subs: ["magic-the-gathering","videojuegos","warhammer"] },
        "real-life":  { icon: "\uD83C\uDF0E", subs: ["cannabis","deportes","filosofia","argentina"] }
      },
      files: [
        { name: "subscribe.sh", type: "exec", url: "/suscribite" },
        { name: "magazine.pdf", type: "file", url: "/revista-421" },
        { name: "latest.log",   type: "file", url: "/en/last-posts" }
      ]
    }
  };

  var L = CFG[LANG] || CFG.es;

  /* ============ WINDOW MANAGER ============ */
  var WM = {
    wins: {},
    counter: 0,
    topZ: 1000,
    desktop: null,
    taskbar: null,
    taskbarItems: null,

    init: function () {
      this.desktop = document.getElementById("fb-desktop");
      this.taskbar = document.getElementById("fb-taskbar");
      this.taskbarItems = document.getElementById("fb-taskbar-items");
      if (!this.desktop) {
        this.desktop = document.createElement("div");
        this.desktop.id = "fb-desktop";
        this.desktop.className = "fb-desktop";
        document.body.appendChild(this.desktop);
      }
      if (!this.taskbar) {
        this.taskbar = document.createElement("div");
        this.taskbar.id = "fb-taskbar";
        this.taskbar.className = "fb-taskbar";
        this.taskbar.style.display = "none";
        this.taskbar.innerHTML = '<div class="fb-taskbar-items" id="fb-taskbar-items"></div>';
        document.body.appendChild(this.taskbar);
        this.taskbarItems = this.taskbar.querySelector(".fb-taskbar-items");
      }
    },

    create: function (opts) {
      var id = "fbw-" + (++this.counter);
      var off = (this.counter % 6) * 28;
      var w = document.createElement("div");
      w.className = "fb-window";
      w.id = id;
      w.style.width = (opts.width || 860) + "px";
      w.style.height = (opts.height || 520) + "px";
      w.style.left = (opts.x != null ? opts.x : 60 + off) + "px";
      w.style.top = (opts.y != null ? opts.y : 40 + off) + "px";
      w.style.zIndex = ++this.topZ;

      // titlebar
      var tb = document.createElement("div");
      tb.className = "fb-titlebar";
      tb.innerHTML =
        '<div class="fb-titlebar-dots">' +
          '<span class="fb-dot fb-dot--close"></span>' +
          '<span class="fb-dot fb-dot--minimize"></span>' +
          '<span class="fb-dot fb-dot--maximize"></span>' +
        '</div>' +
        '<span class="fb-titlebar-title">' + this._esc(opts.title || "Window") + '</span>' +
        '<div class="fb-titlebar-spacer"></div>';
      w.appendChild(tb);

      // content
      if (opts.html) {
        var c = document.createElement("div");
        c.style.cssText = "flex:1;display:flex;flex-direction:column;overflow:hidden;";
        c.innerHTML = opts.html;
        w.appendChild(c);
      }

      this.desktop.appendChild(w);
      this._drag(w, tb);
      this._controls(w, id);
      w.addEventListener("mousedown", function () { WM.front(w); });
      this._taskbarAdd(id, opts.title || "Window");
      this.taskbar.style.display = "flex";
      this.wins[id] = { el: w, title: opts.title };
      return id;
    },

    front: function (w) { w.style.zIndex = ++this.topZ; },

    close: function (id) {
      var w = this.wins[id];
      if (!w) return;
      w.el.remove();
      delete this.wins[id];
      this._taskbarRemove(id);
      if (!Object.keys(this.wins).length) this.taskbar.style.display = "none";
    },

    minimize: function (id) {
      var w = this.wins[id];
      if (!w) return;
      w.el.style.display = "none";
      var ti = this.taskbar.querySelector('[data-wid="' + id + '"]');
      if (ti) ti.classList.add("is-minimized");
    },

    restore: function (id) {
      var w = this.wins[id];
      if (!w) return;
      w.el.style.display = "flex";
      this.front(w.el);
      var ti = this.taskbar.querySelector('[data-wid="' + id + '"]');
      if (ti) ti.classList.remove("is-minimized");
    },

    maximize: function (id) {
      var w = this.wins[id];
      if (w) w.el.classList.toggle("is-maximized");
    },

    setTitle: function (id, t) {
      var w = this.wins[id];
      if (!w) return;
      var el = w.el.querySelector(".fb-titlebar-title");
      if (el) el.textContent = t;
      var ti = this.taskbar.querySelector('[data-wid="' + id + '"]');
      if (ti) ti.textContent = t.length > 22 ? t.substring(0, 22) + "\u2026" : t;
    },

    _esc: function (s) {
      var d = document.createElement("div");
      d.textContent = s;
      return d.innerHTML;
    },

    _drag: function (win, handle) {
      var ox = 0, oy = 0, dragging = false;
      function start(cx, cy) { dragging = true; ox = cx - win.offsetLeft; oy = cy - win.offsetTop; WM.front(win); }
      function move(cx, cy) { if (!dragging) return; win.style.left = (cx - ox) + "px"; win.style.top = (cy - oy) + "px"; }
      function end() { dragging = false; }
      handle.addEventListener("mousedown", function (e) { if (e.target.classList.contains("fb-dot")) return; start(e.clientX, e.clientY); e.preventDefault(); });
      document.addEventListener("mousemove", function (e) { move(e.clientX, e.clientY); });
      document.addEventListener("mouseup", end);
      handle.addEventListener("touchstart", function (e) { if (e.target.classList.contains("fb-dot")) return; var t = e.touches[0]; start(t.clientX, t.clientY); }, { passive: true });
      document.addEventListener("touchmove", function (e) { if (!dragging) return; var t = e.touches[0]; move(t.clientX, t.clientY); }, { passive: true });
      document.addEventListener("touchend", end);
    },

    _controls: function (win, id) {
      win.querySelector(".fb-dot--close").addEventListener("click", function () { WM.close(id); });
      win.querySelector(".fb-dot--minimize").addEventListener("click", function () { WM.minimize(id); });
      win.querySelector(".fb-dot--maximize").addEventListener("click", function () { WM.maximize(id); });
    },

    _taskbarAdd: function (id, title) {
      var b = document.createElement("button");
      b.className = "fb-taskbar-item";
      b.setAttribute("data-wid", id);
      b.textContent = title.length > 22 ? title.substring(0, 22) + "\u2026" : title;
      b.addEventListener("click", function () {
        var w = WM.wins[id];
        if (w && w.el.style.display === "none") WM.restore(id);
        else if (w) WM.front(w.el);
      });
      this.taskbarItems.appendChild(b);
    },

    _taskbarRemove: function (id) {
      var b = this.taskbar.querySelector('[data-wid="' + id + '"]');
      if (b) b.remove();
    }
  };

  /* ============ FILE SYSTEM ============ */
  var FS = {
    posts: [],
    allSubs: [],

    init: function () {
      // Collect all subcategory slugs
      var cats = L.categories;
      Object.keys(cats).forEach(function (k) { FS.allSubs = FS.allSubs.concat(cats[k].subs); });

      // Read posts from hidden data elements
      var els = document.querySelectorAll(".fb-post-entry");
      els.forEach(function (el) {
        FS.posts.push({
          title: el.getAttribute("data-title") || "",
          url: el.getAttribute("data-url") || "#",
          image: el.getAttribute("data-image") || "",
          date: el.getAttribute("data-date") || "",
          primaryTag: el.getAttribute("data-primary-tag") || "",
          tags: (el.getAttribute("data-tags") || "").split(",").filter(Boolean)
        });
      });
    },

    list: function (path) {
      var items = [];
      var cats = L.categories;

      if (path === "/") {
        // Root: show main category folders + special files
        Object.keys(cats).forEach(function (slug) {
          items.push({ name: slug + "/", type: "folder", path: "/" + slug, icon: "\uD83D\uDCC1" });
        });
        L.files.forEach(function (f) {
          var icon = f.type === "exec" ? "\uD83D\uDCC4" : f.type === "file" ? "\uD83D\uDCDC" : "\uD83D\uDCC3";
          items.push({ name: f.name, type: f.type, url: f.url, icon: icon });
        });
        return items;
      }

      var parts = path.split("/").filter(Boolean);
      var mainCat = parts[0];
      var subCat = parts[1];

      if (cats[mainCat] && !subCat) {
        // Inside a main category: show subfolders + articles with this tag
        cats[mainCat].subs.forEach(function (sub) {
          items.push({ name: sub + "/", type: "folder", path: "/" + mainCat + "/" + sub, icon: "\uD83D\uDCC2" });
        });
        // Articles that have this main category tag but not a subcategory tag
        FS.posts.forEach(function (p) {
          var inMain = p.tags.indexOf(mainCat) !== -1 || p.primaryTag === mainCat;
          var inSub = false;
          cats[mainCat].subs.forEach(function (s) { if (p.tags.indexOf(s) !== -1) inSub = true; });
          if (inMain && !inSub) {
            items.push({ name: p.title, type: "article", url: p.url, image: p.image, date: p.date, icon: "\uD83D\uDCF0" });
          }
        });
        return items;
      }

      if (cats[mainCat] && subCat) {
        // Inside a subcategory: show articles with this tag
        FS.posts.forEach(function (p) {
          if (p.tags.indexOf(subCat) !== -1) {
            items.push({ name: p.title, type: "article", url: p.url, image: p.image, date: p.date, icon: "\uD83D\uDCF0" });
          }
        });
        return items;
      }

      return items;
    }
  };

  /* ============ FILE BROWSER ============ */
  var FB = {
    winId: null,
    currentPath: "/",
    history: [],
    historyIdx: -1,

    open: function () {
      if (this.winId && WM.wins[this.winId]) {
        var w = WM.wins[this.winId];
        if (w.el.style.display === "none") WM.restore(this.winId);
        else WM.front(w.el);
        return;
      }
      this.currentPath = "/";
      this.history = ["/"];
      this.historyIdx = 0;

      var html = this._buildChrome() + this._buildBody();
      this.winId = WM.create({ title: L.title, width: 880, height: 520, html: html });
      this._bind();
      this._render();
    },

    _buildChrome: function () {
      return (
        '<div class="fb-toolbar">' +
          '<button class="fb-toolbar-btn fb-nav-back is-disabled">\u2190</button>' +
          '<button class="fb-toolbar-btn fb-nav-forward is-disabled">\u2192</button>' +
          '<button class="fb-toolbar-btn fb-nav-home">\u2302</button>' +
        '</div>' +
        '<div class="fb-pathbar"><span class="fb-pathbar-content"></span></div>'
      );
    },

    _buildBody: function () {
      var cats = L.categories;
      var sideHtml = '<div class="fb-sidebar-heading">' + L.bookmarks + '</div>';
      sideHtml += '<button class="fb-sidebar-item fb-side-nav" data-path="/"><i class="fb-icon">\uD83C\uDFE0</i> ' + L.home + '</button>';
      Object.keys(cats).forEach(function (slug) {
        sideHtml += '<button class="fb-sidebar-item fb-side-nav" data-path="/' + slug + '"><i class="fb-icon">' + cats[slug].icon + '</i> ' + slug + '</button>';
      });
      sideHtml += '<div class="fb-sidebar-divider"></div>';
      sideHtml += '<div class="fb-sidebar-heading">' + L.system + '</div>';
      sideHtml += '<button class="fb-sidebar-item fb-side-nav" data-path="__sub">\u2709 ' + L.subscribe + '</button>';
      sideHtml += '<button class="fb-sidebar-item fb-side-nav" data-path="__mag">\uD83D\uDCD6 ' + L.magazine + '</button>';

      return (
        '<div class="fb-body">' +
          '<aside class="fb-sidebar">' + sideHtml + '</aside>' +
          '<div class="fb-content"><div class="fb-content-grid"></div></div>' +
        '</div>' +
        '<div class="fb-statusbar"><span class="fb-status-count"></span></div>'
      );
    },

    _bind: function () {
      var w = WM.wins[this.winId];
      if (!w) return;
      var el = w.el;
      var self = this;

      el.querySelector(".fb-nav-back").addEventListener("click", function () { self._goBack(); });
      el.querySelector(".fb-nav-forward").addEventListener("click", function () { self._goForward(); });
      el.querySelector(".fb-nav-home").addEventListener("click", function () { self._navigate("/"); });

      // Sidebar navigation
      el.querySelectorAll(".fb-side-nav").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var p = btn.getAttribute("data-path");
          if (p === "__sub") { window.location.href = "/suscribite"; return; }
          if (p === "__mag") { window.location.href = "/revista-421"; return; }
          self._navigate(p);
        });
      });
    },

    _navigate: function (path) {
      this.currentPath = path;
      // Manage history
      if (this.historyIdx < this.history.length - 1) {
        this.history = this.history.slice(0, this.historyIdx + 1);
      }
      this.history.push(path);
      this.historyIdx = this.history.length - 1;
      this._render();
    },

    _goBack: function () {
      if (this.historyIdx > 0) {
        this.historyIdx--;
        this.currentPath = this.history[this.historyIdx];
        this._render();
      }
    },

    _goForward: function () {
      if (this.historyIdx < this.history.length - 1) {
        this.historyIdx++;
        this.currentPath = this.history[this.historyIdx];
        this._render();
      }
    },

    _render: function () {
      var w = WM.wins[this.winId];
      if (!w) return;
      var el = w.el;
      var self = this;
      var items = FS.list(this.currentPath);
      var grid = el.querySelector(".fb-content-grid");

      // Update pathbar
      var pathbar = el.querySelector(".fb-pathbar-content");
      var parts = ["/"].concat(this.currentPath.split("/").filter(Boolean));
      var pathHtml = "";
      for (var i = 0; i < parts.length; i++) {
        var fullPath = i === 0 ? "/" : "/" + parts.slice(1, i + 1).join("/");
        var label = i === 0 ? "\uD83D\uDCBB 421" : parts[i];
        var isLast = i === parts.length - 1;
        pathHtml += '<button class="fb-pathbar-segment' + (isLast ? " is-active" : "") + '" data-path="' + fullPath + '">' + label + '</button>';
        if (!isLast) pathHtml += '<span class="fb-pathbar-separator">/</span>';
      }
      pathbar.innerHTML = pathHtml;
      pathbar.querySelectorAll(".fb-pathbar-segment").forEach(function (seg) {
        seg.addEventListener("click", function () { self._navigate(seg.getAttribute("data-path")); });
      });

      // Update nav buttons
      var backBtn = el.querySelector(".fb-nav-back");
      var fwdBtn = el.querySelector(".fb-nav-forward");
      backBtn.classList.toggle("is-disabled", this.historyIdx <= 0);
      fwdBtn.classList.toggle("is-disabled", this.historyIdx >= this.history.length - 1);

      // Update sidebar active
      el.querySelectorAll(".fb-side-nav").forEach(function (btn) {
        btn.classList.toggle("is-active", btn.getAttribute("data-path") === self.currentPath);
      });

      // Update title
      var titleSuffix = this.currentPath === "/" ? "" : " \u2014 " + this.currentPath;
      WM.setTitle(this.winId, L.title + titleSuffix);

      // Render items
      if (items.length === 0) {
        grid.innerHTML = '<div class="fb-empty"><span class="fb-empty-icon">\uD83D\uDCC2</span><span>' + L.emptyMsg + '</span></div>';
      } else {
        grid.innerHTML = "";
        items.forEach(function (item) {
          var el = document.createElement("div");
          el.className = "fb-item fb-item--" + item.type;
          el.innerHTML = '<span class="fb-item-icon">' + item.icon + '</span><span class="fb-item-name">' + WM._esc(item.name) + '</span>';

          el.addEventListener("click", function () {
            // Deselect others
            grid.querySelectorAll(".fb-item").forEach(function (i) { i.classList.remove("is-selected"); });
            el.classList.add("is-selected");
          });

          el.addEventListener("dblclick", function () {
            if (item.type === "folder") {
              self._navigate(item.path);
            } else if (item.type === "article") {
              self._openArticle(item);
            } else if (item.url) {
              window.location.href = item.url;
            }
          });

          grid.appendChild(el);
        });
      }

      // Update status bar
      var countEl = el.querySelector(".fb-status-count");
      if (countEl) {
        var folderCount = items.filter(function (i) { return i.type === "folder"; }).length;
        var fileCount = items.length - folderCount;
        countEl.textContent = items.length + " " + L.items;
      }
    },

    _openArticle: function (article) {
      var imgHtml = article.image
        ? '<img class="fb-article-image" src="' + WM._esc(article.image) + '" alt="" />'
        : '';
      var html =
        '<div class="fb-article-preview">' +
          imgHtml +
          '<div class="fb-article-body">' +
            '<h2 class="fb-article-title">' + WM._esc(article.name) + '</h2>' +
            (article.date ? '<p class="fb-article-meta">' + article.date + '</p>' : '') +
            '<a href="' + WM._esc(article.url) + '" class="fb-article-read">' + L.readBtn + '</a>' +
          '</div>' +
        '</div>';

      var off = (WM.counter % 6) * 24;
      WM.create({
        title: article.name,
        width: 480,
        height: 440,
        x: 160 + off,
        y: 80 + off,
        html: html
      });
    }
  };

  /* ============ INIT ============ */
  document.addEventListener("DOMContentLoaded", function () {
    WM.init();
    FS.init();

    var launcher = document.getElementById("fb-launcher");
    if (launcher) {
      launcher.addEventListener("click", function () { FB.open(); });
    }
  });
})();
