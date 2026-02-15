#!/usr/bin/env python3
"""
Import Juan Ruocco's articles from Página 12 into Ghost CMS.
Creates draft posts with HTML content, disclaimer footer.
"""

import json
import jwt
import time
import re
import sys
from urllib.request import Request, urlopen

# Ghost config
GHOST_URL = 'https://421bn.ghost.io'
ADMIN_KEY = 'GHOST_ADMIN_API_KEY_REDACTED'
AUTHOR_ID = '66ce429421c1a70001f25110'  # Juan Ruocco


def get_token():
    key_id, secret = ADMIN_KEY.split(':')
    iat = int(time.time())
    payload = {'iat': iat, 'exp': iat + 300, 'aud': '/admin/'}
    return jwt.encode(payload, bytes.fromhex(secret), algorithm='HS256',
                      headers={'kid': key_id})


def create_post(token, title, slug, html, subtitle, date, source_url, source_name):
    """Create a draft post in Ghost using the html field."""
    disclaimer = f'''<hr>
<p><em>Este artículo fue publicado originalmente en <strong><a href="{source_url}">{source_name}</a></strong>. Se reproduce aquí con autorización del autor.</em></p>'''

    full_html = html + disclaimer

    post_data = {
        'posts': [{
            'title': title,
            'slug': slug,
            'html': full_html,
            'status': 'draft',
            'authors': [{'id': AUTHOR_ID}],
            'tags': [{'name': '#es'}],
            'published_at': date,
            'custom_excerpt': subtitle[:300] if subtitle else None,
        }]
    }

    data = json.dumps(post_data).encode('utf-8')
    req = Request(
        f'{GHOST_URL}/ghost/api/admin/posts/?source=html',
        data=data,
        headers={
            'Authorization': f'Ghost {token}',
            'Content-Type': 'application/json',
        },
        method='POST'
    )

    with urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read().decode('utf-8'))
        return result['posts'][0]


def delete_post(token, post_id):
    """Delete a post by ID."""
    req = Request(
        f'{GHOST_URL}/ghost/api/admin/posts/{post_id}/',
        headers={'Authorization': f'Ghost {token}'},
        method='DELETE'
    )
    with urlopen(req, timeout=30) as resp:
        return resp.status


# ── Article data ──────────────────────────────────────────────────────

