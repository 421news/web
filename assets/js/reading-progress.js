(function () {
  const el = document.getElementById('reading-progress');
  if (!el) return;

  const targetSel = el.getAttribute('data-target') || '.rich-text';
  const target = document.querySelector(targetSel);
  if (!target) { el.style.display = 'none'; return; }

  const selContainer = el.getAttribute('data-container');
  const container = selContainer ? document.querySelector(selContainer) : null;

  // What actually scrolls
  const scrollEl = container || document.scrollingElement || document.documentElement;
  const isWindowScroll = (scrollEl === document.documentElement || scrollEl === document.body);

  const getScrollPos = () =>
    isWindowScroll ? (typeof window.scrollY === 'number' ? window.scrollY : window.pageYOffset || 0)
                   : scrollEl.scrollTop;

  const getViewportH = () =>
    isWindowScroll ? window.innerHeight : scrollEl.clientHeight;

  // Compute target's top relative to the scrollable content, robust to wrappers
  function getTargetTopWithinScroll() {
    const tr = target.getBoundingClientRect();
    if (isWindowScroll) {
      return tr.top + getScrollPos();
    } else {
      const sr = scrollEl.getBoundingClientRect();
      return (tr.top - sr.top) + scrollEl.scrollTop;
    }
  }

  const set = p => el.style.setProperty('--progress', Math.max(0, Math.min(1, p)).toFixed(4));
  let ticking = false;

  function compute() {
    const viewportH = getViewportH();
    const targetTop = getTargetTopWithinScroll();
    const targetH = target.offsetHeight;

    // Start when the top of .rich-text hits the top of the viewport
    const start = targetTop;
    // Finish when the bottom of .rich-text hits the bottom of the viewport
    const end = targetTop + targetH - viewportH;

    const span = Math.max(1, end - start);  // avoid div/0 if content fits
    const p = (getScrollPos() - start) / span;
    set(p);

    // Hide if the article doesn't require scrolling (or is tiny)
    const shouldShow = (end - start) > 1;
    el.style.display = shouldShow ? 'block' : 'none';

    ticking = false;
  }

  function onScrollOrResize() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(compute);
    }
  }

  const scrollTarget = isWindowScroll ? window : scrollEl;

  compute();
  scrollTarget.addEventListener('scroll', onScrollOrResize, { passive: true });
  window.addEventListener('resize', onScrollOrResize);
  window.addEventListener('load', compute);

  // Recompute if content height changes (images, embeds, font swaps)
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(onScrollOrResize);
    ro.observe(target);
    if (!isWindowScroll) ro.observe(scrollEl);
  }
})();