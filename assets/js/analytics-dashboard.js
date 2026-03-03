(function() {
  'use strict';

  var chartMonthly = null;
  var chartChannel = null;
  var DATA = null;
  var ALL_MONTHS = [];

  // Central state
  var state = {
    monthFrom: null,
    monthTo: null,
    tab: 'articles',
    lang: 'all',
    search: '',
    sort: 'pv',
    sortDir: 'desc',
    page: 1,
    perPage: 25
  };

  Promise.all([
    window.__ga4Data,
    new Promise(function(r) {
      if (document.readyState !== 'loading') r();
      else document.addEventListener('DOMContentLoaded', r);
    })
  ]).then(function(res) {
    DATA = res[0];
    if (!DATA) return;
    ALL_MONTHS = DATA.monthly.map(function(m) { return m.month; });
    state.monthFrom = 0;
    state.monthTo = ALL_MONTHS.length - 1;
    init();
  });

  // === Formatting ===
  function fmt(n) { return n.toLocaleString('es-AR'); }
  function fmtDuration(seconds) {
    var m = Math.floor(seconds / 60);
    var s = Math.round(seconds % 60);
    return m + 'm ' + (s < 10 ? '0' : '') + s + 's';
  }
  function fmtPct(decimal) { return (decimal * 100).toFixed(1) + '%'; }

  // === Aggregation ===
  function aggregateItem(item) {
    var from = ALL_MONTHS[state.monthFrom];
    var to = ALL_MONTHS[state.monthTo];
    var pv = 0, u = 0, dWeighted = 0;
    for (var ym in item.m) {
      if (ym >= from && ym <= to) {
        var md = item.m[ym];
        pv += md.pv;
        u += md.u;
        dWeighted += (md.d || 0) * md.pv;
      }
    }
    return { pv: pv, u: u, d: pv > 0 ? Math.round(dWeighted / pv) : 0 };
  }

  function aggregateChannel(ch) {
    var from = ALL_MONTHS[state.monthFrom];
    var to = ALL_MONTHS[state.monthTo];
    var s = 0, u = 0;
    for (var ym in ch.m) {
      if (ym >= from && ym <= to) {
        s += ch.m[ym].s;
        u += ch.m[ym].u;
      }
    }
    return { s: s, u: u };
  }

  function sumMonthlyRange(key) {
    var total = 0;
    for (var i = state.monthFrom; i <= state.monthTo; i++) total += DATA.monthly[i][key];
    return total;
  }
  function avgMonthlyRange(key) {
    var total = 0;
    for (var i = state.monthFrom; i <= state.monthTo; i++) total += DATA.monthly[i][key];
    return total / (state.monthTo - state.monthFrom + 1);
  }

  // === Filtering ===
  function getFilteredItems() {
    var items = state.tab === 'articles' ? DATA.articles : DATA.pages;
    // Language filter
    if (state.lang === 'es') {
      items = items.filter(function(a) { return !a.en; });
    } else if (state.lang === 'en') {
      items = items.filter(function(a) { return a.en; });
    }
    // Search filter
    if (state.search) {
      var q = state.search.toLowerCase();
      items = items.filter(function(a) {
        var text = (a.title || a.path || a.slug || '').toLowerCase();
        return text.indexOf(q) !== -1;
      });
    }
    // Aggregate and sort
    var aggregated = items.map(function(a) {
      var agg = aggregateItem(a);
      return { item: a, pv: agg.pv, u: agg.u, d: agg.d };
    });
    // Filter out zero PV in selected range
    aggregated = aggregated.filter(function(a) { return a.pv > 0; });
    // Sort
    var key = state.sort;
    var dir = state.sortDir === 'desc' ? -1 : 1;
    aggregated.sort(function(a, b) { return (b[key] - a[key]) * dir; });
    return aggregated;
  }

  // === Init ===
  function init() {
    document.getElementById('analytics-range').textContent =
      DATA.range.start + ' al ' + DATA.range.end;
    document.getElementById('analytics-generated').textContent = DATA.generated;

    renderMonthFilters();
    setupTabs();
    setupLangSelector();
    setupSearch();
    setupSortHeaders();
    onFilterChange();
  }

  // === Render all ===
  function onFilterChange() {
    renderCards();
    renderMonthlyChart();
    renderMonthlyTable();
    renderChannelDonut();
    renderChannelLegend();
    renderContentTable();
  }

  // === Cards ===
  function renderCards() {
    var pv = sumMonthlyRange('pv');
    var sess = sumMonthlyRange('s');
    var users = sumMonthlyRange('u');
    var dur = avgMonthlyRange('d');
    var cards = [
      { label: 'Pageviews', value: fmt(pv) },
      { label: 'Sesiones', value: fmt(sess) },
      { label: 'Usuarios', value: fmt(users) },
      { label: 'Duraci\u00f3n promedio', value: fmtDuration(dur) }
    ];
    document.getElementById('analytics-cards').innerHTML = cards.map(function(c) {
      return '<div class="analytics-card"><div class="analytics-card-value">' + c.value + '</div><div class="analytics-card-label">' + c.label + '</div></div>';
    }).join('');
  }

  // === Month Filters ===
  function renderMonthFilters() {
    var container = document.getElementById('month-filters');
    var options = DATA.monthly.map(function(m, i) {
      return '<option value="' + i + '">' + m.label + '</option>';
    }).join('');
    container.innerHTML =
      '<label>Desde </label><select id="filter-from">' + options + '</select>' +
      '<label> hasta </label><select id="filter-to">' + options + '</select>';
    document.getElementById('filter-from').value = state.monthFrom;
    document.getElementById('filter-to').value = state.monthTo;
    document.getElementById('filter-from').addEventListener('change', function() {
      var f = parseInt(this.value);
      var t = parseInt(document.getElementById('filter-to').value);
      if (f > t) { document.getElementById('filter-to').value = f; state.monthTo = f; }
      state.monthFrom = f;
      state.page = 1;
      onFilterChange();
    });
    document.getElementById('filter-to').addEventListener('change', function() {
      var f = parseInt(document.getElementById('filter-from').value);
      var t = parseInt(this.value);
      if (t < f) { document.getElementById('filter-from').value = t; state.monthFrom = t; }
      state.monthTo = t;
      state.page = 1;
      onFilterChange();
    });
  }

  // === Tabs ===
  function setupTabs() {
    var tabs = document.querySelectorAll('.analytics-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function() {
        for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
        this.classList.add('active');
        state.tab = this.getAttribute('data-tab');
        state.page = 1;
        // Update column header
        document.getElementById('col-title').textContent = state.tab === 'articles' ? 'Art\u00edculo' : 'P\u00e1gina';
        renderContentTable();
      });
    }
  }

  // === Lang selector ===
  function setupLangSelector() {
    var btns = document.querySelectorAll('.analytics-lang');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function() {
        for (var j = 0; j < btns.length; j++) btns[j].classList.remove('active');
        this.classList.add('active');
        state.lang = this.getAttribute('data-lang');
        state.page = 1;
        renderContentTable();
      });
    }
  }

  // === Search ===
  function setupSearch() {
    document.getElementById('content-search').addEventListener('input', function() {
      state.search = this.value;
      state.page = 1;
      renderContentTable();
    });
  }

  // === Sort headers ===
  function setupSortHeaders() {
    var headers = document.querySelectorAll('.analytics-sortable');
    for (var i = 0; i < headers.length; i++) {
      headers[i].addEventListener('click', function() {
        var key = this.getAttribute('data-sort');
        if (state.sort === key) {
          state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
        } else {
          state.sort = key;
          state.sortDir = 'desc';
        }
        state.page = 1;
        // Update arrows
        var all = document.querySelectorAll('.analytics-sortable');
        for (var j = 0; j < all.length; j++) {
          var arrow = all[j].querySelector('.analytics-sort-arrow');
          if (arrow) arrow.textContent = '';
          all[j].classList.remove('analytics-sort-active');
        }
        var myArrow = this.querySelector('.analytics-sort-arrow');
        if (myArrow) myArrow.textContent = state.sortDir === 'desc' ? '\u25BC' : '\u25B2';
        this.classList.add('analytics-sort-active');
        renderContentTable();
      });
    }
  }

  // === Monthly Chart ===
  function renderMonthlyChart() {
    var months = DATA.monthly.slice(state.monthFrom, state.monthTo + 1);
    var labels = months.map(function(m) { return m.label; });
    var pvData = months.map(function(m) { return m.pv; });
    var sessData = months.map(function(m) { return m.s; });
    var userData = months.map(function(m) { return m.u; });

    if (chartMonthly) {
      chartMonthly.data.labels = labels;
      chartMonthly.data.datasets[0].data = pvData;
      chartMonthly.data.datasets[1].data = sessData;
      chartMonthly.data.datasets[2].data = userData;
      chartMonthly.update();
      return;
    }

    chartMonthly = new Chart(document.getElementById('monthly-chart'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'Pageviews', data: pvData, borderColor: '#fcd221', backgroundColor: 'rgba(252,210,33,0.08)', fill: true, tension: 0.3, pointRadius: 3, pointHoverRadius: 5, yAxisID: 'y' },
          { label: 'Sesiones', data: sessData, borderColor: '#17a583', backgroundColor: 'transparent', tension: 0.3, pointRadius: 3, pointHoverRadius: 5, yAxisID: 'y1' },
          { label: 'Usuarios', data: userData, borderColor: '#e07c24', backgroundColor: 'transparent', tension: 0.3, borderDash: [5, 5], pointRadius: 2, pointHoverRadius: 4, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#eae6e1', usePointStyle: true, padding: 20 } },
          tooltip: {
            backgroundColor: '#1a1a1a', titleColor: '#eae6e1', bodyColor: '#eae6e1',
            borderColor: 'rgba(234,230,225,0.2)', borderWidth: 1,
            callbacks: { label: function(item) { return item.dataset.label + ': ' + item.parsed.y.toLocaleString('es-AR'); } }
          }
        },
        scales: {
          x: { ticks: { color: 'rgba(234,230,225,0.6)', maxRotation: 45 }, grid: { color: 'rgba(234,230,225,0.06)' } },
          y: { type: 'linear', position: 'left', ticks: { color: '#fcd221', callback: function(v) { return v >= 1000 ? (v/1000)+'k' : v; } }, grid: { color: 'rgba(234,230,225,0.06)' }, title: { display: true, text: 'Pageviews', color: '#fcd221', font: { size: 11 } } },
          y1: { type: 'linear', position: 'right', ticks: { color: '#17a583', callback: function(v) { return v >= 1000 ? (v/1000)+'k' : v; } }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Sesiones / Usuarios', color: '#17a583', font: { size: 11 } } }
        }
      }
    });
  }

  // === Monthly Table ===
  function renderMonthlyTable() {
    var months = DATA.monthly.slice(state.monthFrom, state.monthTo + 1);
    var wrap = document.getElementById('monthly-table-wrap');
    var totalPV = 0, totalSess = 0, totalUsers = 0, totalDur = 0;
    months.forEach(function(m) { totalPV += m.pv; totalSess += m.s; totalUsers += m.u; totalDur += m.d; });
    var avgDur = totalDur / months.length;
    var rows = months.map(function(m) {
      return '<tr><td>' + m.label + '</td>' +
        '<td class="analytics-num">' + fmt(m.pv) + '</td>' +
        '<td class="analytics-num">' + fmt(m.s) + '</td>' +
        '<td class="analytics-num">' + fmt(m.u) + '</td>' +
        '<td class="analytics-num">' + fmtDuration(m.d) + '</td>' +
        '<td class="analytics-num">' + fmtPct(m.b) + '</td></tr>';
    }).join('');
    wrap.innerHTML = '<div class="analytics-table-scroll"><table class="analytics-table">' +
      '<thead><tr><th>Mes</th><th class="analytics-num">Pageviews</th><th class="analytics-num">Sesiones</th><th class="analytics-num">Usuarios</th><th class="analytics-num">Duraci\u00f3n</th><th class="analytics-num">Bounce</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '<tfoot><tr class="analytics-total-row"><td><strong>Total / Prom.</strong></td>' +
        '<td class="analytics-num"><strong>' + fmt(totalPV) + '</strong></td>' +
        '<td class="analytics-num"><strong>' + fmt(totalSess) + '</strong></td>' +
        '<td class="analytics-num"><strong>' + fmt(totalUsers) + '</strong></td>' +
        '<td class="analytics-num"><strong>' + fmtDuration(avgDur) + '</strong></td>' +
        '<td class="analytics-num">\u2014</td></tr></tfoot></table></div>';
  }

  // === Channel Donut ===
  function renderChannelDonut() {
    var chData = DATA.channels.map(function(c) {
      var agg = aggregateChannel(c);
      return { name: c.name, color: c.color, s: agg.s, u: agg.u };
    }).filter(function(c) { return c.s > 0; });

    if (chartChannel) {
      chartChannel.data.labels = chData.map(function(c) { return c.name; });
      chartChannel.data.datasets[0].data = chData.map(function(c) { return c.s; });
      chartChannel.data.datasets[0].backgroundColor = chData.map(function(c) { return c.color; });
      chartChannel.update();
      return;
    }

    chartChannel = new Chart(document.getElementById('channel-chart'), {
      type: 'doughnut',
      data: {
        labels: chData.map(function(c) { return c.name; }),
        datasets: [{
          data: chData.map(function(c) { return c.s; }),
          backgroundColor: chData.map(function(c) { return c.color; }),
          borderColor: '#121212', borderWidth: 2, hoverBorderColor: '#eae6e1'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1a1a', titleColor: '#eae6e1', bodyColor: '#eae6e1',
            borderColor: 'rgba(234,230,225,0.2)', borderWidth: 1,
            callbacks: {
              label: function(item) {
                var total = item.dataset.data.reduce(function(a, b) { return a + b; }, 0);
                return item.label + ': ' + item.parsed.toLocaleString('es-AR') + ' (' + ((item.parsed / total) * 100).toFixed(1) + '%)';
              }
            }
          }
        }
      }
    });
  }

  // === Channel Legend ===
  function renderChannelLegend() {
    var chData = DATA.channels.map(function(c) {
      var agg = aggregateChannel(c);
      return { name: c.name, color: c.color, s: agg.s, u: agg.u };
    }).filter(function(c) { return c.s > 0; });
    var total = chData.reduce(function(sum, c) { return sum + c.s; }, 0);
    document.getElementById('channel-legend').innerHTML = chData.map(function(c) {
      var pct = ((c.s / total) * 100).toFixed(1);
      return '<div class="analytics-channel-item">' +
        '<div class="analytics-channel-dot" style="background:' + c.color + '"></div>' +
        '<div class="analytics-channel-info">' +
          '<div class="analytics-channel-name">' + c.name + '</div>' +
          '<div class="analytics-channel-stats">' + fmt(c.s) + ' sesiones \u00b7 ' + fmt(c.u) + ' usuarios \u00b7 ' + pct + '%</div>' +
        '</div></div>';
    }).join('');
  }

  // === Content Table (articles or pages, paginated) ===
  function renderContentTable() {
    var filtered = getFilteredItems();
    var total = filtered.length;
    var totalPages = Math.ceil(total / state.perPage);
    if (state.page > totalPages) state.page = totalPages || 1;
    var start = (state.page - 1) * state.perPage;
    var pageItems = filtered.slice(start, start + state.perPage);
    var maxPV = filtered.length > 0 ? filtered[0].pv : 1;

    var tbody = document.getElementById('content-tbody');
    var isArticle = state.tab === 'articles';

    tbody.innerHTML = pageItems.map(function(a, i) {
      var pos = start + i + 1;
      var barWidth = Math.round((a.pv / maxPV) * 100);
      var item = a.item;
      var title = isArticle ? (item.title || item.slug) : (item.path || item.title);
      var langBadge = item.en ? ' <span class="analytics-lang-badge">EN</span>' : '';
      var mergeNote = item.merge ? ' <span class="analytics-merge-note" title="' + escAttr(item.merge) + '">\u2295</span>' : '';
      var typeBadge = !isArticle && item.type ? ' <span class="analytics-type-badge analytics-type-' + item.type + '">' + item.type + '</span>' : '';
      var subtitle = isArticle && item.slug ? '<div class="analytics-article-slug">/es/' + escHtml(item.slug) + '/</div>' : '';

      return '<tr>' +
        '<td class="analytics-num analytics-pos">' + pos + '</td>' +
        '<td class="analytics-article-cell">' +
          '<div class="analytics-article-title">' + escHtml(title) + langBadge + mergeNote + typeBadge + '</div>' +
          subtitle +
          '<div class="analytics-bar-track"><div class="analytics-bar-fill" style="width:' + barWidth + '%"></div></div>' +
        '</td>' +
        '<td class="analytics-num"><strong>' + fmt(a.pv) + '</strong></td>' +
        '<td class="analytics-num">' + fmt(a.u) + '</td>' +
        '<td class="analytics-num">' + fmtDuration(a.d) + '</td></tr>';
    }).join('');

    renderPagination(total, totalPages);
  }

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // === Pagination ===
  function renderPagination(total, totalPages) {
    var container = document.getElementById('content-pagination');
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    var html = '<span class="analytics-page-info">' + total + ' resultados</span>';
    if (state.page > 1) {
      html += '<button class="analytics-page-btn" data-page="' + (state.page - 1) + '">&laquo;</button>';
    }
    var startPage = Math.max(1, state.page - 2);
    var endPage = Math.min(totalPages, state.page + 2);
    for (var p = startPage; p <= endPage; p++) {
      html += '<button class="analytics-page-btn' + (p === state.page ? ' active' : '') + '" data-page="' + p + '">' + p + '</button>';
    }
    if (state.page < totalPages) {
      html += '<button class="analytics-page-btn" data-page="' + (state.page + 1) + '">&raquo;</button>';
    }
    container.innerHTML = html;
    var btns = container.querySelectorAll('.analytics-page-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function() {
        state.page = parseInt(this.getAttribute('data-page'));
        renderContentTable();
        // Scroll to content section
        document.getElementById('content-table').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

})();
