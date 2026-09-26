/*
 * CONFIGURACIÓN DE LA TIENDA: ClienteA ("TIENDA F.O")
 * ---------------------------------------------------------------------------
 * Tienda de cliente: usa el mismo catálogo y el mismo motor que L.A IMP, con
 * su propio nombre, colores, contacto y precios (precios-*.json de esta carpeta).
 *
 * Datos tomados de su tienda actual (revendedores/clienteA). Lo marcado con
 * "COMPLETAR" todavía no lo sabemos: hay que confirmarlo con el cliente.
 */
window.STORE_CONFIG = {
  id: "cliente-a",
  name: "TIENDA F.O",
  tagline: "Catálogo de zapatillas",

  // Catálogo compartido: dos carpetas arriba de esta.
  catalogBase: "../../catalogo/",
  catalogOrder: "marca-modelo",

  // Igual que su tienda actual: solo stock del proveedor, sin el stock de casa de L.A IMP.
  includeHouseStock: false,

  // Sin logo por ahora (COMPLETAR si el cliente tiene uno): se muestra solo el nombre.
  logo: null,

  // Tema neutro. Para personalizarlo alcanza con cambiar estos colores.
  theme: {
    fonts: {
      stylesheet: "../../motor/fuentes/fuentes.css",
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
    whatsappQueries: "5491176386575",
    whatsappOrders: "5491176386575",
  },

  // COMPLETAR: redes del cliente. Si la lista está vacía, no se muestran.
  social: [],

  // Sin "purchaseModes": igual que su tienda actual, llevando 5 o más pares
  // surtidos el precio por mayor se aplica solo (el cliente no elige).
  channels: {
    mayorista: {
      label: "Por mayor",
      page: "index.html",
      prices: "precios-mayorista.json",
      share: "fotos",   // compartir: fotos sin precio ni link (para revender)
      hero: {
        eyebrow: "Venta por mayor",
        title: "Catálogo de zapatillas",
        highlight: "",
        text: "Elegí modelos y talles, armá tu pedido y envialo por WhatsApp. Te confirmamos el stock y coordinamos la entrega.",
        points: [
          { icon: "box", text: "Precio por mayor llevando 5 o más pares surtidos" },
          { icon: "chat", text: "Sin pago online: confirmás por WhatsApp" },
        ],
      },
    },
    minorista: {
      label: "Tienda",
      page: "minorista.html",
      prices: "precios-minorista.json",
      share: "link",
      hero: {
        eyebrow: "Tienda online",
        title: "Catálogo de zapatillas",
        highlight: "",
        text: "Elegí tu modelo y tu talle, armá el pedido y envialo por WhatsApp. Te confirmamos el stock y coordinamos la entrega.",
        points: [
          { icon: "box", text: "Precio por mayor llevando 5 o más pares surtidos" },
          { icon: "chat", text: "Sin pago online: confirmás por WhatsApp" },
        ],
      },
    },
  },

  // Por ahora solo "Cómo comprar". Envíos, cambios, preguntas y nosotros se
  // suman cuando el cliente pase su información (COMPLETAR).
  pages: [
    { id: "como-comprar", label: "Cómo comprar", file: "paginas/como-comprar.html", menu: true },
  ],

  // COMPLETAR: si el cliente quiere mostrar una tabla de talles, copiar
  // "sizeChart" de la configuración de L.A IMP.
  sizeChart: null,

  // COMPLETAR con los métodos de envío reales del cliente. Por ahora, genéricos.
  // En el pedido no se piden datos: el envío se coordina por WhatsApp.
  shipping: {
    methods: {
      envio: {
        label: "Envío a coordinar",
        icon: "truck",
        summary: "Coordinamos el envío y su costo por WhatsApp.",
      },
    },
  },

  howToBuy: {
    title: "Cómo comprar",
    lead: "Armás el pedido en la tienda y lo terminamos por WhatsApp. No se paga nada en la web.",
    steps: [
      { title: "Elegí modelo y talle", text: "Tocá el talle en cada modelo y agregalo a tu pedido." },
      { title: "Revisá tu pedido", text: "En “Tu pedido” ves el total. Llevando 5 o más pares surtidos se aplica el precio por mayor." },
      { title: "Envialo por WhatsApp", text: "Tocás “Enviar pedido por WhatsApp” y se arma el mensaje con todo el detalle." },
      { title: "Confirmamos y coordinamos", text: "Verificamos el stock, te confirmamos el pedido y coordinamos el pago y la entrega." },
    ],
  },

  // La franja grande de tiendas a medida no se muestra en tiendas de clientes...
  platformPromo: { enabled: false },
  // ...solo esta pregunta chiquita al pie, con link al WhatsApp de quien hace las tiendas.
  // "{tienda}" se reemplaza por el nombre de esta tienda (así sabés desde dónde te escriben).
  platformCredit: {
    enabled: true,
    text: "¿Querés una tienda así?",
    whatsapp: "5491153773771",
    message: "Hola! Vi la tienda de {tienda} y quiero una tienda así para mi negocio.",
  },

  footer: {
    description: "Catálogo de zapatillas. Pedidos por WhatsApp.",
    legal: "Los pedidos se confirman por WhatsApp. No se realizan cobros en este sitio.",
  },

  categories: {
    zapatillas: "Zapatillas",
    ninos: "Niños",
    ojotas: "Ojotas",
    indumentaria: "Indumentaria",
  },
};
