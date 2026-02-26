#!/usr/bin/env python3
"""
Import external articles (batch 3) into Ghost as drafts.
6 articles from NAN, Cenital, and Rest of World.
Uses Lexical JSON format with HTML cards.
"""

import json
import jwt
import time
import urllib.request
import urllib.error
import ssl
import os

GHOST_URL = 'https://421bn.ghost.io'
ADMIN_KEY = os.environ.get('GHOST_ADMIN_API_KEY', '')


def get_token():
    key_id, secret = ADMIN_KEY.split(':')
    iat = int(time.time())
    payload = {'iat': iat, 'exp': iat + 300, 'aud': '/admin/'}
    return jwt.encode(payload, bytes.fromhex(secret), algorithm='HS256',
                      headers={'kid': key_id})


def make_lexical(body_html, disclaimer_html):
    """Build Lexical JSON with two HTML cards: body + disclaimer."""
    return json.dumps({
        "root": {
            "children": [
                {"type": "html", "version": 1, "html": body_html},
                {"type": "html", "version": 1, "html": disclaimer_html}
            ],
            "direction": "ltr",
            "format": "",
            "indent": 0,
            "type": "root",
            "version": 1
        }
    })


def create_post(article):
    """Create a draft post in Ghost using Lexical JSON."""
    token = get_token()

    lexical = make_lexical(article['body_html'], article['disclaimer_html'])

    post_data = {
        'posts': [{
            'title': article['title'],
            'slug': article['slug'],
            'lexical': lexical,
            'status': 'draft',
            'published_at': article['published_at'],
            'custom_excerpt': article['custom_excerpt'],
            'tags': article['tags'],
            'authors': article.get('authors', [{'slug': 'juan'}]),
        }]
    }

    data = json.dumps(post_data).encode('utf-8')
    ctx = ssl.create_default_context()
    req = urllib.request.Request(
        f'{GHOST_URL}/ghost/api/admin/posts/',
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
        print(f'  ERROR {e.code}: {body[:500]}')
        return False


# ─────────────────────────────────────────────────────────
# Articles
# ─────────────────────────────────────────────────────────

ARTICLES = [

    # ── 1. Pop para divertirse ──
    {
        'slug': 'nan-pop-para-divertirse',
        'title': 'Pop para divertirse',
        'published_at': '2016-07-27T00:00:00.000-03:00',
        'tags': [{'name': '#es'}, {'name': 'Cultura'}],
        'authors': [{'slug': 'juan'}],
        'custom_excerpt': 'Inmediata, masiva y de consumo rápido. No, no es una milanesa. Es la omnipresente cultura pop.',
        'disclaimer_html': '<hr><p><em>Esta nota fue publicada originalmente en <a href="https://lanan.com.ar/culturapop-consumo/" target="_blank" rel="noopener noreferrer">NAN</a> el 27 de julio de 2016.</em></p>',
        'body_html': '<p>Inmediata, masiva y de consumo rápido. No, no es una milanesa. No es un combo de McDonald\'s, ni tampoco es falopa. Es la omnipresente, omnisciente y omnipotente cultura pop. El nuevo ídolo al cual le rendimos culto. De Néstor en Bloque a los Transformers. De La Tablada a Hollywood. Cultura pop. Cultura mainstream global. Nene Malo arranca 97 millones de reproducciones en Youtube y pega gira en Dubai. Pero no nos olvidemos de Jon Snow. Necesitamos consumir, todo, ahora, ya mismo. De los muñequitos danzarines de Pokémon en el distrito de Akihabara a las trenzas conurbanas con pantalón camuflado de Rocío Quiroz. Lo único prohibido es estar afuera.</p>'
        '<h2>El consumo</h2>'
        '<p>Así como en la revolución francesa le cortaron la cabeza a la aristocracia y tomaron el poder los burgueses, el pop, por debajo del radar, gestó su propia revolución contra la aristocracia cultural. No se necesita buen gusto, tampoco goce estético. Se necesita conectar con algo. ¿Cuánta gente va al Colón? ¿Cuánta gente por fin de semana revienta Kory Megadisco? El afiche cumbiero que plaga el barrio de Once es la muestra cabal de que la cultura pop se define por su público. Es tan importante un estribillo pegadizo como tener clara la demografía a la que se apunta. Mientras el rock anquilosado y esclerótico sigue siendo cubierto como un fenómeno cultural novedoso, no existe ni un solo medio «cultural» mainstream que cubra la movida cumbiera, salvo desde esa curiosidad muy de clase media blanca, como si estuviesen reescribiendo <em>Una expedición a los indios ranqueles</em>. Eso sí; a no perderse el último recital de la bandita indie del momento que lleva con fuerza a cuarenta personas al C. C. Matienzo.</p>'
        '<h2>Pokémon Go</h2>'
        '<p>No hay lugar para la aristocracia ni para la demagogia. La medida de consagración es el éxito. La vigencia la determina el público. Ni el galerista, ni el editor. Es el fenómeno blockbuster, el best seller. Si vende funciona, si no vende que pase el que sigue. Stephen King como norte. La cruza perfecta entre calidad y cantidad. El pop es el gran igualador. No importa si sos rico o pobre. El Big Mac vale lo mismo para los dos.</p>'
        '<h2>Accesible</h2>'
        '<p>La cultura pop se fue comiendo a todos sus competidores y hermanitos. Me acuerdo que la primera vez que vi <em>Star Wars. El imperio Contraataca</em> lo hice en una emisora pirata: Canal 4 Utopía. Ahí mismo vi <em>Akira</em>. Tenía 10 años, quedé con el cerebro frito para siempre. La cultura pop está cada vez más cerca. Primero la televisión, después el cable, más adelante Internet, luego el DVD y ahora el On Demand. Hoy tu viejo puede ver <em>Necromantic</em> o el último recital de Los Pimpinela en Netflix, al alcance de su pulgar.</p>'
        '<h2>Masiva</h2>'
        '<p>La cultura pop es cultura mainstream globalizada. No importa si vivís en Wisconsin o en Villa del Parque. En los noventa miraste las Tortugas Ninja y ahora delirás con <em>Adventure Time</em>. <em>Game Of Thrones</em> y Pokémon son parte de un idioma global. La cultura pop es la expresión cultural de la democracia capitalista. El modo de producción está inserto en lo que define a la cosa. Cambian los modos de producción, cambia el objeto producido. El cine de los años treinta nada tiene que ver con el cine actual: de los estudios magníficos a la pantalla verde.</p>'
        '<h2>La estética es un accidente de la industria</h2>'
        '<p>Todos miramos a la capital transnacional de la cultura pop. La Roma del mundo eléctrico: Estados Unidos. <em>Volver al Futuro</em> hizo más por la hegemonía norteamericana global que la guerra de Vietnam. Todos queremos producir como Estados Unidos, todos queremos tener la cultura que tiene EEUU. Cada país tiene la cultura que puede pagar.</p>'
        '<h2>Digerible</h2>'
        '<p>No se necesita intermediación intelectual para entenderla ni para consumirla. Es hija de la cultura de la pantalla. Forjó su idioma en el cine y extendió su dominio a cada rincón del planeta con la televisión. Es más fácil entender <em>La Sirenita</em> que la <em>Crítica de la Razón Pura</em>. El pop es, antes que nada, entretenimiento. No requiere esfuerzo alguno. Pero eso no le quita valor, al contrario, se lo otorga. Porque lo que pierde en profundidad lo gana en alcance. Resigna complejidad para llegar a un público más amplio. La simplicidad se convierte en una virtud democrática.</p>'
        '<h2>Repetitiva</h2>'
        '<p>No todo es alegría en el paraíso pop. El éxito es el amo y gran señor. Luego todos quieren emular y repetir el éxito creyendo que existen fórmulas para ello. ¿La pegamos con Iron Man? Entonces hagamos películas de Thor o Hulk. ¿La competencia te está cogiendo? Copiale la fórmula: Batman, Superman, Batman VS. Superman. Hoy son superhéroes, ayer fueron tortugas ninja, mañana serán pulpos galácticos con laser en el culo. La cultura pop tiende a convertirse en un gran más de lo mismo.</p>'
        '<h2>Tendencia</h2>'
        '<p>La cultura pop se mueve por la tendencia, la moda. Lo actual es lo único que importa. La moda es esa –falsa– negociación entre público e industria: "Te damos lo que querés y te decimos lo que querés querer". Hoy ver superhéroes es lo más cool del universo hasta que mañana deje de serlo. Tal vez pasado vuelva. ¿Quién sabe? No importa. Lo que importa es el look. Lo que importa es la remera, no saber si Charizard evoluciona en nivel 40. Pululan los especialistas en cultura pop que dicen cualquier banana. Nadie los corrige porque no importa. No importa saber de algo, importa saber lo que dice Wikipedia para no quedar como un boludo si te preguntan. Y nada más. Se vive de la tendencia.</p>'
        '<h2>Cíclica</h2>'
        '<p>Todo lo que alguna vez estuvo de moda va a volver. Es la ley máxima de la cultura pop. El tiempo y la distancia operan como una suerte de edición sobre la memoria cultural. El paso del tiempo nos permite elegir lo mejor de épocas pasadas y entonces la nostalgia hace lo propio. "Qué buenos estaban los ochenta", dijeron todos veinte años después de que aquella década hubiese terminado. Lo rescatable de la cultura de décadas pasadas volverá en forma de nuevo mainstream, cuando los jovenzuelos de entonces tomen el lugar de sus predecesores y produzcan cultura. Retro, vintage, old school, son etiquetas para volver a vender cosas que habían entrado en desuso.</p>'
        '<h2>La fotocopia como dispositivo. La producción en serie</h2>'
        '<p>La cultura pop es por definición warholiana. La originalidad pierde significado. El valor lo adquiere una copia. En el arte, hasta el pop, el valor lo otorgaba la autenticidad. La diferencia entre un cuadro con una firma de Picasso y uno con una firma de Juan Pindonga es de veinte palos verdes. Con la producción en serie, eso murió. En el pop no existen originales. El truco es la reproducción serial de muchos iguales, baratos, accesibles. P-A-R-A-T-O-D-O-S. Para todos los que paguen. La industria creativa pop, global y masiva está marcada por su origen: la reproducción en serie.</p>'
        '<h2>El pop no tiene jerarquías</h2>'
        '<p>El pop tiene clásicos. Podemos entender a la cultura como una red con miles de nodos. El clásico se define por ser un nodo con mayor peso en la red. Un punto neurálgico que reacomoda el entramado a su alrededor. La cantidad de referencias que obras posteriores hacen de él y la influencia en trabajos futuro son la marca de los clásicos.</p>'
        '<h2>Apéndice I: Clásicos</h2>'
        '<p>Tolkien. Asimov. Cordwainer Smith. Gary Gygax. Ron Gilbert. Tim Schaffer. Philip Dick. Joss Whedon. Richard Garfield. Katsuhiro Otomo. Yoshiyuki Sadamoto. Go Nagai. Alan Moore. Stan Lee. Kevin Eastman. Neil Gaiman. Bram Stoker. Mary Shelley. Julio Verne. H.P. Lovecraft y Arthur Conan Doyle.</p>'
        '<h2>Apéndice II: Culto</h2>'
        '<p>A eso que es bueno pero no tiene éxito, el pop le reserva un lugar: la obra de culto. Influencia de futuros productores, contraseña para acceder a cierto prestigio en algunos círculos. Los hay pasados y recientes. Tiene el potencial de ser el nuevo clásico. Sólo por mencionar algunos recientes que merecen atención: <em>Scott Pilgrim vs. the world</em>, <em>Attack the Block</em>, <em>Hot Fuzz</em>, <em>Superbad</em>, <em>Ready Player One</em>, <em>Angry Videogame Nerd</em>.</p>'
        '<h2>Sos lo que producís</h2>'
        '<p>Del consumo a la producción, el pop vuelve accesible y democrática a la cultura. Es una constante tensión, como lo es la democracia. La propia dinámica de producción tiende a la monopolización de contenidos. Abre espacios y clausura otros, permite acercar la dimensión mítica y simbólica al público masivo a la vez que impide que acceda toda cultura que no se lleve bien con un esquema comercial sólido. Crea un status quo apto para los negocios.</p>'
        '<p>Hasta que alguna revolución tecnológica patea el tablero. Vimos cómo implosionó la industria de la música de la mano del Mp3 y el iPod. Estamos viendo cómo Netflix le come los talones a la televisión, que está en un momento de oro sobrepasando por mucho al cine. La irrupción de lo digital simplificó procesos de producción y transmisión como nunca antes se vio. Si lo esencial del arte está en el método de producción y estamos en una era en la que la cultura se produce en pequeños ordenadores portátiles de mano, entonces la cultura va a cambiar. Un smartphone o una notebook reemplazan al estudio de grabación, al set, a la isla de edición. ¿Que es Youtube sino el reflejo de este cambio en los medios de producción y en los hábitos de consumo?</p>'
        '<p>Pero a la vez que simplifica, el dispositivo performa usos. Nos liberamos del intermediario, del editor, del curador, del galerista del museo. Los nuevos amos y señores del juego son los vendedores de dispositivos. Tal vez todo sea un simple pasamanos.</p>'
        '<p>No se puede pensar el pop por afuera del capitalismo. Sus reglas nos condicionan y nos determinan de manera no mecánica, y sin embargo es un lugar donde también podemos liberarnos de la esclavitud del consumo. Si pegamos el salto, de animarnos, podemos dejar sólo de consumir cultura y pasar a producir, crear, por el simple hecho de que somos libres de hacerlo. Es una ironía dialéctica que aquello que nos encierra es también lo que nos puede liberar.</p>'
        '<p>Pues entonces seamos libres, que lo demás, lo demás es sólo pop para divertirse.</p>',
    },

    # ── 2. La paradoja retro ──
    {
        'slug': 'nan-la-paradoja-retro',
        'title': 'La paradoja retro',
        'published_at': '2016-11-23T00:00:00.000-03:00',
        'tags': [{'name': '#es'}, {'name': 'Juegos'}, {'name': 'Videojuegos'}],
        'authors': [{'slug': 'juan'}],
        'custom_excerpt': 'El retrogaming es un fenómeno que va ganando terreno. Replay es una revista nueva sobre videojuegos viejos.',
        'disclaimer_html': '<hr><p><em>Esta nota fue publicada originalmente en <a href="https://lanan.com.ar/revistareplay-videojuegosretro/" target="_blank" rel="noopener noreferrer">NAN</a> el 23 de noviembre de 2016.</em></p>',
        'body_html': '<p>El <em>retrogaming</em> es un fenómeno que va ganando terreno desde hace más de una década, impulsado por el deseo de volver a jugar las joyas del pasado reciente. Replay es una revista nueva sobre videojuegos viejos, es bimestral, tiene 26 páginas y una calidad de diseño que se destaca.</p>'
        '<p>El editor del proyecto, Juan Ignacio Papaleo, tiene 37 años, es diseñador gráfico -lo cual explica la calidad de la revista- y <em>retrogamer</em>. Decidió encarar su propia epopeya editorial con Replay. Hecho que merece una ovación de pié porque editar en papel en 2016 es más jodido que atravesar un campo minado con los ojos vendados y un palo de escoba en el culo.</p>'
        '<p>A través de una exitosa campaña de <em>crowdfunding</em> en la plataforma idea.me, unas 415 personas bancaron el proyecto alcanzando la cifra para nada despreciable de 40 mil pesos. A principios de noviembre Replay llegó a las manos, puertas y buzones de todos sus auspiciantes/lectores.</p>'
        '<p>Nostalgia es lo primero que uno siente cuando ve la revista. Y es inevitable. El slogan de Replay es: "La revista para la generación de 8 y 16 bits". La publicación está teledirigida como un misil a los recuerdos más preciados de una infancia noventosa rodeada de videojuegos. Pero ¿hay algo más allá de la nostalgia?</p>'
        '<p>Consolas de 8 bits fueron el Family Game o NES (Nintendo Entertainment System) y la Sega Master System -que practicamente no llegó a la Argentina-. Dato de color: la NES y el Family son la misma consola pese a que, por una cuestión de marketing, tuvieron nombre y forma distinta según el país en el que se distribuían.</p>'
        '<p>De 16 Bits son la SNES – o Super Nintendo- y la mítica SEGA. Consolas que marcaron a fuego la infancia de todos los que nacimos en algún momento de los 80\' y crecimos durante la década del 90\' en pleno estado de gracia menemista, convertibilidad y desintegración social. La denominación de 8 y 16 bits proviene de la arquitectura de procesamiento del chip de la consola. Una consola es una computadora. Pero para jugar.</p>'
        '<h2>Retro vs. Clásico</h2>'
        '<p>En su libro <em>Retromanía</em>, Simon Reynolds intenta encontrar las causas de la obsesión que tiene la industria de la música con su pasado reciente. Podemos encontrar similitudes entre este análisis con el mundo de los videojuegos.</p>'
        '<p>Reynolds distingue dos categorías que en general usamos como sinónimos pero no lo son: lo <em>retro</em> y lo <em>vintage</em>. <em>Retro</em> es un producto nuevo que emula un producto del pasado. Por ejemplo, un juego del año 2016 pero con estética y jugabilidad de uno del año \'92. En cambio, <em>vintage</em> es algo viejo. Un cartucho de Family del año \'92 es <em>vintage</em>. Entonces cuando se habla de <em>retrogaming</em> en realidad deberíamos decir <em>vintage gaming</em>. Parece una diferencia medio boluda, pero no lo es. Hay una clave ahí para entender cómo viene la mano.</p>'
        '<p>Por ejemplo, cuando escuchamos Paranoid de Black Sabbath no decimos que estamos escuchando música retro. Pasa lo mismo con los libros. Leer <em>Ulises</em> de James Joyce es leer un clásico. Nadie habla de literatura retro. La diferencia en el uso común entre <em>retro</em> y clásico es que el primer término encierra un sesgo peyorativo. Como si lo que sentido común nombra como retro fuese <em>kitsch</em> o no tuviera un valor propio. Con 44 años de historia los videojuegos ya son una expresión artística independiente de las otras con un valor intrínseco propio. Y ya estamos en condiciones de poder enumerar y disfrutar los clásicos dentro de este arte.</p>'
        '<p>Hay algo de los videojuegos de esta generación que nos hace jugarlos de nuevo.</p>'
        '<p>Simon Parkin, periodista de la revista New Yorker, sostiene que el fenómeno <em>retro</em> en parte está marcado por la propensión de los videojuegos a ser obsoletos. Con cada nueva generación de software y hardware, la generación anterior de videojuegos queda obsoleta. Si bien esto se dio en la música y en las películas, en el caso de los juegos no solo depende del soporte sino de la computadora o consola que interpreta ese soporte. Entonces, los videojuegos tienen como cierta disposición a ser olvidados y suplantados por lo más nuevo, por lo mejor, por lo de la nueva generación.</p>'
        '<p>En la actitud de rescatar el pasado hay un intento de volver a buscar el valor de cada juego, el valor que aportó en su contexto, el hecho de que fue un eslabón en la evolución de la industria y la posibilidad de que tal vez sea único. Las limitaciones de cada plataforma influenciaron el diseño y la estética de los juegos en formas particulares. Dieron piezas únicas e irrepetibles. Este es el valor propio de cada generación más allá del efecto nostalgia.</p>'
        '<p><em>Super Mario World</em>, <em>Sonic</em>, <em>Contra</em>, <em>Tetris</em>, <em>Zelda</em>, <em>Castlevania</em> y muchos títulos más siguen siendo considerados como clásicos un cuarto de siglo después de su lanzamiento por lo geniales que fueron pese a las restricciones de la época. Jugarlos sigue siendo divertido.</p>'
        '<h2>La paradoja retro</h2>'
        '<p>Replay tiene su base de operaciones en José Mármol lo cual la inserta en la noble tradición de revistas autogestionadas de zona sur como Burra y NAN. Se puede conseguir en kioscos de diarios y varios puntos de venta que figuran en su web donde, además puede comprarse.</p>'
        '<p>Juan Ignacio decidió hacer la publicación en principio porque no lograba conseguir la revista Retrogamer en su kiosco de diarios. La Retrogamer se publica desde el año 2004 en Inglaterra y es la referente del género. Pero a medida que se fue insertando en la pequeña pero activa escena <em>retrogamer</em> local descubrió dos valores que a mi parecer pueden ser los pilares de Replay.</p>'
        '<p>Por un lado, Juan Ignacio destaca de algún modo la paradoja de que algo que es del pasado sea actual, la paradoja <em>retro</em>: "Hoy está súper activo todo esto. Podés tener juegos \'viejos\' que nunca tuviste vía emuladores que en definitiva son nuevos para vos. El proyecto Nave es un videojuego <em>arcade</em> acá en Argentina pero nuevo, es de hoy. Las ferias suceden hoy, están acá, podés ir. No es algo viejo, no es todo viejo, al revés, es todo novedad".</p>'
        '<p>Y por otro lado, resalta un componente muy local que tiene que ver con la asimilación de la cultura <em>gamer</em> noventosa por estas pampas: "Acá hay algo muy copado en Argentina, que también nos parece material para hablar, y es que acá entraron muchas cosas alternativas. Como no teníamos Nintendo oficial teníamos todos clones y unas <em>falopeadas</em> tremendas. Por ejemplo, <em>hacks</em> de Mario de todos lados y muchos más juegos que eran todos <em>hacks</em> con etiquetas. Eran re <em>falopa</em>. No tener lo oficial está buenísimo porque hay un montón de bizarreadas, y además podés tener todos esos cartuchos que son una joya y están dentro de todo baratos".</p>'
        '<p>Creo que es en estos dos valores donde Replay puede hacer un aporte interesante a la escena <em>gamer</em>. Muestra la actualidad y el regreso del <em>classic gaming</em> sin el estigma de lo <em>retro</em> ayudándonos a comprender el valor propio de los juegos de esta era; el valor único de los juegos truchos, la cultura pirata, el <em>hackeo</em> y la modificación de videojuegos en un guiño cuasi punk que hermana estos intentos con otros mercados ilegales: los LEGO chinos, la escena <em>toymaker</em> de muñecos de resina y los <em>mockbuster</em> en el cine.</p>'
        '<p>Estos son los aportes fundamentales de Replay a la cultura en general. Algo mucho más que un simple gesto nostálgico.</p>',
    },

    # ── 3. Game over o el fin de la diversión ──
    {
        'slug': 'starcraft-cyber',
        'title': 'Game over o el fin de la diversión',
        'published_at': '2014-04-24T00:00:00.000-03:00',
        'tags': [{'name': '#es'}, {'name': 'Juegos'}, {'name': 'Videojuegos'}],
        'authors': [{'slug': 'juan'}],
        'custom_excerpt': '¿La profesionalización de los gamers es otra derrota del tiempo libre en manos del capital? De espaciales noches adolescentes a dilucidar el negocio de los videojuegos.',
        'disclaimer_html': '<hr><p><em>Esta nota fue publicada originalmente en <a href="https://lanan.com.ar/game-over/" target="_blank" rel="noopener noreferrer">NAN</a> el 24 de abril de 2014.</em></p>',
        'body_html': '<p>Cumplí 12 años y un tío me regaló el nuevo juego de computadora de moda: Tomb Raider. En la tapa aparecía una voluptuosa mujer en mini-shorts sosteniendo dos pistolas de grueso calibre en pose seductora: Lara Croft. Aprendí a ser prejuicioso; más bien, a seguir mi propia intuición. La tapa me pareció una mierda, lo que me hizo sospechar que el juego también lo sería. Lo instalé. Doble click al ícono en el escritorio. Pantalla negra y después de vuelta al escritorio. No lo podía jugar. La Pentium 166 que el magro sueldo de mi padre había podido comprar en cuotas no tenía la capacidad suficiente para correrlo. Sospecha confirmada: un juego que no se puede jugar es una mierda.</p>'
        '<p>Tenía el mismo sentimiento respecto al fútbol. Nací sin la habilidad suficiente para ejecutarlo de una forma al menos decente. Por eso, siempre pensé que el fútbol era una mierda porque no podía jugarlo. Jamás lo dije en voz alta por miedo a ser linchado en un país donde la gente se mata, literalmente, por la pelota.</p>'
        '<p>Tomé el CD de Tomb Raider y fui a la casa de videojuegos donde me lo habían comprado, a cambiarlo. Un local donde te vendían el Resident Evil diciéndote: "Éste es de marcianos, maestro". Mirando una carpeta con portadas de juegos de PC, elegí uno titulado StarCraft (SC). Por la tapa, obvio. Prejuicio confirmado, otra vez. Esperé a que el chabón del local vaya a buscar el CD trucho y listo. Transacción completa.</p>'
        '<p>Llegué a casa. Instalé el juego. Doble click, unos segundos de incertidumbre y ¡pum!, la Pentium 166 lo corrió sin problemas. Arrancó con una cinemática de calidad excesiva. Cuasi cinematográfica. Jugué doce horas de corrido.</p>'
        '<h2>StarCraft: la perfección del RTS</h2>'
        '<p>Creado el mismo que año que Zidane vacunó al Brasil de Ronaldo, 1998, por Blizzard Enterteinment (empresa de juegos masivos online), SC es un videogame de estrategia RTS (Real Time Strategy). Cuando salió, le decíamos "de estrategia", a secas. La diferencia entre un RTS y un juego clásico de estrategia es que estos son por turno, como el T.E.G. o el ajedrez. En los RTS el tiempo de juego es continuo, no se detiene, no hay turnos. SC es un juego de estrategia en el cual hay que hacer, básicamente, tres cosas para lograr el objetivo final, derrotar al contrincante.</p>'
        '<p>1) Juntar recursos.<br>2) Armar una base.<br>3) Construir un ejército.</p>'
        '<p>En el universo SC tres razas de seres vivos compiten por el territorio: Protoss, Terran y Zerg. La galaxia les queda demasiado chica, entonces deben exterminarse los unos a los otros. Las especies están relacionadas entre sí como una tríada al estilo piedra-papel-tijera. Los tres factores que componen la interrelación son: velocidad, fuerza y costo. Los Terran son más rápidos que los Protoss pero más lentos que los Zerg. Los Terran son más "caros" de producir que los Zerg pero más baratos que los Protoss, y a su vez son más fuertes que los Zerg pero más débiles que los Protoss. Las batallas se dan en determinados escenarios con cantidades limitadas de espacio y recursos, lo cual indica el nivel de dificultad de un mapa específico para jugar y la cantidad de jugadores que ese mapa se banca. El juego se podía jugar contra la inteligencia artificial o en multiplayer.</p>'
        '<h2>Segundo encuentro: junio de 2002</h2>'
        '<p>Promediando mis 15 años, la gran mayoría de la gente de mi edad salía a bailar. Yo no. Yo usé jogging hasta los 17. Así que mis salidas nocturnas tenían poco y nada de ir a bailar.</p>'
        '<p>La novedad para ese año en el barrio era el ciber de Tera. Estaba abierto casi toda la noche. Lo atendía su dueño, Tera, un coreano bastante roñoso que se pasaba las veinticuatro horas del día en el local. Se bañaba con una canilla que había en el patio, al aire libre, y vivía en un entrepiso del local cuyo único mobiliario era un colchón hecho mierda. Colchón que usaba para garchar con putas, dependiendo el horario de la noche.</p>'
        '<p>La primera vez fui con dos amigos. Pagamos cuatro pesos y jugamos dos horas en LAN. Fue la primera vez que jugué al Counter Strike. Aburrido, me puse a charlar con el empleado de Tera, un esmirriado ser con pinta de Keanu Reeves en Matrix que se hacía llamar Galford. Le comenté que jugaba al SC, me dijo que jugaba con Tera. Jugamos ocho minutos. Me liquidó.</p>'
        '<p>Mientras mi cuerpo aún estaba tibio, Galford me contó que era imposible ganarle a Tera. Ese día me quedé hasta tarde esperando verlo jugar. Era impresionante, casi no usaba el mouse y daba todas las órdenes a las unidades usando el teclado. Los dedos alcanzaban velocidades grotescas. Parecía que el coreano tenía algún tipo de superioridad biológica para viciar.</p>'
        '<h2>Tercer encuentro: 2011</h2>'
        '<p>Compré la versión online de StarCraft II. Actualicé mi cuenta de Battle.net (la plataforma multi-jugador de Blizzard que permite jugar online y es la más grande del mundo), prendí un churro y me dispuse a jugar. Me interesaba la opción multiplayer. Quería medir mis capacidades contra oponentes humanos. Accedí con el nickname "JuanPeron".</p>'
        '<p>Jugué la primera partida. Perdí estrepitosamente. Jugué la segunda. Volví a perder, escandalosamente. Jugué la tercera. Perdí. La cuarta. Perdí. La quinta. Perdí. La sexta. P-A-L-I-Z-A. La séptima. Perdí. La octava. Perdí. Me frustré. Prendí el segundo churro de la noche e intenté analizar en frío cómo llegué a este estado tan deplorable de angustia existencial. Me consideraba un buen jugador. Aún con el efecto de los psicoactivos trabajando en mis neuronas, le comenté frustrado a un conocido, Nacho, que estaba jugando SC II, la experiencia.</p>'
        '<p>A la semana siguiente, nos juntamos a jugarlo. De ponerla, ni hablar. Pedimos comida china y Nacho me empezó a mostrar cómo jugar en modo Pro. Tecleaba con una mano frenéticamente y con la otra movía el mouse para todos lados. Concentrado. No se distraía ni un segundo. En menos de diez minutos, las bases enemigas estaban sometidas a un asedio constante. El rival se rindió y concedió la partida. Lo mismo otra vez, otra vez y otra vez. Para cuando terminó, estaba fusilado. Bajoneamos lo que quedaba de chao-fan y Nacho se fue.</p>'
        '<p>No terminaba de entender bien qué acababa de suceder. Mi modo apacible de juego, de disfrute de cada partida, parecía arcaico. Me volví un jugador obsoleto. La repetición constante de los movimientos de los dedos sobre el teclado constituía una nueva forma de jugar. Ya no se trataba de disfrutar del juego. Por el modo de ver jugar a Nacho, sospechaba que el jugar se había vuelto algo muy similar a trabajar. Poco quedaba en pie del goce del juego, del jugar por jugar. Esto era otra cosa. Esto lo había visto alguna vez en Tera. El coreano del ciber jugaba igual.</p>'
        '<h2>Todo es culpa de los coreanos</h2>'
        '<p>El abismo de diferencia entre lo que fue jugar al SC y SC II es responsabilidad estricta de Corea del Sur. Me explico: por una de esas aleatoriedades de la humanidad, SC se volvió furor en Corea del Sur. Ya desde el año 2000 funcionaba la KeSPA (Korea e-Sports Association), una asociación aprobada por el Ministerio de Cultura y Turismo de Corea del Sur, creada con el fin de promover la naciente industria de los e-sports. Para 2002, los dos principales canales dedicados a e-games (Ongamenet y MBCGame) se asociaron con la KeSPA y crearon dos ligas de SC en las que participaría un selecto grupo de jugadores profesionales. Los partidos se transmitirían en vivo y se repartiría dinero en premios para los ganadores. Entre ambas ligas, llegaron a dar 4 millones de dólares en premios hasta el año pasado, cuando la dieron de baja para migrar al SC II.</p>'
        '<p>El mercado explotó. Se multiplicaron las ligas, los horarios de emisión por televisión y así un simple juego de estrategia hecho en Estados Unidos se convirtió en deporte nacional en Corea. Globalización, le dicen. Las finales de una liga llegaron a juntar 50 mil personas para presenciarlas en vivo y fueron vistas por varios millones en todo el país a través de la televisión.</p>'
        '<p>Las marcas de tecnología, como Samsung e Intel, y las telefónicas de Corea, como SK Telecom y KT, no tardaron en apoyar la nueva industria. A cambio del sponsoreo conseguían toneladas de publicidad en los programas coreanos más vistos. De estas ligas saldría una legión de jugadores que llevaría al SC constantemente hacia el límite, actualizando en forma constante las estrategias de juego y la competitividad de las partidas.</p>'
        '<p>Como caso podemos señalar a Lim Yo-Hwan, uno de los jugadores más emblemáticos de SC Brood War. Bajo su seudónimo "SlayerS_BoxerS", ganó más de 500 partidos de liga transmitidos por televisión y dos veces el World CiberGame Championship. Tiene un ingreso actual de 400 mil dólares anuales, más 90 mil extras por auspiciantes, según el sitio esportsearnings.com.</p>'
        '<p>La gran innovación de los coreanos en el juego fue usar en un altísimo porcentaje el teclado para coordinar las acciones del ejército. El juego originalmente se había pensado para jugar con mouse y teclado, pero la mayoría de los seres humanos jugaba casi exclusivamente con el mouse. Los coreanos aprovecharon una función secundaria del juego de manera asombrosa: las hotkey. Una hotkey es un atajo que se puede usar para dar una orden apretando sólo una tecla del teclado en vez de marcar la misma orden con el mouse en la interfaz de juego.</p>'
        '<p>Esto les permitió a los coreanos llevar la coordinación a un nivel realmente extremo y desarrollar estilos de juego frenéticos. El juego se volvió así atractivo para una gran audiencia, ya que los tiempos de las partidas se acortaron considerablemente y se volvieron mucho más excitantes para que las vieran los espectadores.</p>'
        '<p>Para tener una idea de cuán serio se volvió este asunto del uso prominente del teclado, se creó un parámetro para calcular la cantidad de acciones de cada jugador por minuto. El índice de APM (Action Per Minute). En base a esto, se calculó que un jugador principiante tiene un APM de 50 y un jugador profesional de al menos 300. Vale considerar que los APM de los profesionales muchas veces contienen repeticiones de órdenes ya dadas. Al fenómeno se lo considera SPAM y se refiere a acciones no productivas que repiten comandos ya dados.</p>'
        '<p>Algo que había nacido como un inocente entretenimiento, estaba alcanzando el status de trabajo.</p>'
        '<h2>La universalización del modelo coreano</h2>'
        '<p>Casi diez años después del lanzamiento de SC, Blizzard anunció el desarrollo de StarCraft II (SC II) el 19 de mayo de 2007 en el Blizzard Worldwide Invitational de Seúl, Corea del Sur. La elección del lugar para anunciarlo no fue inocente. Blizzard intentaría replicar el éxito de SC en Corea pero a nivel global. En 2010, sacó a la luz la nueva versión del videogame. Fue un éxito: antes de finalizar ese año llevaba vendidas 4.5 millones de unidades.</p>'
        '<p>Las modificaciones más importantes en torno al juego se dieron en la experiencia. No se puede jugar sin conexión a Internet y sin cuenta en Battle.net. La empresa creó servidores especiales para cada continente y uno aparte para Corea del Sur. El modo multiplayer ahora consta de un ranking por ligas en el cual todos los jugadores están inmersos. La competencia y los rankings se volvieron parte central del juego. No se puede jugar contra otros jugadores partidas que queden fuera del ranking. Todos los jugadores tienen un registro de sus victorias y derrotas, y acorde a eso se los ubica en las ligas de bronce, plata, oro, platino y diamante. Esta innovación llevó a los jugadores occidentales a emular el estilo coreano para perfeccionar el propio y no quedar en las ligas más bajas.</p>'
        '<p>Para 2012, Blizzard realizó por primera vez la liga mundial de SC II, la Battle.net World Championship Series. Lo cual convirtió a la competencia de SC II en global, al mejor estilo ATP World Tour.</p>'
        '<h2>Algunas conclusiones</h2>'
        '<p>La anterior exploración sobre el SC deja en claro la transformación que tuvo, de ser un juego menor de estrategia hasta convertirse en una experiencia de éxito comercial a nivel mundial.</p>'
        '<p>La consecuencia fundamental de la universalización de la experiencia sur-coreana fue la de transformar un juego diseñado originalmente para el entretenimiento en un trabajo. La globalización de los rankings y el foco que se hizo en el modo multi-jugador subsumieron al juego a una dinámica de competencia de alto rendimiento en la que se premia simbólicamente (mediante rankings virtuales) a una gran mayoría y monetariamente (premios por torneos) a una minoría. Minoría a la cual esa gran mayoría aspira pertenecer.</p>'
        '<p>La frontera del juego (libre de todo interés) se borra y se entra en el terreno de la competitividad. Una gran mayoría de los jugadores actualmente se enfoca mucho más en perfeccionar su juego que en sencillamente entretenerse. El jugador actual está enfocado en subir de ranking más que en disfrutar. Utiliza gran parte de su tiempo viendo videos de estrategias, leyendo sobre diferentes formas de construir un ejército más eficiente o analizando los mapas en los que más le conviene jugar. Su actitud frente al juego dista mucho de ser propia del ocio. Parece una actitud más bien cercana a la sentencia con la que arrancaba la canción de apertura de la serie de dibujitos animados Pokémon: "Tengo que ser siempre el mejor, mejor que nadie más".</p>'
        '<p>Este modo subsume el juego a una lógica más propia del capital, es decir la de utilizar el tiempo libre en forma productiva. Ya no se juega por jugar (el principio del ocio es la acción libre) sino que se juega para aumentar el ranking, para mejorar el promedio entre partidas ganadas y perdidas o para ascender a las ligas mayores. El <em>South-Korean StarCraft way of life</em>.</p>'
        '<p>Sin embargo, la paradoja trabajar de jugar persiste en un grupo selecto de jugadores que es premiado con dinero (¿o asalariado?). A la vez, funciona como modelo a seguir para millones de jugadores cuyo único rol frente a la industria es la de consumidores.</p>'
        '<p>Pese a la aparente paradoja que entraña que te paguen por jugar, hay algo muy claro: todo lo que produzca plusvalía puede ser un trabajo. Punto. Aquí es donde la paradoja se termina. El capital permite que hagas lo que quieras, mientras eso genere guita.</p>'
        '<h2>Epílogo</h2>'
        '<p>Pese a la globalización de la manera de jugar al StarCraft que se forjó en Corea, los coreanos aún mantienen la hegemonía en el dominio del juego. La última edición del Battle.net World Championship Series la ganó un coreano. Y pareciera que esta hegemonía no corre riesgo alguno. La capacidad de procesar información de estos tipos es virtualmente ilimitada. En un futuro no muy lejano, un grupo de jóvenes sur-coreanos a cargo de un ejército de androides Samsung tomará el mundo, desde sus computadoras. Todo terminará en quince minutos.</p>',
    },

    # ── 4. Reddit vs. Wall Street ──
    {
        'slug': 'cenital-reddit-vs-wall-street',
        'title': 'Todo lo que tenés que saber para entender el episodio Reddit vs. Wall Street',
        'published_at': '2021-01-31T00:00:00.000-03:00',
        'tags': [{'name': '#es'}, {'name': 'Tecnología'}, {'name': 'Internet'}, {'name': 'Cripto'}],
        'authors': [{'slug': 'juan'}],
        'custom_excerpt': 'El 21 de agosto de 2020, el usuario de YouTube Roaring Kitty compartió un video analizando el precio de las acciones de GameStop.',
        'disclaimer_html': '<hr><p><em>Esta nota fue publicada originalmente en <a href="https://cenital.com/todo-lo-que-tenes-que-saber-para-entender-el-episodio-reddit-vs-wall-street/" target="_blank" rel="noopener noreferrer">Cenital</a> el 31 de enero de 2021.</em></p>',
        'body_html': '<h2>I</h2>'
        '<p>El 21 de agosto de 2020, el usuario de YouTube Roaring Kitty compartió un video analizando el precio de las acciones de GameStop. La empresa se dedica a la venta de videojuegos, accesorios para consolas, merchandising y juegos de mesa, con cinco mil sucursales en Estados Unidos y funcionando como casa de cambio de videojuegos usados. Es la casa de compra/venta de juegos usados más grande de Estados Unidos. El video se titulaba "The Big Short SQUEEZE from $5 to $50? Could GameStop stock (GME) explode higher?".</p>'
        '<p>Roaring Kitty explicaba que aunque GameStop enfrentaba declive por la venta online de videojuegos, existían factores positivos que podrían posicionarla como empresa relevante en el mercado. Sin embargo, importantes fondos de inversión (hedge funds) apostaban contra la compañía mediante "shorts", intentando capitalizar la caída de acciones.</p>'
        '<p>Hacer un "short" consiste en pedir prestadas acciones para venderlas, esperando que bajen de precio. Cuando bajan, se recompran, se devuelven y se embolsa la diferencia. Si suben, las pérdidas son potencialmente infinitas.</p>'
        '<p>Un ejemplo: si creo que Cachito Inc. bajará, pido prestadas 100 acciones a $100, las vendo obteniendo $10,000. Cuando caen a $50, compro las 100 acciones por $5,000, devuelvo el préstamo y gano $5,000.</p>'
        '<p>Fondos como Melvin Capital y Citadel estaban llevando adelante esta maniobra cuando interfirió el subreddit r/WallStreetBets. Reddit es una plataforma social donde usuarios crean comunidades sobre tópicos variados. WallStreetBets, descrito como "Like 4chan found a Bloomberg terminal", es un espacio dedicado a discusiones financieras con tono provocador e irónico.</p>'
        '<h2>II</h2>'
        '<p>El 22 de enero de 2021, usuarios de r/WallStreetBets iniciaron un rally masivo de acciones de GameStop. Sin coordinación formal más allá de artículos en el subreddit, compraron GME y apostaron contra el short de Melvin y Citadel, causando un "short squeeze" que tomó desprevenidos a los fondos.</p>'
        '<p>La jugada fue efectiva: el precio se disparó, obligando a los fondos a recomprar acciones para evitar pérdidas mayores. Esto generó alzas aún mayores. En cinco días, las acciones de GME cotizaban a $396 USD, casi diez veces el valor inicial. Durante la corrida, Wall Street suspendió múltiples veces la compra/venta por "excesiva volatilidad".</p>'
        '<p>Mientras ocurría esto, medios esparcían la noticia como incendio. El meme de pequeños compradores contra gigantes de Wall Street era irresistible, creando retroalimentación positiva que llevó a más usuarios a sumarse a WSB. El furor alcanzó otras empresas como AMC, Blockbuster y Nokia.</p>'
        '<p>Muchas inversiones se realizaron vía RobinHood, aplicación que ganó popularidad durante la pandemia, permitiendo a usuarios comunes comprar y vender acciones sin certificación. Esto coincidió con cheques de estímulo de $1,200 USD entregados por Donald Trump, generando un boom de "pequeños inversores" en 2020.</p>'
        '<p>Sin embargo, durante la corrida de GME, RobinHood detuvo varias veces las compras y usuarios reportaron que la aplicación vendió sus acciones sin consentimiento. El escándalo fue tal que usuarios de WSB calificaron negativamente la app en Google Play, pero Google borró esas calificaciones. Los usuarios de RobinHood sintieron así los embates del establishment económico intentando frenar movimientos alcistas.</p>'
        '<h2>III</h2>'
        '<p>Aunque noticias sobre GameStop pasaron a segundo plano, la disputa continúa. Melvin y otros fondos afirman ante Reuters que sus posiciones están cerradas. Pero usuarios de WSB desconfían, sospechando que aunque las posiciones originales cerraron, nuevas posiciones se abrieron para obtener beneficios.</p>'
        '<p>Factor importante: qué narrativa se impuso. La mayoría de información circuló de segunda, tercera o cuarta mano. Salvo algunos periodistas informados, el público desconocía dinámicas de comunidades online y fondos profesionales. En un "teléfono descompuesto global", versiones disparatadas circularon: desde ataques de "extrema derecha" hasta "fin del capitalismo".</p>'
        '<p>El evento deja conclusiones importantes: primero, la coordinación masiva de mercado por usuarios sin contacto mutuo. Esto es acción descentralizada, "ataque" sin centro visible. Esta dinámica ocurrió antes en GamerGate (batalla entre fans sobre connivencia prensa-compañías de videojuegos) y elecciones presidenciales 2016 (acciones descentralizadas instalando narrativas mediante memes). Análisis posteriores de prensa tradicional intentaron explicar fenómenos bajo modelos centralizados y fallaron. La coordinación espontánea y uso de memes como armas para narrativas ("weaponized memes") es campo fascinante para investigación.</p>'
        '<p>Segundo, acercamiento irónico de estos grupos. Pocos realmente creían que GameStop tenía "buenos fundamentos". El movimiento no estaba motivado por creencia en lo que se compra, sino por creencia en el grupo. La cohesión entre usuarios desafiando poder establecido era más fuerte que el "valor" de las acciones.</p>'
        '<p>Esto es meme que implica conducta. Como "ice bucket challenge" o "harlem shake", la corrida alcista de GME es conducta memética implicando acción real con sentido "performático". Se corrobora leyendo mensajes destacados de r/WallStreetBets.</p>'
        '<p>Mientras esperan reapertura bursátil, quienes mantienen posiciones (compraron y no vendieron) podrían hacer mucho dinero vendiendo, pero instan a mantener posiciones firmes, tener "manos de diamante" (versus "manos débiles" que venden rápido) y aguantar hasta cierre de posiciones de Melvin y Citadel, intentando llevarlos a quiebra. Sea verdadero o ilusión colectiva, motoriza a usuarios a mantenerse firmes contra embates financieros, tecnológicos y mediáticos.</p>'
        '<p>Finalmente, el acercamiento irónico revela ruptura entre orden de "conocedores" y "turba ignorante". Usuarios de Internet con organización descentralizada desafían modelos predictivos de fondos profesionales de Wall Street. La línea entre expertos e ignorantes se difumina volviéndose irreconocible.</p>'
        '<p>Como señala filósofo Santiago Gerchunoff, "la ironía es marca de democratización borrando fronteras entre élite y gente común". Keith Gill (Roaring Kitty), sentado en silla gamer frente a dos monitores, mira satisfecho cómo se confirma su tesis alcista sobre GameStop, resumida en video de cinco minutos subido a YouTube casi cinco meses antes.</p>',
    },

    # ── 5. Rouzed / 4chan argentino (Spanish) ──
    {
        'slug': 'row-rouzed-4chan-argentino',
        'title': 'El 4chan argentino cierra tras sospechas de que el atacante de Cristina Fernández era usuario',
        'published_at': '2022-09-07T00:00:00.000-03:00',
        'tags': [{'name': '#es'}, {'name': 'Tecnología'}, {'name': 'Internet'}],
        'authors': [{'slug': 'juan'}],
        'custom_excerpt': 'Usuarios de Rouzed lanzaron acusaciones mutuas tras el atentado contra la vicepresidenta argentina antes de que el sitio fuera eliminado.',
        'disclaimer_html': '<hr><p><em>Esta nota fue publicada originalmente en <a href="https://restofworld.org/2022/rouzed-4chan-argentino-cierra-cristina-fernandez/" target="_blank" rel="noopener noreferrer">Rest of World</a> el 7 de septiembre de 2022.</em></p>',
        'body_html': '<p>El jueves pasado, Fernando Sabag André Montiel habría intentado asesinar a la vicepresidenta de Argentina, Cristina Fernández de Kirchner. El arma no disparó, Fernández fue puesta a salvo y Montiel detenido. Cuando imágenes de Montiel comenzaron a circular públicamente, los usuarios de un foro en línea argentino afirmaron reconocerlo como usuario e inmediatamente intentaron desvincularse del posible asesino.</p>'
        '<p>El foro, Rouzed, era una comunidad digital argentina donde posteos anónimos sobre temas banales como el cuidado del cabello y memes de humor se mezclaban con temas de conversación llenos de comentarios o memes racistas, de acoso sexual e incluso de discriminación a personas con síndrome de Down. Los operadores del sitio desconectaron el foro poco después del ataque a la vicepresidenta, luego de que varios usuarios se acusaran mutuamente de complicidad en el atentado y hablaran de "ocultar evidencia" que vinculara a Rouzed con Montiel. Los administradores cerraron el sitio cuando comentarios como "el tirador era un rouzero" comenzaron a aparecer.</p>'
        '<p>Para el sábado 3 de septiembre, los creadores del espacio abrieron un nuevo foro denominado "Boxed". Ese mismo día, una cuenta de Telegram administrada de forma anónima presentó a la comunidad un nuevo sitio, afirmando en el chat grupal "[Rouzed en el exilio]" que Boxed era el heredero de Rouzed. "La idea es reunir a todos en el mismo lugar. [No voy a dejar que \'la R\' muera]", dijo el administrador de ese chat. Rest of World intentó contactar a los administradores de Boxed a través del mail publicado en el sitio para preguntar por qué había cerrado Rouzed y si el nuevo sitio abordaría los problemas de incitación al odio, pero no recibió respuesta al momento de la publicación.</p>'
        '<p>La estructura anónima, pública y no moderada de Rouzed creó un "caldo de cultivo para la radicalización", dijo a Rest of World Niv Sardi, un activista y desarrollador de código abierto que ha estudiado ampliamente las redes sociales y la violencia política. "Es común pensar que \'esa gente\' [los extremistas] existen en lugares oscuros, exclusivos, inaccesibles, pero, en verdad, sus ideas se pueden encontrar en cualquier parte. El hecho de que el extremismo sea una secta no significa que esté cerrado al público. El peligro es, precisamente, que es muy fácil de encontrar".</p>'
        '<p>El empleo de Rouzed como hub para extremistas lo convierte en parte de una tendencia global de sitios de chat anónimos, públicos y relativamente no moderados. Uno de los más famosos, 4chan, también tiene una historia problemática de mezclar contenido banal con discursos de odio. Recientemente, un tirador en Buffalo, Nueva York, supuestamente fue identificado como un posteador frecuente en el sitio.</p>'
        '<p>Antes de que los moderadores de Rouzed cerraran el foro, los comentaristas recircularon publicaciones que le adjudicaban a Montiel, incluidas supuestas imágenes de él mismo con tatuajes nazis en los brazos, lo que, según indicaron, les permitió reconocerlo como el atacante de Fernández.</p>'
        '<p>"En caso de una investigación de alguna entidad federal o similar, yo no tengo ninguna relación con este grupo ni con las personas que están en él, no sé cómo estoy aquí, probablemente agregado por un tercero, no apoyo ninguna acciones de los miembros de este grupo", dijo un usuario en el foro Rouzed, publicando el mensaje en español, inglés, francés, japonés y portugués.</p>'
        '<p>Sardi, que ha estudiado sitios como 4chan, señaló que el hecho de que Rouzed fuera un sitio de fácil acceso y sin moderación funcional también condujo a su caída. La amplitud de los temas en el sitio hizo que su comunidad fuera mucho más "diversa", dijo, de lo que cabría esperar de un núcleo atomizado de extrema derecha. Las presuntas publicaciones de Montiel indican una ideología en los márgenes del sitio, y cuando otros usuarios se encontraron participando en el mismo foro que el posible tirador, muchos temieron que también los identificaran con esas ideas.</p>'
        '<p>Sin embargo, al igual que había usuarios que no compartían la ideología de Montiel, muchos otros probablemente temían haberse "quedado sin antro debido a un normie", como comentó un usuario en Boxed.</p>'
        '<p>Ante la continuación de Rouzed como Boxed, Ezequiel Ipar, investigador del CONICET y profesor de teoría sociológica de la Universidad de Buenos Aires, explicó a Rest of World que el problema de fondo no era un individuo, como Montiel, ni un sitio web, como Rouzed, sino más bien, un problema sistémico. Uno en el que espacios digitales como Boxed hacen accesible el discurso de odio de una manera "barata, rápida y sencilla". Para confrontar verdaderamente el extremismo, Ipar abogó por la "educación en línea, de modo que cuando las personas se enfrenten a un mensaje de odio, no se queden simplemente shockeadas por su violencia, sino empoderadas para recuperar esas plataformas".</p>',
    },

    # ── 6. Rouzed / Argentina's 4chan (English) ──
    {
        'slug': 'row-rouzed-argentina-4chan',
        'title': "Argentina's 4chan taken down by admins after would-be assassin suspected as frequent user",
        'published_at': '2022-09-05T00:00:00.000-03:00',
        'tags': [{'name': '#en'}, {'name': 'Tech'}, {'name': 'Internet'}],
        'authors': [{'slug': 'juan'}],
        'custom_excerpt': "Rouzed users filled the forum with disclaimers that they weren't involved with the attempted assassination before the site was taken down.",
        'disclaimer_html': '<hr><p><em>This article was originally published in <a href="https://restofworld.org/2022/argentina-rouzed-4chan-taken-down-after-assassin/" target="_blank" rel="noopener noreferrer">Rest of World</a> on September 5, 2022.</em></p>',
        'body_html': '<p>Last Thursday, Fernando Sabag André Montiel allegedly attempted to assassinate the vice president of Argentina, Cristina Fernández de Kirchner. The gun did not fire, Fernández was whisked away safely, and Montiel was arrested. When images of Montiel circulated, users of one Argentine online forum claimed to recognize him as a fellow user, and immediately tried to disassociate themselves from the would-be assassin.</p>'
        '<p>The forum, Rouzed, was an Argentine digital community where anonymous posters mix banal conversations about hair care and memes with threads full of racist comments and sexual harassment. The site\'s higher-ups took the forum offline shortly after the attack on the vice president, doing so voluntarily after seeing the forum\'s members accuse each other of complicity in the attack, along with talk of "hiding evidence" linking Rouzed to Montiel. The administrators opted to close down the site when comments like "the shooter was a <em>rouzero</em>" began to gather traction.</p>'
        '<p>By Saturday, September 3, the site\'s creators had set up a new forum called "Boxed." That same day, an anonymously administered Telegram account introduced members to a new site, declaring on a group chat dubbed "Rouzed in exile" that Boxed was Rouzed\'s heir. "The idea is to reunite everyone in the same spot. I\'m not going to let \'the R\' die," said the moderator. Rest of World reached out to the administrators of Boxed to ask why Rouzed had been closed down and whether the new site would address the issues of hate speech on their forums, but received no answer at the time of publication.</p>'
        '<p>The anonymous, public, and unmoderated structure of Rouzed created a "breeding ground for radicalization," Niv Sardi, an open-source activist and developer who has extensively studied social media and political violence, told Rest of World. "It is common to think that \'those people\' [extremists] exist in dark, exclusive, inaccessible places, but, in truth, their ideas can be found anywhere. The fact that extremism is a cult doesn\'t mean that it is closed off from the public. The danger is precisely that it is very easy to find."</p>'
        '<p>Rouzed\'s status as a hub for extremists makes it a part of a global trend of relatively unmoderated, public, and anonymized chat sites. One of the most famous, 4chan, also has a troubled history of mixing banal content with hate speech. Just recently, a shooter in Buffalo, New York, was allegedly identified as being a frequent poster on the site.</p>'
        '<p>Before Rouzed moderators closed down the forum, users quickly began to recirculate posts they said were from Montiel, including purported images of himself bearing Nazi tattoos on his arms, which they said enabled them to recognize him as Fernández\'s attacker.</p>'
        '<p>"In case of an investigation by any federal entity or similar, I do not have any involvement with this group or with the people in it, I do not know how I am here, probably added by a third party, I do not support any actions by members of this group," said one user on the Rouzed forum, posting the message in Spanish, English, French, Japanese, and Portuguese.</p>'
        '<p>Sardi, who has studied sites like 4chan, said that the fact that Rouzed was such an easily accessible and functionally unmoderated site also led to its downfall. The breadth of subject matter on the site made its community much more "diverse," he said, from what one would expect from a far-right monolith. Postings purportedly by Montiel indicate an ideology on the site\'s fringes, so when other users found themselves participating in the same forum as the would-be shooter, many feared being identified with his philosophy as well.</p>'
        '<p>However, just as there were users who disagreed with Montiel, many likely feared that they\'d been "left without a hangout spot because of a normie," as one user commented on Boxed.</p>'
        '<p>Faced with the perpetuation of Rouzed as Boxed, Ezequiel Ipar, a researcher at CONICET and professor of sociological theory at the University of Buenos Aires, told Rest of World that the fundamental problem was not an individual, like Montiel, or a website, like Rouzed, but rather, a systemic issue. One in which digital spaces such as Boxed can easily make accessible hate speech in a "cheap, fast and simple" way. To truly confront extremism, Ipar advocated "online education, so that when people are faced with a message of hate, they are not left simply with the shock from its violence, but instead, empowered to take back those platforms."</p>',
    },
]


if __name__ == '__main__':
    print(f'Importing {len(ARTICLES)} articles into Ghost as drafts...\n')
    ok = 0
    for i, art in enumerate(ARTICLES, 1):
        print(f'[{i}/{len(ARTICLES)}] {art["title"]}')
        if create_post(art):
            ok += 1
        time.sleep(0.5)
    print(f'\nDone: {ok}/{len(ARTICLES)} articles imported.')
