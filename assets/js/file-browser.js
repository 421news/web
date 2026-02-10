/**
 * File Browser - Unix Window Navigation
 * Handles interactivity for the file browser component
 */
document.addEventListener("DOMContentLoaded", function () {
  var window_el = document.querySelector(".fb-window");
  if (!window_el) return;

  // ---- Window controls ----
  var dotClose = window_el.querySelector(".fb-dot--close");
  var dotMinimize = window_el.querySelector(".fb-dot--minimize");
  var dotMaximize = window_el.querySelector(".fb-dot--maximize");

  if (dotMinimize) {
    dotMinimize.addEventListener("click", function () {
      window_el.classList.toggle("is-minimized");
    });
  }

  if (dotMaximize) {
    dotMaximize.addEventListener("click", function () {
      window_el.classList.toggle("is-minimized");
    });
  }

  if (dotClose) {
    dotClose.addEventListener("click", function () {
      window_el.style.display = "none";
    });
  }

  // ---- View toggle (grid / list) ----
  var viewGridBtn = window_el.querySelector(".fb-view-btn[data-view='grid']");
  var viewListBtn = window_el.querySelector(".fb-view-btn[data-view='list']");
  var contentArea = window_el.querySelector(".fb-content");

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
  var items = window_el.querySelectorAll(".fb-item");
  items.forEach(function (item) {
    item.addEventListener("click", function (e) {
      // Remove previous selection
      items.forEach(function (i) { i.classList.remove("is-selected"); });
      item.classList.add("is-selected");
    });
  });

  // ---- Toolbar back button ----
  var backBtn = window_el.querySelector(".fb-toolbar-btn[data-action='back']");
  if (backBtn) {
    backBtn.addEventListener("click", function (e) {
      if (!backBtn.classList.contains("is-disabled")) {
        e.preventDefault();
        window.history.back();
      }
    });
  }

  // ---- Sidebar active state based on current URL ----
  var sidebarItems = window_el.querySelectorAll(".fb-sidebar-item[href]");
  var currentPath = window.location.pathname;

  sidebarItems.forEach(function (item) {
    var href = item.getAttribute("href");
    if (href && currentPath.indexOf(href) === 0 && href !== "/") {
      item.classList.add("is-active");
    }
  });

  // ---- Path bar: highlight current segment ----
  var pathSegments = window_el.querySelectorAll(".fb-pathbar-segment");
  if (pathSegments.length > 0) {
    var lastSegment = pathSegments[pathSegments.length - 1];
    lastSegment.classList.add("is-active");
  }

  // ---- Update item count in status bar ----
  var itemCount = window_el.querySelector(".fb-statusbar-count");
  var totalItems = window_el.querySelectorAll(".fb-item").length;
  if (itemCount) {
    itemCount.textContent = totalItems + (totalItems === 1 ? " elemento" : " elementos");
  }
});
