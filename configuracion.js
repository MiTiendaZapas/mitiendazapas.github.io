/*
 * CONFIGURACIÓN DE LA TIENDA: L.A IMP
 * ---------------------------------------------------------------------------
 * Este es el archivo para personalizar la tienda: nombre, colores, contactos,
 * redes y textos. Los precios están aparte, en precios-mayorista.json y
 * precios-minorista.json.
 *
 * Números de WhatsApp: formato internacional sin "+" ni espacios
 * (54 9 11 xxxx-xxxx  ->  "5491100000000").
 */
window.STORE_CONFIG = {
  id: "la-imp",
  name: "L.A IMP",
  tagline: "Zapatillas por unidad y por mayor",

  // Carpeta del catálogo compartido (productos.json + fotos/), relativa a esta página.
  catalogBase: "catalogo/",

  // Orden de los modelos: "marca-modelo" (marca A-Z y modelo A-Z) o "mas-vendidos".
  catalogOrder: "marca-modelo",

  logo: {
    small: "marca/logo-160.webp",
    large: "marca/logo-512.webp",
    alt: "L.A IMP",
  },

  // Tema claro y simple: fondo gris muy suave, tarjetas blancas y negro para
  // botones y precios (el mismo estilo que la tienda de ClienteA).
  theme: {
    fonts: {
      // Fuentes guardadas dentro del proyecto (no dependen de Google).
      stylesheet: "motor/fuentes/fuentes.css",
      display: "'Barlow Condensed', 'Arial Narrow', sans-serif",
      body: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    },
    colors: {
      "bg": "#f5f5f3",
      "surface": "#ffffff",
      "surface-2": "#ececea",
      "border": "#d9d9d5",
      "text": "#18181b",
      "text-muted": "#5b5b63",
      "accent": "#18181b",
      "accent-strong": "#18181b",
      "accent-contrast": "#ffffff",
      "accent-gradient": "#18181b",
      "danger": "#c62828",
      "success": "#2e7d32",
    },
    colorScheme: "light",
  },

  contact: {
    // Consultas (modelos, talles, stock) y pedidos van al mismo número,
    // pero con mensajes distintos para que se reconozcan en el chat.
    whatsappQueries: "5491153773771",
    whatsappOrders: "5491153773771",
  },

  // Redes: se muestran en la franja de arriba de todo, en la tienda minorista,
  // al enviar un pedido y en el footer. Si la lista está vacía, no aparecen.
  social: [
    { network: "instagram", label: "Instagram", handle: "@lautaroagustin_imp", url: "https://www.instagram.com/lautaroagustin_imp/" },
    { network: "tiktok", label: "TikTok", handle: "@lautaroortiz155", url: "https://www.tiktok.com/@lautaroortiz155" },
    { network: "facebook", label: "Facebook", handle: "L.A IMP", url: "https://www.facebook.com/share/1Dkgvn1k2R/" },
  ],
  socialInvite: "Seguinos: novedades y modelos nuevos todos los días",

  // Las dos versiones de la tienda. Cada página HTML indica cuál es con
  // <body data-channel="...">.
  channels: {
    mayorista: {
      label: "Revendedores",
      page: "index.html",
      prices: "precios-mayorista.json",
      // Llevando 5 o más pares el cliente elige cómo comprar (igual que la tienda actual).
      purchaseModes: {
        mayor: { title: "Por mayor", note: "Sin cambio de talle", when: "Llevando 5 o más pares surtidos y eligiendo comprar por mayor.", message: "Compra POR MAYOR (5 o más pares surtidos): sin cambio de talle." },
        unidad: { title: "Por unidad", note: "Cambio de talle con recargo de $5.000", when: "Cuando comprás por unidad (o elegís no comprar por mayor).", message: "Compra POR UNIDAD: cambio de talle con recargo de $5.000." },
      },
      // "Compartir" de cada modelo: las fotos con nombre y talles, sin precio ni link,
      // para que el revendedor se las mande a su cliente.
      share: "fotos",
      // Versión para revendedores: sin portada, directo al catálogo. Solo una
      // franja finita con lo que hay que saber para comprar.
      hero: {
        compact: true,
        points: [
          { icon: "box", text: "Por mayor llevando 5 o más pares surtidos" },
          { icon: "chat", text: "Armás el pedido y lo enviás por WhatsApp" },
        ],
      },
    },
    minorista: {
      label: "Tienda",
      page: "minorista.html",
      prices: "precios-minorista.json",
      purchaseModes: {
        mayor: { title: "Por mayor", note: "Sin cambio de talle", when: "Llevando 5 o más pares surtidos y eligiendo comprar por mayor.", message: "Compra POR MAYOR (5 o más pares surtidos): sin cambio de talle." },
        unidad: { title: "Por unidad", note: "Con cambio de talle sin cargo", when: "Cuando comprás por unidad (o elegís no comprar por mayor).", message: "Compra POR UNIDAD: con cambio de talle sin cargo." },
      },
      // "Compartir" de cada modelo: el link directo al modelo en esta tienda.
      share: "link",
      hero: {
        eyebrow: "Tienda online",
        title: "Tus próximas zapatillas",
        highlight: "a un mensaje",
        text: "Elegí tu modelo y tu talle, armá el pedido y envialo por WhatsApp. Te confirmamos el stock y coordinamos la entrega.",
        points: [
          { icon: "repeat", text: "Cambio de talle sin cargo comprando por unidad" },
          { icon: "truck", text: "Envíos por moto mensajería y Vía Cargo" },
          { icon: "chat", text: "Sin pago online: confirmás por WhatsApp" },
        ],
        showSocial: true,
      },
    },
  },

  // Páginas de información (cada una es un archivo dentro de "paginas/").
  // "menu: true" = aparece en el menú de arriba; todas aparecen en el footer.
  pages: [
    { id: "como-comprar", label: "Cómo comprar", file: "paginas/como-comprar.html", menu: true },
    { id: "talles", label: "Talles", file: "paginas/tabla-de-talles.html", menu: true },
    { id: "envios", label: "Envíos", file: "paginas/envios.html", menu: true },
    { id: "cambios", label: "Cambios", file: "paginas/cambios-y-devoluciones.html", menu: true },
    { id: "preguntas", label: "Preguntas", file: "paginas/preguntas-frecuentes.html", menu: true },
    { id: "nosotros", label: "Nosotros", file: "paginas/nosotros.html" },
    { id: "revender", label: "Quiero revender", file: "paginas/revender.html" },
  ],

  // Tabla de talles: se ve en la página "Talles" y dentro de cada modelo de
  // las categorías indicadas (en niños y ojotas no, porque los talles son otros).
  sizeChart: {
    title: "Tabla de talles",
    categories: ["zapatillas"],
    hint: "Medí tu pie del talón a la punta del dedo más largo.",
    columns: ["Talle", "Largo del pie"],
    rows: [
      ["34", "23 cm"],
      ["35", "23,5 cm"],
      ["36", "24 cm"],
      ["37", "25 cm"],
      ["38", "25,5 cm"],
      ["39", "26 cm"],
      ["40", "26,5 cm"],
      ["41", "27 cm"],
      ["42", "28 cm"],
      ["43", "28,5 cm"],
      ["44", "29 cm"],
    ],
  },

  // Formas de entrega. Se informan en la página de envíos; en el pedido no se
  // pide ningún dato: el envío se coordina por WhatsApp.
  shipping: {
    methods: {
      moto: {
        label: "Moto mensajería",
        icon: "truck",
        summary: "El costo se consulta una vez hecho el pedido o por WhatsApp.",
        consultLabel: "Consultar costo por WhatsApp",
        consultMessage: "¿Cuánto sale el envío por moto a mi dirección? Estoy en ",
      },
      viacargo: {
        label: "Vía Cargo",
        icon: "box",
        summary: "Despachamos a la sucursal de Vía Cargo que elijas. El envío se paga al retirar.",
        points: [
          "Despachamos a la sucursal de Vía Cargo que nos indiques.",
          "El costo del envío no está incluido en el pedido: depende del despacho.",
          "Lo pagás directamente en la sucursal al retirar.",
          "Después de enviar el pedido, nos pasás por WhatsApp la localidad y la sucursal donde querés recibirlo.",
        ],
      },
    },
  },

  // ---------------------------------------------------------------------------
  // TEXTOS DE LAS PÁGINAS DE INFORMACIÓN
  // En preguntas frecuentes, "channels" limita una pregunta a una sola versión.
  // Para sacar una página, quitala de "pages" (arriba).
  // ---------------------------------------------------------------------------
  howToBuy: {
    title: "Cómo comprar",
    lead: "Armás el pedido en la tienda y lo terminamos juntos por WhatsApp. No se paga nada en la web.",
    steps: [
      { title: "Elegí modelo y talle", text: "Tocá el talle en cada modelo y agregalo a tu pedido. Podés sumar todos los pares que quieras." },
      { title: "Revisá tu pedido", text: "En “Tu pedido” ves el total. Llevando 5 o más pares surtidos elegís si comprás por mayor o por unidad." },
      { title: "Envialo por WhatsApp", text: "Tocás “Enviar pedido por WhatsApp” y se arma el mensaje con todo el detalle. No hace falta completar datos." },
      { title: "Confirmamos y coordinamos", text: "Verificamos el stock, te confirmamos el pedido y coordinamos el pago y el envío." },
    ],
  },

  shippingSection: {
    title: "Envíos",
    lead: "Enviamos por moto mensajería y por Vía Cargo. El envío se coordina por WhatsApp y no está incluido en el total del pedido.",
  },

  exchanges: {
    title: "Cambios y devoluciones",
    lead: "Depende de cómo hiciste la compra. Todos los cambios se coordinan por WhatsApp.",
    faultTitle: "Se cambia al recibir",
    faultNote: "Si un par tiene una falla de fábrica, lo cambiamos (comprando por mayor o por unidad). Revisá el pedido en el momento de recibirlo: la falla se tiene que avisar ahí para poder hacer el cambio.",
  },

  resellers: {
    title: "¿Querés empezar a vender zapatillas?",
    lead: "Te acompañamos desde el primer pedido. Con 5 pares surtidos ya accedés al precio por mayor, y te asesoramos para que elijas bien con qué arrancar.",
    points: [
      { icon: "box", title: "Por mayor desde 5 pares", text: "Surtidos: podés combinar modelos y talles." },
      { icon: "clock", title: "Catálogo actualizado", text: "Stock que se renueva durante el día para ofrecer a tus clientes." },
      { icon: "users", title: "Asesoramiento directo", text: "Te ayudamos a armar tu primer pedido según lo que buscás." },
    ],
    whatsapp: "5491136284751",
    ctaLabel: "Quiero asesoramiento",
    message: "Hola! Quiero empezar a revender zapatillas y me gustaría asesoramiento.",
  },

  about: {
    title: "Nosotros",
    text: [
      "L.A IMP nació hace dos años con una idea simple: acercar buenas zapatillas a quienes las usan y a quienes quieren venderlas.",
      "Trabajamos de forma directa y por WhatsApp: armás tu pedido, te confirmamos el stock real y coordinamos la entrega con vos, sin vueltas.",
    ],
    values: [
      { title: "2 años", text: "vendiendo zapatillas" },
      { title: "Trato directo", text: "cada pedido lo confirma una persona" },
      { title: "Por unidad o por mayor", text: "para usar o para revender" },
    ],
  },

  faq: [
    { q: "¿Cómo hago un pedido?", a: "Elegí el talle en cada modelo y agregalo a tu pedido. Cuando termines, tocá “Tu pedido” y “Enviar pedido por WhatsApp”. Ahí te confirmamos todo." },
    { q: "¿Qué talle elijo?", a: "Mirá la tabla de talles: medí tu pie del talón a la punta del dedo más largo y elegí el talle según los centímetros. Si tenés dudas, consultanos por WhatsApp." },
    { q: "¿Cómo pago?", a: "En la web no se paga nada. Primero confirmamos el stock por WhatsApp y después te indicamos cómo pagar." },
    { q: "¿El stock que veo es real?", a: "El catálogo se actualiza varias veces al día, pero el stock final siempre te lo confirmamos por WhatsApp antes de cualquier pago. Si tenés una duda puntual, consultanos." },
    { q: "¿Venden por mayor?", a: "Sí. Llevando 5 o más pares surtidos (podés combinar modelos y talles) accedés al precio por mayor, que figura debajo del precio de cada modelo." },
    { q: "¿Cuánto cuesta el envío por moto?", a: "El costo se consulta una vez hecho el pedido o por WhatsApp." },
    { q: "¿Cómo funciona Vía Cargo?", a: "Despachamos a la sucursal que nos indiques y el envío lo pagás al retirar. El costo no está incluido en el pedido porque depende del despacho." },
    { q: "¿Puedo cambiar el talle?", channels: ["mayorista"], a: "Comprando por unidad, sí: el cambio de talle tiene un recargo de $5.000. Comprando por mayor (5 o más pares) no hay cambio de talle. Revisá bien los talles antes de confirmar." },
    { q: "¿Puedo cambiar el talle?", channels: ["minorista"], a: "Comprando por unidad, sí, y sin cargo. Comprando por mayor (5 o más pares) no hay cambio de talle." },
    { q: "¿Hay cambios por falla?", a: "Sí, en cualquier tipo de compra, pero la falla se tiene que avisar en el momento de recibir el pedido. Revisá cada par cuando te llega." },
    { q: "¿Cuánto tarda el pedido?", a: "Depende de la confirmación del stock y del método de envío. Cuando confirmamos tu pedido por WhatsApp te decimos cuándo lo recibís." },
    { q: "¿Cómo puedo empezar a revender?", a: "Escribinos desde la sección “¿Querés empezar a vender zapatillas?” y te asesoramos para armar tu primer pedido." },
  ],

  // Servicio de tiendas online (queda al final, discreto, sin interferir con la compra).
  platformPromo: {
    enabled: true,
    title: "¿Querés una tienda así para tu negocio?",
    text: "Armamos catálogos online a medida para emprendimientos: con tu marca, tus precios y los pedidos directo a tu WhatsApp.",
    whatsapp: "5491153773771",
    ctaLabel: "Consultar",
    message: "Hola! Vi la tienda de L.A IMP y me interesa una tienda así para mi negocio.",
  },

  footer: {
    description: "Zapatillas por unidad y por mayor. Pedidos por WhatsApp.",
    legal: "Los pedidos se confirman por WhatsApp. No se realizan cobros en este sitio.",
  },

  categories: {
    zapatillas: "Zapatillas",
    ninos: "Niños",
    ojotas: "Ojotas",
    indumentaria: "Indumentaria",
  },
};
