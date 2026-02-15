#!/usr/bin/env python3
"""
Import Página 12 articles (batch 2) into Ghost as drafts.
15 articles from author pages 2-3 + Web Archive.
User directive: title, subtitle, body text, images only. No disclaimers.
"""

import json
import jwt
import time
import urllib.request
import urllib.error
import ssl

GHOST_URL = 'https://421bn.ghost.io'
ADMIN_KEY = 'GHOST_ADMIN_API_KEY_REDACTED'
AUTHOR_ID = '66ce429421c1a70001f25110'  # Juan Ruocco


def get_token():
    key_id, secret = ADMIN_KEY.split(':')
    iat = int(time.time())
    payload = {'iat': iat, 'exp': iat + 300, 'aud': '/admin/'}
    return jwt.encode(payload, bytes.fromhex(secret), algorithm='HS256',
                      headers={'kid': key_id})


def create_post(title, slug, html, subtitle, date):
    token = get_token()
    post_data = {
        'posts': [{
            'title': title,
            'slug': slug,
            'html': html.strip(),
            'status': 'draft',
            'authors': [{'id': AUTHOR_ID}],
            'tags': [{'name': '#es'}],
            'published_at': date,
            'custom_excerpt': subtitle[:300] if subtitle else None,
        }]
    }
    data = json.dumps(post_data).encode('utf-8')
    ctx = ssl.create_default_context()
    req = urllib.request.Request(
        f'{GHOST_URL}/ghost/api/admin/posts/?source=html',
        data=data,
        headers={
            'Authorization': f'Ghost {token}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, context=ctx) as resp:
            result = json.loads(resp.read())
            post = result['posts'][0]
            print(f'  OK: {post["title"]} (id: {post["id"]})')
            return True
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f'  ERROR {e.code}: {body[:300]}')
        return False


ARTICLES = [
    # ── 1. Fall Guys ──
    {
        'title': 'Por qué Fall Guys es el juego más adictivo y popular del momento',
        'slug': 'p12-por-que-fall-guys-es-el-juego-mas-adictivo-y-popular-del-momento',
        'subtitle': '60 minions coloridos en escenarios enclences que ponen a prueba la paciencia. Y un solo requisito: nunca dejarse venir abajo.',
        'date': '2020-08-21T19:29:00.000Z',
        'html': """
<p>"The name of the game is the game", solía afirmar Peter Main, vicepresidente ejecutivo de márketing de Nintendo América entre fines de los '80 y principios de los '90. Basta con recordar los títulos icónicos de esa generación para entender el punto: Mortal Kombat, Street Fighter, Streets of Rage. El nombre del juego era el juego. Fall Guys, como dice su título, es un videojuego sobre ¿criaturas? que se caen al vacío. Pero con una excepción: el último en quedar en pie se lleva la corona.</p>

<p>Nuestro personaje, que parece un minion, compite contra otros 59 pendorchos coloridos por ser el último en quedar en pie. Tenemos brazos, piernas y disfraces que se pueden cambiar a medida que se sube de nivel, o se pueden comprar. Pero que no influyen en nada en la mecánica del juego, que ya de por sí es muy sencilla.</p>

<p>Solo hay cuatro movimientos: caminar, saltar, agarrar y tirarse de palomita. Nuestra misión es superar cinco niveles en los que sucesivamente se elimina un tercio de los jugadores. Una eliminación, una caída del mapa y estás fuera. A empezar todo desde el principio.</p>

<h2>Cada derrota es un bajón</h2>

<p>Los niveles a superar son escenarios complejos en los cuales hay que seguir un patrón repetitivo mientras se corre contra otros 59 jugadores intentando hacer lo mismo. A veces es una carrera de obstáculos, otras es una lucha en equipos para meter pelotas en arcos gigantes y hasta en algunos escenarios hay juegos que implican usar la memoria.</p>

<p>La sencillez y la repetición son las claves del juego. Durante cada competencia, los niveles de dopamina se disparan al techo: el cuerpo está tensionado, los sentidos afiladísimos, el cronómetro es una espada de Damocles sobre nuestro sistema nervioso central.</p>

<p>Cada derrota es un bajón, sólo superado por el rush que implica volver a jugar. A medida que se avanza en el juego, se van conociendo casi todos los escenarios y se van aprendiendo trucos para lograr mejores rendimientos en cada uno.</p>

<p>Por último está el componente corporal. El personaje que manejamos, al intentar hacer lo mismo que otros 59, muchas veces se encuentra en situaciones tipo embudo: con muchos jugadores intentando pasar por el mismo punto. Lejos de ser una falencia del juego, es una virtud pues dispara en nuestro cerebro esa misma señal de apretón que sentimos al bajar en la estación Pellegrini de la línea B un martes a las 9 de la mañana.</p>

<p>Jugar Fall Guys es, en pocas palabras, adictivo.</p>

<h2>Una corona para gobernarlos a todos</h2>

<p>Pero esto de por sí no explicaría el éxito arrasador que viene demostrando el juego. Si usamos como parámetro de popularidad la cantidad de viewers que tiene el juego en la plataforma Twitch, podemos sostener que es el juego más popular del momento.</p>

<p>La cantidad de usuarios viendo al mismo tiempo gameplays del juego suele oscilar entre los 150 mil y 300 mil, dejando atrás a todos los tanques como Fortnite, CS:GO, League of Legends, GTA V o Call of Duty. Incluso superando la categoría Just Chatting, la de mayor crecimiento en lo que va de la pandemia.</p>

<p>El hecho de estar disponible gratis para los jugadores de PS4, implica contar con un caudal extra, como pasó con los casos de Fortnite y Call of Duty: Warzone. Para PC, hoy se consigue en Steam a $720.</p>

<p>Además, la sencillez del juego es abrumadora. Quienes se sientan oxidados por años de no tocar un videojuego no teman: si de chicos jugaron un poco al Super Mario Bros, al Sonic o al ¿Tetris?, no van a tardar más de dos minutos en sentirse expertos, con la chance de ganar la ansiada corona.</p>

<p>Fall Guys es un juego para todas y todos: desde jugadores hardcore a neófitos. Y un tip: si tenés la suerte de estar con compañía, la experiencia positiva del juego se multiplica exponencialmente.</p>

<p>Pero tampoco nos engañemos. Fall Guys no va a revolucionar la industria y lo más probable es que sea una moda pasajera como tantas otras. Sin embargo, eso no quita que sea un juego excelente.</p>

<p>Si no jugás Fall Guys no te perdés de absolutamente nada. Ahora, si te enganchás un rato puede ser un paliativo increíble para esta situación de pandemia, encierro y sala de ensayo. En definitiva, Fall Guys es como una versión multijugador del Mario Party, pero rodeado de millones de jugadores online. Un videojuego interminable para días interminables.</p>
""",
    },

    # ── 2. Armas 3D ──
    {
        'title': 'Armas 3D: ni patrón ni estado ni número de serie',
        'slug': 'p12-armas-3d-ni-patron-ni-estado-ni-numero-de-serie',
        'subtitle': 'En comunidades y foros web circulan planos para fabricar todo tipo de pistolas y rifles casi por completo en impresoras 3D.',
        'date': '2020-06-27T21:08:00.000Z',
        'html': """
<p><strong>Defense Distributed (DD)</strong> es una empresa con un camino de al menos siete años en la creación de "armas fantasmas". Esto es armas creadas por usuarios y sin número de serie. En 2013 el presidente de DD, Cody Wilson, publicó los planos de la Liberator, la primera pistola impresa casi en su totalidad (al 99%) en una impresora 3D. Un arma rudimentaria, con más elementos en común con un pistolón que con una pistola o un revólver, y que sin embargo fue el puntapié inicial para que el movimiento despegue.</p>

<p>Así DD pasó a constituirse, durante un tiempo, en un actor fundamental de la escena y construyó un incipiente negocio basado en dibujar planos digitales de cada arma y compartirlos en internet. Así este movimiento se ganó el mote de <em>wiki weapons</em> en referencia a la similaridad con la famosa enciclopedia libre.</p>

<p>Pese a los avances conseguidos, varias partes cruciales de armas seguían siendo necesarias en aluminio, dado que los polímeros de las impresoras eran insuficientes para soportar la fuerza que generaba un disparo. Para sortear este obstáculo, DD sacó su propio hardware: un CNC (una especie de torno computarizado) muy pequeño que permite crear las piezas clave desde la comodidad de la casa.</p>

<p>Con todo esto Cody Wilson, individualista radical (¿anarco-capitalista, cripto-anarquista?), llamó la atención del gobierno de Estados Unidos. Lo que sumergió a DD en una serie de litigaciones contra el Departamento de Estado, en primer lugar, y luego contra el estado de Washington.</p>

<p>En 2018, además, Wilson fue encontrado culpable de haberle ofrecido 500 dólares para tener sexo a una chica de 16 años que conoció en el sitio web <em>Sugar Daddy Meet</em>. Mientras que el fundador de DD sostuvo que toda la causa estaba armada por el gobierno federal, la justicia estadounidense lo encontró culpable y lo sentenció a siete años de trabajo comunitario y una multa de 1,2 millones de dólares.</p>

<h2>La bala que esquivaba estados</h2>

<p>Pero la comunidad de impresión tridimensional de armas siguió creciendo y tomó un camino separado del de Wilson y su compañía. <strong>Ctrl+Pew</strong> es una de las cuentas de Twitter más activas de este ramo, y bajo el lema Deterrence Dispensed (algo así como "dispensario de disuasión") muestra los avances de la comunidad, entre ellos la impresión total de una pistola Glock.</p>

<p>Si bien la mayor parte de la pistola puede ser impresa, según la información disponible es necesario agregar unos 400 dólares en partes no imprimibles para tener el arma completa y funcional. Como sostienen desde la cuenta, la principal ventaja no es el precio sino el hecho de tener un arma que esquivó todos los conductos burocráticos del estado.</p>

<p>No es casual que muchos de los usuarios de la comunidad de armas impresas también sean entusiastas de las criptomonedas. Ambas tecnologías comparten raíces filosóficas como la descentralización. En cierta medida Bitcoin puede considerarse un desafío abierto al monopolio del estado en la creación del dinero. La impresión de armamento también es una afrenta directa contra el estado, dado que los usuarios pueden tener un arma completamente funcional sin que el gobierno lo sepa.</p>

<p>El principal argumento de la comunidad de impresores es que cualquier tipo de prohibición genera a la vez un mercado negro y que los criminales, tarde o temprano, encuentran la forma de acceder a un arma. Mientras que la respuesta por parte de diferentes estados fue la política de desarme, los cripto-anarquistas prefieren responder escalando la situación: este movimiento no tiene jefes, ni dueños, ni regulación. A lo sumo podemos encontrar miembros más activos en una comunidad cuya vitalidad está determinada por la fortaleza de la conexión entre los nodos.</p>

<p>La tendencia a una individualidad radical va en aumento, y para estas comunidades todo --menos la propiedad privada-- está puesto en cuestión. Mientras tanto, la tecnología crea nuevas realidades políticas. ¿O la política crea nuevos usos de la tecnología?</p>
""",
    },

    # ── 3. Elon Musk / SpaceX ──
    {
        'title': 'Elon Musk, SpaceX y la parábola del espacio en la cultura pop',
        'slug': 'p12-elon-musk-spacex-y-la-parabola-del-espacio-en-la-cultura-pop',
        'subtitle': 'Las andanzas del magnate apuntalan una época que tiene a la tecnología espacial en el centro de juegos, series y animaciones.',
        'date': '2020-06-04T18:18:00.000Z',
        'html': """
<p>El sábado pasado SpaceX, la empresa de tecnología espacial de Elon Musk, logró otro hito: por primera vez una compañía privada logró llevar dos astronautas a la estación espacial internacional. Estados Unidos recuperó esta capacidad estratégica luego de nueve años de usar los servicios de la agencia espacial de la Federación Rusa y sus híper confiables naves Soyuz.</p>

<p>Para esta misión, SpaceX usó su cohete reutilizable Falcon 9, cuyo sistema de propulsión se puede recuperar y usar más de una vez, reduciendo de forma significativa el costo de cada misión. Este lanzamiento, para nada menor, se inscribe en un plan mucho más grande que involucra a la NASA y a SpaceX y que tiene como destino final crear un sistema de transporte espacial fiable para enviar (y traer de vuelta) una misión tripulada a Marte. El nombre del proyecto es Artemis, y su próximo objetivo significativo es lograr que vuelvan las misiones tripuladas a la Luna.</p>

<h2>Mecánica espacial para millennials</h2>

<p>Quienes crecimos demasiado tarde como para ver la llegada del Apollo 11 a la Luna tuvimos que conformarnos con la era del transbordador espacial, la exploración del espacio cercano y las misiones robóticas. Los treintañeros crecimos con la no épica del transbordador espacial, cuyos picos de popularidad fueron los desastres del Challenger (que explotó 73 segundos después del despegue) y el Columbia (que se desintegró en el reingreso a la Tierra).</p>

<p>Así y todo, el transbordador fue un símbolo para millennials: desde tener su propio modelo de Playmobil hasta aparecer en varias películas como Space Cowboys, pasando por apariciones en videojuegos como The Dig.</p>

<p>Sin la competencia de la Guerra Fría, la exploración espacial parecía estancada. Y si bien en ese período las agencias espaciales de Europa, Rusia y China consolidaron sus operaciones en el espacio, ninguna pudo competir con la influencia en la cultura popular de la NASA, que contó con toda la maquinaria publicitaria de las usinas creativas estadounidenses. Y su rol en la industria aeroespacial sigue siendo clave tanto por su liderazgo en el desarrollo de tecnología como por esa capacidad de movilizar la imaginación de millones de personas alrededor del mundo.</p>

<p>Pero, durante muchos años, el declive del espacio como lugar imaginario dentro de la cultura de masas marcó un poco una época: Los Simpson, Padre de familia, todas las series de Nickelodeon y demás consumos apuntados a los jóvenes tenían un claro tinte costumbrista. La excepción fue Futurama, que se convirtió en un éxito de culto aunque no pudo competir con el éxito de su hermano mayor, Los Simpson. También estuvieron Battlestar Galactica, otra serie de culto, y la fallida Firefly de Joss Whedon.</p>

<h2>Elon Musk, el magnate sci-popero</h2>

<p>La aparición de Elon Musk en la escena espacial rompió esa inercia. El que una empresa privada se hiciera responsable de algo que siempre había sido potestad de los estados nacionales encendió un nuevo debate entre aquellos que querían ver a Musk cumplir sus promesas y los que deseaban verlo fracasar. Como sabemos, la polémica genera engagement, y Musk resultó ser un maestro en el arte de convertir sus dispositivos tecnológicos en artefactos publicitarios. ¿Qué mejor publicidad que empujar las fronteras de la civilización?</p>

<p>No es casual que después de que SpaceX logró por primera vez recuperar un cohete y reutilizarlo en un lanzamiento, en 2010, el espacio volvió a convertirse en un escenario narrativo. De la mano de Gravity, Interstellar, The Martian y Ad Astra, el espacio y los astronautas volvieron a las pantallas de los cines. Junto a esto, en la pantalla chica se dio una explosión de series animadas donde el espacio juega un rol importante, desde Final Space hasta Rick & Morty, donde los tropos de la ciencia ficción rompieron la inercia costumbrista.</p>

<p>En 2017 el ex niño mimado de Silicon Valley, devenido en Hank Skorpio, reveló su plan de colonizar Marte. Desde entonces el planeta rojo volvió a estar en el horizonte de lo posible, tanto en lo técnico como en la narrativa. En 2019, SpaceX aprovechó una misión de prueba para poner a orbitar un convertible eléctrico roadster de Tesla, la compañía de automóviles eléctricos también propiedad de Musk, mientras era transmitido en vivo con música de David Bowie de fondo.</p>

<p>La tecnología como publicidad en su punto culmine: incluso el propio Musk se volvió una máquina de generar debates y controversias dada su poca ortodoxa forma de llevar adelante sus negocios y su vida. Desde fumar porro en vivo en el podcast de Joe Rogan o casarse con la artista pop Grimes, hasta bautizar a su hijo con el nombre de X AE A-12 o incluso hablar de "red pills" en su cuenta de Twitter. Musk es su propia marca.</p>

<h2>El próximo gran paso</h2>

<p>En 2019, Donald Trump instó a la conducción política de la NASA a que acelere sus planes de llegar a Marte. La agencia ya venía trabajando en un plan completo, un nuevo sistema de lanzamiento y transporte, y misiones de prueba a la Luna, con estación espacial incluida. ¿El lema? "El próximo gran paso".</p>

<p>Con este nuevo impulso y aprovechando la sinergia con contratistas privados como Musk o la empresa Boeing (uno de los proveedores históricos de la NASA así como de aviones de guerra), el presidente estadounidense puso el objetivo de pisar Marte antes de 2030.</p>

<p>Esto marca el comienzo de una nueva etapa en la exploración espacial y la posibilidad de que, finalmente, quienes crecimos en la época de los últimos vestigios de la carrera espacial podamos ver de nuevo semejante maquinaria tecno-social en movimiento. Y ver un ser humano poner un pie en superficie marciana.</p>
""",
    },

    # ── 4. Brave ──
    {
        'title': 'Brave: premios en criptomoneda por usar internet',
        'slug': 'p12-brave-premios-en-criptomoneda-por-usar-internet',
        'subtitle': 'El browser paga en su propia cripto y promueve usarla para darles propinas a tus sitios y creadores de contenidos favoritos.',
        'date': '2020-04-24T17:40:00.000Z',
        'html': """
<p>Navegar internet hoy se parece a caminar por las grandes avenidas de Buenos Aires hace unas décadas. Casi cada píxel parece estar dedicado a "vender publicidad", y con razón: es el negocio más rentable de internet. Google ganó 160 mil millones de dólares en 2019 solamente con la venta de publicidad. Facebook se acercó a los 17 mil millones. "Internet", ese reino de libertad ilimitada y conocimiento infinito, terminó convirtiéndose en un cartel publicitario.</p>

<p>Mientras tanto, los usuarios navegamos la web (que pagamos), hacemos click en links y banners desde dispositivos que compramos, y los plutócratas de Silicon Valley se enriquecen. Sin embargo, queda esperanza: el programador Brendan Eich, creador de JavaScript y cofundador de la Mozilla Foundation, lanzó un nuevo browser llamado Brave que bloquea la publicidad por defecto y recompensa a los usuarios con valor en criptomoneda.</p>

<p>Mientras que las "condiciones y términos" actualizadas de Google en marzo ahora permiten a Google usar todos tus datos, recopilados desde cualquier plataforma para cualquier propósito, este nuevo browser --basado en Chromium, el propio código de Chrome-- mejora la privacidad y la seguridad, bloqueando la publicidad invasiva. Si bien otros navegadores como Chrome y Firefox ofrecen funcionalidad similar a través de complementos, tenerlo como una función por defecto en Brave brinda una mejor experiencia y evita problemas de compatibilidad.</p>

<h2>Los cripto-entusiastas de internet</h2>

<p>El browser de Eich cuenta con un sistema de recompensas para los usuarios basado en BAT (basic attention token), un token que opera en la blockchain de Ethereum. Los usuarios que aceptan ver publicidad reciben mensualmente tokens convertibles a dólares. Además, los BAT ganados permiten contribuir a creadores de contenido: actualmente disponible en YouTube, Twitter, Vimeo, Twitch, Reddit, Github y sitios web. Así, Brave presenta una alternativa descentralizada a servicios como Patreon, que no funciona ampliamente en Argentina ya que requiere cuentas extranjeras para cobrar.</p>

<p>Crear una billetera de criptomonedas es el único requisito para ganar recompensas. Brave (disponible para Android, iOS, OSX, Windows y Linux) se asoció con una empresa que provee una billetera fácil de usar: Uphold. Este periodista recibió 2,7 BAT después de dos meses de navegación. Al tipo de cambio actual, eso son apenas cincuenta centavos. No te vas a hacer millonario usando Brave, pero lo más interesante es que su enfoque invierte la ecuación, ofreciendo la posibilidad de ganar algo de moneda. Además, los anuncios aparecen como notificaciones, sin afectar la interfaz de navegación de Brave.</p>

<p>Aunque todavía está en desarrollo, ganar recompensas se hizo posible hace meses, lo que le dio un impulso significativo. La empresa anunció haber alcanzado 10 millones de usuarios, lo que representa un crecimiento del 19 por ciento desde la versión 1.0. Si bien Eich no es el Che Guevara y Brave no es la herramienta definitiva para la revolución socialista, como solución técnica que beneficia a los usuarios, funciona bastante bien.</p>
""",
    },

    # ── 5. Coronavirus y cripto ──
    {
        'title': 'Coronavirus y otra oportunidad de entrar a las criptomonedas',
        'slug': 'p12-coronavirus-y-otra-oportunidad-de-entrar-a-las-criptomonedas',
        'subtitle': '¿Querías invertir en bitcoins pero te resultaba demasiado caro? Con el precio en baja, te contamos cómo comprar tus criptos.',
        'date': '2020-03-13T20:39:00.000Z',
        'html': """
<p>La crisis mundial desatada por la epidemia de coronavirus Covid-19 golpeó todos los aspectos de una economía globalizada casi en su totalidad. La interdependencia que genera un mercado internacional de este tipo, enhebrado entre varios países e industrias, se convirtió en una pesadilla logística, industrial y social. Y el mercado financiero global no fue la excepción: entre el lunes 9 y el jueves 12 de marzo, Wall Street reportó una caída por un total de 500 mil millones de dólares. En un mercado donde todos los inversores salieron a quemar sus activos a cambio de efectivo, Bitcoin y otras criptomonedas no fueron la excepción. Pero pese a las apariencias, esto abrió una posibilidad interesante para quienes quieran sumarse al mundo cripto.</p>

<p>Las acciones de las empresas más importantes del mundo se desplomaron y los inversores salieron a vender con tal de obtener efectivo a cambio, sin importar el nivel de pérdidas asumido. La reserva federal de Estados Unidos anunció que inyectará 1,5 billones de dólares en crédito durante los próximos tres meses para contener la situación. En la misma dirección, las criptomonedas y en particular Bitcoin sufrieron una caída importantísima, siendo la de ayer la más pronunciada: este jueves negro la principal criptomoneda perdió el 50 por ciento de su valor y tocó un piso de 3800 dólares. Ya al cierre de este artículo la moneda se había recuperado un poco y cotizaba en una franja entre los 5000 y los 5500 dólares.</p>

<p>En primer lugar, el precio vuelve a tocar un piso como en abril de 2019, lo cual abre una ventana para los inversores que querían entrar pero veían el activo muy caro: hace apenas un mes estaba cerca de los 10 mil dólares. Por otro lado, cerca del 18 de mayo de este año, la cantidad de bitcoins que se darán como recompensa a los mineros se reducirá a la mitad y pasará de 12.5 a 6.25 por bloque minado. Este evento conocido como halving ya ocurrió en otras oportunidades y el resultado fue, en el largo plazo, un mercado alcista. Por lo tanto, esta combinación de precio bajo más un halving cerca puede ser una buena oportunidad para los que quieran probar comprar Bitcoin, esperar unos meses y vender en un escenario alcista. Cabe recordar que cada bitcoin se puede dividir en 100 millones de partes, por lo cual se puede comprar casi cualquier suma de la criptomoneda, no es necesario comprar uno entero.</p>

<h2>Cómo comprar criptomonedas online</h2>

<p>La forma más sencilla de comprar criptomonedas es a través de un broker, es decir alguna de las plataformas de compra-venta que funcionan como casas de cambio digitales aunque, en vez de vender dólares, euros o reales, venden criptos. En Argentina hay tres servicios confiables: Ripio, Satoshi Tango y Bitex. Para usarlas hay que ser mayor de 18 años, registrarse y validar la identidad con un proceso que incluye sacarse una selfie, cargar imágenes del DNI, verificar un email y un teléfono. El alta puede demorar hasta 48 horas.</p>

<p>Una vez que el perfil está verificado hay que cargar dinero a la cuenta por transferencia o MercadoPago, o en efectivo en locales de cobro de servicios como RapiPago o PagoFácil. Ripio ofrece a la venta Bitcoin, Ether y Dai; Satoshi Tango tiene Bitcoin, Bitcoin Cash, Ether y Litecoin; y Bitex solo Bitcoin. El mínimo para operar está alrededor de los $1000. Y estas plataformas también funcionan como billeteras, lo que permite dejar el valor en cripto guardado ahí si no se tiene mucha experiencia o planes concretos.</p>

<p>Aunque es el más sencillo y rápido, este sistema tiene dos contras. Por un lado se pierde el anonimato, ya que se nos requieren toda nuestra información personal. Y por el otro hay cierta pérdida del control sobre las cripto al dejarlas en manos de terceros, aunque se resuelve si una vez compradas las transferimos a una billetera propia. Con los criptobrokers, si bien ganamos facilidad a la hora de comprar, también perdemos algunas de las características más atractivas del mundo cripto.</p>

<h2>Compra de cripto de usuario a usuario</h2>

<p>El otro método que existe es comprarle directamente a otro usuario. Existe más de una forma de encontrar un vendedor. Una de las más destacadas es LocalBitcoins, una página que conecta usuarios que quieren comprar y vender, para que hagan el negocio fuera de la plataforma. Además, cada usuario cuenta con un sistema de reputación para evitar problemas. Desde hace un tiempo, a raíz de un cambio de normativa, LocalBitcoins les exige a sus usuarios someterse a un proceso de verificación. De esta forma, la plataforma perdió su costado más interesante.</p>

<p>Otra forma es meterse en grupos de Facebook como Bitcoin Argentina, que funciona como canal para acercar compradores y vendedores. El grupo es cerrado y tiene una moderación bastante fuerte, y sus usuarios lo usan además como canal de consultas sobre criptomonedas en general. También en Telegram existen otros grupos como Crypto P2P.</p>

<p>Si bien la compra-venta de usuario a usuario conserva el anonimato y el control sobre nuestras criptos, estas operaciones pueden ser un poco más riesgosas al no conocer a la contraparte y no saber de sus intenciones. Por eso, siempre se recomienda hacer este tipo de transacciones en lugares públicos, donde es más difícil que pueda suceder un robo o algo por el estilo. Además, tené en cuenta siempre que las transacciones de Bitcoin son irreversibles y públicas, por lo cual una vez realizada la misma tenemos una seguridad total de que el activo digital pasó a ser nuestro.</p>
""",
    },

    # ── 6. Fishman / Transparencia ──
    {
        'title': '"Necesitamos más transparencia para saber cómo se manejan las corporaciones y el gobierno"',
        'slug': 'p12-necesitamos-mas-transparencia-corporaciones-gobierno',
        'subtitle': 'Entrevista a Andrew Fishman, periodista de The Intercept.',
        'date': '2019-08-18T03:00:00.000Z',
        'html': """
<p>En 2016, Andrew Fishman dejó la producción del programa matutino de la National Public Radio de Estados Unidos, con una audiencia semanal de 30 millones de personas, para unirse al sitio de noticias The Intercept. A cargo de este medio está Glenn Greenwald, quien dio a conocer el caso de Edward Snowden y todos los documentos filtrados de la National Security Agency (NSA). The Intercept se caracteriza por tener una línea editorial áspera, sin reservas, frontal y agresiva, y sobre esa misión vendrá Fishman a hablar en la próxima MediaParty, el encuentro que bajo el lema "Reiniciando el periodismo" reunirá entre el 29 y el 31 de agosto a programadores, comunicadores, investigadores, diseñadores, analistas y desarrolladores en la Ciudad Cultural Konex.</p>

<p>Fishman fue el responsable de sacar a la luz una serie de audios y documentos que mostraban al mundo la cara más oscura del Lava Jato. Alejado de su misión y sus competencias originales, el Tribunal encargado de desarmar el caso de corrupción más grande de la historia de Brasil evolucionó en un organismo con agenda propia. Así se convirtió en un actor político que tomó decisiones que marcaron el rumbo de la vida del país vecino: el juicio político a Dilma Rousseff, el ascenso de Michel Temer a la presidencia, la cárcel para Lula Da Silva y el ascenso de Jair Bolsonaro como presidente.</p>

<p>La aventura culminó con Sergio Moro, principal figura en el armado del Lava Jato, como ministro de Justicia de Brasil, y con una carrera política promisoria. Hasta que apareció Fishman. Las revelaciones de The Intercept dejaron a la luz que en el proceso Lava Jato violó sus competencias, rompió el principio de separación de poderes y favoreció a sus aliados omitiendo importantes pistas dentro de la investigación. Actitudes que no se condecían con la imagen de organismo tecnocrático y neutral que Moro instaló con la ayuda de los medios más importantes de Brasil.</p>

<p>"Algo que no tuvo mucha atención y que necesita ser entendido mejor es la suma millonaria de dólares que se gastó en campañas ilegales y clandestinas de fake news vía WhatsApp a favor de Bolsonaro, tal como reveló el Foro de San Paulo. Sabemos que fueron financiadas por empresas, líderes y millonarios, pero después la noticia murió", retoma Fishman en diálogo con Página|12.</p>

<p>--¿Es posible una democracia sin privacidad?</p>

<p>--Siento que cada día nuestras sociedades, nuestras instituciones y nuestras vidas se están volviendo más precarias. Pienso en cualquier persona sumergida en la nueva Gig Economy de plataformas como Uber, Rappi, que trabaja por un par de centavos, cuya vida es trackeada por completo; pienso en lo inhumano y terrible que es y no quiero que haya más de eso.</p>

<p>--¿Qué nota usted como reacción de los ciudadanos?</p>

<p>--Hay un entendimiento de que la cosa no va bien, de que no nos dicen la verdad. El Lava Jato nació como una fuerza anticorrupción, y combatir la corrupción se trata de transparentar a los poderosos, de llevar a la luz pública a las personas que abusan del poder o de las instituciones.</p>

<p>--Está claro que necesitamos más transparencia para saber cómo se manejan las corporaciones y el gobierno. Porque cuando ves cómo trabajan, podés llegar a conocer qué es lo que realmente hacen, cosas con las que uno no está para nada de acuerdo. El caso Snowden fue revelador.</p>

<p>--¿Tuvo problemas a partir del enfoque de esta investigación?</p>

<p>--Cuando molestás a gente con poder y estás en la primera línea tenés que aprender varias cosas. En principio sobre seguridad digital: encriptar tus comunicaciones, separar la información para limitar accesos externos y evitar riesgos de hackeos.</p>

<p>--¿Cómo ve el futuro en Estados Unidos, Brasil y nuestra región?</p>

<p>--Soy estadounidense y Trump es el presidente allá. Vivo en Brasil hace diez años y Bolsonaro es presidente acá. No soy muy optimista sobre el futuro, aunque creo que la juventud tiene una visión más positiva de todo esto.</p>

<p>--¿Existen las operaciones de guerra psicológica o son un mito?</p>

<p>--Se engaña a sí mismo cualquiera que no crea que hay operaciones psicológicas financiadas por el Gobierno o por empresas privadas, que afectan las elecciones o la opinión pública. No quieren creerlo, pero es verdad. Tenemos evidencia.</p>

<p>--Lo importante es que una vez que la gente entiende que esto sucede es como el efecto de una vacuna. Estas operaciones son efectivas porque la gente no lo sabe, en cambio cuando la sociedad empieza a entender, a discernir lo verdadero de lo falso y ser un poco más precavida y desconfiada, esto pierde su efecto.</p>
""",
    },

    # ── 7. Han llegado cartas ──
    {
        'title': 'Han llegado cartas',
        'slug': 'p12-han-llegado-cartas',
        'subtitle': '¿Qué tiene para aportar a cada formato la nueva expansión de Magic: the Gathering?',
        'date': '2018-01-18T03:00:00.000Z',
        'html': """
<p>Rivales de Ixalan está aquí. Y la segunda expansión del bloque de Ixalan --plano espacio-temporal en curso para Magic: the Gathering-- trae una horda de vampiros, dinosaurios, tritones y piratas que esperan dominar la escena. Es que Magic tiene una naturaleza dual: es un juego y es un producto. Para mantener vivo el negocio, saca cuatro expansiones por año. Al haber tantas cartas se vuelve más complicado, así que se organizaron "formatos" que consisten en conjuntos de reglas que establecen qué cartas se pueden usar o no y ciertas condiciones para el armado de mazos.</p>

<p>Los más populares son Standard, Modern, Commander y Limitado. En Standard se usan cartas de las ediciones más nuevas (en general ocho, que abarcan los últimos dos años). Modern se juega con cartas de Octava Edición (de julio de 2003) en adelante. Commander permite usar todas las existentes pero solo una copia por mazo, mientras que en el resto de los modos se usan hasta cuatro. Por último, Limitado se juega con la última expansión disponible y los mazos se arman en el mismo torneo, con sobres que se abren en el momento.</p>

<p>Toda expansión nueva está diseñada para alimentar cada formato, y a continuación va una lista de las cartas flamantes que podrían dominar sus respectivos entornos.</p>

<p><strong>Limitado: Tetzimoc, la Muerte Primigenia.</strong> En Limitado, las criaturas son el centro de cualquier estrategia. Tetzimoc permite "marcar" criaturas del oponente y destruirlas cuando entra en juego. Esto nos deja con todas nuestras criaturas vivas y una bestia 6/6 contra ninguna defensa del oponente. Partido.</p>

<p><strong>Standard: Fénix reavivado.</strong> Fiel a su nombre, esta criatura roja 4/3 que vuela vuelve al tablero cada vez que muere. Con Prisa. La única desventaja es que ya hay criaturas rojas muy buenas del mismo coste (4 manás) con las cuales tiene que competir.</p>

<p><strong>Commander: Zacama, la Hecatombe Primigenia.</strong> En Commander, las estrellas son los bichos grandes con costes caros. Zacama va a brillar. Más allá del coste altísimo (9 manás), sus habilidades compensan todo. Vigilancia, Arrollar, Alcance y además puede hacer 3 daños, romper artefactos/encantamientos o ganar 3 vidas. Una locura.</p>

<p><strong>Modern: Kumena, tirano de Orazca.</strong> Al cierre de esta nota, Kumena vale 23 dólares y subió 8 en un día. ¡Otra que los Bitcoins! Se perfila como el tritón más codiciado del mercado. Si bien su sola presencia entusiasma a los amantes de esta tribu a intentar un mazo en Standard, va a brillar en Modern, donde ya existe un mazo de tritones competitivo que con esta adición promete hacer olas.</p>
""",
    },

    # ── 8. Milton Martínez / Skate ──
    {
        'title': '"Este es un laburo que no se siente como tal"',
        'slug': 'p12-este-es-un-laburo-que-no-se-siente-como-tal',
        'subtitle': 'Milton Martínez, embajador argentino de la patineta, cuenta cómo es ser un deportista de elite en la era de Instagram.',
        'date': '2017-12-14T03:00:00.000Z',
        'html': """
<p>Milton Martínez recién llega a Argentina. Si bien es oriundo de Mar del Plata, como toda su familia, su profesión lo llevó a instalarse en California. Ahora acaba de dejar su casa de Long Beach para venir a visitarlos y de paso traer a su hija, que vive en Brasil, a pasar las fiestas con ellos.</p>

<p>El trabajo de Martínez consiste en andar en skate y filmar. El skateboarding es una forma de expresión efímera: la única manera de volver a ver las pruebas que los skaters profesionales hacen en lugares remotos es mediante alguna forma de registro, puede ser en foto o video.</p>

<p>Mientras que hasta entonces el video en DVD era la forma más común de difundir el skate, la irrupción de Instagram trastocó el negocio. Los videos tendieron a desaparecer y convertirse en clips de algunos segundos y muchas marcas pasaron a pedirles a sus corredores grabar en ese formato en vez de en los videos tradicionales.</p>

<p>La revista Thrasher es una institución dentro del mundo del skate y el medio más importante de su industria. Salir en ella es sinónimo de consagración. Así fue como Milton irrumpió en la escena norteamericana y se convirtió en parte del elenco estable. En 2012, un clip de apenas 26 segundos le alcanzó para ubicarse dentro de la elite. Bajo el título de "Magnified", la revista publicó en su web una prueba que dejó a más de uno sin aliento.</p>

<p>De ahí en más, la carrera del marplatense fue en ascenso. Pasó a formar parte de los equipos de Creature, Volcom e Independent, marcas históricas dentro del mundo del skateboarding. Pero no todo fue fácil. El año pasado, mientras grababa la última prueba para su parte en un video de Volcom, tuvo un accidente que le sacó el pie del lugar y le fracturó la fíbula.</p>

<p>Una operación y siete clavos después, Milton estuvo listo para volver a la calle: "Fue un proceso recuperarse. Mentalmente es la parte más difícil, encima me mudé a Estados Unidos y a la semana me pasó eso. Y el dolor también, porque duele. Pero yo sabía que me iba a recuperar."</p>

<p>"Mi sueño era entrar a una marca de tablas buenas y tener un Pro Model." Este año, el sueño que lo impulsó desde chico se hizo realidad. A sus 25 años llegó a eso a lo que solo una fracción minúscula de los skaters del planeta puede acceder: tener un modelo de tabla propia. En junio, Creature presentó el modelo de Milton.</p>

<p>Milton piensa, vive y respira skate. Su papá, Tatú Martínez, es un mítico skater vieja escuela de Mar del Plata. Como contó en más de una ocasión Milton, en su casa no se veía fútbol, se andaba en skate.</p>

<p>"Este es un laburo que no siento como tal y que me encanta. Las únicas presiones que me pongo son mentales, no en cuanto a que si no hago algo me van a echar. Eso nunca. Si te echan de una marca no es el fin de nada. El sentimiento del skate no pasa por ese lado, es otra cosa. Por eso si no tuviera sponsors seguiría andando."</p>

<p>Una y otra vez, Milton hace hincapié en los mismos temas. La esencia del skate. Para el filósofo griego Platón, la palabra esencia era sinónimo de arquetipo, el modelo original a partir del cual las demás cosas tomaban forma. Este joven marplatense representa las dos cosas. Por un lado la fuente del skate, su naturaleza original. Por el otro un modelo a seguir, un ejemplo de cómo hacer las cosas. Así, en definitiva, Milton Martínez es el arquetipo del skater.</p>
""",
    },

    # ── 9. Polémica en las galaxias ──
    {
        'title': 'Polémica en las galaxias',
        'slug': 'p12-polemica-en-las-galaxias',
        'subtitle': 'Pese al cuestionamiento a su sistema de transacciones, el nuevo juego confirma que destrozarse a tiros en el espacio es la mejor manera de conectar con la saga.',
        'date': '2017-12-07T03:00:00.000Z',
        'html': """
<p>Star Wars: Battlefront II tuvo un debut estrellado. EA decidió poner un sistema de micro transacciones dentro del juego y desató la furia de los usuarios. La empresa respondió con un post en reddit que alcanzó 675 mil votos negativos (convirtiéndose en la entrada peor rankeada de la historia de esa plataforma). La reacción es comprensible, dado que en la primera entrega del juego las mejoras y personajes no estaban bloqueados. Imaginate comprarte un juego de Star Wars y descubrir que tenés que pagar para jugar con Luke Skywalker o Darth Vader.</p>

<p>Más allá de la polémica, lo mejor de Star Wars: Battlefront II es el modo multijugador. Aunque no es el único, también hay otros modos como campaña o arcade. Pero la posibilidad de matarte a tiros en simultáneo con 40 jugadores --sean soldados imperiales, de la Resistencia, la Primera Orden o la Federación de Comercio-- es una razón suficiente para jugar online hasta que te revienten los ojos.</p>

<p>En cuanto a la puesta, la principal diferencia con su predecesor es el período que podemos jugar. La primera entrega estaba enfocada en la primera trilogía y este se ubica en períodos anteriores o posteriores. La novedad es que además de jugar con personajes clásicos como Han Solo o Boba Fett, ahora también tenemos a Yoda, Darth Maul, Rey o Kylo Ren.</p>

<p>El gameplay tiene varias novedades. La principal es que el juego está más estructurado. Mientras que en Star Wars: Battlefront se podían modificar personajes a gusto, ahora empezamos eligiendo cuatro clases: asalto, especialista, pesado y oficial.</p>

<p>Con estos cambios EA busca estandarizar más el juego y llevarlo hacia algo más competitivo. Pese a los cambios nefastos que pueden comprometer el futuro del juego, aún no encuentro una forma mejor que destrozarse a tiros en el espacio, para mantenerme unido al universo Star Wars.</p>
""",
    },

    # ── 10. Garganta con arena ──
    {
        'title': 'Garganta con arena',
        'slug': 'p12-garganta-con-arena',
        'subtitle': 'En su décima entrega en diez años, la saga busca ampliarse sin perder identidad, pero se queda a medio camino del Nilo.',
        'date': '2017-11-09T03:00:00.000Z',
        'html': """
<p>La próxima semana ya habrán pasado diez años desde que salió el primer Assassin's Creed. Sucesor del Prince of Persia, este juego desarrollado por Ubisoft Montreal cautivó a una generación de pendejos combinando varios elementos: desde una jugabilidad re arcade que permitía trepar por todos lados, un modo de sigilo propio del Metal Gear y mundos enormes para explorar hasta un set up histórico de conspiraciones templarias en medio de las Cruzadas.</p>

<p>Pero los años pasan para todos. La saga apostó a mantener el núcleo de elementos durante todas sus entregas --y ya van diez, más siete spin-offs-- mientras iba modificando el contexto histórico y la variedad de las conspiraciones.</p>

<p>The Witcher 3: Wild Hunt, Fallout 4 y Uncharted 4: A Thief's End le subieron la vara a la nueva generación de videojuegos.</p>

<p>Los creadores de Assassin's Creed Origins intentaron sumar algunos de estos elementos para refrescar la experiencia de juego. Agregaron un sistema de niveles y experiencia al personaje para acercarlo más a un RPG, un inventario para construir ítems y un árbol de habilidades. Sin embargo, estos elementos no están integrados al juego y se los puede obviar sin que cambie mucho la experiencia. Eso no está bueno.</p>

<p>No obstante, como rasgos interesantes vale destacar la elección del antiguo Egipto como contexto, ya que permite revivir ese mundo extinto gracias a una calidad gráfica de primera línea, y también la posibilidad de usar el punto de vista del águila que acompaña al personaje para tener una visión del terreno desde arriba y planificar las acciones. Como un dron, pero vieja escuela.</p>

<p>En general, Assassin's Creed Origins se siente como un juego de transición, que intenta incorporar elementos nuevos sin dejar de recurrir a la misma fórmula que hizo exitosa a la franquicia. Solo que esta vez no le alcanza para estar entre los mejores de esta generación.</p>
""",
    },

    # ── 11. No dejes para mañana ──
    {
        'title': 'No dejes para mañana',
        'slug': 'p12-no-dejes-para-manana',
        'subtitle': 'El creador de PayPal y su plan monumental, entre autos eléctricos, cohetes a Marte y vehículos a mil por hora: ¿es Hank Skorpio o un Willy Wonka sci-fi?',
        'date': '2017-10-26T03:00:00.000Z',
        'html': """
<p>Es difícil entender si Elon Musk es Hank Skorpio, Willy Wonka o el vendedor de monorriel de Los Simpson. Parece tan capaz como chanta. Está empecinado en ser el nuevo Henry Ford, en construir el futuro y venderlo. Siempre está anunciando una tecnología "revolucionaria". Quiere arreglar el tránsito, el calentamiento global y colonizar Marte. Mañana, o de ser posible hoy mismo.</p>

<p>Musk promete todo el tiempo achicar la brecha entre realidad y ciencia ficción. Tesla es su marca insignia: la primera fábrica de autos eléctricos, que lanzará este año al mercado su tercer modelo, bautizado oportunamente "Model 3", con el que espera conquistar al público masivo. Y pese a producir solo 80 mil unidades al año, la compañía vale 60 mil millones de dólares, superando la cotización de Ford, General Motors y BMW.</p>

<p>El Model 3 ya tiene 400 mil unidades prevendidas. Solo para suplir la demanda de baterías de su cadena de producción, está construyendo la planta de baterías más grande del planeta: Gigafactory, que espera terminar en 2020. Sola, esa planta tendría más capacidad que todas las fábricas de baterías del mundo que existen juntas. Todo en el universo Musk es gigante.</p>

<p>Y para la conquista espacial, cuenta con SpaceX, que empezó como subcontratista de la NASA para vuelos suborbitales y abastecimiento a la estación espacial internacional. En marzo, por primera vez, logró que su cohete reutilizable, el Falcon 9, hiciera su segundo viaje. La filosofía de Musk es abaratar los costos de los vuelos espaciales para que sean tan comunes como los viajes en avión. Pero SpaceX también es la punta de lanza de su proyecto más controvertido: la colonización de Marte.</p>

<p>Por último, Hyperloop. Una idea que generó mucho ruido cuando salió y luego se extinguió en el mar de la información. Lanzar cápsulas-vehículo por tubos de vacío como medio de transporte, a velocidades de entre 200 y 960 kilómetros por hora. Musk confirmó este año que recibió aval de palabra del gobierno estadounidense para que su compañía The Boring Company cave un túnel entre Nueva York y Washington.</p>

<p>Así, el futuro de la Humanidad parece estar, de nuevo, en manos de un excéntrico millonario. Solo que en este caso Musk es el reverso de Ford: primero vende el futuro y luego lo construye.</p>
""",
    },

    # ── 12. Somos los piratas ──
    {
        'title': 'Somos los piratas',
        'slug': 'p12-somos-los-piratas',
        'subtitle': 'El nuevo set de Magic: The Gathering tendrá estreno este fin de semana en Argentina, con un mix zarpado de dinosaurios, piratas y vampiros.',
        'date': '2017-09-28T03:00:00.000Z',
        'html': """
<p>Magic: The Gathering son muchos juegos. Todo es cuestión de reglas. Diferentes conjuntos de reglas dan origen a diferentes formatos agrupados en dos grandes categorías: construido y limitado. En construido, cada jugador prepara su mazo de antemano. En limitado, armar mazos es parte del juego. Sellado (o Sealed) pertenece al segundo grupo.</p>

<p>Este formato implica dos habilidades: saber jugar Magic y saber armar mazos. Se estima que de las 40 cartas, 23 tienen que ser hechizos y el resto tierras, las fuentes de maná que permiten realizar acciones.</p>

<p>En Sellado las criaturas tienen un rol central. El truco pasa por armar una buena "curva", eligiéndolas según su coste de maná. Si nos quedamos con criaturas caras, vamos a estar muertos antes de jugarlas. Pero si elegimos bichos muy baratos, es posible que no sea suficiente para ganar.</p>

<p>El flamante Ixalan es un set rápido con criaturas buenas, bonitas y baratas que, además de fuerza y resistencia, vienen con mecánicas extra en sintonía con la onda tribal de la edición. Este mundo está lleno de piratas (negro/azul/rojo), vampiros (negro/blanco), tritones (verde/azul) y... ¡dinosaurios! (verde/blanco/rojo). Las mecánicas nuevas son Enfurecer, que da ciertos bonus cuando la criatura es dañada, y Explorar, que nos permite robar una carta de tierra cuando el bicho entra en juego, o bien ponerle un contador +1/+1.</p>

<p>Las tribus permiten que las sinergias entre colores rivales funcionen turbo bien. Esta es la primera clave para Ixalan en Sellado: pensar en tribus más que en colores. Los piratas ayudan a generar maná extra y los vampiros a ganar vida; los tritones ganan habilidades cuando hay otros tritones y los dinosaurios son las bombas del formato. Y aunque los hay pasados de anabólicos --los mejores-- también los hay comunes, listos para hacerle una fatality al que se le ponga delante. Por ejemplo, Fauces Pavorosas Colosal, una 6/6 que arrolla por seis manás. A ese pibe lo van a ver una y otra vez si se ceban con el Sellado de Ixalan.</p>
""",
    },

    # ── 13. Melodía encadenada ──
    {
        'title': 'Melodía encadenada',
        'slug': 'p12-melodia-encadenada',
        'subtitle': 'Así como Seiya no llegó solo, los bitcoins tampoco.',
        'date': '2017-08-10T03:00:00.000Z',
        'html': """
<p>Así como Seiya no llegó solo, los bitcoins tampoco. La aparición del caballero de Pegaso fue una excusa genial para que los caballeros de bronce coparan el santuario. La irrupción de Bitcoin en el mercado trajo consigo al caballo de Troya, la tecnología del blockchain. Y al ser de código abierto, permitió que varias redes lo emularan, dando nacimiento a un movimiento de criptomonedas. Un grupo de investigadores con base en Londres estima que desde 2013 aparecieron 1469, de las que al menos 600 se mantienen activas con transacciones diarias.</p>

<p>Ethereum, Ripple, Litecoin, Dash y Monero, las cinco que le siguen en importancia a Bitcoin, ya coparon el 20 por ciento de la cuota de mercado. Ethereum, por ejemplo, utiliza la tecnología de blockchain para crear aplicaciones. Sus creadores explican que así como el e-mail era uno de los usos de internet, Bitcoin es solo una de las formas posibles de usar blockchain.</p>

<p>Ripple está enfocado en sistemas de pagos para grandes empresas. El banco Santander ya la incluye en algunas de sus operaciones. Litecoin es una versión más rápida, liviana y barata de Bitcoin. Dash asegura tener capacidad de hacer transacciones instantáneas y privadas. Mientras que Monero dice que su sistema de minado es más transparente y evita la centralización intrínseca de la arquitectura de Bitcoin.</p>
""",
    },

    # ── 14. Cuentos de la criptomoneda ──
    {
        'title': 'Cuentos de la criptomoneda',
        'slug': 'p12-cuentos-de-la-criptomoneda',
        'subtitle': 'Bitcoins, formateando el capital.',
        'date': '2017-08-09T03:00:00.000Z',
        'html': """
<p>Telefónica se come el ciberataque más groso de su historia. Ningún usuario tiene acceso al sistema. Corren noticias de discos rígidos explotando por el aire. Los crackers piden rescate y exigen que el pago se haga en bitcoins. Nogoyá y Helguera, corazón de Villa del Parque. Un jubilado mira la vidriera de un nuevo local y entra, la marquesina reza: compra y venta de bitcoins. Emiliano juega World of Warcraft. Necesita la espada del dragón sagrado para vencer al boss del calabozo nivel 900. La compra por internet y paga en bitcoins.</p>

<p>La palabra bitcoin hace referencia a dos cosas: la moneda digital y la red que la soporta. Es imposible entender nada sin este concepto básico. Bitcoin es una moneda pero es también una red. Una de intercambio P2P --quizá la recuerden de películas como eMule y Napster--, es decir de intercambio directo entre usuarios. Solo que en vez de intercambiar películas, acá se intercambia una moneda digital, el bitcoin. No es una moneda común y corriente, ya que no tiene un respaldo en el mundo físico. Pero así como le damos valor al dinero porque lo usamos, el bitcoin funciona igual: adquiere su valor en el uso, en el intercambio.</p>

<p>Bitcoin se maneja con ciertos principios básicos. El objetivo de una moneda digital es evitar por todos los medios que alguien la use sin autorización. El sistema funciona capturando cada transacción en un archivo del que todos los usuarios tienen una copia pero que nadie puede modificar. Todas las copias se actualizan simultáneamente y así todos los usuarios pueden ver todo el historial de transacciones. Esto previene que un mismo bitcoin se gaste dos veces.</p>

<p>Cuando se agrega una nueva transacción, se genera un nuevo bloque que incluye el archivo original, al cual se refiere mediante un número generado que es muy difícil de copiar. Eso garantiza la veracidad del bloque actual. Bitcoin es en definitiva un libro contable donde cada transacción queda registrada y es compartida con todos los usuarios. Esta cadena de bloques que agrupa transacciones recibe el nombre de "blockchain" (literalmente bloque-cadena) y es el pilar de Bitcoin.</p>

<p>El diseño de esta red estipula además añadir cierta cantidad fija de bitcoins por año hasta llegar al límite de 21 millones. Ese es el tope disponible. Un bitcoin se puede dividir ocho veces hasta llegar a la fracción del 0.00000001, que recibe el nombre de Satoshi por su creador, quien permanece en el anonimato.</p>

<p>Los bitcoins se crean a través de un proceso llamado "mining", que básicamente consiste en poner tu computadora a trabajar procesando transacciones de bitcoins. Mediante un algoritmo, lo que hace cada computadora es validar transacciones y recibir a cambio un porcentaje muy pequeño de bitcoins.</p>

<p>Bitcoin está inspirado en el manifiesto criptoanarquista escrito por Timothy C. May en 1992, en el que propuso la creación de una red de usuarios que elimine todo tipo de intermediación estatal o privada. May aseguraba que el impacto de una creación de una red de este tipo resguardada mediante el uso de sistemas de encriptación debilitaría el poder de entidades financieras así como la imprenta debilitó el poder de los gremios medievales.</p>

<p>Bitcoin es una moneda y por lo tanto es un sistema de pago. Si bien hay quienes lo utilizan como una inversión, en realidad Bitcoin no lo es. Lo que necesita Bitcoin es que haya circulación y mayor cantidad de pagos realizados con el sistema. El éxito de Bitcoin no está en la suba de su cotización sino en la cantidad de usuarios que se sumen a la red.</p>

<p>No es la primera vez que estas promesas surcan las redes de fibra óptica y la mente de quienes las usamos para comunicarnos. De la invención de Napster al establecimiento de los servicios de streaming como mainstream pasaron 15 años y mucha agua debajo del puente. Netflix no existiría sin el embate de los gigantes del entretenimiento contra las redes que compartían su contenido gratuitamente. La destrucción de Megaupload y la cárcel para los creadores de The Pirate Bay fueron los clavos en el ataúd del sueño de una internet libre.</p>

<p>Los defensores del blockchain argumentan que este problema está solucionado de base, por la arquitectura misma del sistema. Nadie puede, en teoría, apropiarse de toda la red. Pero de la misma forma que con las primeras etapas de internet, esto se va a debatir al calor de los intereses del capital y las empresas.</p>

<p>Los críticos aseguran que se trata de una burbuja, mientras sus defensores avisan que es la nueva revolución tecnológica por venir. Lo cierto es que la aparición de Bitcoin disparó la de otras criptomonedas que incluso ya le compiten cuotas de mercado.</p>

<p>Habrá que ver qué pasa primero. Pero más allá del futuro del Bitcoin, la aparición de la tecnología de blockchain abre la posibilidad de transformar cualquier práctica social en la que se tenga que resguardar la identidad y veracidad de un documento. Sus posibles aplicaciones son el tema más caliente dentro de la comunidad de programadores, quienes aseguran que en menos de cinco años transformará áreas enormes de la vida cotidiana como pueden los pasaportes, el almacenamiento masivo online e incluso los procesos electorales.</p>
""",
    },

    # ── 15. ¿Qué hacés, máquina? ──
    {
        'title': '¿Qué hacés, máquina?',
        'slug': 'p12-que-haces-maquina',
        'subtitle': 'La dualidad antológica en torno de la robótica se reescribe desde que el miedo humano ya no es a la devastación sino al desempleo. Pero ¿hasta dónde se puede rechazar una rama científica que entraña tan alto fetichismo?',
        'date': '2015-05-07T03:00:00.000Z',
        'html': """
<p>Saturno llegó a las góndolas de las jugueterías en la Navidad del '92. Era un muñeco simpático con un parecido de familia con los robots de los '50. Tenía una pantalla incrustada en el pecho que proyectaba imágenes del espacio, funcionaba a pilas, caminaba solo y cuando chocaba contra una pared se daba vuelta y volvía en la dirección opuesta. Cualquier niño que lo vio en acción creyó que era un robot hecho y derecho.</p>

<p>Por la misma época llegó Terminator 2: El día del juicio final. Ningún niño que haya sido expuesto al legendario film por un padre fanático de las películas de acción la olvidó. Entre los varones de 25 y 30 años tiene un estatus mítico. Es difícil olvidar al implacable robot asesino de metal líquido modelo T-1000 de Cyberdine. O esa apertura, con Schwarzenegger en culo entrando a un bar de motoqueros mientras sonaba Bad to the Bone de ZZ Top.</p>

<p>Pero lo que realmente le voló los sesos a esa generación fue la idea de Skynet: un software de defensa que se vuelve consciente de sí a los cinco minutos de ser prendido, y en respuesta a ser apagado desata un apocalipsis nuclear. Los sobrevivientes del holocausto son perseguidos y exterminados por una nueva generación de robots asesinos creados por Skynet. No se dudó un segundo de que el futuro sería así, que se trataría de sobrevivir a una guerra con los robots. John Connor fue el profeta.</p>

<p>Desde entonces se impusieron dos miradas sobre la robótica. Una de confianza y otra de desconfianza, los polos entre los cuales oscila el péndulo de la aceptación de la tecnología en la vida humana.</p>

<hr>

<p>Un robot es una máquina diseñada para reemplazar tareas humanas que combina elementos mecánicos, electrónicos e informáticos para realizar tareas en forma automática. El robot por excelencia es el brazo mecánico, y no por un capricho sino porque es por lejos el miembro más versátil del cuerpo humano.</p>

<p>En 1959, los ingenieros yanquis Joseph Engelberger y George Devol fundaron Unimation (acrónimo de Universal Automation Inc.), la primera empresa dedicada a la fabricación de robots. En 1961 instalaron su buque insignia, el Unimate, en la cadena de montaje de General Motors. Ocho años más tarde, General Motors creó la primera planta automatizada del mundo, duplicó la cantidad de autos fabricados por hora y revolucionó la industria automotriz.</p>

<p>Pero el robot inmediatamente se convirtió en objeto de consumo y fetiche pop, y más durante la década del '90, con el auge de la televisión por cable y las videocaseteras: Mazinger Z, Grandizer, Voltron y Daltanias acompañaban las tardes de dibujos animados. Estos robots, a diferencia de Terminator, eran la herramienta primordial para garantizar la supervivencia del hombre.</p>

<hr>

<p>En otros clásicos noventosos como Los Centuriones o Los Halcones Galácticos, la máquina era una extensión del cuerpo humano o bien funcionaba como armadura y exoesqueleto.</p>

<p>Lo curioso es que este tipo de tecnología ya existe, y hay una rama de la ingeniería, llamada mecatrónica, que se encarga de estudiarla y aplicarla. Por caso, Ekso Bionics, una compañía con base en California, vende un exoesqueleto diseñado para que personas con parálisis puedan volver a caminar asistidas. Pero los desarrollos más flasheros en esta disciplina incluyen a los MEM (Sistemas Micro-Electro-Mecánicos), dispositivos de tamaños que van del milímetro para abajo y pueden, por ejemplo, navegar por el sistema sanguíneo en busca de enfermedades, analizando célula por célula, como el Autobús Mágico.</p>

<hr>

<p>En el año 2000, otra vez los robots salieron al encuentro en la pantalla chica. Los niños de los '90 entraban en la adolescencia, la última curva de la convertibilidad venía jodida, la Alianza tenía mucha más capacidad de ocasionar daño que el temido Y2K, y dos productos marcaron el clima apocalíptico de la época. The Matrix era la figurita difícil de los videoclubs; Evangelion era la niña mimada de los chicos suertudos que aparte de tener cable, tenían el canal dedicado a la animación japonesa, Locomotion.</p>

<p>Evangelion transcurre en Neotokyo en 2015. La agencia secreta NERV construye unos "robots" gigantes llamados EVA para pelear contra doce ángeles que Dios, sí Dios, manda para aniquilar la Humanidad.</p>

<p>En Matrix, la Humanidad de nuevo es víctima de su propia creación. Luego de la película, salieron unos cortos bajo el nombre de Animatrix. Uno que se destaca es The Second Renaissance, que cuenta cómo los seres humanos y los robots entraron en guerra, luego de que las personas tiranizaran y esclavizaran a las máquinas.</p>

<p>Sin embargo, estos dos polos entre los que se plantea el problema son estériles. Si el destino de la robótica es la cooperación total con la Humanidad, entonces no hay problema. Y si por otro lado la única salida es la aniquilación, el dilema es inútil porque no tiene solución. Por eso, una vez más aparece una tercera posición equidistante: el verdadero problema con el que habrá que lidiar está en el medio de los extremos, y su nombre es "automatización".</p>

<hr>

<p>Los términos en los que la ficción especulativa plantea este problema son o bien que la tecnología es buena o bien que es mala. No es posible hacer un juicio de valor sobre esto. Lo único sabido es que la tecnología es irreversible: una vez que se la comienza a utilizar en algún sector de la vida cotidiana, ya no se vuelve atrás.</p>

<p>John Connor no estuvo solo en su cruzada contra las máquinas. A finales del siglo XVIII, el obrero Ned Ludd entró a la fábrica donde trabajaba y destruyó a martillazo limpio dos máquinas que suplantaban el trabajo de varios operarios. Así surgió una tendencia llamada Ludismo, que sostiene que la utilización de tecnología en la industria va a llevar al desempleo masivo.</p>

<p>Los economistas la llamaron Falacia Ludista, porque según ellos la evidencia histórica demuestra que los operarios desplazados por las máquinas se convirtieron en operarios de dichas máquinas y a la vez estas fueron herramientas para aumentar su productividad. Sin embargo, ya se llegó al punto en el que las propias máquinas empiezan a hacer el trabajo sin necesidad de que alguien las opere. Basta pensar, por ejemplo, en el impacto a gran escala en la industria del transporte de un automóvil que se maneje solo, como el que desarrolla Google. U otro ejemplo, un algoritmo que reemplace a los contadores. U otro que lea cosas de Internet, haga copy-paste y reemplace a los redactores y periodistas. ¿Dónde se absorbería esa masa trabajadora?</p>

<p>Crear nuevos trabajos implica más especificidad y más especificidad implica más estudios, pero no todos los sectores pueden acceder a esos niveles de educación. Entonces, la consecuencia serían sociedades en las que la brecha entre ricos y pobres estaría acentuada. Este parece ser el desafío a no tan largo plazo de esta generación: ya no sobrevivir a la aniquilación masiva sino sobrevivir a la obsolescencia, al desempleo.</p>
""",
    },
]


if __name__ == '__main__':
    print(f'Importing {len(ARTICLES)} articles into Ghost as drafts...\n')
    ok = 0
    for i, art in enumerate(ARTICLES, 1):
        print(f'[{i}/{len(ARTICLES)}] {art["title"]}')
        if create_post(art['title'], art['slug'], art['html'], art['subtitle'], art['date']):
            ok += 1
        time.sleep(0.5)
    print(f'\nDone: {ok}/{len(ARTICLES)} articles imported.')
