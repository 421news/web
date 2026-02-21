(function () {
  var container = document.getElementById('revista-container');
  if (!container) return;

  var jsonPath = '/assets/data/revista.json';

  var svgDownload = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  var svgExpand = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>';

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
          '<a href="' + issue.pdf + '" class="revista-btn-download" download>' +
            svgDownload + ' Descargar PDF (' + issue.size + ')' +
          '</a>' +
          '<a href="' + issue.cover + '" target="_blank" class="revista-btn-cover">' +
            svgExpand + ' Ver tapa' +
          '</a>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  fetch(jsonPath)
    .then(function (res) { return res.json(); })
    .then(function (issues) {
      var html = '<div class="revista-grid">';
      issues.forEach(function (issue) {
        html += renderCard(issue);
      });
      html += '</div>';
      container.innerHTML = html;
    });
})();
