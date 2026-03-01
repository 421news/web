(function () {
  var container = document.getElementById('revista-container');
  if (!container) return;

  var CONTENT_KEY = '420da6f85b5cc903b347de9e33';
  var PAGE_SLUG = 'revista-421';

  var svgDownload = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  var svgExpand = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>';

  function parseIssues(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var headings = doc.querySelectorAll('h2');
    var issues = [];

    headings.forEach(function (h2) {
      var text = h2.textContent.trim();
      // Parse: #12 - Febrero 2026 - Especial Manga/Animé
      var match = text.match(/#(\d+)\s*-\s*([^-]+?)(?:\s*-\s*(.+))?$/);
      if (!match) return;

      var numero = parseInt(match[1], 10);
      var fecha = match[2].trim();
      var titulo = match[3] ? match[3].trim() : 'Revista 421 #' + numero;

      // Find next figure (cover image + credits)
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
          // Parse credits from figcaption: bold text = rol, next link = nombre
          var nodes = caption.childNodes;
          var currentRol = '';
          for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if (node.nodeType === 1) { // element
              var tag = node.tagName.toLowerCase();
              // Bold/strong = role name
              if ((tag === 'b' || tag === 'strong') && !node.querySelector('a')) {
                var rolText = node.textContent.trim().replace(/:$/, '');
                if (rolText) currentRol = rolText;
              }
              // Link = person name
              if (tag === 'a') {
                creditos.push({
                  rol: currentRol || 'Crédito',
                  nombre: node.textContent.trim(),
                  url: node.href
                });
                currentRol = '';
              }
              // Bold with link inside
              if ((tag === 'b' || tag === 'strong') && node.querySelector('a')) {
                var innerLink = node.querySelector('a');
                if (innerLink) {
                  // Check if this bold also has non-link text (the role)
                  var allText = node.textContent.trim();
                  var linkText = innerLink.textContent.trim();
                  if (allText !== linkText) {
                    currentRol = allText.replace(linkText, '').replace(/:$/, '').trim();
                  }
                  creditos.push({
                    rol: currentRol || 'Crédito',
                    nombre: linkText,
                    url: innerLink.href
                  });
                  currentRol = '';
                }
              }
            }
          }
        }
      }

      // Find file card (PDF link + size)
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
        issues.push({
          numero: numero,
          titulo: titulo,
          fecha: fecha,
          cover: cover,
          pdf: pdf,
          size: size,
          creditos: creditos
        });
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

    return '<div class="revista-card">' +
      '<div class="revista-card-cover">' +
        '<a href="' + issue.cover + '" target="_blank">' +
          '<img src="' + issue.cover + '" alt="Revista 421 #' + issue.numero + '" loading="lazy">' +
        '</a>' +
      '</div>' +
      '<div class="revista-card-info">' +
        '<div class="revista-card-header">' +
          '<span class="revista-card-number">#' + issue.numero + '</span>' +
          '<span class="revista-card-fecha">' + issue.fecha + '</span>' +
        '</div>' +
        '<div class="revista-card-title">' + issue.titulo + '</div>' +
        '<div class="revista-card-credits">' + creditsHtml + '</div>' +
        '<div class="revista-card-actions">' +
          (issue.pdf ?
            '<a href="' + issue.pdf + '" class="revista-btn-download" download>' +
              svgDownload + ' Descargar PDF' + (issue.size ? ' (' + issue.size + ')' : '') +
            '</a>' : '') +
          '<a href="' + issue.cover + '" target="_blank" class="revista-btn-cover">' +
            svgExpand + ' Ver tapa' +
          '</a>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  fetch('/ghost/api/content/pages/slug/' + PAGE_SLUG + '/?key=' + CONTENT_KEY + '&formats=html')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var page = data.pages && data.pages[0];
      if (!page || !page.html) return;

      var issues = parseIssues(page.html);
      if (!issues.length) return;

      var html = '<div class="revista-grid">';
      issues.forEach(function (issue) {
        html += renderCard(issue);
      });
      html += '</div>';
      container.innerHTML = html;
    });
})();
