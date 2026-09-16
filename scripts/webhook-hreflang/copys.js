/**
 * FUENTE ÚNICA de todos los copys de email.
 *
 * Lo consumen: contenido/automatizacion-emails.js, contenido/crear-campana-engaged.js
 * y el módulo de Render (421-web/scripts/webhook-hreflang).
 *
 * Para editar los textos: tocar ACÁ y solo acá.
 * Para exportar a txt y corregir a mano: node contenido/exportar-copys.js
 */

const SUSCRIBITE = 'https://www.421.news/es/suscribite/';
const REVISTA_URL = 'https://www.421.news/es/revista-421/';
const CANON_URL = 'https://www.421.news/es/canon/';
const RUTAS_URL = 'https://www.421.news/es/rutas/';
const MI_SUSCRIPCION_URL = 'https://www.421.news/es/mi-suscripcion/';

const cta = (texto, campaign) =>
  `<p><a href="${SUSCRIBITE}?utm_source=ghost&utm_medium=email&utm_campaign=${campaign}"><strong>${texto}</strong></a></p>`;

const FIRMA = '<p>Juan Ruocco</p>';

// El argumento de suscripción es uno solo (definido 2026-09-09): las notas no
// tienen paywall y a cada colaborador se le paga, y las dos cosas dependen de
// los suscriptores. Es el mismo texto de la tarjeta de la home y de las notas.
const CORE = '<p>Las notas de 421 no tienen paywall. Y a cada colaborador se le paga por su trabajo. Ambas cosas son muy importantes para nosotros. Por un lado, que la información circule sin restricciones y por el otro, retribuir a cada escritor de forma justa. Para que eso suceda, necesitamos que te suscribas.</p>';

// Placeholders que se completan al enviar (emails-automaticos.js → renderHtml):
//   {{PRECIO}}          línea de precio con los pesos del día (GET /prices de MP)
//   {{CONCILIO_DIA}}    "viernes 18"      ┐ salen de CONCILIO_DETALLES; si la
//   {{CONCILIO_HORA}}   "20:30"           │ fecha no está cargada ahí, los mails
//   {{CONCILIO_LINK}}   link de Meet      ┘ del Concilio NO salen
//   {{REVISTA}}         último número liberado (página revista-421)

