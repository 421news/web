(function() {
  'use strict';

  var inited = false;
  var growthChart = null, revChart = null, tierChart = null;

  var GREEN = '#17a583', YELLOW = '#fcd221', ORANGE = '#e07c24', RED = '#c0392b', PURPLE = '#6c5ce7', GREY = '#636e72';
  var GRID = 'rgba(234,230,225,0.06)', TICK = 'rgba(234,230,225,0.6)';

  var TIERS = [
    { key: 'mp_m5', label: 'MP $5/mes', color: GREEN },
    { key: 'mp_a50', label: 'MP $50/año', color: YELLOW },
    { key: 'mp_m10', label: 'MP $10/mes', color: ORANGE },
    { key: 'mp_a100', label: 'MP $100/año', color: RED },
    { key: 'stripe_m', label: 'Stripe mensual', color: PURPLE },
    { key: 'stripe_a', label: 'Stripe anual', color: GREY }
  ];

  function fmt(n) { return (n == null) ? '—' : Number(n).toLocaleString('es-AR'); }
  function fmtMaybe(n, prefix) { return (n == null) ? '—' : prefix + Number(n).toLocaleString('es-AR'); }
  function tooltipStyle() {
    return { backgroundColor: '#1a1a1a', titleColor: '#eae6e1', bodyColor: '#eae6e1', borderColor: 'rgba(234,230,225,0.2)', borderWidth: 1 };
  }

  window.initRevenueDashboard = function() {
    if (inited) return;
    inited = true;
    window.__revenueData.then(function(data) {
      if (!data) return;
      render(data);
    }).catch(function() {});
  };

  function render(data) {
    var hist = data.history || [];
    var cur = data.current || (hist.length ? hist[hist.length - 1] : {});
    var prev = hist.length > 1 ? hist[hist.length - 2] : null;

    document.getElementById('revenue-date').textContent = cur.date || data.generated || '';
    document.getElementById('revenue-blue').textContent = data.blue_ref ? '$' + fmt(data.blue_ref) : '—';
    document.getElementById('revenue-source').textContent = (data.source && data.source.indexOf('seed') === 0)
      ? 'Datos de siembra (último reporte)' : 'Actualizado semanalmente';

    renderCards(cur, prev);
    renderGrowth(hist);
    renderRevenue(hist);
    renderTiers(cur);
    renderHistory(hist);
  }

  function delta(cur, prev, key, suffix) {
    if (!prev || cur[key] == null || prev[key] == null) return '';
    var d = cur[key] - prev[key];
    if (d === 0) return '<div class="analytics-card-delta">=</div>';
    var cls = d > 0 ? 'up' : 'down';
    var sign = d > 0 ? '+' : '';
    return '<div class="analytics-card-delta ' + cls + '">' + sign + fmt(d) + (suffix || '') + ' vs ant.</div>';
  }

  function renderCards(cur, prev) {
    var cards = [
      { value: fmt(cur.pagos), label: 'Suscriptores pagos', accent: true, d: delta(cur, prev, 'pagos') },
      { value: (cur.ratio != null ? cur.ratio.toFixed(2) + '%' : '—'), label: 'Conversión pago/free', d: '' },
      { value: fmtMaybe(cur.rev_usd_m, 'US$ '), label: 'MRR (USD blue)', accent: true, d: '' },
      { value: fmt(cur.total), label: 'Miembros totales', d: delta(cur, prev, 'total') }
    ];
    document.getElementById('revenue-cards').innerHTML = cards.map(function(c) {
      return '<div class="analytics-card">' +
        '<div class="analytics-card-value' + (c.accent ? ' analytics-accent' : '') + '">' + c.value + '</div>' +
        '<div class="analytics-card-label">' + c.label + '</div>' + (c.d || '') + '</div>';
    }).join('');
  }

  function renderGrowth(hist) {
    var labels = hist.map(function(h) { return h.date; });
    var pagos = hist.map(function(h) { return h.pagos; });
    var total = hist.map(function(h) { return h.total; });
    if (growthChart) return;
    growthChart = new Chart(document.getElementById('revenue-growth-chart'), {
      type: 'line',
      data: { labels: labels, datasets: [
        { label: 'Suscriptores pagos', data: pagos, borderColor: GREEN, backgroundColor: 'rgba(23,165,131,0.1)', fill: true, tension: 0.3, pointRadius: 3, yAxisID: 'y' },
        { label: 'Miembros totales', data: total, borderColor: YELLOW, borderDash: [5, 5], tension: 0.3, pointRadius: 2, yAxisID: 'y1' }
      ]},
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: '#eae6e1', usePointStyle: true, padding: 18 } }, tooltip: tooltipStyle() },
        scales: {
          x: { ticks: { color: TICK, maxRotation: 45 }, grid: { color: GRID } },
          y: { position: 'left', ticks: { color: GREEN }, grid: { color: GRID }, title: { display: true, text: 'Pagos', color: GREEN, font: { size: 11 } } },
          y1: { position: 'right', ticks: { color: YELLOW }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Miembros', color: YELLOW, font: { size: 11 } } }
        }
      }
    });
  }

  function renderRevenue(hist) {
    var labels = hist.map(function(h) { return h.date; });
    var ars = hist.map(function(h) { return h.rev_mens_ars; });
    var usd = hist.map(function(h) { return h.rev_usd_m; });
    if (revChart) return;
    revChart = new Chart(document.getElementById('revenue-rev-chart'), {
      data: { labels: labels, datasets: [
        { type: 'bar', label: 'Rev. mensual (ARS)', data: ars, backgroundColor: 'rgba(252,210,33,0.45)', yAxisID: 'y' },
        { type: 'line', label: 'Rev. mensual (USD blue)', data: usd, borderColor: GREEN, backgroundColor: 'transparent', tension: 0.3, pointRadius: 3, spanGaps: true, yAxisID: 'y1' }
      ]},
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: '#eae6e1', usePointStyle: true, padding: 18 } }, tooltip: tooltipStyle() },
        scales: {
          x: { ticks: { color: TICK, maxRotation: 45 }, grid: { color: GRID } },
          y: { position: 'left', ticks: { color: YELLOW, callback: function(v) { return '$' + (v / 1000000).toFixed(1) + 'M'; } }, grid: { color: GRID }, title: { display: true, text: 'ARS', color: YELLOW, font: { size: 11 } } },
          y1: { position: 'right', ticks: { color: GREEN, callback: function(v) { return 'US$' + v; } }, grid: { drawOnChartArea: false }, title: { display: true, text: 'USD', color: GREEN, font: { size: 11 } } }
        }
      }
    });
  }

  function renderTiers(cur) {
    var data = TIERS.map(function(t) { return { label: t.label, color: t.color, n: cur[t.key] || 0 }; }).filter(function(t) { return t.n > 0; });
    var total = data.reduce(function(s, t) { return s + t.n; }, 0);
    if (!tierChart) {
      tierChart = new Chart(document.getElementById('revenue-tier-chart'), {
        type: 'doughnut',
        data: { labels: data.map(function(t) { return t.label; }), datasets: [{ data: data.map(function(t) { return t.n; }), backgroundColor: data.map(function(t) { return t.color; }), borderColor: '#121212', borderWidth: 2, hoverBorderColor: '#eae6e1' }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '60%',
          plugins: { legend: { display: false }, tooltip: tooltipStyle() } }
      });
    }
    document.getElementById('revenue-tier-legend').innerHTML =
      '<div class="analytics-subhead">' + total + ' suscripciones activas</div>' +
      data.map(function(t) {
        var pct = total ? ((t.n / total) * 100).toFixed(1) : '0.0';
        return '<div class="analytics-channel-item">' +
          '<div class="analytics-channel-dot" style="background:' + t.color + '"></div>' +
          '<div class="analytics-channel-info">' +
            '<div class="analytics-channel-name">' + t.label + '</div>' +
            '<div class="analytics-channel-stats">' + t.n + ' subs · ' + pct + '%</div>' +
          '</div></div>';
      }).join('');
  }

  function renderHistory(hist) {
    var rows = hist.slice().reverse().map(function(h) {
      return '<tr>' +
        '<td>' + h.date + '</td>' +
        '<td class="analytics-num">' + fmt(h.total) + '</td>' +
        '<td class="analytics-num"><strong>' + fmt(h.pagos) + '</strong></td>' +
        '<td class="analytics-num">' + (h.ratio != null ? h.ratio.toFixed(2) + '%' : '—') + '</td>' +
        '<td class="analytics-num">' + fmt(h.mp_m5) + '</td>' +
        '<td class="analytics-num">' + fmt(h.mp_a50) + '</td>' +
        '<td class="analytics-num">' + fmt(h.mp_m10) + '</td>' +
        '<td class="analytics-num">' + fmt(h.mp_a100) + '</td>' +
        '<td class="analytics-num">' + fmt(h.stripe_m) + '</td>' +
        '<td class="analytics-num">' + fmt(h.stripe_a) + '</td>' +
        '<td class="analytics-num">' + fmtMaybe(h.rev_mens_ars, '$') + '</td>' +
        '<td class="analytics-num">' + fmtMaybe(h.rev_usd_m, 'US$') + '</td>' +
        '</tr>';
    }).join('');
    document.getElementById('revenue-hist-tbody').innerHTML = rows;
  }

})();
