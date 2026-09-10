/* Pestaña "Motores de búsqueda" de /es/analytics/
 *
 * Consolida las DOS propiedades de Search Console: 421.news y el dominio
 * anterior, cuatroveintiuno.com. La migración fue en octubre de 2025, así que
 * mirar sólo el dominio nuevo confunde una mudanza con un crecimiento: en
 * mayo-octubre de 2025 el viejo hacía 13.132 clicks y el nuevo 2.385.
 *
 * Los datos NO salen en vivo de Google: vienen de un archivo que sirve el
 * webhook (ver el comentario en server.js). Se regeneran con
 * seo/scripts/generar-gsc-consolidado.py.
 */
(function () {
  var ENDPOINT = 'https://webhook-hreflang.onrender.com/api/gsc-data.json';
  var VERDE = '#17a583', AMARILLO = '#fcd221', CREMA = '#eae6e1', TENUE = '#948d84';

  // Meses incompletos: el primero (las propiedades se verificaron a mitad de
  // mes) y el último (todavía está corriendo). Se dibujan, pero rayados y
  // aclarados, porque si no parecen una caída.
  var PARCIALES = {};

  var iniciado = false;
  var chartClicks = null, chartImpr = null;
  var MESES_RAW = [];   // los meses tal cual vienen: incluyen el top de notas

  window.initBuscadoresDashboard = function () {
    if (iniciado) return;
    iniciado = true;
    var cont = document.getElementById('buscadores-body');
    if (!cont) return;
    cont.innerHTML = '<div class="analytics-empty">Cargando…</div>';

    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 8000);
    fetch(ENDPOINT, { signal: ctrl.signal })
      .then(function (r) { clearTimeout(t); if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(render)
      .catch(function () {
        clearTimeout(t);
        cont.innerHTML = '<div class="analytics-empty">No pudimos cargar los datos de Search Console. ' +
          'Suele ser un bloqueador o una extensión de privacidad frenando webhook-hreflang.onrender.com.</div>';
      });
  };

  function fmt(n) { return (n || 0).toLocaleString('es-AR'); }
  function pct(a, b) { return b ? (a / b * 100).toFixed(2).replace('.', ',') + '%' : '—'; }

  function render(d) {
    var meses = d.meses || [];
    if (!meses.length) return;
    MESES_RAW = meses;

    // El primer y el último mes de la serie están cortados por la mitad
    PARCIALES[meses[0].mes] = true;
    PARCIALES[meses[meses.length - 1].mes] = true;

    var serie = meses.map(function (m) {
      var v = { mes: m.mes, web: 0, discover: 0, impr: 0, viejo: 0, nuevo: 0 };
      ['421.news', 'cuatroveintiuno.com'].forEach(function (dom) {
        var x = m[dom]; if (!x) return;
        var c = (x.web ? x.web.clicks : 0) + (x.discover ? x.discover.clicks : 0);
        if (dom === '421.news') v.nuevo += c; else v.viejo += c;
        v.web += x.web ? x.web.clicks : 0;
        v.discover += x.discover ? x.discover.clicks : 0;
        v.impr += (x.web ? x.web.impresiones : 0) + (x.discover ? x.discover.impresiones : 0);
      });
      v.clicks = v.web + v.discover;
      return v;
    });

    var totC = serie.reduce(function (s, m) { return s + m.clicks; }, 0);
    var totI = serie.reduce(function (s, m) { return s + m.impr; }, 0);
    var totD = serie.reduce(function (s, m) { return s + m.discover; }, 0);
    var mejor = serie.slice().sort(function (a, b) { return b.clicks - a.clicks; })[0];

    document.getElementById('buscadores-body').innerHTML =
      '<div class="analytics-cards">' +
        tarjeta(fmt(totC), 'clicks totales · ' + serie.length + ' meses') +
        tarjeta(fmt(totI), 'impresiones') +
        tarjeta(pct(totD, totC), 'de los clicks son de Discover') +
        tarjeta(etiqueta(mejor.mes), 'mejor mes: ' + fmt(mejor.clicks) + ' clicks') +
      '</div>' +
      '<p class="analytics-subtitle" style="margin-top:1.2rem">' +
        'Suma de <strong>421.news</strong> y <strong>cuatroveintiuno.com</strong>. La migración fue en ' +
        'octubre de 2025: sin el dominio viejo, el salto de esos meses parece crecimiento y es mudanza. ' +
        'El primer y el último mes están incompletos.' +
      '</p>' +
      '<div class="analytics-chart-container"><canvas id="gsc-chart-clicks"></canvas></div>' +
      '<h3 class="analytics-subhead" style="margin-top:2rem">Impresiones y CTR</h3>' +
      '<p class="analytics-subtitle">Cuando las impresiones suben y el CTR baja, 421 está apareciendo ' +
        'en consultas que no le corresponden.</p>' +
      '<div class="analytics-chart-container"><canvas id="gsc-chart-impr"></canvas></div>' +
      '<h3 class="analytics-subhead" style="margin-top:2rem">Notas del mes</h3>' +
      '<p class="analytics-subtitle">Qué leyó la gente cada mes, separado por origen. ' +
        'Sirve para elegir de qué escribir: Discover premia otra cosa que la búsqueda.</p>' +
      selectorMeses(meses) +
      '<div id="gsc-ranking"></div>' +
      '<h3 class="analytics-subhead" style="margin-top:2rem">Mes a mes</h3>' +
      tabla(serie);

    var sel = document.getElementById('gsc-mes');
    if (sel) {
      sel.addEventListener('change', function () { ranking(this.value); });
      ranking(sel.value);
    }

    if (typeof Chart === 'undefined') return;
    dibujar(serie);
  }

  // Meses con ranking cargado, del más nuevo al más viejo
  function selectorMeses(meses) {
    var conTop = meses.filter(function (m) { return m.top; }).slice().reverse();
    if (!conTop.length) return '';
    // Arranca en el último mes COMPLETO: el mes en curso siempre parece una caída.
    var porDefecto = conTop.filter(function (m) { return !PARCIALES[m.mes]; })[0] || conTop[0];
    return '<select id="gsc-mes" class="analytics-search-input" style="max-width:16rem;margin-bottom:1rem">' +
      conTop.map(function (m) {
        return '<option value="' + m.mes + '"' + (m.mes === porDefecto.mes ? ' selected' : '') + '>' +
          etiqueta(m.mes) + (PARCIALES[m.mes] ? ' (parcial)' : '') + '</option>';
      }).join('') + '</select>';
  }

  function ranking(mes) {
    var cont = document.getElementById('gsc-ranking');
    var m = MESES_RAW.filter(function (x) { return x.mes === mes; })[0];
    if (!cont || !m || !m.top) { if (cont) cont.innerHTML = '<div class="analytics-empty">Sin datos de ese mes</div>'; return; }
    cont.innerHTML = '<div class="analytics-funnel-grid">' +
      lista('Búsqueda', m.top.web) + lista('Discover', m.top.discover) + '</div>';
  }

  function lista(titulo, filas) {
    if (!filas || !filas.length) return '<div><h3 class="analytics-subhead">' + titulo +
      '</h3><div class="analytics-empty">Sin datos</div></div>';
    var max = filas[0].c || 1;
    return '<div><h3 class="analytics-subhead">' + titulo + '</h3><div class="analytics-cta-list">' +
      filas.map(function (f) {
        var w = Math.round(f.c / max * 100);
        // f.x marca las del dominio viejo: el link se arma contra 421.news igual,
        // porque cuatroveintiuno.com redirige, pero se avisa de dónde salió.
        var href = 'https://www.421.news' + f.u;
        var estilo = 'color:inherit;text-decoration:none;border-bottom:1px solid rgba(148,141,132,.35)';
        return '<div class="analytics-cta-item">' +
          '<div class="analytics-cta-row">' +
            '<span class="analytics-cta-label"><a href="' + href + '" target="_blank" rel="noopener" style="' + estilo + '">' +
              titulazo(f.u) + '</a>' + (f.x ? ' <span style="opacity:.45">· dominio viejo</span>' : '') + '</span>' +
            '<span class="analytics-cta-val">' + fmt(f.c) +
              ' <span class="analytics-cta-pct">' + pct(f.c, f.i) + '</span></span>' +
          '</div>' +
          '<div class="analytics-bar-track"><div class="analytics-bar-fill" style="width:' + w + '%"></div></div>' +
          '</div>';
      }).join('') + '</div></div>';
  }

  // El slug alcanza para reconocer la nota y entra en una línea
  function titulazo(u) {
    var limpio = u.replace(/\/$/, '');
    if (!limpio) return 'portada';
    // /es/, /en/, /pt/… son las portadas de idioma, no notas
    if (/^\/[a-z]{2}$/.test(limpio)) return 'portada ' + limpio.slice(1).toUpperCase();
    if (/^\/[a-z]{2}\/tag\//.test(limpio)) return 'tag: ' + limpio.split('/').pop().replace(/-/g, ' ');
    if (/^\/author\//.test(limpio)) return 'autor: ' + limpio.split('/').pop().replace(/-/g, ' ');
    var slug = limpio.split('/').pop();
    var t = slug.replace(/-/g, ' ');
    return t.length > 52 ? t.slice(0, 52) + '…' : t;
  }

  function tarjeta(n, d) {
    return '<div class="analytics-card"><div class="analytics-card-value">' + n +
           '</div><div class="analytics-card-label">' + d + '</div></div>';
  }

  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function etiqueta(mes) {
    var p = mes.split('-');
    return MESES[parseInt(p[1], 10) - 1] + ' ' + p[0].slice(2);
  }

  function tabla(serie) {
    var filas = serie.slice().reverse().map(function (m) {
      return '<tr>' +
        '<td>' + etiqueta(m.mes) + (PARCIALES[m.mes] ? ' <span style="opacity:.5">(parcial)</span>' : '') + '</td>' +
        '<td style="text-align:right">' + fmt(m.web) + '</td>' +
        '<td style="text-align:right">' + fmt(m.discover) + '</td>' +
        '<td style="text-align:right"><strong>' + fmt(m.clicks) + '</strong></td>' +
        '<td style="text-align:right">' + fmt(m.impr) + '</td>' +
        '<td style="text-align:right">' + pct(m.clicks, m.impr) + '</td>' +
        '<td style="text-align:right;opacity:.7">' + (m.viejo ? fmt(m.viejo) : '—') + '</td>' +
        '</tr>';
    }).join('');
    return '<div style="overflow-x:auto"><table class="analytics-table"><thead><tr>' +
      '<th>Mes</th><th style="text-align:right">Búsqueda</th><th style="text-align:right">Discover</th>' +
      '<th style="text-align:right">Total</th><th style="text-align:right">Impresiones</th>' +
      '<th style="text-align:right">CTR</th><th style="text-align:right">Dominio viejo</th>' +
      '</tr></thead><tbody>' + filas + '</tbody></table></div>';
  }

  function dibujar(serie) {
    var labels = serie.map(function (m) { return etiqueta(m.mes); });
    var tenue = serie.map(function (m) { return PARCIALES[m.mes] ? 0.4 : 1; });

    var c1 = document.getElementById('gsc-chart-clicks');
    if (c1) {
      if (chartClicks) chartClicks.destroy();
      chartClicks = new Chart(c1, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            { label: 'Búsqueda', data: serie.map(function (m) { return m.web; }),
              backgroundColor: serie.map(function (m, i) { return sombra(VERDE, tenue[i]); }) },
            { label: 'Discover', data: serie.map(function (m) { return m.discover; }),
              backgroundColor: serie.map(function (m, i) { return sombra(AMARILLO, tenue[i]); }) }
          ]
        },
        options: opciones({ apilado: true, titulo: 'Clicks por mes' })
      });
    }

    var c2 = document.getElementById('gsc-chart-impr');
    if (c2) {
      if (chartImpr) chartImpr.destroy();
      chartImpr = new Chart(c2, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            { label: 'Impresiones', data: serie.map(function (m) { return m.impr; }),
              borderColor: TENUE, backgroundColor: 'rgba(148,141,132,.15)', fill: true,
              tension: .3, yAxisID: 'y', pointRadius: 2 },
            { label: 'CTR %', data: serie.map(function (m) { return m.impr ? +(m.clicks / m.impr * 100).toFixed(2) : 0; }),
              borderColor: VERDE, backgroundColor: 'transparent', tension: .3,
              yAxisID: 'y2', pointRadius: 2, borderWidth: 2 }
          ]
        },
        options: opciones({ doble: true, titulo: 'Impresiones y CTR' })
      });
    }
  }

  // Los meses parciales van con el mismo color pero translúcidos
  function sombra(hex, alfa) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alfa + ')';
  }

  function opciones(o) {
    var rejilla = 'rgba(148,141,132,.15)';
    var base = {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: CREMA, boxWidth: 12, font: { size: 11 },
          // El color de barra es un array (los meses parciales van atenuados) y
          // Chart.js toma el del índice 0 para la leyenda, que justo es parcial:
          // la leyenda salía apagada. Se fuerza el color pleno.
          generateLabels: function (chart) {
            return chart.data.datasets.map(function (ds, i) {
              var c = Array.isArray(ds.backgroundColor)
                ? (ds.label === 'Discover' ? AMARILLO : VERDE)
                : (ds.borderColor || ds.backgroundColor);
              return { text: ds.label, fillStyle: c, strokeStyle: c, lineWidth: 0,
                       hidden: !chart.isDatasetVisible(i), datasetIndex: i, fontColor: CREMA };
            });
          } } },
        title: { display: false },
        tooltip: { callbacks: { label: function (c) {
          var v = c.parsed.y;
          return c.dataset.label + ': ' + (c.dataset.yAxisID === 'y2'
            ? String(v).replace('.', ',') + '%' : fmt(v));
        } } }
      },
      scales: {
        x: { stacked: !!o.apilado, ticks: { color: TENUE, font: { size: 10 } }, grid: { color: rejilla } },
        y: { stacked: !!o.apilado, beginAtZero: true, ticks: { color: TENUE, font: { size: 10 },
             callback: function (v) { return v >= 1000 ? (v / 1000) + 'k' : v; } }, grid: { color: rejilla } }
      }
    };
    if (o.doble) {
      base.scales.y2 = { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false },
        ticks: { color: VERDE, font: { size: 10 }, callback: function (v) { return v + '%'; } } };
    }
    return base;
  }
})();