const COPYS = {
  // ─────────────────────────────────────────────────────────── núcleo (mensual)
  concilio: {
    nombre: 'Concilio — a registrados, 2 a 7 días antes de cada Concilio',
    asunto: 'Este {{CONCILIO_DIA}} hacemos el Concilio',
    html: `
<p>Hola,</p>
${CORE}
<p>Además, una vez por mes nos juntamos a charlar en el <strong>Concilio</strong>: una videollamada de alrededor de una hora donde hablamos de lo que estamos leyendo, de cómo va 421, de lo que viene y de cómo mejorar lo que hacemos.</p>
<p>El próximo es <strong>este {{CONCILIO_DIA}} a las {{CONCILIO_HORA}}</strong> (hora de Argentina). Si te suscribís antes, el link te espera en tu cuenta.</p>
<p>Suscribirte también te da la Revista 421 un mes antes que al resto y la posibilidad de comentar en las notas.</p>
<p>Contamos con vos para que 421 siga creciendo.</p>
${cta('Suscribirme', 'seg-concilio')}
${FIRMA}`.trim()
  },

  // ───────────────────────────────────── recordatorio a los que YA pagan
  // No vende nada: fecha, hora y link directo. Va por la newsletter
  // "Exclusivo para suscriptores" y al segmento status:-free.
  'concilio-suscriptores': {
    nombre: 'Concilio · recordatorio a suscriptores — mismos días que el mail a registrados',
    asunto: 'El Concilio es este {{CONCILIO_DIA}}',
    html: `
<p>Hola,</p>
<p>Te aviso para que lo agendes: <strong>este {{CONCILIO_DIA}} a las {{CONCILIO_HORA}}</strong> (hora de Argentina) hacemos el Concilio.</p>
<p>Es por Google Meet. Para entrar: <a href="{{CONCILIO_LINK}}"><strong>{{CONCILIO_LINK_TEXTO}}</strong></a></p>
<p>Dura alrededor de una hora y no queda grabado. El link también está en <a href="${MI_SUSCRIPCION_URL}">Mi suscripción</a>, por si lo perdés.</p>
<p>Gracias por sostener 421. Nos vemos el {{CONCILIO_DIA_CORTO}}.</p>
${FIRMA}`.trim()
  },

  // ─────────────────────────── revista (salen solas cuando se sube un número)
  // Placeholders: {{REV_NUEVA}} "#20 - Octubre 2026 - Título", {{REV_NUEVA_N}} "#20",
  // {{REV_LIBRE}} / {{REV_LIBRE_N}} el número anterior, {{REV_PORTADA}} la tapa,
    // El link va SIEMPRE a la página, nunca al PDF: la versión web de los mails de
  // Ghost es pública y reenviarla entregaría el archivo.
  'revista-suscriptores': {
    nombre: 'Revista · a suscriptores — apenas se sube el número nuevo',
    asunto: 'Ya salió el {{REV_NUEVA_N}} de la Revista 421',
    html: `
<p>Hola,</p>
<p>Ya está disponible el <strong>{{REV_NUEVA}}</strong>. Como suscriptor, lo leés un mes antes que el resto.</p>
<p>{{REV_PORTADA}}</p>
<p><a href="${REVISTA_URL}"><strong>Descargalo acá</strong></a> (entrá con tu cuenta de 421).</p>
<p>Gracias por sostener 421.</p>
${FIRMA}`.trim()
  },

  'revista-libre': {
    nombre: 'Revista · a todos los registrados — el martes después del número nuevo',
    asunto: 'El {{REV_LIBRE_N}} ya es gratis (y salió el {{REV_NUEVA_N}})',
    html: `
<p>Hola,</p>
<p>Todos los meses sacamos un número de la <strong>Revista 421</strong>: un PDF armado y diseñado, con lo mejor del mes y material que no está en el sitio.</p>
<p>El <strong>{{REV_LIBRE}}</strong> ya está disponible gratis para todos. <a href="${REVISTA_URL}"><strong>Bajalo acá</strong></a>.</p>
<p>Y ya salió el <strong>{{REV_NUEVA}}</strong>, que durante este mes leen primero los suscriptores.</p>
${CORE}
<p>Contamos con vos para que 421 siga creciendo.</p>
${cta('Suscribirme', 'revista-libre')}
${FIRMA}`.trim()
  },

  // ──────────────────────────────────────────── bienvenida (altas nuevas, drip)
  'bienvenida-1': {
    nombre: 'Bienvenida 1 — semana 1 desde el alta',
    asunto: 'Por dónde se entra a 421',
    html: `
<p>Hola,</p>
<p>Te registraste en 421 hace unos días, así que va una orientación corta.</p>
<p>421 es un medio de orientación intelectual: cultura, tecnología, juegos y vida real, con notas largas que se pueden leer sin apuro.</p>
<p>Si no sabés por dónde empezar, andá a las <a href="${RUTAS_URL}">Rutas</a>: son recorridos temáticos, armados para leer en orden. Elegís el tema que te interese y ya tenés por dónde seguir.</p>
<p>Nada más por ahora. Leé tranquilo.</p>
${FIRMA}`.trim()
  },

  'bienvenida-2': {
    nombre: 'Bienvenida 2 — semana 2 desde el alta. Da algo, no pide nada.',
    asunto: 'Bajate una revista, va de regalo',
    html: `
<p>Hola,</p>
<p>Hacemos una revista todos los meses: un PDF armado y diseñado, con lo mejor de 421 y material que no está en el sitio. Números especiales sobre inteligencia artificial, sobre manga, sobre ruinas digitales.</p>
<p><a href="${REVISTA_URL}">Están casi todos disponibles gratis</a>, así que agarrá el que más te llame y llevátelo.</p>
<p>Con tu cuenta ya alcanza para bajarlos. Ya estás.</p>
${FIRMA}`.trim()
  },

  'bienvenida-3': {
    nombre: 'Bienvenida 3 — semana 4 desde el alta (el que vende)',
    asunto: 'Cómo se sostiene 421',
    html: `
<p>Hola,</p>
<p>Ya llevás un mes leyendo 421, así que te cuento cómo funciona por dentro.</p>
${CORE}
<p>A los suscriptores los veo una vez por mes en el <strong>Concilio</strong>: una videollamada de alrededor de una hora donde charlamos de lo que estamos leyendo, de cómo va 421 y de en qué nos equivocamos. No queda grabado, así que lo que se dice ahí queda entre los que están.</p>
<p>Suscribirte también te da la Revista 421 un mes antes que al resto y la posibilidad de comentar en las notas.</p>
{{PRECIO}}
${cta('Suscribirme', 'drip-concilio')}
${FIRMA}`.trim()
  },

  'bienvenida-4': {
    nombre: 'Bienvenida 4 — semana 6 desde el alta (cierre)',
    asunto: 'Última vez que te escribo por esto',
    html: `
<p>Hola,</p>
<p>Es la última vez que te escribo para invitarte a suscribirte. Si no es el momento, está todo bien: 421 sigue abierto y vas a poder leer todo igual.</p>
${CORE}
<p>Con la suscripción entrás al Concilio (una videollamada por mes conmigo), leés la revista un mes antes y podés comentar en las notas.</p>
{{PRECIO}}
${cta('Suscribirme', 'drip-cierre')}
<p>Gracias por leer.</p>
${FIRMA}`.trim()
  },

  // ────────────────────────────────────────────────── cold (cada 12 semanas)
  cold: {
    nombre: 'Cold — reactivación, cada 12 semanas. SIN venta, a propósito.',
    asunto: '¿Seguís queriendo recibir esto?',
    html: `
<p>Hola,</p>
<p>Te anotaste en 421 hace un tiempo y desde entonces no abriste casi ninguno de estos mails. Puede ser que ya no te interese, que te caiga en spam, o que simplemente no era el momento.</p>
<p>Cualquiera de las tres está bien. Solo quiero saber cuál.</p>
<p>Si querés seguir recibiendo 421, no tenés que hacer nada: con que abras este mail alcanza.</p>
<p>Y si querés retomar por algún lado, las <a href="${RUTAS_URL}">Rutas</a> son recorridos temáticos para leer en orden, sin tener que elegir por dónde empezar.</p>
${FIRMA}`.trim()
  }
};

module.exports = { COPYS, CORE, SUSCRIBITE, REVISTA_URL, CANON_URL, RUTAS_URL, cta, FIRMA };
