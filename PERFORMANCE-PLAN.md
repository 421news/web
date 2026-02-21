# Performance Optimization Plan - 421.news

> Generado: 2026-02-21
> Estado: Pendiente
> Baseline: CSS 152KB (8 archivos), JS 234KB (16 archivos), textura 779KB

---

## Fase 1 — Quick wins (30 min, impacto alto)

**Ahorro estimado:** ~24 KB en mobile + ~120ms por página

### 1.1 Condicionar carga de `window-manager.js` a desktop
- **Archivo:** `default.hbs`
- **Problema:** `window-manager.js` (24 KB) se carga en TODAS las páginas. En mobile hace `if (!isDesktop) return` pero ya descargó 24 KB.
- **Solución:** Reemplazar el `<script src="window-manager.js" defer>` con:
  ```html
  <script>
  if (window.innerWidth >= 1024) {
    var s = document.createElement('script');
    s.src = '{{asset "js/window-manager.js"}}';
    s.defer = true;
    document.head.appendChild(s);
  }
  </script>
  ```
- **Ahorro:** 24 KB en ~80% de usuarios (mobile)
- [x] Completado

### 1.2 Guards en inline scripts de `default.hbs`
- **Archivo:** `default.hbs`
- **Problema:** JSON-LD patch y hreflang injection corren en TODAS las páginas pero solo sirven en posts.
- **Solución:** Envolver JSON-LD patch en:
  ```js
  if (document.querySelector('script[type="application/ld+json"]')) { /* patch */ }
  ```
  Envolver hreflang injection en:
  ```js
  var path = window.location.pathname;
  if (path.match(/^\/(es|en)\/[^\/]+\/$/)) { /* hreflang logic */ }
  ```
- **Ahorro:** ~20ms por página que no es post (home, tags, author, etc.)
- [x] Completado

### 1.3 Simplificar MutationObserver de Ghost Portal
- **Archivo:** `default.hbs`
- **Problema:** MutationObserver con `{ childList: true, subtree: true }` + 4 setTimeout (0, 500, 1500, 3000ms) observa TODO el DOM para remover `.gh-post-upgrade-cta`.
- **Solución:** Reemplazar todo el bloque con:
  ```js
  function removeGhostCTA() {
    document.querySelectorAll('.gh-post-upgrade-cta').forEach(function(el) { el.remove(); });
  }
  removeGhostCTA();
  setTimeout(removeGhostCTA, 1000);
  setTimeout(removeGhostCTA, 3000);
  ```
  Sin MutationObserver, 2 setTimeout en vez de 4, sin subtree observation.
- **Ahorro:** ~50-100ms de overhead continuo eliminado
- [x] Completado

---

## Fase 2 — Consolidación de JS (2-3 hs)

**Ahorro estimado:** ~20-25 KB en código + 50-80% menos payload API en archivo

### 2.1 Extraer `renderCard()` a módulo compartido
- **Archivos afectados:** `related-posts.js`, `rutas.js`, `home-ruta.js`, `pagination-home.js`, `pagination-next.js`
- **Problema:** ~300 líneas duplicadas de la misma función `renderCard()` en 5 archivos.
- **Solución:** Crear `assets/js/render-card.js` con la función compartida:
  ```js
  window.renderCard = function(post, texturaUrl) { /* ... */ };
  window.formatPostDate = function(dateStr) { /* ... */ };
  window.escHtml = function(str) { /* ... */ };
  ```
  Cargar en `default.hbs` con defer. Los 5 archivos llaman `window.renderCard()`.
- **Ahorro:** ~8-12 KB de código eliminado
- [x] Completado

### 2.2 Unificar los 3 scripts de paginación
- **Archivos:** `pagination-home.js`, `pagination-next.js`, `pagination-author.js`
- **Problema:** 95% del código es idéntico (fetch, prefetch, render, load-more).
- **Solución:** Crear `assets/js/pagination.js` parametrizado:
  ```js
  window.initPagination = function(options) {
    // options: { postsPerPage, filter, feedSelector, buttonSelector }
  };
  ```
  Cada template lo llama con sus parámetros. Eliminar los 3 archivos individuales.
- **Ahorro:** ~10-12 KB de código eliminado
- **Nota:** Actualizar los `<script>` tags en `index.hbs`, `en.hbs`, todos los `tag-*.hbs`, y `author.hbs`.
- [x] Completado

### 2.3 Arreglar `filter-posts.js` para usar endpoints nativos
- **Archivo:** `assets/js/filter-posts.js`
- **Problema:** Hace `fetch(...limit=all)` para popular dropdowns de autores y tags. Descarga TODOS los posts.
- **Solución:** Usar endpoints de Ghost Content API directamente:
  ```js
  // Authors: GET /ghost/api/content/authors/?key=...&limit=all
  // Tags: GET /ghost/api/content/tags/?key=...&limit=all&filter=visibility:public
  ```
  Filtrar por idioma client-side (es/en prefix check).
- **Ahorro:** 50-80% menos payload en la carga inicial de `/es/ultimos-posts/` y `/en/last-posts/`
- [x] Completado

### 2.4 Event delegation en paginación
- **Archivos:** Los scripts de paginación (post-2.2, sería en `pagination.js`)
- **Problema:** Cada card recibe mouseover/mouseout individual para el overlay de textura.
- **Solución:** Un solo listener en el contenedor feed:
  ```js
  feed.addEventListener('mouseover', function(e) {
    var overlay = e.target.closest('.post-card_overlay');
    if (overlay) overlay.style.backgroundImage = '...';
  });
  ```
- **Ahorro:** Menos allocations de memoria, más limpio
- [x] Completado

---

