export const PUBLIC_CONTACT_CATEGORIES = [
  { value: 'idea', label: 'Idea o mejora' },
  { value: 'ux', label: 'Interfaz o usabilidad' },
  { value: 'data', label: 'Datos, cartas o sets' },
  { value: 'bug', label: 'Error o comportamiento raro' },
  { value: 'other', label: 'Otro tema' },
];

export const PUBLIC_UPDATES = [
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
    id: '2026-05-13-security-hardening',
    date: '2026-05-13',
    type: 'fix',
    title: 'Refuerzo de seguridad y estabilidad',
    summary: 'Se endurecieron rate limits, validacion de adjuntos y gestion de contrasenas para reducir riesgos y errores.',
    highlights: [
      'Rate limit persistente en base de datos.',
      'Adjuntos multimedia validados por contenido real.',
      'Registro sin filtrado claro de cuentas existentes.',
    ],
    tags: ['seguridad', 'backend', 'feedback'],
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
    answer: 'Si. Envianos el texto de la lista o una captura y revisaremos el parser o el formato concreto que te esta fallando.',
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
