/**
 * File Browser - Unix Window Navigation
 * Handles interactivity for the file browser component
 * Exposed as window.FileBrowser for reuse by Window Manager
 */
window.FileBrowser = {
  init: function(windowEl) {
    if (!windowEl) return;

    // ---- Window controls ----
    var dotClose = windowEl.querySelector(".fb-dot--close");
    var dotMinimize = windowEl.querySelector(".fb-dot--minimize");
    var dotMaximize = windowEl.querySelector(".fb-dot--maximize");

    if (dotMinimize) {
      dotMinimize.addEventListener("click", function () {
        windowEl.classList.toggle("is-minimized");
      });
    }

    if (dotMaximize) {
      dotMaximize.addEventListener("click", function () {
        windowEl.classList.toggle("is-minimized");
      });
    }

    if (dotClose) {
      dotClose.addEventListener("click", function () {
        windowEl.style.display = "none";
      });
    }

    // ---- View toggle (grid / list) ----
    var viewGridBtn = windowEl.querySelector(".fb-view-btn[data-view='grid']");
    var viewListBtn = windowEl.querySelector(".fb-view-btn[data-view='list']");
    var contentArea = windowEl.querySelector(".fb-content");

    function setView(mode) {
      if (!contentArea) return;
      if (mode === "list") {
        contentArea.classList.add("is-list");
      } else {
        contentArea.classList.remove("is-list");
      }
      if (viewGridBtn && viewListBtn) {
        viewGridBtn.classList.toggle("is-active", mode === "grid");
        viewListBtn.classList.toggle("is-active", mode === "list");
      }
      try {
        localStorage.setItem("fb-view", mode);
      } catch (e) { /* ignore */ }
    }

    // Restore saved view preference
    try {
      var savedView = localStorage.getItem("fb-view");
      if (savedView === "list") setView("list");
    } catch (e) { /* ignore */ }

    if (viewGridBtn) {
      viewGridBtn.addEventListener("click", function () { setView("grid"); });
    }
    if (viewListBtn) {
      viewListBtn.addEventListener("click", function () { setView("list"); });
    }

    // ---- Item selection ----
    var items = windowEl.querySelectorAll(".fb-item");
    items.forEach(function (item) {
      item.addEventListener("click", function (e) {
        items.forEach(function (i) { i.classList.remove("is-selected"); });
        item.classList.add("is-selected");
      });
    });

    // ---- Toolbar back button ----
    var backBtn = windowEl.querySelector(".fb-toolbar-btn[data-action='back']");
    if (backBtn) {
      backBtn.addEventListener("click", function (e) {
        if (!backBtn.classList.contains("is-disabled")) {
          e.preventDefault();
          window.history.back();
        }
      });
    }

    // ---- Sidebar active state based on current URL ----
    var sidebarItems = windowEl.querySelectorAll(".fb-sidebar-item[href]");
    var currentPath = window.location.pathname;

    sidebarItems.forEach(function (item) {
      var href = item.getAttribute("href");
      if (href && currentPath.indexOf(href) === 0 && href !== "/" && href !== "/en/") {
        item.classList.add("is-active");
      }
    });

    // ---- Path bar: highlight current segment ----
    var pathSegments = windowEl.querySelectorAll(".fb-pathbar-segment");
    if (pathSegments.length > 0) {
      var lastSegment = pathSegments[pathSegments.length - 1];
      lastSegment.classList.add("is-active");
    }

    // ---- Update item count in status bar ----
    var itemCount = windowEl.querySelector(".fb-statusbar-count");
    var totalItems = windowEl.querySelectorAll(".fb-item").length;
    if (itemCount) {
      var isEnglish = window.location.pathname.startsWith('/en/');
      if (isEnglish) {
        itemCount.textContent = totalItems + (totalItems === 1 ? " item" : " items");
      } else {
        itemCount.textContent = totalItems + (totalItems === 1 ? " elemento" : " elementos");
      }
    }
  }
};

// Auto-initialize on inline file browsers (mobile fallback)
document.addEventListener("DOMContentLoaded", function () {
  var inlineWindows = document.querySelectorAll(".fb-window:not(.wm-managed)");
  inlineWindows.forEach(function (el) {
    window.FileBrowser.init(el);
  });
});
