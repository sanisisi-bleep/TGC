export const PUBLIC_CONTACT_CATEGORIES = [
  { value: 'idea', label: 'Idea o mejora' },
  { value: 'ux', label: 'Interfaz o usabilidad' },
  { value: 'data', label: 'Datos, cartas o sets' },
  { value: 'bug', label: 'Error o comportamiento raro' },
  { value: 'other', label: 'Otro tema' },
];

export const PUBLIC_UPDATES = [
  {
    id: '2026-05-16-deck-folders',
    date: '2026-05-16',
    type: 'feature',
    title: 'Carpetas para organizar mazos',
    summary: 'Mis Mazos ya permite agrupar listas por carpetas para ordenar mejor pruebas, sets o arquetipos dentro de cada TCG.',
    highlights: [
      'Creacion de carpetas por juego para separar mazos sin mezclar entornos.',
      'Movimiento de mazos dentro o fuera de carpeta con una gestion mas comoda.',
      'Vista de carpetas mas compacta para evitar caos visual cuando empiezas a acumular listas.',
    ],
    tags: ['mazos', 'organizacion', 'carpetas'],
  },
  {
    id: '2026-05-15-public-pages',
    date: '2026-05-15',
    type: 'improvement',
    title: 'Nuevas paginas publicas de soporte y confianza',
    summary: 'Se anaden Novedades, Contacto y Acerca de para explicar mejor el proyecto antes del registro.',
    highlights: [
      'Menu publico ampliado con acceso directo a las paginas informativas.',
      'Footer global con enlaces rapidos y juegos activos.',
      'Formulario publico de contacto con FAQ integrada.',
    ],
    tags: ['web', 'publico', 'soporte'],
  },
  {
    id: '2026-05-15-deck-history',
    date: '2026-05-15',
    type: 'feature',
    title: 'Historial y comparacion de mazos',
    summary: 'Los mazos ya guardan checkpoints automaticos y se pueden comparar con versiones anteriores u otros mazos.',
    highlights: [
      'Snapshots automaticos al tocar cantidades, considering y nombre.',
      'Checkpoint manual desde el detalle del mazo.',
      'Comparacion clara de cartas que entran, salen o cambian copias.',
    ],
    tags: ['mazos', 'historial', 'compare'],
  },
  {
    id: '2026-05-12-guest-demo',
    date: '2026-05-12',
    type: 'feature',
    title: 'Modo demo para invitados',
    summary: 'Buscar, Coleccion y Mazos ahora se pueden explorar sin sesion para entender mejor el producto antes de registrarse.',
    highlights: [
      'Vista guiada en lectura para invitados.',
      'CTA de login/registro desde las rutas reales.',
      'Menos confusion al entrar por primera vez.',
    ],
    tags: ['demo', 'onboarding', 'ux'],
  },
];

export const PUBLIC_FAQ_ITEMS = [
  {
    id: 'faq-demo',
    question: 'Puedo probar la web sin crear cuenta?',
    answer: 'Si. Buscar cartas, Coleccion y Mazos tienen un modo demo en lectura para que veas como funciona antes de registrarte.',
  },
  {
    id: 'faq-data',
    question: 'He visto una carta mal cargada o un set incompleto. Donde lo aviso?',
    answer: 'Usa el formulario de Contacto y marca la categoria de datos. Si puedes, anade el codigo de carta o el set para localizarlo mas rapido.',
  },
  {
    id: 'faq-import',
    question: 'Puedo enviar errores de importacion o listas de mazo raras?',
    answer: 'Si. Envianos el texto de la lista o el detalle del formato y revisaremos el parser concreto que te esta fallando.',
  },
  {
    id: 'faq-contact',
    question: 'Me respondereis si os escribo?',
    answer: 'Si marcas que permites contacto y dejas email, si. Si prefieres no compartirlo, el mensaje se recibe igual, solo que no podremos contestarte.',
  },
  {
    id: 'faq-suggest',
    question: 'Aceptais ideas de producto o nuevas funciones?',
    answer: 'Si. De hecho es uno de los objetivos del buzon publico: recoger que echan en falta los jugadores y que les haria volver mas.',
  },
];