ARTICLES = [
    {
        'title': 'Knotfest en el Parque de la Ciudad: el circo del deathcore y los choris veganos',
        'slug': 'knotfest-parque-de-la-ciudad-deathcore-choris-veganos',
        'subtitle': 'Adaptando los elementos típicos de un evento moderno, el festival del grupo de Iowa pisó fuerte para buscar mayor continuidad.',
        'date': '2024-10-30T18:29:00.000Z',
        'source_url': 'https://www.pagina12.com.ar/778936-knotfest-en-el-parque-de-la-ciudad-el-circo-del-deathcore-y-',
        'source_name': 'Página/12',
        'html': """
<p>En la era dominada por los festivales franquiciados (Lollapalooza, Primavera Sound, la vuelta de Creamfields), el Knotfest resalta como el esfuerzo de una banda para mantener ciertos márgenes de autonomía. Slipknot, que fácilmente puede ser considerada como una de las tres o cuatro bandas más importantes del new metal Y2K junto con Limp Bizkit, Linkin Park y Korn, aterrizó con su propio festival en Argentina por segunda vez, pero en esta ocasión al aire libre. La edición anterior, ni bien salíamos de la pandemia, había sido en el Movistar Arena con la presencia de ni más ni menos que Judas Priest. Ambas bandas tocaron cada una un día distinto.</p>

<p>Esta vez, en cambio, la banda de Corey Taylor eligió ni más ni menos que las ruinas del Parque de la Ciudad para hacer su presentación, esta vez toda en el mismo día. Pareciera difícil encontrar una mejor locación para la banda de las máscaras que un parque de diversiones destruído por la desidia, el paso del tiempo y el óxido. La propuesta emuló la organización de otros grandes festivales con un escenario central, un museo de las giras de Slipknot en una muy atinada carpa de circo, y diferentes propuestas comerciales: estacionamiento, patio de cerveza, locales de comida y puestos de merchandising oficial.</p>

<p>Si bien la propuesta gastronómica fue bastante amplia (incluyendo choripanes veganos), el sistema de compra que se impuso para festivales es más que engorroso. El día anterior, la organización avisó por la cuenta oficial de Instagram que era necesario adquirir una tarjeta prepaga para comprar la comida. La cerveza y el merchandising se podían pagar con un QR normal. Lo único un poco bizarro es que la cerveza sólo se podía tomar dentro del perímetro determinado, previa compra del vaso. Nobleza obliga, es la misma modalidad repetida en varios festivales grandes —su serie de requisitos burocráticos para un espectáculo de entretenimiento—, pero incluso queda más extraña en un festival organizado por Slipknot.</p>

<p>El lineup también contó con bandas locales, con la siempre ingrata tarea de abrir el festival. Bajo el sol tremendo de la primavera porteña, inauguró el concierto la banda Nvlo, que hace un deathcore con todos los ingredientes necesarios: voz podrida, blast beat y los necesarios breakdowns o cortes tan característicos de los géneros "core". La banda además viene en pleno crecimiento con tres discos de estudio, un vivo y la no menor presentación en el festival alemán de Wacken, el más importante del género en el viejo continente.</p>

<p>Después vino el turno de Arde La Sangre, la banda de dos ex Carajo, Corvata Corvalán y Teri Langer, que desplegaron su clásico altísimo nivel escénico y recorrieron su discografía. Es bastante significativo que no haya algo puntual para destacar sobre el resto, en una banda tan prolija y de semejantes músicos de este género: casi que es la rutina de lo perfecto.</p>

<p>Luego fue el turno del último invento de la OTAN, Babymetal, un grupo de idols asiáticas bajo ropaje metalero que convocó al público infanto-juvenil que participó del show a pura coreografía. Así introdujeron bastante de la cultura kpopera dentro de un público más bien reticente, aunque cabe destacar que el público del metal es histórico primo cercano de la cultura otaku. Y no solo dijo presente para la versión pesada de las idols de laboratorio sino que había mucha pareja de tipo humano metalero con chica otaku vestida de maid. Gran crossover que sirve para derribar el mito de la virginidad eterna del público metalero y además introduce nuevos componentes con mucha onda para el público vernáculo.</p>

<p>Ya cuando promediaba la tarde y asomaba la hora mágica (ese momento del día que la luz del sol adquiere tonalidades ámbar y se vuelve un filtro de Instagram natural), fue el turno del plato más fuerte del festival: Meshuggah. Los suecos formados en 1987 desplegaron toda su potencia musical de la mano del death metal ultra técnico que los caracteriza. Etiqueta que resulta algo inútil dada la influencia, variedad y registro que maneja la banda de Jens Kidman. Es increíble pensar que el grupo comparte país de origen con Abba. En realidad, lo que es increíble es el abanico de la música sueca, también cuna de los productores pop más destacados del Siglo XXI y de Spotify (como para tener en cuenta). Como sea, la banda cerró con <em>Bleed</em> y <em>Demiurge</em>, dos temas capaces de enterrarte a piñas en el cemento caliente que oficiaba de piso. Después de eso podría haber terminado el festival.</p>

<p>Pero fue el turno de Amon Amarth, otro clásico del metal extremo, en su caso con claros tintes nórdicos. También tuvieron una performance impecable pero a medida que uno crece toda la parafernalia neo vikinga va quedando cada vez más lejos en la escala de la autenticidad y se parece más a un gesto adolescente. Más allá de eso, la banda cumplió.</p>

<p>Y por último, pero no menos importante, fue el cierre de los anfitriones. La banda de Corey Taylor salió al escenario con el clásico overol rojo, desplegando toda su faceta performática y teatral, además de la musical a la cual nos tienen acostumbrados. La novedad fue el estreno del baterista, Eloy Casagrande, el segundo desde la partida del histórico y fallecido Joy Jordison. La novedad del espectáculo se dió cuando el vocalista anunció que dado que su disco debut, <strong>Slipknot</strong>, cumplía 25 años, esta noche sería como escuchar a la banda en 1999.</p>

<p>Resultó una grata sorpresa para los fanáticos del grupo formado en Des Moines, Iowa, que pudieron escuchar en vivo temas que quizá nunca antes habían podido. También fue una sorpresa para el público golondrina que quizá se acercó hasta el show esperando escuchar los superhits <em>Duality</em> y <em>Psychosocial</em>, que cayeron en la volteada. Sumado eso a la ubicación un poco trasmano del Parque de la Ciudad, ya a mitad del show de Slipknot se percibió un éxodo un poco adelantado de cierta parte del público, que venía también de una jornada larga y extenuante.</p>

<p>Quizá esa haya sido la razón por la cual la banda se fue del escenario sin despedirse del público. O tal vez sea sólo otra arriesgada conjetura de este imaginativo cronista. Como sea, el grupo igual le metió duro y parejo durante 90 minutos en los cuales no decepcionó, desplegando toda su potencia musical y escénica. Con el diario del lunes (o de hoy, miércoles) queda preguntarse cómo habrá sido el saldo para Slipknot y los productores locales. De haber sido exitoso, se podrá especular con una próxima edición y quizá, de a poco, con lograr un festival estable en el calendario musical argentino. Algo tan necesario para este género casi siempre tan olvidado y marginado por los grandes organizadores como el propio Parque de la Ciudad.</p>
""",
    },
    {
        'title': 'Nación Urbana: llamen a El Doctor que pintaron los Bardero$',
        'slug': 'nacion-urbana-el-doctor-barderos-trap-drill-hip-hop',
        'subtitle': 'El martes, el festival juntará artistas de base del trap, el drill y el hip hop locales.',
        'date': '2023-02-16T20:35:00.000Z',
        'source_url': 'https://www.pagina12.com.ar/524484-nacion-urbana-llamen-a-el-doctor-que-pintaron-los-bardero',
        'source_name': 'Página/12',
        'html': """
<p>El asfalto de Buenos Aires no perdona y los 30 y largos grados que marca la térmica se hacen 40 si no hay sombra. Como casi nunca pasa, el búnker del <strong>Nación Urbana</strong> tiene un excelente stock de bebidas para combatir el infierno: agua, coca, cerveza y mucho, mucho hielo. El festival se realizará <strong>este martes 21 feriado, en el Estadio Obras</strong>, con la presencia de artistas consagrados y emergentes de los diversos géneros de la movida. De artistas acostumbrados a la rutina del sold out como <strong>Bardero$</strong> a otros que vuelven para mostrar su actualidad, como <strong>Lucho SSJ</strong>, pasando por <strong>El Doctor</strong> o la <strong>Soui Uno</strong>.</p>

<h2>Vacaciones en el bardo</h2>

<p><strong>Homer el Mero Mero</strong> es el primero en llegar para la rueda de prensa junto con <strong>C.R.O</strong>, con quien formaron Bardero$ para producir, tocar y girar. Caen justamente en modo bardo y cuentan que se armaron una casa para vivir juntos y producir sin parar. <strong>Ya tienen un disco en plena grabación (Vacaciones en el barrio), mientras calientan motores para abrir el año en Obras</strong>. También tienen shows sold out en México. Bardo para todo el continente.</p>

<p>"<strong>Estamos todo el día grabando, como encerrados en la máquina del tiempo. Comemos y seguimos grabando, estamos full metidos</strong>" dice C.R.O. "<strong>Queremos romperla como nunca antes</strong>, tenemos bombas preparadas para romperla, este año va a ser nuestro." De fondo los chicharras aúllan con el mismo tono cansino de un capítulo de <em>Evangelion</em>.</p>

<h2>Ronpe nene, Ronpe</h2>

<p>De reglamentaria musculosa de los Chicago Bulls con el 23 de Jordan aparece <strong>Ronpe 99</strong>, que cuenta entusiasmado cómo arranca su año: <strong>Cosquín Rock, Mar del Plata y Obras</strong>; y si pudiera meter más shows metería más, dice. De todos los artistas que van llegando, <strong>es el más joven y el que menos tatuajes tiene</strong>: la cara limpia, tan clara como sus objetivos. "Venimos entrenando una banda este show en vivo, empezamos el año pasado y nos dimos cuenta que el <strong>sonido tridimensional</strong> era la que iba" dice.</p>

<p>"<strong>Yo siempre hice la mía, por mambos míos, se pusieron todos a hacer RKT y me puse a hacer rock</strong>", dice Ronpe, que respeta a todos pero no le tiembla el pulso a la hora de seguir su propio camino sin mirar lo que hacen los demás. Venir de abajo es un plus, sostiene: "<strong>Están todos re frágiles, uno con tener un plato de comida y un techo en la casa está más que agradecido</strong>".</p>

<h2>El Señor Doctor</h2>

<p>Ya se fueron un par de botellas de Coca, no queda un sólo sánguche de miga y las latas de cerveza se empiezan a acumular cuando aparece <strong>El Doctor, que llega con su estilo único, recién bañado y perfumado</strong>. En contra de toda intuición, es un pan de dios. Un veterano del trap, drill y el hip hop que pese a no estar entre los artistas más conocidos, es <strong>por lejos, lejos, uno de los mejores de la escena</strong>.</p>

<p>"Es que <strong>siempre, siempre primerié, pero de chico, eh</strong>… me pasó en la escuela que me copiaban el corte, la ropa", dice con la seguridad de quien se sabe distinto. A años luz del resto, pero sin perder la humildad. <strong>El Doctor siempre tocó con banda en vivo</strong>, modalidad que desde el año pasado un montón de músicos del palo empezaron a adoptar. El Doctor en vivo parece más una banda de hardcore que un rapero. "<strong>El trap une el heavy metal, la cumbia y el punk</strong>", dice tranquilo, como si fuera una obviedad.</p>

<p>El Doctor saltó a la fama con <strong>30 mil pe$os y su videoclip de bajo presupuesto</strong> filmado en una esquina cualquiera del conurbano bonaerense. El hit ya prefiguraba todo lo que iba a traer la lírica del Doctor: <strong>cocaína, paco, choreo, fierros y mujeres, todo el combo básico del gangsta rap</strong> de la costa oeste norteamericana pero adaptado a las restricciones presupuestarias de Argentina, en primer lugar, y de la provincia de Buenos Aires, en segundo lugar. Un gesto tan sencillo como radical.</p>

<p>Recuerda El Doctor que en el momento de grabar el tema, unos años antes incluso de publicar el video en YouTube, "30 lucas era un montón de guita". Usando como referencia la fecha de publicación del video (16 de febrero de 2017, hace exactamente 6 años) al dólar del momento daba algo así como 1842 USD, que al blue de hoy serían unos 700 mil pesos. "<strong>La vida real de un hombre real, rescatar el efectivo por sus propios medios</strong>", dice El Doctor al inicio de ese tema, en un leitmotiv que se repite a lo largo de sus canciones y en su disco FAFA. "Un testimonio de la negatividad para sacar algo positivo", dice.</p>

<p><strong>Este año, El Doctor se prepara para jugar su mejor juego</strong>, tratar de crecer más como artista y en el conocimiento del público. A diferencia de lo que se puede percibir desde afuera, El Doctor no es un reventado. <strong>Se mantiene alejado de las drogas, dice que no quiere pipear más y que mientras compone como mucho se prende un porro</strong>. De chico grabó todo un disco estando duro, pero ahora ya ni siquiera le sirve para producir.</p>

<p>Hay algo irreductible en la prosa del Doctor: <strong>un núcleo duro de la poesía marginal que lo vuelve irreductible; imposible que sea convertido en uno más del mercado</strong>. Eso que él mismo define como "raper panqui" puede verse como una línea de continuidad —o un pliegue más en la fractura— de una figura emblemática del punk local como Ricky Espinosa. Hay una máxima actual que sostiene que cualquier cosa, incluso la rebelión —o aún con más énfasis la rebelión— puede ser vendido como un producto más. <strong>Es el capital engullendo todo y reconfigurando todo como un mero producto más. Pero es difícil imaginarse al Doctor como el próximo Tini Stoessel</strong>.</p>

<p>Esa línea de convergencia entre heavy, trap y punk tiene además <strong>un desprecio total (no impostado) por los valores morales del sentido común argentino</strong>. Y quizá lo que lo hace único también sea una especie de maldición. El Doctor sabe que sus letras, su puesta en escena, su banda y su estética no tienen rival. Y que, sin embargo, está <strong>construida de tal forma que se resiste a devenir <em>commodity</em></strong>.</p>

<p>El calor agobiante ya cansó a las propias chicharras, que ni cantan. Y en ese breve instante de silencio <strong>El Doctor dice que de su vida dura no lo sacó ni al arte ni la música: "Lo que me sirvió es el amor del público"</strong>, dice, así como si nada. "Están los fans que te cuidan y los toxifans", sentencia, en una divisoria de aguas entre quienes lo quieren ver bien y los que se la agitan para que recree las historias o vivencias que canta en sus canciones.</p>

<p>El Doctor está en su mejor momento, <strong>prepara un nuevo disco, doble, que dice que es mejor que FAFA</strong>. "Este lo va a superar y tiene todo: cosas para los enemigos, cosas para las groupies, amor, chascarrillos, cosas sad. Me cansé de equivocarme. <strong>Me perfeccioné en un montón de cosas como artista y como persona estoy ready</strong>", dice mientras vuelven las chicharras.</p>
""",
    },
    {
        'title': 'Buenos Aires Death Match: la conexión directa de la Thrasher y Argentina',
        'slug': 'buenos-aires-death-match-thrasher-argentina-skate',
        'subtitle': 'Patinan desde Tony Trujillo y Milton Martínez hasta Franco Morales y Mami Tezuka, con Massacre y más punk y skate rock de fondo.',
        'date': '2022-10-06T22:48:00.000Z',
        'source_url': 'https://www.pagina12.com.ar/487836-buenos-aires-death-mach-la-conexion-directa-de-la-thrasher-y',
        'source_name': 'Página/12',
        'html': """
<p>Iconos del skate como <strong>Tony Trujillo, Sean Malto y Milton Martínez</strong>, nuevas glorias como <strong>Jenn Soto y Mami Tezuka</strong>, y talentos locales en plena parábola ascendente como <strong>Eze Martínez y Franco Morales</strong>. Además de la infaltable banda creadora del skate rock local, <strong>Massacre</strong> (bajo el nombre original de Massacre Palestina), y shows de <strong>Arde la Sangre, Loquero, Minoría Activa y Fuck Dolls</strong>, cuyo frontman "Pitu" López es un legendario pro skater argentino y constante agitador de la movida.</p>

<p><strong>¿Cómo se consigue eso?</strong> Este domingo 9 en C Complejo Art Media, del barrio porteño de Chacarita, durante el <strong>Buenos Aires Death Match</strong>, que conjugará exhibiciones de skateboarding a cargo del team de la archifamosa revista <em>Thrasher</em> y recitales de bandas afines al skate rock.</p>

<p>La "marca" <em>Thrasher</em> se volvió muy reconocida en Argentina en los últimos años dado que <strong>sus clásicas remeras se convirtieron en un artículo cool adoptado por jóvenes y diferentes artistas del género urbano</strong>. Pero más allá de este dato superficial, el vínculo entre la revista y nuestro país es mucho más profundo. Como siempre, las apariencias engañan.</p>

<p><strong>En 1981, el skate había entrado en un ciclo a la baja, donde perdió popularidad y volvió al under</strong>. Es ahí que nace <em>Thrasher</em> y se convierte en un "vehículo de comunicación del skate real, roots, hardcore", describe Walas, cantante de Massacre que participó como skater de esa segunda ola que haría renacer al skate, y de la cual <strong>la <em>Thrasher</em> fue responsable con su línea doctrinaria sintetizada en el <em>Skate &amp; Destroy</em></strong>. Sería también esta segunda ola donde el skate prendería fuerte en Argentina, para nunca más extinguirse.</p>

<p>Con el correr de los años, <em>Thrasher</em> <strong>se convertiría no sólo en una revista de skate sino en todo un representante de la cultura</strong>. Con Jake Phelps como editor abanderado, se volvería la revista más icónica. Llegar a su tapa se convirtió en sinónimo de consagración y ganar <strong>el premio de "skater del año", creado por la revista, se volvió el título más codiciado del "skate real"</strong>, por encima de cualquier campeonato o medalla olímpica.</p>

<p><strong>Y esta doble corona es la que logró la bestia infernal —sin exagerar— de Milton Martínez en diciembre de 2019</strong>. Nacido en Mar del Plata, es hijo de un skater histórico, "Tatu" Martínez, y hermano de Ezequiel; y logró lo que cualquiera que se subió a una tabla sueña. Después de una carrera meteórica en Argentina, en 2016 se instaló en California y empezó a codearse con la crema del skate, <strong>hasta que una terrible lesión lo marginó de las calles por un tiempo</strong>.</p>

<p>Estaba filmando para Volcom e hizo <strong>una prueba muy arriesgada en un spot casi mítico de Los Ángeles: el Car Wash</strong>. En ese lugar, un skater tier god como Mark Gonzalez (reconocido como el mejor skater de todos los tiempos de manera casi unánime) no pudo bajar su ollie. De hecho, desde 2010, cuando Jim Greco hizo lo propio, nadie había filmado un truco ahí. El lugar es insano, para ejecutar el truco hay que <strong>subir al techo del lavadero de autos y luego saltar a un plano inclinadísimo, realmente muy violento</strong>, que da a la mismísima Sunset Strip. <strong>Milton se quebró el tobillo en 2016, pero tres años después bajó un flip que quedó para la historia</strong>. Todo en el mismo lugar.</p>

<p>La prueba fue tan impactante que la tapa de esa edición de la <em>Thrasher</em> solo incluyó el logo de la revista, el código de barras y la foto de la prueba. El video de Volcom se sumó a su parte en <em>Demolición</em>, el compilado de la <em>Thrasher</em>, y le ganó la bendición del mismísimo Phelps. Con todo, <strong>Milton fue elegido Skater Of The Year (SOTY) en 2019</strong>.</p>

<p>"Es un privilegio poder tener la tapa de <em>Thrasher</em>, y con toda la historia que tiene el épico spot del Car Wash no podría estar más agradecido de la forma en que se dieron las cosas. <strong>Creo que la lesión me ayudó a poder superarme y eso hizo que lo diera todo para la parte de video que siempre soñé con tener</strong>", le dijo Milton al NO. "Y bueno, ser SOTY fue un bonus que nunca imaginé que era posible. La verdad, sin palabras."</p>

<p>"<strong>Tuve muchos viajes increíbles con Phelps y siempre me motivó mucho para andar en skate</strong>, ya que tenía la mejor onda conmigo. Lo conocí a través de Preston, filmador de <em>Thrasher</em> y gran amigo, que en paz descanse. Y unos de los recuerdos que siempre me van a quedar fue aquel viaje que hicimos con Preston, Phelper y Ladas, donde recorrimos una linda parte de Brasil. <strong>Siempre estará dentro de los viajes más increíbles que pude hacer</strong>", concluye.</p>

<p>Y aunque ahí parece agotarse la conexión <em>Thrasher</em>-Argentina, siempre hay un poco más. Y el que la cuenta, así como si nada, como quién inicia a un neófito cualquiera, es <strong>Walas, gran maestre y mago de la cultura skater rock nacional</strong>. "La conexión que tiene <em>Thrasher</em> con Argentina es desde el génesis, porque <strong>uno de los fundadores de la revista es un argentino</strong>, de Almagro, simpatizante de San Lorenzo. Un muchacho que se fue a vivir de muy joven a Estados Unidos, que se llamaba <strong>Fausto Vitello, que funda los trucks Independent (los mejores de la historia) y todo el imperio de tablas Santa Cruz y las ruedas OJs</strong>. A partir de ahí, como forma de publicitar todos estos productos, funda la revista <em>Thrasher</em>".</p>

<p>Al parecer, este misterioso y titánico personaje emigró a California con apenas 9 años, dado que <strong>sus padres escaparon de la nefasta "Revolución Libertadora"</strong>. Increíble pero real, como no puede ser de otra manera en Argentina, la tierra del milagro: un hilo conductor que une a una familia ¿peronista? perseguida política y exiliada durante una dictadura, con la creación de las marcas más importantes del skate, la fundación de la revista ícono del palo y los sueños de un pibe marplatense que sólo quería ser el mejor skater del mundo. <strong>En definitiva: bienvenida a casa, revista <em>Thrasher</em></strong>.</p>
""",
    },
    {
        'title': 'Gundam, un Caballo de Troya para la subcultura mecha',
        'slug': 'gundam-caballo-de-troya-subcultura-mecha',
        'subtitle': 'El animé Mobile Suit Gundam originó una de las sagas más notables, engordada ahora por un juego enroscado pero entretenido.',
        'date': '2022-08-31T19:28:00.000Z',
        'source_url': 'https://www.pagina12.com.ar/477969-gundam-un-caballo-de-troya-para-la-subcultura-mecha',
        'source_name': 'Página/12',
        'html': """
<p>En 1979, los estudios Sunrise de Japón estrenaron el animé <strong>Mobile Suit Gundam</strong>, donde se cuenta la guerra de liberación entre el Principado de Zeon y la Federación Terrestre. Las armas principales con las cuales se libera esta guerra independentista no son otras que <strong>robots gigantes también conocidos como mechas</strong> y pronunciados en castellano como mecas. Ese animé, dirigido por <strong>Yoshiyuki Tomino</strong>, dio origen a una de las franquicias más exitosas de toda la cultura nipona.</p>

<p>Pese a que la idea de "franquicia" no deja de resultar un poco despectiva —es el mismo sustantivo que se usa para describir cadenas de comidas rápidas—, también explica muy bien en lo que se convirtió <em>Gundam</em>: <strong>manga (historieta japonesa), cantidades inagotables de animé (series animadas japonesas), películas, videojuegos, merchandising variado, juguetes y, además, modelos para armar</strong>. Sí, robots miniaturas que son modelos de ficticios robots gigantes. Oh, la ironía.</p>

<p><em>Gundam</em> es una de las franquicias, sino la franquicia, más respetada, consumida y exitosa dentro de Japón. El modelo original del primer "Mobile Suit" es uno de los íconos más reconocibles de la cultura japonesa: <strong>el RX-78-2 que aunque nunca supiste su nombre, seguro que al menos una vez en la vida lo viste en algún lado</strong>. La figura original del robot humanoide con casco blanco, pecho azul, torso rojo y detalles amarillos es reconocible pese a nunca haber visto ninguna serie. <em>Gundam</em> <strong>es un ícono de Japón</strong>, como lo son <em>Mazinger</em>, <em>Doraemon</em>, Eva 01 y Goku.</p>

<h2>Gunplas y Gundams</h2>

<p>Gran parte de la trascendencia de <em>Gundam</em> es producto de sus series animadas, pero también se debe al éxito de los <strong>"Gunpla", los modelos armables de cada robot de la franquicia, de plástico encastrable y en diferentes escalas</strong>. El suceso comercial de los Gunpla creó toda una línea de coleccionables en sí misma, campeonatos de montaje, una subcultura en YouTube sobre armado y pintura de modelos y animés sobre pelea de Gunplas —he aquí el rizo de retroalimentación completo—.</p>

<p>Y, como si fuera poco, también <strong>tres estatuas conmemorativas en tamaño real</strong>. La última en ser construida, en la ciudad de Yokohama, dentro de la fábrica de los Gunplas, mide 18 metros y se mueve.</p>

<p><em>Gundam</em> es un sucesor directo de animés como <em>Tetsujin 28-gō</em> (conocida en latinoamérica como <em>Gigantor</em>) y <em>Mazinger</em>, que constituyeron la primera generación de mechas. <strong>Pero a diferencia del enfoque más simplón de sus antecesores, <em>Gundam</em> introdujo una serie de novedades que hicieron al género explorar nuevos terrenos narrativos</strong>.</p>

<p>Este subgénero del animé de robots gigantes es conocido como <strong>"Real Robot", dado que los modelos intentan emular armas de guerra</strong> más que suponer una concepción fantasiosa de las máquinas. Y donde, además, se aprovecha este acercamiento realista a la guerra para <strong>explorar todas las dimensiones posibles de la tragedia</strong>.</p>

<p>A lo largo de los años, además de <em>Mobile Suit Gundam</em>, series como <em>Zeta Gundam</em>, <em>Gundam Wing</em> o <em>Gundam Unicorn</em> mantuvieron la popularidad de la franquicia. Quienes quieran interiorizarse en los pormenores de cada serie y las diferentes líneas temporales que los constituyen, pueden ver un excelente video que lo explica todo.</p>

<p>Una generosa cantidad de estas series están en las plataformas de streaming más populares. Para quienes nunca hayan visto nada de <em>Gundam</em>, también hay <strong>una miniserie de 1989 que se puede ver en YouTube, titulada <em>Gundam 0080: War in the Pocket</em>, que recorre toda la potencia dramática del universo, tematiza el fetiche con la guerra y cuenta todo desde el punto de vista de un niño de 8 años</strong> que queda atrapado entre las facciones combatientes. Una joya de apenas seis episodios.</p>

<h2>SD Gundam: Battle Alliance</h2>

<p>Pero además <em>Gundam</em> tiene un enorme universo de videojuegos, y este mes Bandai Namco tuvo el lanzamiento de <strong>SD Gundam Battle Alliance, un RPG que permite luchar con muchas de las armaduras del universo <em>Gundam</em>, subir niveles y desarrollar habilidades en las unidades (como buen RPG), y combatir en escenarios limitados contra las fuerzas enemigas</strong>. Todo esto con una salvedad: los personajes están diseñados en la modalidad SD, super deformed, que es un subgénero en sí mismo y representa a todas las armaduras con un formato de cabeza enorme y caricaturesco.</p>

<p>El juego es bastante entretenido y consiste en un permanente hack and slash donde todo el truco está en <strong>conectar la mayor cantidad posible de combos a los mechas enemigos con ataques cuerpo a cuerpo, de rango y movimientos "finales especiales"</strong>. Luego de algunas horas, las mecánicas se ponen un poco repetitivas, pero el apartado gráfico, el universo y la jugabilidad son bastante decentes. Con el avance de las misiones iniciales, <strong>la party aumenta a tres personajes que se pueden levelear, y también es posible elegir pilotos aliados</strong> con los que combear poderes. De ahí el <em>Battle Alliance</em> del título.</p>

<p><strong>La trama del juego es un poco enroscada, pero divertida</strong>. Básicamente, el personaje está en una suerte de estación espacial que lleva el registro histórico de todas las líneas temporales del universo <em>Gundam</em>, pero resulta que ese archivo es interactivo, y parece que las intervenciones del jugador modifican la historia. Las líneas se cruzan, aparecen Armaduras del futuro en el pasado y <strong>la misión es normalizar el archivo histórico, recreando las batallas principales de cada momento histórico de la franquicia</strong>.</p>

<p>El juego cuesta cerca de 60 dólares en Steam y también está disponible para PS4 y Nintendo Switch. <strong>El precio es un poco elevado para la oferta del juego</strong>, que luego de unas horas es más de lo mismo: batallas en escenarios limitados, combos, subir de nivel, repetir hasta el cansancio. Por eso, <strong>no está nada mal esperar a alguna semana de descuentos para comprarlo a precio promocional</strong>. En ese caso, la inversión estaría totalmente justificada.</p>

<p>Es que para quienes nunca jugaron algo de la franquicia es <strong>un inicio excelente que permite sacarse las ganas de meter piña con los mobile suit</strong>. Y para conocedores, el juego permite revivir algunas famosas escenas de combate utilizando las armaduras de la Federación, del Principado, de los Zakus e inclusive el mismísimo Gundam RX-78-2.</p>
""",
    },
    {
        'title': '"Las cosas donde ya no estaban", un caso independiente de cine posible',
        'slug': 'las-cosas-donde-ya-no-estaban-cine-independiente',
        'subtitle': 'Dos personajes, una noche, un reencuentro y una ciudad de Buenos Aires reconocible, cotidiana y, a la vez, cinematográfica.',
        'date': '2022-07-13T19:14:00.000Z',
        'source_url': 'https://www.pagina12.com.ar/436797-las-cosas-donde-ya-no-estaban-un-caso-independiente-de-cine-',
        'source_name': 'Página/12',
        'html': """
<p><strong>Fabio Vallarelli</strong> nació en Sarandí, localidad de la zona sur del Gran Buenos Aires, dentro del partido de Avellaneda. <strong>A los 14 años, un amigo de su hermano le prestó una copia trucha de</strong> <em>La naranja mecánica</em> <strong>de Stanley Kubric, y ahí supo que el cine era algo más que simples películas.</strong> "En mi casa estaba todo bien pero siempre al límite", dice Fabio. Así, ni bien terminada la secundaria, pese a su amor al cine, se metió a estudiar abogacía, se recibió, hizo carrera y hoy trabaja en el CELS.</p>

<p>En paralelo, y sin olvidar el primer amor, ingresó al <strong>Instituto de Arte Cinematográfico de Avellaneda</strong> (IDAC). Fue justo en pleno conflicto entre el instituto, la municipalidad y la entonces recién fundada Universidad de Avellaneda. Los pibes tomaron el IDAC y lo mantuvieron bajo control estudiantil por cuatro meses. Por su personalidad, <strong>Fabio se hizo delegado de su curso y estuvo en todas las asambleas</strong>.</p>

<p>Al final del conflicto, el IDAC no sólo mantuvo su autonomía, sino que además consiguió un edificio mejor en la calle 12 de Octubre. Fabio se recibió, filmó su primer largometraje (<em>Tierra2</em>), un cortometraje (<em>¿Por qué te vas?</em>) y se convirtió en docente del IDAC. En ese camino, forjó un grupo de trabajo. Hasta que <strong>el mes pasado estrenó la película</strong> <em>Las cosas donde ya no estaban</em>, <strong>que sigue con funciones en el Gaumont y otros Espacios INCAA</strong>.</p>

<h2>La parábola de la película posible</h2>

<p><em>Las cosas donde ya no estaban</em> <strong>es una película sobre una pareja que se reencuentra luego de que uno de ellos haya emigrado al exterior producto de la crisis de 2001</strong>. Y se vuelven a conocer, al menos por una noche, en la ciudad de Buenos Aires, casi veinte años después, con Argentina de nuevo en estado de crisis permanente. Es una película con <strong>muchos guiños a la generación que transitó su adolescencia en los 2000</strong>, filmada en una Buenos Aires reconocible, cotidiana y, a la vez, cinematográfica.</p>

<p>Es una película independiente en el sentido más preciso del término: <strong>se filmó, produjo y pos-produjo sin ningún subsidio</strong>. Costó alrededor de 7000 dólares de los cuales un tercio se consiguió mediante plataformas de financiación colectiva.</p>

<p><strong>Su estreno fue rechazado en el Bafici y en el festival de Mar del Plata</strong>. Está claro: Vallarelli no pertenece a la aristocracia cinéfila. Pese a todo, la película ganó un festival en Perú cuyo premio sirvió para terminar la posproducción de sonido. En contra de lo que indica la tradición del cine independiente argentino, <em>Las cosas donde ya no estaban</em> <strong>tiene un sonido excelente</strong>.</p>

<p><strong>El pasado 16 de junio se estrenó en el Gaumont. Allí, en apenas una semana trepó hasta el tercer lugar de las películas más vistas en espacios INCAA</strong>. Un puntapié inicial que siguió con la exhibición en varios espacios INCAA del país. Toda una estrategia diseñada y ejecutada por el propio director, quien pese a apoyar la existencia y función del Instituto Nacional de Cine y Artes Audiovisuales sabe que al esquema le falta un punto de cocción.</p>

<p>Vallarelli sostiene que "<strong>como el subsidio del INCAA está más enfocado en hacer, cobrar y vivir, la exhibición no forma parte del problema cotidiano</strong>". La exhibición, es decir que el público vea las películas que el instituto financia, deviene más un problema técnico para que los productores puedan cobrar el subsidio completo que un incentivo para la industria. "<strong>El sistema tiene que ser más virtuoso y encargarse de la exhibición</strong>", sostiene Vallarelli, a la vez que recalca la necesidad de fortalecer al INCAA y democratizarlo, además de tener una cinemateca nacional que eduque al público en la riquísima tradición del cine argentino.</p>

<p><em>Las cosas donde ya no estaban</em>, además, funciona como <strong>un faro para estudiantes del IDAC y para discutir la idea de que "los otros lugares te dan más chapa"</strong>. Para Vallarelli, fiel representante de la escuela cinematográfica bonaerense, otro cine es posible. Con el estreno de este film, el humilde pero no menos trabajador IDAC se anima a disputar un espacio entre las escuelas de cine local como la ENERC o la mismísima FUC. Vallarelli quiere convencer a sus estudiantes de que para hacer una película propia y llegar a verla en un cine, "<strong>no se tienen que ir a otro lado, no tienen que ser multimillonarios, no tienen que venir de una familia de plata</strong>". Aunque "<strong>sí tienen que laburar un montón</strong>".</p>

<p>Y como nadie es profeta en su tierra, <em>Las cosas donde ya no estaban</em> <strong>ganó su segundo festival, pero esta vez en Italia y el premio fueron 8000 mil dogecoins</strong>: la famosa criptomoneda meme cuya vida empezó como un chiste y que ha llegado a valer 60 centavos de dólar. Un premio inusual, para una película inusual y un director inusual. Si la diosa fortuna lo sigue acompañando, tal vez el próximo mercado alcista cripto pague su siguiente película.</p>
""",
    },
    {
        'title': 'World wide weed: porro legal en las principales ciudades europeas',
        'slug': 'world-wide-weed-porro-legal-ciudades-europeas',
        'subtitle': 'A la par de los museos, el faso y los hongos se volvieron parte del circuito turístico en Ámsterdam, Roma, Zúrich y Berlín.',
        'date': '2022-07-06T20:37:00.000Z',
        'source_url': 'https://www.pagina12.com.ar/434978-world-wide-weed-porro-legal-en-las-principales-ciudades-euro',
        'source_name': 'Página/12',
        'html': """
<p>La tradición sigue vigente, e indica que <strong>Ámsterdam es el lugar adecuado para ejecutar el ritual de pasear, ver museos y consumir drogas psicodélicas</strong>. El porro sigue siendo muy bueno, pero a decir verdad, las variedades argentinas no tienen nada que envidiarle: en los últimos años el cultivo local subió muchísimo de nivel.</p>

<p>El menú cannábico neerlandés está repleto de cogollos de variedades conocidas que se consiguen por peso, armados o en porros mezclados con tabaco. <strong>El europeo promedio consume el porro mezclado con tabaco y ve como símbolo de barbarie el porro armado sólo con porro</strong>. Oh, la ironía.</p>

<p>Los porros armados se venden sólo como "sativa o indica", sin mayor explicación. <strong>Para acceder a variedades, hay que comprar por peso</strong>. Para tener un estándar y comparar cómo varía la calidad en cada lugar, muchos compran siempre el mismo tipo de porro, y después prueban algo más para darse el gusto. Algunos coffee shops imperdibles de la ciudad son <strong>Kandinsky, Sensi Seeds y Tweede Kamer, que además de tener un porro excelente es un local que rompe con la cultura "bro" de los locales más céntricos</strong>.</p>

<p>Pero uno de los mejores porros del viaje está <strong>a una hora de tren de Ámsterdam, en Utrecht</strong>, donde se firmó el tratado que terminó la guerra por la sucesión de la corona española en 1715. El lugar se llama <strong>Anderson, y ahí el precio del gramo oscila entre los 8 y los 11 euros</strong>, pero cada coco picado deja una montañita de cristales que funciona para condimentar el recién armado.</p>

<p>Es que Ámsterdam no ostenta el rango de única ciudad porrera de Europa. <strong>En Roma (Italia), Zúrich (Suiza) y Berlín (Alemania) es posible conseguir marihuana en maxiquioscos o mercaditos</strong> de cualquier callecita medianamente transitada. En Suiza y Alemania es legal vender porro con muy bajo contenido de THC, menos del 1% (el THC es la sustancia psicoactiva del cannabis) pero alto de CBD (la "medicinal", relajante y desinflamante). En Italia la situación es similar, con la diferencia de que el contenido de THC puede ser de hasta el 6%.</p>

<p><strong>Pero si bien estos porcentajes son muy bajos comparados con las variedades que pululan el mercado cannábico actual, el porro cumple algo de su tarea</strong>. Además, es bastante simpático entrar a un kiosko o minimercado y llevarte alguna golosina, una bebida y un porro tamaño dedo de momia.</p>

<p>Para quien busca otro tipo de experiencias, el viaje no puede terminar sin una sesión de hongos en la capital neerlandesa. <strong>Las trufas psicoactivas son un point que se consigue en locales en los típicos callejones holandeses:</strong> cuestan unos 20 euros y equivalen a dos dosis. Pese a la estridentes publicidades de los locales, durante el viaje de trufas no hay contacto extraterrestre sino apenas <strong>un sentimiento de comunión con la naturaleza</strong> y un viaje que nunca termina de despegar, algo así como un cuarto de dosis de LSD que nunca alcanza el summun. Pero que, pese a todo, <strong>te deja dos horas acariciando el pasto y riéndote mucho</strong>.</p>

<h2>La bicicleta de la creación de contenido</h2>

<p>Otra característica singular de cualquier tour europeo actual es <strong>la cantidad de instagrameros, youtuberos, tiktokeros y vlogeros que rondan las diferentes ciudades</strong>, y en especial los puntos turísticos. Es muy gracioso ver pibas recontra empilchadas tirando poses arriba de un puente mientras sus amigas, novias, novios, o madres (no tan empilchadas) les disparan con un celular último modelo.</p>

<p>O ver la cantidad de <strong>pibes con sus cámaras, sus gimbals y sus one-man-set-up caminando a toda velocidad</strong> por las calles imbricadas de las trazas europeas medievales-renacentistas, mientras hablan (solos) a cámara, no exentos de cierta timidez al atraer las miradas de todos los que los rodean.</p>

<p>Ver cómo se produce contenido de viajes mientras el resto del mundo sigue en la suya <strong>genera una disonancia muy fuerte y bastante vergüenza ajena</strong>. El esfuerzo de parte de los creadores de contenido por superar la dicotomía entre lo que están haciendo y su entorno no deja de ser simpático y también llamativo.</p>

<p><strong>Las bicicletas son, sin duda, otra de las estrellas del verano europeo</strong>. En ciudades como Berlín, Ámsterdam y Zúrich son las dueñas indiscutidas de las calles. Mientras que en París y Roma, dada su extensión, todavía luchan por ganarse un lugar entre el tránsito. En París se nota mucho más la inversión del municipio en bicisendas, pero las distancias tan largas a comparación de ciudades más chicas puede ser desalentadora. No así en <strong>Berlín, que es gigante y todo el mundo anda en bici</strong>.</p>

<p>A modo de compensación, en las ciudades que no son tan bicicleteras, <strong>el monopatín eléctrico destaca como la opción de movilidad en ascenso</strong>. Es muy común ver pendejos de todas las edades usándolos por doquier con diferentes niveles de inconsciencia. Hasta de hecho en París es común ver que la policía pare a gente que va de a dos en un solo monopatín.</p>

<h2>La pilcha y el morfi</h2>

<p>La cantidad de marcas de moda rápida como Primark, H&amp;M y Zara tiene como contraparte una <strong>proliferación de ferias americanas con un ethos ecologista</strong>. Reciclar ropa como resistencia política y modo de frenar la avanzada del consumo. Berlín está repleta de ferias de ropa ética, e incluso <strong>las marcas más grandes empezaron a poner en sus etiquetas el porcentaje de algodón reciclado</strong> que llevan sus prendas.</p>

<p>Pero entre todas las tendencias la más silenciosa y omnipresente es gastronómica y viene de la región árabe. La cada vez más importante inmigración desde allí llevó a que <strong>desde el ya clásico "döner kebab" al novedoso pizza kebab</strong> pululen las calles de toda ciudad de mediana importancia en Europa.</p>

<p>Además de ser muy baratos en comparación con otras comidas, <strong>son los únicos lugares que están abiertos hasta tarde</strong> (es decir, después de las 18, cuando cierran casi todos los comercios; y de las 22, cuando cierra la mayoría de los restoranes). Además, <strong>cada ciudad ya tiene su propio barrio árabe</strong> donde se pueden conseguir desde comida típica hasta vestidos de casamiento, burkas y copias del <em>Corán</em>.</p>

<p><strong>Así está Europa en 2022, plagada de bicis, influenciadores, porro y döner kebab</strong>.</p>
""",
    },
    {
        'title': 'Ampliación del campo de desarrollo gamer en Argentina',
        'slug': 'ampliacion-campo-desarrollo-gamer-argentina',
        'subtitle': 'Estudios indies, pymes y grandes empresas buscan todo tipo de perfiles creativos y técnicos.',
        'date': '2022-02-23T18:44:00.000Z',
        'source_url': 'https://www.pagina12.com.ar/403464-ampliacion-del-campo-de-desarrollo-gamer-en-argentina',
        'source_name': 'Página/12',
        'html': """
<p>Para cualquier argentino y/o argentina que creció con sus pupilas bombardeadas por los rayos catódicos de decenas de títulos, la posibilidad de <strong>trabajar en algo relacionado a la industria de videojuegos pertenecía al reino de la fantasía, la imaginación y los sueños</strong>. En gran parte producto de las asimetrías del modo de producción actual.</p>

<p><strong>Si bien desde los '90 los jugadores argentinos podíamos sentirnos parte de una "comunidad global"</strong>, la posibilidad de tener un rol activo en la producción de videojuegos durante esos años, y hasta bien entrados los 2000, era casi imposible. Apenas un sueño.</p>

<p>Sin embargo, ya no es novedad que <strong>desde hace al menos una década las compañías argentinas dedicadas a la creación de videojuegos no paran de crecer</strong>. Hoy existen posibilidades reales de insertarse laboralmente en una empresa de este tipo y <strong>tener una carrera participando de la creación de videojuegos desde Argentina</strong> para el mundo.</p>

<p>Y no solo en <strong>puestos técnicos como desarrollador o programador</strong> (sin dudas la alternativa más evidente) sino también desde <strong>competencias más asociadas a lo creativo</strong> como la escritura, la ilustración, el diseño, la publicidad y un largo etcétera. Por eso, joven estudiante de Letras, Comunicación, Periodismo, Filosofía o afines: no desesperes, <strong>también hay lugar para vos</strong>.</p>

<h2>Una industria con todo tipo de talles</h2>

<p>La industria argentina del gaming tiene fauna de todos los tamaños. La nave insignia es <strong>Etermax, creadora de la franquicia <em>Preguntados</em></strong> (2013), que gracias a sus trivias supo liderar rankings globales. Con presencia en más de 180 países, hoy cuenta con más de 600 millones de descargas a nivel mundial, y más de <strong>150 millones de usuarios activos anuales</strong>. Una locura.</p>

<p>Este <strong>gigante argentino con base en el barrio porteño de Villa Urquiza emplea más de 500 personas en todo el mundo</strong>, distribuidas en seis países (Argentina, Alemania, Uruguay, México, Brasil y Colombia). Y según le informó la empresa, un <strong>25% de esa plantilla está ocupada por puestos creativos</strong>.</p>

<p>En la otra punta del espectro está la gente de <strong>LCB Game Studio</strong>, con sus "pixel pulps". El estudio está comandado por <strong>Nicolás Saraintaris, un multifacético humano cuyas aptitudes van desde escribir novelas a crear videojuegos, y Fernando Martínez Ruppel, un ilustrador de los que quedan pocos</strong>.</p>

<p>Los chicos de LCB están cerca del lanzamiento de <em>Mothmen 1966</em>, juego que ya se puede agregar en la lista de deseados de Steam. Es una <strong>aventura de texto</strong> donde los píxeles cumplen la función principal de crear <strong>atmósferas muy vívidas</strong>. El juego es como <strong>una especie de <em>Elige tu propia aventura</em> digital y pasado de rosca</strong>.</p>

<p>El estudio cerró un <strong>deal con el publisher Chorus Worldwide</strong>, lo que equivale a conseguir la financiación necesaria para que el juego se produzca y tenga un buen lanzamiento.</p>

<p>Hoy, <strong>para los estudios de tamaño chico y medio ése es el juego dentro del juego (el "metajuego")</strong>: como no se pueden dar la opción de financiar su propio proyecto, <strong>necesitan de un publisher</strong> que lo haga. Es un poco el equivalente a <strong>pegar contrato con una discográfica</strong> en los '80 para producir un disco. Conseguir un buen publisher que financie el proyecto es una <strong>herramienta clave para navegar las siempre turbulentas aguas de la economía argentina</strong>.</p>

<p>En el medio del espectro podemos señalar dos proyectos destacados. <strong>Saibot Studio, creador del juego <em>Hellbound</em></strong> (2020), un hermoso FPS inspirado en <em>Doom</em> pero con todos los agregados que permite la tecnología contemporánea. Y <strong>Tlön Industries, comandado por el ya legendario Javier Otaegui, creador del multipremiado <em>Per Aspera</em></strong> (2020), en el cual tenemos la misión de terraformar Marte.</p>

<p>Ya sea en un gigante de los juegos mobile, en un microestudio que crea aventuras de texto y pixel art, o en una pyme que crea FPS o juegos de estrategia, <strong>trabajar en la creación de videojuegos argentinos para audiencias globales ya no pertenece al reino de la fantasía</strong> sino que es parte de la <strong>¿nueva? realidad</strong>.</p>
""",
    },
    {
        'title': 'Ethereum, la máquina maravillosa',
        'slug': 'ethereum-maquina-maravillosa-criptomonedas',
        'subtitle': 'La red y su "computadora descentralizada" tienen a su criptomoneda en máximos históricos.',
        'date': '2021-01-22T21:38:00.000Z',
        'source_url': 'https://www.pagina12.com.ar/319101-ethereum-la-maquina-maravillosa',
        'source_name': 'Página/12',
        'html': """
<p>El tren del hype acaba de llegar a la estación <strong>Ethereum</strong> y nadie se quiere quedar abajo. La red Ethereum es una <strong>prima hermana cool de Bitcoin</strong>, y su criptomoneda <strong>Ether (o ETH)</strong> está en pleno ciclo alcista. En diciembre ya había pegado un <strong>fuerte salto en su cotización</strong> y había alcanzado los 600 dólares por unidad, pero <strong>esta semana llegó a los 1435 dólares</strong>, superando por 15 dólares a su anterior máxima cotización, alcanzada en 2018.</p>

<p><strong>Ethereum, si bien es similar a Bitcoin, tiene varias diferencias que vale destacar</strong>. Los ETH son divisibles en hasta 18 decimales, por lo que se puede adquirir desde 0.000000000000000001 ETH (con BTC, en cambio, se puede operar sólo hasta 8 decimales). Por otro lado, <strong>Ethereum no es sólo una red cripto basada en blockchain</strong>, sino que funciona como una <strong>computadora descentralizada en "la nube"</strong>.</p>

<p>Ethereum tiene la capacidad de <strong>ejecutar programas informáticos</strong> (sumando todo el poder de cómputo de los nodos de su red) <strong>a cambio de un pago</strong>. Además, el código de Ethereum permite ejecutar un tipo de software bautizado como <strong>smart contracts o "contratos inteligentes"</strong>, que al estar escritos en una cadena de bloques resultan ser <strong>programas informáticos inmutables</strong>, que se ejecutan siempre de la misma manera. Algo así como las expendedoras de gaseosas, que son sistemas automáticos <strong>que ante una señal de entrada</strong> (ponerle guita) <strong>responden con otra de salida</strong> (entregar una lata).</p>

<p>De esta forma, Ethereum se convirtió de pronto en <strong>una gran herramienta para crear cosas</strong> a partir de contratos inteligentes. Esto permitió, por ejemplo, la creación sencilla de <strong>nuevas criptomonedas, objetos coleccionables digitales, videojuegos</strong> y todo un nuevo universo de <strong>finanzas descentralizadas</strong> basado en este tipo de programas y conocido como <strong>DeFi</strong>.</p>

<p>Otro de los casos de uso más significativos de Ethereum son las <strong>stablecoins o criptomonedas estables</strong>, cuyo valor se mantiene en <strong>paridad uno a uno con el dólar americano</strong>. Además, no tienen ninguna de las restricciones cambiarias del billete estadounidense. <strong>DAI y USDC</strong> son las más conocidas y usadas en Argentina, y nuestro país se destaca por tener un rol preponderante en la comunidad de Ethereum.</p>

<p>Si bien <strong>Bitcoin es la criptomoneda más usada</strong> y cuyo nombre ya representa una marca en sí misma, <strong>Ethereum se convirtió en el espacio más atractivo para los desarrolladores</strong>, dado que cuenta con un <strong>idioma propio (Solidity)</strong> y es una plataforma accesible para crear nuevas aplicaciones de forma sencilla.</p>

<p>Por otra parte, Bitcoin y Ethereum difieren en la cantidad de unidades disponibles. Mientras <strong>Bitcoin tiene un límite de emisión</strong> establecido en 21 millones de unidades, <strong>Ethereum no tiene ningún límite preestablecido</strong>. Al momento de la publicación de esta nota, el total ascendía a más de <strong>114 millones de unidades</strong>. Para los defensores de Bitcoin, esto es problemático dado que <strong>no habría diferencia sustancial entre Ether y el dinero fiduciario</strong>, es decir, el que es controlado por los estados y emitido acorde a las necesidades del momento.</p>

<h2>Cuantas minas que tengo</h2>

<p>No hace falta más que recorrer un poco las Galerías Jardín, ubicadas en la calle Florida (la peatonal más famosa y microcéntrica de Buenos Aires) para cruzarse con una cantidad considerable de <strong>sujetos que van de local en local preguntando precios de placas de video</strong>. Muchos están ahí por los videojuegos, pero otros por la <strong>minería de Ethereum</strong> que, con estos precios, volvió a ser <strong>una inversión muy rentable</strong>.</p>

<p>Resulta que, a diferencia de Bitcoin, <strong>Ethereum todavía se puede minar con placas de video comunes y corrientes</strong>, conocidas como GPU (siglas de <em>graphics processing unit</em>). "<strong>Con este precio, recuperás lo invertido en dólares en cinco meses</strong>", dice una fuente del sector que prefiere mantenerse anónima, mientras busca de local en local y discute precios de placas como si se tratara de alfombras en algún bazar del Medio Oriente.</p>

<h2>Comprar Ether en Argentina</h2>

<p>Como ya explicamos oportunamente con Bitcoin, la compra de Ethereum no requiere ninguna ciencia en especial, sino <strong>abrir una cuenta en alguna plataforma de compra venta</strong> (Binance, Satoshi Tango, Ripio), pasar un <strong>breve proceso de carga de datos</strong> y luego <strong>cargar pesos para operar</strong>. La venta funciona de la misma manera, se vende directo a la plataforma a cambio de pesos.</p>

<p>Luego de comprar, si la idea es <strong>atesorar esos ETH o usarlos para invertir en DeFi</strong> lo más recomendable es sacarlos de las plataformas y <strong>enviarlos a una billetera propia</strong> como por ejemplo Metamask, una billetera de Ethereum compatible con todas las monedas y tokens que usan dicha tecnología, con una <strong>interfaz simple</strong> que se puede instalar como <strong>extensión del navegador de internet</strong> (Chrome, Firefox, Brave) o bien descargarla al teléfono.</p>

<p>También, para quienes elijan ir por una opción 100% barrani para que sus transacciones no queden registradas en alguna plataforma, pueden buscar cobijo en los <strong>cada día más numerosos cripto cueveros</strong>. Ya sea para Bitcoin o Ethereum, <strong>el veranito cripto está a todo vapor en Buenos Aires</strong>.</p>
""",
    },
    {
        'title': '"El dinero es el índice de información de este sistema"',
        'slug': 'criptocomunismo-mark-alizart-bitcoin-dinero',
        'subtitle': 'Lejos del clamor antiestatista libertario, el autor plantea a Bitcoin como una máquina de consenso y de política social.',
        'date': '2020-11-03T14:22:00.000Z',
        'source_url': 'https://www.pagina12.com.ar/303471-el-dinero-es-el-indice-de-informacion-de-este-sistema',
        'source_name': 'Página/12',
        'html': """
<p><strong>Mark Alizart</strong>, el filósofo más extraño y entretenido de Francia, empieza su texto <strong>Criptocomunismo</strong> arrojando una bomba molotov contra el sentido común: <strong>Bitcoin no será la moneda de los libertarios</strong>, sino que dará origen a una <strong>versión upgradeada del comunismo, el criptocomunismo</strong>.</p>

<p>En este ensayo fértil, todo parece ser condición de posibilidad para algo más. A diferencia de otros textos filosóficos, dónde lo central es demostar cierta tesis, Alizart hace <strong>filosofía para pensar, disparar preguntas</strong> y encontrar los recovecos por dónde explota el sentido. Es una <strong>máquina de sintetizar conceptos</strong>, que enarbola una tesis por capítulo, y a veces por página. Escribe con el vértigo y la rapidez de <strong>quién cree haber encontrado algo nuevo</strong>. Y tal vez sea así.</p>

<h2>Bitcoin y el anarcocapitalismo</h2>

<p>La <strong>criptomoneda más famosa del mundo</strong>, creada por el anónimo Satoshi Nakamoto en los albores de la crisis económica de 2009, se convirtió rápidamente en un <strong>paraíso libertario, o mejor dicho, anarcocapitalista</strong>.</p>

<p>Para quienes vengan de la izquierda, la idea de anarquía unida a la de capitalismo puede parecer descabellada, pero alcanza con hacer la siguiente distinción: mientras que para los anarquistas clásicos el objetivo político era abolir el Estado y la propiedad privada, <strong>para los anarcocapitalistas alcanza con abolir al Estado, pero manteniendo la propiedad privada</strong>. Una especie de feat entre Kropotkin y Locke.</p>

<p><strong>Bitcoin</strong>, en ese sentido, sería la tecnología perfecta, pues cumple con ambas condiciones: <strong>elimina al Estado como intermediario en la creación de monedas</strong>, a la vez que se constituye como una <strong>herramienta que garantiza la propiedad privada</strong>, dadas las características de la red sobre la que opera.</p>

<p>Pero para Alizart, al revés de lo que sus seguidores creen, <strong>Bitcoin es una máquina de juntar gente en torno a un objetivo: generar consenso</strong>. En este sentido, sería una institución mucho más política de lo que sus seguidores están dispuestos a asumir.</p>

<p>Alizart sostiene que Bitcoin es una tecnología cuyo impacto tiene que ser buscado en dos revoluciones previas: la reforma protestante y la revolución francesa. <strong>Bitcoin trae consigo un nuevo orden teológico-político</strong>, dado que es una nueva institución cuya <strong>principal función es proveer un algoritmo de "fe"</strong>. Bitcoin, como todo el dinero, obtiene valor a partir de que una comunidad cree que lo tiene.</p>

<p>Alizart sostiene que si bien los bitcoiners buscan ser "libres" de cualquier institución, Bitcoin en realidad es <strong>una institución de la libertad, un orden social</strong>. Pareciera que la política es una maldición imposible de huir: Bitcoin es, en un punto, <strong>un sistema de consenso, una pequeña "comunidad organizada"</strong>.</p>

<h2>La Izquierda y la tecnología</h2>

<p>"La izquierda no puede seguir mirando la tecnología como si fuera algo extraño o maligno. Nick Srnicek y Alex Williams escribieron sobre eso hace unos años en <em>El Manifiesto Aceleracionista</em>, <strong>llamando a los progresistas a reclamar la idea del futuro</strong> en lugar de dejarla al neoliberalismo", responde Alizart por mail.</p>

<p>Si hubiera que resumir de qué se trata su libro en solo un par de líneas, se podría decir que <strong>para el autor, Bitcoin es la herramienta que le faltaba al libre mercado para devenir en comunismo</strong>. Lo cual pareciera ser una contradicción absoluta: ¿cómo puede ser el libre mercado la puerta hacia el comunismo?</p>

<p>"Obviamente es discutible, pero fue la idea original de Marx, y proviene de la tradición anarquista que alimentó el socialismo temprano. Contrariamente a la mayoría de las creencias, <strong>el comunismo no es estatismo</strong>. Es la idea de que el estado debe ser destruido, pero también es <strong>la idea de que el estado no puede ser destruido ingenuamente</strong>."</p>

<p>Recuerda el filósofo francés que <strong>Marx creía que la concepción liberal de los mercados libres era una ilusión</strong>, o peor aún, un esquema para ocultar el hecho de que el Estado que creemos como servidor público está en realidad solo al servicio de intereses privados. "Así que el marxismo lucha por encontrar una forma de destruir el Estado de una manera majestuosa. Y para ser justos, nunca lo logró", considera Alizart.</p>

<p>El autor de <em>Criptocomunismo</em> está profundamente interesado en la <strong>cibernética</strong>, la ciencia de los <strong>sistemas distribuidos</strong>, y particularmente en las <strong>blockchains</strong>. "Por lo tanto, creo que <strong>Marx habría estado muy interesado en todo</strong> y probablemente habría abrazado las criptomonedas de la misma manera que abrazó el darwinismo o la estadística."</p>

<h2>¿Es la economía una forma de mover energía?</h2>

<p>—Sí, en gran parte, <strong>de eso se trata la economía</strong>. La economía es la forma en que un sistema (vivo o social) <strong>recolecta y distribuye energía hacia sus partes móviles</strong>. Pero hay que añadir de inmediato: <strong>energía e información</strong>. Esta es la parte que falta en el marxismo, que entendió bien la naturaleza termodinámica de la economía.</p>

<h2>¿Cómo sería eso?</h2>

<p>—No se trata solo de poder de trabajo, también se trata de asignación de información. <strong>El dinero es, en cierto modo, ese índice de información en el sistema</strong>. Por eso, el dinero no es sólo un "velo en la economía": tiene propiedades intrínsecas y un papel especial que desempeñar.</p>

<h2>Criptomonedas para la liberación</h2>

<p>Para Alizart, con un razonamiento análogo a la termodinámica, <strong>cualquier sistema económico puede entenderse como un sistema que mueve energía, pero también información</strong>. El dinero sería, en este caso, esa información extra. <strong>Y Bitcoin es una nueva forma (más ágil, eficiente y útil) de mover información</strong>.</p>

<p>Además, al Bitcoin no estar dominado por ninguna empresa o estado en particular, tiene la capacidad de <strong>devolver los medios de producción monetarios a las manos de aquellos que más lo necesitan</strong>: las personas comunes y corrientes, los trabajadores y trabajadoras del planeta <strong>sin ningún tipo de acceso privilegiado al capital</strong>.</p>

<p>De esta manera, para el autor, <strong>se rompería la endogamia entre mercados, bancos y Estado</strong>, que de forma permanente mantiene a las personas alejadas del acceso al dinero (aka información) y perpetúa, así, las relaciones de poder del orden actual. Serían entonces las criptomonedas y las blockchains una nueva arma <strong>al servicio de la internacional comunista</strong>. Criptoproletarios del mundo... ¡uníos!</p>
""",
    },
]


def main():
    # Check for --delete flag
    if '--delete' in sys.argv:
        idx = sys.argv.index('--delete')
        delete_ids = sys.argv[idx+1:]
        token = get_token()
        for pid in delete_ids:
            try:
                status = delete_post(token, pid)
                print(f"Deleted {pid}: {status}")
            except Exception as e:
                print(f"Failed to delete {pid}: {e}")
        return

    token = get_token()

    for i, article in enumerate(ARTICLES):
        print(f"\n[{i+1}/{len(ARTICLES)}] Creating: {article['title']}")
        try:
            post = create_post(
                token,
                article['title'],
                article['slug'],
                article['html'].strip(),
                article['subtitle'],
                article['date'],
                article['source_url'],
                article['source_name'],
            )
            print(f"  Created draft: {post['title']} (id: {post['id']})")
        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()

    print("\nDone!")


if __name__ == '__main__':
    main()
