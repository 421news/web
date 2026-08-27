// Pestaña "Autores" de /es/analytics/.
//
// Los datos vienen en window.__ga4Data.autores, que arma el mismo refresh de GA4
// que alimenta el resto de la página (2 veces por día). Acá no se calcula nada:
// solo se dibuja.
//
// Dos rankings sobre el MISMO recorte, y hay que leerlos juntos:
//   por volumen        -> premia la constancia (todo lo que acumuló)
//   por mejor artículo -> premia el techo (cuánto hizo su mejor nota)
// La última columna de cada tabla muestra la posición en el otro, que es donde
// aparece lo interesante: quién sube y quién baja al cambiar de criterio.
(function () {
  var iniciado = false;
  var datos = null;
  var orden = 'total';

  var AYUDA = {
    total: 'La suma de todo lo que publicó cada uno. Premia la constancia.',
    top: 'Cuánto hizo el mejor texto de cada uno, sin importar cuántos publicó. Premia el techo.'
  };

  function num(n) { return (n || 0).toLocaleString('es-AR'); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function tarjetas(d) {
    var el = document.getElementById('autores-cards');
    if (!el) return;
    var cards = [
      { n: num(d.notas), l: 'Notas' },
      { n: num(d.pv), l: 'Pageviews' },
      { n: num(d.autores), l: 'Autores' },
      { n: num(d.prom), l: 'Promedio por nota' }
    ];
    el.innerHTML = cards.map(function (c) {
      return '<div class="analytics-card"><div class="analytics-card-value">' + c.n +
        '</div><div class="analytics-card-label">' + c.l + '</div></div>';
    }).join('');
  }

  function fila(a, i, max) {
    var valor = orden === 'total' ? a.pv : a.topV;
    var aca = orden === 'total' ? a.rT : a.rP;   // puesto en la tabla que se está viendo
    var otro = orden === 'total' ? a.rP : a.rT;  // puesto en la otra
    // Positivo = rankea MEJOR acá que allá. El número de puesto va al revés que la
    // calidad (menor es mejor), así que la resta es otro - acá, no acá - otro.
    var delta = otro - aca;
    var signo = delta > 0 ? 'up' : (delta < 0 ? 'down' : 'eq');
    var txt = delta === 0 ? '=' : (delta > 0 ? '+' + delta : String(delta));
    var ancho = max ? Math.round(valor / max * 100) : 0;
    return '<tr>' +
      '<td class="analytics-pos">' + i + '</td>' +
      '<td class="analytics-article-cell"><div class="au-nombre">' + esc(a.nombre) + '</div>' +
        '<a class="au-nota" href="' + esc(a.topU) + '" target="_blank" rel="noopener">' + esc(a.topT) + '</a></td>' +
      '<td class="analytics-num">' + num(a.notas) + '</td>' +
      '<td class="analytics-num au-fig">' + num(valor) +
        '<span class="au-bar" style="width:' + ancho + '%"></span></td>' +
      '<td class="analytics-num au-soft">' + num(orden === 'total' ? a.prom : a.topV) + '</td>' +
      '<td class="analytics-num au-cmp">#' + otro + ' <span class="au-delta au-' + signo + '">' + txt + '</span></td>' +
    '</tr>';
  }

  function pintar() {
    if (!datos) return;
    var lista = datos.lista.slice().sort(function (x, y) {
      return orden === 'total' ? y.pv - x.pv : y.topV - x.topV;
    });
    var max = lista.length ? (orden === 'total' ? lista[0].pv : lista[0].topV) : 0;

    var t = document.getElementById('autores-tabla');
    if (t) {
      t.innerHTML =
        '<thead><tr><th>#</th><th>Autor y su nota m&aacute;s le&iacute;da</th>' +
        '<th class="analytics-num">Notas</th>' +
        '<th class="analytics-num">' + (orden === 'total' ? 'Pageviews' : 'Su mejor nota') + '</th>' +
        '<th class="analytics-num">' + (orden === 'total' ? 'Promedio' : 'Pico') + '</th>' +
        '<th class="analytics-num">' + (orden === 'total' ? 'Por mejor art&iacute;culo' : 'Por volumen') + '</th>' +
        '</tr></thead><tbody>' +
        lista.map(function (a, i) { return fila(a, i + 1, max); }).join('') +
        '</tbody>';
    }
    var titulo = document.getElementById('autores-titulo');
    if (titulo) titulo.textContent = orden === 'total' ? 'Por volumen' : 'Por mejor artículo';
    var ayuda = document.getElementById('autores-ayuda');
    if (ayuda) ayuda.textContent = AYUDA[orden];
  }

  window.initAutoresDashboard = function () {
    if (iniciado) return;
    iniciado = true;

    var cont = document.getElementById('autores-tabla');
    var toggle = document.getElementById('autores-toggle');
    if (toggle) {
      toggle.addEventListener('click', function (e) {
        var b = e.target.closest('[data-orden]');
        if (!b) return;
        orden = b.getAttribute('data-orden');
        var bs = toggle.querySelectorAll('[data-orden]');
        for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('active', bs[i] === b);
        pintar();
      });
    }

    (window.__ga4Data || Promise.reject(new Error('sin datos')))
      .then(function (d) {
        datos = d && d.autores;
        if (!datos || !datos.lista || !datos.lista.length) {
          // Pasa mientras Render no corrió todavía un refresh con la versión nueva,
          // o si la consulta a Ghost falló en ese refresh. No es un error del navegador.
          if (cont) cont.innerHTML = '<tbody><tr><td>Todavía no hay ranking de autores. ' +
            'Se genera en el próximo refresh de datos (12:00 y 00:00).</td></tr></tbody>';
          return;
        }
        var corte = document.getElementById('autores-corte');
        if (corte) corte.textContent = datos.corte;
        tarjetas(datos);
        pintar();
      })
      .catch(function () {
        if (cont) cont.innerHTML = '<tbody><tr><td>No se pudieron cargar los datos.</td></tr></tbody>';
      });
  };
})();
