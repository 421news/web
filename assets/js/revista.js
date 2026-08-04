(function () {
  var container = document.getElementById('revista-container');
  if (!container) return;

  var CONTENT_KEY = '420da6f85b5cc903b347de9e33';
  var PAGE_SLUG = 'revista-421';
  var PROXY = 'https://webhook-hreflang.onrender.com';

  var isMember = false;
  var isPaid = false;
  var gatedNum = null;   // número que todavía no se liberó (adelanto de suscriptores)

  var svgDownload = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  var svgExpand = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>';
  var svgLock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

  // El segmento va en el NOMBRE del evento (revista_download_wizard / _free), no en un
  // parámetro: GA4 reporta eventName sin configurar nada, mientras que desglosar por un
  // parámetro custom exige registrar una custom dimension en el Admin — que además no es
  // retroactiva. Con tres nombres la cardinalidad no es un problema.
  function track(base, numero, segmentoForzado) {
    if (typeof gtag !== 'function') return;
    var seg = segmentoForzado || (isPaid ? 'wizard' : (isMember ? 'free' : 'anon'));
    var name = base === 'revista_download' ? base + '_' + seg : base;
    gtag('event', name, {
      event_category: 'revista',
      event_label: 'issue-' + numero,
      value: numero
    });
  }

  function parseIssues(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var headings = doc.querySelectorAll('h2');
    var issues = [];

    headings.forEach(function (h2) {
      var text = h2.textContent.trim();
      var match = text.match(/#(\d+)\s*-\s*([^-]+?)(?:\s*-\s*(.+))?$/);
      if (!match) return;

      var numero = parseInt(match[1], 10);
      var fecha = match[2].trim();
      var titulo = match[3] ? match[3].trim() : 'Revista 421 #' + numero;

      var cover = '';
      var creditos = [];
      var figure = h2.nextElementSibling;
      while (figure && !figure.matches('figure.kg-image-card') && !figure.matches('h2')) {
        figure = figure.nextElementSibling;
      }
      if (figure && figure.matches('figure.kg-image-card')) {
        var img = figure.querySelector('img.kg-image');
        if (img) cover = img.src;

        var caption = figure.querySelector('figcaption');
        if (caption) {
          var nodes = caption.childNodes;
          var currentRol = '';
          for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if (node.nodeType === 1) {
              var tag = node.tagName.toLowerCase();
              if ((tag === 'b' || tag === 'strong') && !node.querySelector('a')) {
                var rolText = node.textContent.trim().replace(/:$/, '');
                if (rolText) currentRol = rolText;
              }
              if (tag === 'a') {
                creditos.push({ rol: currentRol || 'Crédito', nombre: node.textContent.trim(), url: node.href });
                currentRol = '';
              }
              if ((tag === 'b' || tag === 'strong') && node.querySelector('a')) {
                var innerLink = node.querySelector('a');
                if (innerLink) {
                  var allText = node.textContent.trim();
                  var linkText = innerLink.textContent.trim();
                  if (allText !== linkText) {
                    currentRol = allText.replace(linkText, '').replace(/:$/, '').trim();
                  }
                  creditos.push({ rol: currentRol || 'Crédito', nombre: linkText, url: innerLink.href });
                  currentRol = '';
                }
              }
            }
          }
        }
      }

      var pdf = '';
      var size = '';
      var fileCard = figure ? figure.nextElementSibling : h2.nextElementSibling;
      while (fileCard && !fileCard.matches('.kg-file-card') && !fileCard.matches('h2')) {
        fileCard = fileCard.nextElementSibling;
      }
      if (fileCard && fileCard.matches('.kg-file-card')) {
        var link = fileCard.querySelector('a.kg-file-card-container');
        if (link) pdf = link.href;
        var sizeEl = fileCard.querySelector('.kg-file-card-filesize');
        if (sizeEl) size = sizeEl.textContent.trim();
      }

      if (cover) {
        issues.push({ numero: numero, titulo: titulo, fecha: fecha, cover: cover, pdf: pdf, size: size, creditos: creditos });
      }
    });

    return issues;
  }

  function renderCard(issue) {
    var creditsHtml = issue.creditos.map(function (c) {
      var nameHtml = c.url
        ? '<a href="' + c.url + '" target="_blank" rel="noopener">' + c.nombre + '</a>'
        : c.nombre;
      return '<span><span class="revista-credit-rol">' + c.rol + ':</span> ' + nameHtml + '</span>';
    }).join('');

    // El número gateado no trae PDF en el HTML a propósito: su URL vive solo en el server.
    var esGateado = !issue.pdf && issue.numero === gatedNum;
    var downloadBtn = '';
    var badge = '';

    if (esGateado) {
      badge = '<span class="revista-card-badge">' + svgLock + ' Adelanto suscriptores</span>';
      if (isPaid) {
        downloadBtn = '<a href="#" class="revista-btn-download revista-btn-gated" data-gated="' + issue.numero + '">' +
          svgDownload + ' Descargar PDF' +
          '</a>';
      } else {
        downloadBtn = '<a href="/es/suscribite/" class="revista-btn-download revista-btn-locked" data-locked="' + issue.numero + '">' +
          svgLock + ' Suscribite para leerlo ya' +
          '</a>';
      }
    } else if (issue.pdf) {
      if (isMember) {
        downloadBtn = '<a href="' + issue.pdf + '" class="revista-btn-download" data-issue="' + issue.numero + '" download>' +
          svgDownload + ' Descargar PDF' + (issue.size ? ' (' + issue.size + ')' : '') +
          '</a>';
      } else {
        downloadBtn = '<a href="#" class="revista-btn-download revista-btn-locked" data-signup="1">' +
          svgLock + ' Registrate para descargar' +
          '</a>';
      }
    }

    return '<div class="revista-card' + (esGateado ? ' revista-card-gated' : '') + '">' +
      '<div class="revista-card-cover">' +
        '<a href="' + issue.cover + '" target="_blank">' +
          '<img src="' + issue.cover + '" alt="Revista 421 #' + issue.numero + '" loading="lazy">' +
        '</a>' +
      '</div>' +
      '<div class="revista-card-info">' +
        '<div class="revista-card-header">' +
          '<span class="revista-card-number">#' + issue.numero + '</span>' +
          '<span class="revista-card-fecha">' + issue.fecha + '</span>' +
          badge +
        '</div>' +
        '<div class="revista-card-title">' + issue.titulo + '</div>' +
        '<div class="revista-card-credits">' + creditsHtml + '</div>' +
        '<div class="revista-card-actions">' +
          downloadBtn +
          '<a href="' + issue.cover + '" target="_blank" class="revista-btn-cover">' +
            svgExpand + ' Ver tapa' +
          '</a>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // El PDF gateado no es un href: se pide con el JWT del member y se baja como blob.
  function descargarGateado(numero, btn) {
    var original = btn.innerHTML;
    btn.innerHTML = svgDownload + ' Preparando...';
    fetch('/members/api/session', { credentials: 'same-origin' })
      .then(function (r) { return r.text(); })
      .then(function (token) {
        return fetch(PROXY + '/api/revista/descarga/' + numero, {
          headers: { 'Authorization': 'Bearer ' + token.trim() }
        });
      })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'Revista 421 #' + numero + '.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
        track('revista_download', numero, 'wizard');
        btn.innerHTML = original;
      })
      .catch(function () {
        btn.innerHTML = svgLock + ' No se pudo, reintentá';
        setTimeout(function () { btn.innerHTML = original; }, 3000);
      });
  }

  container.addEventListener('click', function (e) {
    var gated = e.target.closest('.revista-btn-gated');
    if (gated) {
      e.preventDefault();
      descargarGateado(parseInt(gated.getAttribute('data-gated'), 10), gated);
      return;
    }

    var locked = e.target.closest('.revista-btn-locked');
    if (locked) {
      if (locked.hasAttribute('data-signup')) {
        e.preventDefault();
        window.location.hash = '#/portal/signup/free';
        return;
      }
      // El del mes: deja pasar el click a /es/suscribite/, solo lo registra.
      track('revista_locked_click', parseInt(locked.getAttribute('data-locked'), 10));
      return;
    }

    var dl = e.target.closest('.revista-btn-download[data-issue]');
    if (dl) track('revista_download', parseInt(dl.getAttribute('data-issue'), 10));
  });

  // Estado del member. Normalización igual a comments.js: comped llega como paid:true,
  // y son 216 de los ~225 que pagan — con status==='paid' a secas quedarían afuera.
  var memberPromise = fetch('/members/api/member/', { credentials: 'same-origin' })
    .then(function (res) { return (!res.ok || res.status === 204) ? null : res.json(); })
    .then(function (member) {
      if (member && member.email) {
        isMember = true;
        isPaid = member.paid === true ||
          member.status === 'paid' || member.status === 'comped' ||
          !!(member.subscriptions && member.subscriptions.length);
      }
    })
    .catch(function () {});

  // Qué número está gateado. Si el server no contesta, caemos a "el más nuevo sin PDF",
  // que es la misma conclusión por otro camino.
  var gatedPromise = fetch(PROXY + '/api/revista/estado')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d && typeof d.gated === 'number') gatedNum = d.gated; })
    .catch(function () {});

  Promise.all([memberPromise, gatedPromise])
    .then(function () {
      return fetch('/ghost/api/content/pages/slug/' + PAGE_SLUG + '/?key=' + CONTENT_KEY + '&formats=html', { headers: { 'Accept-Version': 'v5.0' } });
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var page = data.pages && data.pages[0];
      if (!page || !page.html) return;

      var issues = parseIssues(page.html);
      if (!issues.length) return;

      if (gatedNum === null) {
        var newest = issues.reduce(function (a, b) { return b.numero > a.numero ? b : a; });
        if (!newest.pdf) gatedNum = newest.numero;
      }

      var html = '<div class="revista-grid">';
      issues.forEach(function (issue) {
        html += renderCard(issue);
      });
      html += '</div>';
      container.innerHTML = html;
    });
})();
