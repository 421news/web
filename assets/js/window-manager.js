/**
 * Window Manager - Floating Desktop System for 421.news
 * Single-window navigation: folders and posts load inside the file browser
 */
(function() {
  var WM = window.WindowManager = {};
  var windows = [];
  var zCounter = 10001;
  var isDesktop = window.innerWidth >= 1024;
  var API_KEY = '420da6f85b5cc903b347de9e33';
  var API_URL = window.location.origin + '/ghost/api/content';
  var isEnglish = window.location.pathname.startsWith('/en/');
  var windowIdCounter = 0;

  // Don't initialize on suscribite/subscribe pages
  var path = window.location.pathname;
  if (path === '/es/suscribite' || path === '/es/suscribite/' ||
      path === '/en/subscribe' || path === '/en/subscribe/') {
    return;
  }

  // ---- Initialization ----
  function init() {
    if (!isDesktop) return;
    document.body.classList.add('wm-desktop');

    var launcher = document.getElementById('wm-launcher');
    if (launcher) {
      launcher.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        WM.openFileBrowser();
      });
    }
  }

  // ---- Create Window (shell only) ----
  WM.createWindow = function(options) {
    var opts = options || {};
    var id = 'wm-win-' + (++windowIdCounter);
    var width = opts.width || 900;
    var height = opts.height || 550;
    var title = opts.title || '';
    var type = opts.type || 'browser';

    var win = document.createElement('div');
    win.className = 'wm-window';
    win.id = id;
    win.setAttribute('data-wm-type', type);
    win.style.width = width + 'px';
    win.style.height = height + 'px';

    // Center on screen
    var left = Math.max(20, (window.innerWidth - width) / 2);
    var top = Math.max(20, (window.innerHeight - height) / 2);
    var offset = (windows.length % 8) * 25;
    win.style.left = (left + offset) + 'px';
    win.style.top = (top + offset) + 'px';

    var body = document.createElement('div');
    body.className = 'wm-window-body';
    win.appendChild(body);

    var resizeHandle = document.createElement('div');
    resizeHandle.className = 'wm-resize-handle';
    win.appendChild(resizeHandle);

    var container = document.getElementById('wm-windows');
    if (container) container.appendChild(win);

    var winData = {
      id: id, el: win, title: title, type: type, minimized: false
    };
    windows.push(winData);

    win.addEventListener('mousedown', function() { WM.focusWindow(win); });

    setupResize(win, resizeHandle);
    addTaskbarItem(winData);
    WM.focusWindow(win);

    return win;
  };

  // ---- Setup Window Control Dots ----
  function setupWindowControls(win, winData) {
    var dots = win.querySelectorAll('.fb-dot--close, .fb-dot--minimize, .fb-dot--maximize');
    dots.forEach(function(dot) {
      var newDot = dot.cloneNode(true);
      dot.parentNode.replaceChild(newDot, dot);
    });

    var closeBtn = win.querySelector('.fb-dot--close');
    var minBtn = win.querySelector('.fb-dot--minimize');
    var maxBtn = win.querySelector('.fb-dot--maximize');

    if (closeBtn) {
      closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        WM.closeWindow(win);
      });
    }
    if (minBtn) {
      minBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        WM.minimizeWindow(win);
      });
    }
    if (maxBtn) {
      maxBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (win.getAttribute('data-maximized') === 'true') {
          win.style.width = win.getAttribute('data-prev-width');
          win.style.height = win.getAttribute('data-prev-height');
          win.style.left = win.getAttribute('data-prev-left');
          win.style.top = win.getAttribute('data-prev-top');
          win.removeAttribute('data-maximized');
        } else {
          win.setAttribute('data-prev-width', win.style.width);
          win.setAttribute('data-prev-height', win.style.height);
          win.setAttribute('data-prev-left', win.style.left);
          win.setAttribute('data-prev-top', win.style.top);
          win.style.width = (window.innerWidth - 40) + 'px';
          win.style.height = (window.innerHeight - 76) + 'px';
          win.style.left = '20px';
          win.style.top = '20px';
          win.setAttribute('data-maximized', 'true');
        }
      });
    }
  }

  // ---- Open File Browser (single window, in-window navigation) ----
  WM.openFileBrowser = function() {
    var sourceWindow = document.querySelector('.fb-window');
    if (!sourceWindow) return;

    var baseTitle = isEnglish ? '421 — File Browser' : '421 — Explorador de archivos';

    var clone = sourceWindow.cloneNode(true);
    clone.classList.add('wm-managed');
    clone.style.display = 'flex';

    var win = WM.createWindow({
      title: baseTitle,
      width: 900,
      height: 550,
      type: 'browser'
    });

    var body = win.querySelector('.wm-window-body');
    body.innerHTML = '';
    body.appendChild(clone);

    if (window.FileBrowser) {
      window.FileBrowser.init(clone);
    }

    // Setup drag on titlebar
    var titlebar = clone.querySelector('.fb-titlebar');
    if (titlebar) setupDrag(win, titlebar);

    var winData = getWinData(win);
    if (winData) setupWindowControls(win, winData);

    // ---- In-window navigation ----
    var contentArea = clone.querySelector('.fb-content');
    var pathbar = clone.querySelector('.fb-pathbar');
    var titleEl = clone.querySelector('.fb-titlebar-title');
    var homeBase = isEnglish ? '/en/' : '/es/';

    // Save original home content
    var homeHTML = contentArea ? contentArea.innerHTML : '';

    // Navigation stack: [{prevHTML, prevTitle, prevPathSegs}]
    var navStack = [];

    // Back button: clone to remove old listeners
    var oldBack = clone.querySelector('.fb-toolbar-btn[data-action="back"]');
    var backBtn = null;
    if (oldBack) {
      backBtn = oldBack.cloneNode(true);
      oldBack.parentNode.replaceChild(backBtn, oldBack);
      backBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (!backBtn.classList.contains('is-disabled')) {
          goBack();
        }
      });
    }

    // Intercept toolbar Home and Reload links (they are <a href="/"> that navigate away)
    clone.querySelectorAll('.fb-toolbar .fb-toolbar-btn[href]').forEach(function(link) {
      var newLink = link.cloneNode(true);
      link.parentNode.replaceChild(newLink, link);
      newLink.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        // Go to browser home (root)
        navStack = [];
        if (contentArea) contentArea.innerHTML = homeHTML;
        setPathbar([]);
        if (titleEl) titleEl.textContent = baseTitle;
        if (winData) {
          winData.title = baseTitle;
          updateTaskbarItem(winData);
        }
        bindHomeFolderClicks();
        updateBackBtn();
      });
    });

    function updateBackBtn() {
      if (backBtn) {
        if (navStack.length > 0) {
          backBtn.classList.remove('is-disabled');
        } else {
          backBtn.classList.add('is-disabled');
        }
      }
    }

    function setPathbar(segments) {
      if (!pathbar) return;
      var html = '<a href="' + homeBase + '" class="fb-pathbar-segment" onclick="return false"><i class="fb-icon">&#128187;</i> home</a>' +
        '<span class="fb-pathbar-separator">/</span>' +
        '<span class="fb-pathbar-segment' + (segments.length === 0 ? ' is-active' : '') + '">421</span>' +
        '<span class="fb-pathbar-separator">/</span>';
      segments.forEach(function(seg, i) {
        var isLast = i === segments.length - 1;
        html += '<span class="fb-pathbar-segment' + (isLast ? ' is-active' : '') + '">' + escapeHtml(seg) + '</span>' +
          '<span class="fb-pathbar-separator">/</span>';
      });
      pathbar.innerHTML = html;
    }

    function goBack() {
      if (navStack.length === 0) return;
      var prev = navStack.pop();
      if (contentArea) contentArea.innerHTML = prev.prevHTML;
      if (titleEl) titleEl.textContent = prev.prevTitle;
      setPathbar(prev.prevPathSegs);
      updateBackBtn();

      // Re-bind clicks on restored content
      if (navStack.length === 0) {
        bindHomeFolderClicks();
      } else {
        bindFolderItemClicks();
      }
    }

    function navigateToFolder(slug, displayName) {
      var currentPathSegs = getCurrentPathSegs();
      navStack.push({
        prevHTML: contentArea.innerHTML,
        prevTitle: titleEl ? titleEl.textContent : '',
        prevPathSegs: currentPathSegs
      });

      var cleanName = displayName.replace(/\/$/, '').replace(/^[\s\S]*?\}\s*/, '').trim();
      setPathbar([cleanName]);
      updateBackBtn();
      if (titleEl) titleEl.textContent = '421 — ' + cleanName + '/';

      // Update taskbar
      if (winData) {
        winData.title = '421 — ' + cleanName + '/';
        updateTaskbarItem(winData);
      }

      if (contentArea) {
        contentArea.innerHTML = '<div class="wm-loading">' +
          (isEnglish ? 'Loading...' : 'Cargando...') + '</div>';
      }

      var url = API_URL + '/posts/?key=' + API_KEY +
        '&filter=tag:' + encodeURIComponent(slug) +
        '&limit=all&include=tags,authors' +
        '&fields=title,slug,feature_image,published_at';

      fetch(url)
        .then(function(res) { return res.json(); })
        .then(function(data) {
          var posts = data.posts || [];
          if (!contentArea) return;

          if (posts.length === 0) {
            contentArea.innerHTML = '<div class="wm-error">' +
              (isEnglish ? 'No posts found' : 'No se encontraron posts') + '</div>';
            return;
          }

          var html = '<div class="wm-folder-grid">';
          posts.forEach(function(post) {
            html += '<div class="wm-folder-item" data-slug="' + escapeAttr(post.slug) + '">' +
              '<span class="wm-folder-item-icon">&#128196;</span>' +
              '<span class="wm-folder-item-name">' + escapeHtml(post.title) + '</span></div>';
          });
          html += '</div>';
          contentArea.innerHTML = html;

          bindFolderItemClicks();
        })
        .catch(function() {
          if (contentArea) {
            contentArea.innerHTML = '<div class="wm-error">' +
              (isEnglish ? 'Error loading posts' : 'Error al cargar posts') + '</div>';
          }
        });
    }

    function navigateToPost(postSlug) {
      var currentPathSegs = getCurrentPathSegs();
      navStack.push({
        prevHTML: contentArea.innerHTML,
        prevTitle: titleEl ? titleEl.textContent : '',
        prevPathSegs: currentPathSegs
      });

      var newSegs = currentPathSegs.slice();
      newSegs.push(postSlug);
      setPathbar(newSegs);
      updateBackBtn();

      if (contentArea) {
        contentArea.innerHTML = '<div class="wm-loading">' +
          (isEnglish ? 'Loading...' : 'Cargando...') + '</div>';
      }

      var url = API_URL + '/posts/slug/' + encodeURIComponent(postSlug) +
        '/?key=' + API_KEY + '&include=authors';

      fetch(url)
        .then(function(res) { return res.json(); })
        .then(function(data) {
          var post = data.posts && data.posts[0];
          if (!post) {
            if (contentArea) contentArea.innerHTML = '<div class="wm-error">' +
              (isEnglish ? 'Post not found' : 'Post no encontrado') + '</div>';
            return;
          }

          if (titleEl) titleEl.textContent = '421 — ' + post.title;
          if (winData) {
            winData.title = post.title;
            updateTaskbarItem(winData);
          }

          if (!contentArea) return;
          var html = '';
          if (post.feature_image) {
            html += '<img class="wm-post-image" src="' + escapeAttr(post.feature_image) +
              '" alt="' + escapeAttr(post.title) + '" />';
          }
          html += '<div class="wm-post-details">';
          html += '<h2>' + escapeHtml(post.title) + '</h2>';
          var authorName = post.primary_author ? post.primary_author.name :
            (post.authors && post.authors[0] ? post.authors[0].name : '');
          var pubDate = post.published_at ?
            new Date(post.published_at).toLocaleDateString(isEnglish ? 'en-US' : 'es-AR') : '';
          html += '<div class="wm-post-meta">' + escapeHtml(authorName) +
            (pubDate ? ' &middot; ' + pubDate : '') + '</div>';
          var excerpt = stripHtml(post.html || '').substring(0, 800);
          if ((post.html || '').length > 800) excerpt += '...';
          html += '<div class="wm-post-excerpt">' + escapeHtml(excerpt) + '</div>';
          var postUrl = isEnglish ? '/en/' + post.slug + '/' : '/es/' + post.slug + '/';
          html += '<a href="' + postUrl + '" class="wm-post-link">' +
            (isEnglish ? 'Read full &rarr;' : 'Leer completo &rarr;') + '</a>';
          html += '</div>';
          contentArea.innerHTML = html;
        })
        .catch(function() {
          if (contentArea) {
            contentArea.innerHTML = '<div class="wm-error">' +
              (isEnglish ? 'Error loading post' : 'Error al cargar el post') + '</div>';
          }
        });
    }

    function getCurrentPathSegs() {
      if (!pathbar) return [];
      var segs = [];
      var all = pathbar.querySelectorAll('.fb-pathbar-segment');
      for (var i = 2; i < all.length; i++) {
        segs.push(all[i].textContent.trim());
      }
      return segs;
    }

    function bindHomeFolderClicks() {
      if (!contentArea) return;
      contentArea.querySelectorAll('.fb-item--folder').forEach(function(item) {
        var href = item.getAttribute('href');
        if (!href) return;
        var tagMatch = href.match(/\/tag\/([^\/]+)/);
        if (!tagMatch) return;
        item.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          var slug = item.getAttribute('data-tag') || tagMatch[1];
          var nameEl = item.querySelector('.fb-item-name');
          var displayName = nameEl ? nameEl.textContent.trim() : slug;
          navigateToFolder(slug, displayName);
        });
      });
      contentArea.querySelectorAll('.fb-list-row').forEach(function(item) {
        var href = item.getAttribute('href');
        if (!href) return;
        var tagMatch = href.match(/\/tag\/([^\/]+)/);
        if (!tagMatch) return;
        item.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          var slug = item.getAttribute('data-tag') || tagMatch[1];
          var nameEl = item.querySelector('.fb-list-name');
          var displayName = nameEl ? nameEl.textContent.trim() : slug;
          navigateToFolder(slug, displayName);
        });
      });
    }

    function bindFolderItemClicks() {
      if (!contentArea) return;
      contentArea.querySelectorAll('.wm-folder-item').forEach(function(item) {
        item.addEventListener('click', function() {
          var slug = item.getAttribute('data-slug');
          if (slug) navigateToPost(slug);
        });
      });
    }

    // Sidebar navigation
    clone.querySelectorAll('.fb-sidebar-item').forEach(function(item) {
      var href = item.getAttribute('href');
      if (!href) return;
      var tagMatch = href.match(/\/tag\/([^\/]+)/);
      var isHome = (href === '/es/' || href === '/en/');
      if (!tagMatch && !isHome) return; // suscribite/revista navigate normally
      var newItem = item.cloneNode(true);
      item.parentNode.replaceChild(newItem, item);
      newItem.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        navStack = [];
        if (contentArea) contentArea.innerHTML = homeHTML;
        setPathbar([]);
        updateBackBtn();
        if (titleEl) titleEl.textContent = baseTitle;
        if (winData) {
          winData.title = baseTitle;
          updateTaskbarItem(winData);
        }
        bindHomeFolderClicks();
        if (tagMatch) {
          navigateToFolder(tagMatch[1], newItem.textContent.trim());
        }
      });
    });

    bindHomeFolderClicks();
  };

  // ---- Focus Window ----
  WM.focusWindow = function(win) {
    zCounter++;
    win.style.zIndex = zCounter;
    windows.forEach(function(w) {
      w.el.classList.remove('wm-focused');
      var item = document.querySelector('.wm-taskbar-item[data-win-id="' + w.id + '"]');
      if (item) item.classList.remove('is-active');
    });
    win.classList.add('wm-focused');
    var activeItem = document.querySelector('.wm-taskbar-item[data-win-id="' + win.id + '"]');
    if (activeItem) activeItem.classList.add('is-active');
  };

  // ---- Minimize Window ----
  WM.minimizeWindow = function(win) {
    win.style.display = 'none';
    var winData = getWinData(win);
    if (winData) {
      winData.minimized = true;
      var item = document.querySelector('.wm-taskbar-item[data-win-id="' + winData.id + '"]');
      if (item) item.classList.add('is-minimized');
    }
  };

  // ---- Restore Window ----
  WM.restoreWindow = function(win) {
    win.style.display = 'flex';
    var winData = getWinData(win);
    if (winData) {
      winData.minimized = false;
      var item = document.querySelector('.wm-taskbar-item[data-win-id="' + winData.id + '"]');
      if (item) item.classList.remove('is-minimized');
    }
    WM.focusWindow(win);
  };

  // ---- Close Window ----
  WM.closeWindow = function(win) {
    var winData = getWinData(win);
    if (winData) {
      var item = document.querySelector('.wm-taskbar-item[data-win-id="' + winData.id + '"]');
      if (item) item.remove();
      windows = windows.filter(function(w) { return w.id !== winData.id; });
    }
    win.remove();
    if (windows.length === 0) {
      var taskbar = document.getElementById('wm-taskbar');
      if (taskbar) taskbar.style.display = 'none';
    }
  };

  // ---- Taskbar ----
  function addTaskbarItem(winData) {
    var taskbar = document.getElementById('wm-taskbar');
    var itemsContainer = document.getElementById('wm-taskbar-items');
    if (!taskbar || !itemsContainer) return;
    taskbar.style.display = 'flex';

    var item = document.createElement('div');
    item.className = 'wm-taskbar-item is-active';
    item.setAttribute('data-win-id', winData.id);
    item.textContent = winData.title;

    item.addEventListener('click', function() {
      if (winData.minimized) {
        WM.restoreWindow(winData.el);
      } else if (winData.el.classList.contains('wm-focused')) {
        WM.minimizeWindow(winData.el);
      } else {
        WM.focusWindow(winData.el);
      }
    });
    itemsContainer.appendChild(item);
  }

  function updateTaskbarItem(winData) {
    var item = document.querySelector('.wm-taskbar-item[data-win-id="' + winData.id + '"]');
    if (item) item.textContent = winData.title;
  }

  // ---- Drag Logic ----
  function setupDrag(win, handle) {
    var startX, startY, startLeft, startTop, dragging = false;

    function onStart(e) {
      if (e.target.classList.contains('fb-dot')) return;
      dragging = true;
      var point = e.touches ? e.touches[0] : e;
      startX = point.clientX;
      startY = point.clientY;
      startLeft = parseInt(win.style.left, 10) || 0;
      startTop = parseInt(win.style.top, 10) || 0;
      handle.classList.add('wm-dragging');
      WM.focusWindow(win);
      e.preventDefault();
    }
    function onMove(e) {
      if (!dragging) return;
      var point = e.touches ? e.touches[0] : e;
      var newLeft = startLeft + (point.clientX - startX);
      var newTop = startTop + (point.clientY - startY);
      newLeft = Math.max(-win.offsetWidth + 100, Math.min(window.innerWidth - 100, newLeft));
      newTop = Math.max(0, Math.min(window.innerHeight - 50, newTop));
      win.style.left = newLeft + 'px';
      win.style.top = newTop + 'px';
    }
    function onEnd() {
      dragging = false;
      handle.classList.remove('wm-dragging');
    }

    handle.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    handle.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

  // ---- Resize Logic ----
  function setupResize(win, handle) {
    var startX, startY, startW, startH, resizing = false;

    function onStart(e) {
      resizing = true;
      var point = e.touches ? e.touches[0] : e;
      startX = point.clientX;
      startY = point.clientY;
      startW = win.offsetWidth;
      startH = win.offsetHeight;
      e.preventDefault();
      e.stopPropagation();
    }
    function onMove(e) {
      if (!resizing) return;
      var point = e.touches ? e.touches[0] : e;
      win.style.width = Math.max(400, startW + (point.clientX - startX)) + 'px';
      win.style.height = Math.max(300, startH + (point.clientY - startY)) + 'px';
    }
    function onEnd() { resizing = false; }

    handle.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    handle.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

  // ---- Helpers ----
  function getWinData(win) {
    for (var i = 0; i < windows.length; i++) {
      if (windows[i].el === win || windows[i].id === win.id) return windows[i];
    }
    return null;
  }
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }
  function escapeAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function stripHtml(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  // ---- Responsive ----
  window.addEventListener('resize', function() {
    var nowDesktop = window.innerWidth >= 1024;
    if (isDesktop && !nowDesktop) {
      windows.slice().forEach(function(w) { WM.closeWindow(w.el); });
      document.body.classList.remove('wm-desktop');
    } else if (!isDesktop && nowDesktop) {
      document.body.classList.add('wm-desktop');
    }
    isDesktop = nowDesktop;
  });

  // ---- Init ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
