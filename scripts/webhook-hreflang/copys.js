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

const COPYS = {
  // ─────────────────────────────────────────────────────────── núcleo (mensual)
  concilio: {
    nombre: 'Concilio — sale 2 a 7 días antes de cada Concilio',
    asunto: 'Hace un tiempo que no te escribo',
    html: `
<p>Hola, ¿cómo va?</p>
<p>Hace un tiempo que no te escribo. Hoy vuelvo por algo puntual.</p>
<p>Una vez por mes estamos haciendo el <strong>Concilio</strong>: un vivo de alrededor de una hora entre los suscriptores de 421 y yo. Se habla de lo que estamos leyendo, de cómo va el proyecto, los pasos a seguir, de en qué nos equivocamos.</p>
<p>No queda grabado: lo que se dice ahí queda entre los que están.</p>
<p><strong>Este domingo tenemos uno.</strong></p>
<p>Además, suscribirse te permite:</p>
<ul>
  <li>Leer la Revista 421 en PDF un mes antes de que se libere al público</li>
  <li>Comentar y discutir en cada nota</li>
  <li>Acceder a la app de Magic para gestión de colecciones</li>
</ul>
<p>Cuesta <strong>US$10 por mes</strong> o <strong>US$100 por año</strong>. Desde Argentina, con MercadoPago, son <strong>$15.100 por mes</strong>.</p>
${cta('Suscribirme', 'seg-concilio')}
<p>Si preferís seguir leyendo gratis: 421 sigue abierto. Esto es para el que ya viene leyendo hace rato y alguna vez pensó en dar el paso.</p>
${FIRMA}`.trim()
  },

  // ───────────────────────────────────── recordatorio a los que YA pagan (225)
  // No vende nada: solo avisa que el Concilio es el domingo y dónde está el
  // link, porque la vez pasada varios no lo encontraron. Va por la newsletter
  // "Exclusivo para suscriptores" y al segmento status:-free.
  'concilio-suscriptores': {
    nombre: 'Concilio · recordatorio a suscriptores — mismos días que el mail del núcleo',
    asunto: 'El Concilio es este domingo',
    html: `
<p>Hola,</p>
<p>Te aviso para que lo agendes: <strong>este domingo a las 18:00</strong> (hora de Argentina) hacemos el Concilio.</p>
<p>El link para entrar está en tu cuenta, en <a href="${MI_SUSCRIPCION_URL}">Mi suscripción</a>. Es el mismo lugar donde tenés la revista y la app de Magic.</p>
<p>La vez pasada varios no lo encontraron, así que ahí va el atajo directo.</p>
<p>Nos vemos el domingo.</p>
${FIRMA}`.trim()
  },

  revista: {
    nombre: 'Revista — sale a mitad de ciclo, 12 a 18 días después del Concilio',
    asunto: 'El número nuevo sale primero para suscriptores',
    // {{REVISTA}} se reemplaza en tiempo de envío con el último número liberado,
    // leído de la página de Ghost. Si no se puede leer, la línea se omite entera.
    html: `
<p>Hola,</p>
<p>Todos los meses sacamos un número de la <strong>Revista 421</strong>: un PDF armado y diseñado, con lo mejor del mes y material que no está en el sitio.</p>
<p>Sale primero para los suscriptores. Un mes después se libera para todos.</p>
<p>{{REVISTA}}</p>
<p>Los números viejos quedan disponibles gratis, así que si nunca bajaste uno, empezá por ahí: <a href="${REVISTA_URL}">están todos acá</a>. Lo que se reserva es el último.</p>
<p>Suscribirse también da entrada al Concilio (el vivo mensual que no queda grabado), poder comentar en las notas, y la app de Magic para gestión de colecciones.</p>
<p>US$10 por mes o US$100 por año. Desde Argentina, $15.100 por mes.</p>
${cta('Suscribirme', 'seg-revista')}
${FIRMA}`.trim(),
    revistaLinea: 'El último que ya se liberó es el <strong>{{TITULO}}</strong>. El que le sigue lo están leyendo los suscriptores.'
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
<p>Es tuyo, no hay que registrarse en nada ni dejar ningún dato. Ya estás.</p>
${FIRMA}`.trim()
  },

  'bienvenida-3': {
    nombre: 'Bienvenida 3 — semana 4 desde el alta (el que vende)',
    asunto: 'El domingo no queda grabado',
    html: `
<p>Hola,</p>
<p>Una vez por mes hacemos el <strong>Concilio</strong>: un vivo de alrededor de una hora donde contamos en qué anda 421, qué vamos a escribir, en qué nos equivocamos. Se responden las preguntas que aparecen en el chat.</p>
<p>No queda grabado. Si no estuviste, lo perdiste. Es la única parte de 421 que no se puede leer después.</p>
<p>El link es solo para suscriptores. Suscribirse también da:</p>
<ul>
  <li>Leer la Revista 421 en PDF un mes antes de que se libere al público</li>
  <li>Comentar y discutir en cada nota</li>
  <li>Acceder a la app de Magic para gestión de colecciones</li>
</ul>
<p>Cuesta <strong>US$10 por mes</strong> o <strong>US$100 por año</strong>. Desde Argentina, con MercadoPago, son <strong>$15.100 por mes</strong>.</p>
${cta('Suscribirme', 'drip-concilio')}
${FIRMA}`.trim()
  },

  'bienvenida-4': {
    nombre: 'Bienvenida 4 — semana 6 desde el alta (cierre)',
    asunto: 'Última vez que te escribo por esto',
    html: `
<p>Hola,</p>
<p>Es la última vez que te escribo para invitarte a suscribirte. Si no es el momento, no pasa nada: 421 sigue abierto y vas a poder leer todo igual.</p>
<p>Por si el momento es ahora: son US$10 por mes ($15.100 desde Argentina), y con eso entrás al Concilio, leés la revista un mes antes y podés comentar en las notas.</p>
${cta('Suscribirme', 'drip-cierre')}
<p>Y si te quedás gratis, también está bien. Gracias por leer.</p>
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
<p>Si no, hay un link para darte de baja al final y listo, sin vueltas.</p>
<p>Y si querés retomar por algún lado, las <a href="${RUTAS_URL}">Rutas</a> son recorridos temáticos para leer en orden, sin tener que elegir por dónde empezar.</p>
${FIRMA}`.trim()
  }
};

module.exports = { COPYS, SUSCRIBITE, REVISTA_URL, CANON_URL, RUTAS_URL, cta, FIRMA };