## Fase 3 — Optimización profunda (medio día)

**Ahorro estimado:** ~30-40 KB minificación + 779 KB diferidos + 29 KB CSS deferido

### 3.1 Concatenar y minificar CSS
- **Archivos:** Todos en `assets/css/`
- **Problema:** 8 archivos CSS separados (152 KB) = 8 HTTP requests que bloquean render.
- **Solución:**
  1. Concatenar globals + normalize + site-nav + index + progress-bar → `main.css`
  2. Mantener separados (lazy): `file-browser.css`, `window-manager.css`, `suscribite.css`
  3. Minificar todos (usar `cssnano` o `clean-css`)
  4. Agregar script de build: `npx clean-css-cli -o assets/css/main.min.css assets/css/globals.css assets/css/normalize.css ...`
- **Ahorro:** ~30-40% del peso CSS (45-60 KB → 30-40 KB), 8 requests → 2-3
- **Nota:** Ghost no tiene build pipeline, así que el minificado se haría pre-deploy (agregar al script de deploy).
- [ ] Completado

### 3.2 Defer CSS de features específicas
- **Archivos:** `suscribite.css` (12 KB), `file-browser.css` (8.5 KB), `window-manager.css` (8.5 KB)
- **Problema:** Se cargan en `default.hbs` en todas las páginas. `suscribite.css` solo se usa en 4 páginas (suscribite, subscribe, mi-suscripcion, my-subscription).
- **Solución:**
  - Mover `suscribite.css` a los templates que lo usan (ya lo hacen con `<link>`, verificar que no esté duplicado en default.hbs)
  - Mover `window-manager.css` a carga condicional (desktop only, igual que el JS de 1.1)
  - `file-browser.css` se necesita en casi todas las páginas, mantener global
- **Ahorro:** ~21 KB diferidos en páginas que no los necesitan
- [ ] Completado

### 3.3 Lazy-load textura.webp
- **Archivo:** `assets/css/index.css` (referencia a textura.webp como background-image)
- **Problema:** 779 KB se descargan en cada página aunque el usuario no scrollee hasta ver las cards.
- **Solución:** No cargar la textura via CSS. En su lugar, asignarla via JS con Intersection Observer:
  ```js
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.style.backgroundImage = "url('/assets/images/textura.webp')";
        observer.unobserve(entry.target);
      }
    });
  });
  document.querySelectorAll('.post-card_overlay').forEach(function(el) {
    observer.observe(el);
  });
  ```
- **Ahorro:** 779 KB diferidos hasta que el usuario scrollea
- [ ] Completado

### 3.4 Optimizar `hide-show-nav.js`
- **Archivo:** `assets/js/hide-show-nav.js`
- **Problema:** Consulta `window.innerWidth` en cada evento de scroll (fuerza reflow).
- **Solución:** Usar `matchMedia`:
  ```js
  var mobileQuery = window.matchMedia('(max-width: 768px)');
  var isMobile = mobileQuery.matches;
  mobileQuery.addEventListener('change', function(e) { isMobile = e.matches; });
  ```
- **Ahorro:** ~3-5ms por frame de scroll
- [ ] Completado

### 3.5 Reducir variantes de Google Fonts
- **Archivo:** `default.hbs`
- **Problema:** 9 variantes cargadas. `Nunito Sans italic 800` (`1,800`) puede no usarse.
- **Solución:** Auditar uso de `font-weight: 800; font-style: italic` en CSS. Si solo se usa en 1-2 lugares (nav subscribe button), considerar eliminar la variante y usar `font-weight: 700` como fallback.
- **Ahorro:** ~5-10 KB de fonts (1 variante menos)
- [ ] Completado

### 3.6 Gradient como variable CSS
- **Archivo:** `assets/css/globals.css` + todos los CSS
- **Problema:** `linear-gradient(280deg, var(--verde), var(--amarillo))` repetido 40+ veces.
- **Solución:** Definir en `:root`:
  ```css
  :root {
    --gradient-main: linear-gradient(280deg, var(--verde), var(--amarillo));
  }
  ```
  Reemplazar todas las ocurrencias con `var(--gradient-main)`.
- **Ahorro:** ~500 bytes + mejor mantenibilidad
- [ ] Completado

---

## Resumen de impacto esperado

| Métrica | Antes | Después | Mejora |
|---------|-------|---------|--------|
| CSS por página | 152 KB, 8 requests | ~90 KB, 2-3 requests | **-40%** |
| JS en mobile | ~234 KB | ~180 KB | **-23%** |
| Código JS duplicado | 300+ líneas en 5 archivos | 1 módulo | **-20 KB** |
| HTTP requests CSS | 8 | 2-3 | **-60%** |
| Inline script overhead | ~150ms/página | ~30ms (solo posts) | **-80%** |
| textura.webp | 779 KB bloqueante | 779 KB lazy | **diferido** |
| API payload /ultimos-posts/ | Todos los posts | Solo tags/authors | **-50-80%** |
| First paint (3G) | ~3-4s | ~2-2.5s | **-30-40%** |

---

## Notas

- jQuery (87 KB CDN) es dependencia de `udesly-ghost.min.js` (Webflow). No se puede eliminar sin reemplazar el framework completo. Dejarlo como está.
- `webflow.css` (43 KB) tiene mucho código muerto (sliders, lightbox, twitter widgets) pero está marcado como "don't edit". Una auditoría con Chrome DevTools Coverage podría identificar qué se usa realmente, pero es riesgo alto de romper algo.
- Ghost no tiene build pipeline nativo. Cualquier minificación/concatenación debe hacerse pre-deploy (agregar paso al script de zip en CLAUDE.md).