export const PUBLIC_GUIDES = [
  {
    slug: 'importar-mazos-digimon',
    title: 'Como importar mazos de Digimon',
    summary: 'Formato recomendado para pegar listas de Digimon con codigo, variante y cantidad sin perder cartas por el camino.',
    tags: ['digimon', 'importacion', 'mazos'],
    updatedAt: '2026-05-20',
    sections: [
      {
        title: 'Formato mas estable',
        body: 'Usa una linea por carta con la cantidad al inicio, despues el codigo y al final el nombre. Por ejemplo: 4 BT12-021 Veemon.',
      },
      {
        title: 'Variantes y promos',
        body: 'Si tu lista usa variantes como BT12-002_P0, puedes pegarla tal cual. El importador normaliza guiones y variantes para buscar la carta correcta.',
      },
      {
        title: 'Huevos Digi-Egg',
        body: 'Las cartas Digi-Egg se separan del main deck automaticamente cuando el tipo de carta lo permite, para respetar la estructura del juego.',
      },
    ],
  },
  {
    slug: 'organizar-mazos-carpetas',
    title: 'Como organizar mazos por carpetas',
    summary: 'Ideas para separar pruebas, torneos, sets y arquetipos sin convertir Mis Mazos en una pared infinita.',
    tags: ['carpetas', 'organizacion', 'ux'],
    updatedAt: '2026-05-16',
    sections: [
      {
        title: 'Carpetas por objetivo',
        body: 'Crea carpetas por entorno: torneo, pruebas, casual o nombre de expansion. Asi cada mazo tiene un contexto claro.',
      },
      {
        title: 'Mover sin perder datos',
        body: 'Mover un mazo a una carpeta no cambia cartas, historial ni disponibilidad. Solo cambia como lo visualizas.',
      },
      {
        title: 'Sacar de carpeta',
        body: 'Si una lista deja de pertenecer a una carpeta, puedes moverla fuera y volvera a aparecer en la zona principal de mazos.',
      },
    ],
  },
  {
    slug: 'completar-mazo-con-coleccion',
    title: 'Como completar un mazo con tu coleccion',
    summary: 'La forma rapida de entender que copias tienes, cuales estan ocupadas y que falta para cerrar una lista.',
    tags: ['coleccion', 'mazos', 'faltantes'],
    updatedAt: '2026-05-20',
    sections: [
      {
        title: 'Copias totales y disponibles',
        body: 'La coleccion diferencia entre copias que posees y copias libres. Si una carta esta asignada a otro mazo, no se cuenta como disponible.',
      },
      {
        title: 'Faltantes del mazo',
        body: 'Al abrir un mazo puedes ver si las cantidades que pide la lista estan cubiertas por tu coleccion o si falta comprar/intercambiar cartas.',
      },
      {
        title: 'Clonar con seguridad',
        body: 'Clonar un mazo copia la lista, pero no inventa disponibilidad. La coleccion sigue siendo la fuente real de copias.',
      },
    ],
  },
  {
    slug: 'one-piece-don',
    title: 'Guia rapida de One Piece DON!!',
    summary: 'Que son las cartas DON!!, como se separan del mazo principal y por que conviene importarlas como seccion propia.',
    tags: ['one piece', 'don', 'reglas'],
    updatedAt: '2026-05-20',
    sections: [
      {
        title: 'No forman parte del main deck',
        body: 'En One Piece, el mazo principal mantiene sus 50 cartas y el mazo DON!! va separado con hasta 10 cartas DON!!.',
      },
      {
        title: 'Importacion clara',
        body: 'Si el importador detecta DON!!, lo coloca en su zona para evitar que altere el contador del main deck.',
      },
      {
        title: 'Color identity',
        body: 'Las cartas de main deck se validan contra el Leader cuando aplica. DON!! queda aparte porque su funcion es distinta.',
      },
    ],
  },
];

export const ABOUT_SECTIONS = [
  {
    id: 'what',
    eyebrow: 'Que es',
    title: 'Un hub para varios TCGs sin cambiar de herramienta',
    text: 'Multiverse TCG Manager nace para juntar buscador, coleccion y mazos dentro de la misma cuenta, sin obligarte a saltar entre webs distintas segun el juego.',
  },
  {
    id: 'why',
    eyebrow: 'Por que existe',
    title: 'Menos friccion y mas tiempo jugando',
    text: 'La idea no es solo guardar cartas. La gracia es que una carta que buscas termine en tu coleccion, y de ahi pase a un mazo con reglas reales del TCG, todo en el mismo flujo.',
  },
  {
    id: 'growth',
    eyebrow: 'Vision',
    title: 'Crecer TCG a TCG sin romper la base',
    text: 'El proyecto esta pensado para seguir sumando juegos, mejorar reglas especificas, importar listas reales y dar mas contexto de coleccion, historial y metajuego.',
  },
];

export const ABOUT_VALUE_POINTS = [
  'Buscador de cartas con filtros y detalle por juego.',
  'Coleccion conectada a disponibilidad real de copias.',
  'Mazos con validacion por TCG, importacion y exportacion.',
  'Modo demo para ensenar el producto antes del registro.',
];
