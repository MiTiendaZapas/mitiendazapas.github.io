/*
 * Tiendas con stock propio: los datos de la tienda (nombre, logo, WhatsApp, redes, color,
 * textos de la portada y venta por mayor) los cambia el cliente en su panel. Acá se leen
 * y se aplican sobre configuracion.js antes de dibujar la página.
 */
const NETWORKS = {
  instagram: { label: "Instagram", url: (u) => `https://www.instagram.com/${u}/`, handle: (u) => `@${u}` },
  tiktok: { label: "TikTok", url: (u) => `https://www.tiktok.com/@${u}`, handle: (u) => `@${u}` },
  facebook: { label: "Facebook", url: (u) => `https://www.facebook.com/${u}`, handle: (u) => u },
};

export async function loadStoreSettings(config) {
  try {
    const response = await fetch(`/api/tienda/${encodeURIComponent(config.manualStore)}/ajustes.json`, { cache: "no-cache" });
    if (!response.ok) return null;
    const settings = await response.json();
    return settings?.name ? settings : null;
  } catch {
    return null;   // sin ajustes: queda lo de configuracion.js
  }
}

export function applyStoreSettings(config, channel, settings) {
  const base = `/api/tienda/${encodeURIComponent(config.manualStore)}/`;
  config.name = settings.name;
  if (settings.tagline) config.tagline = settings.tagline;
  config.logo = settings.logo ? { small: base + settings.logo.small, large: base + settings.logo.large, alt: settings.name } : null;
  if (settings.whatsapp) config.contact = { ...config.contact, whatsappQueries: settings.whatsapp, whatsappOrders: settings.whatsapp };
  config.social = Object.entries(NETWORKS)
    .filter(([network]) => settings[network])
    .map(([network, n]) => ({ network, label: n.label, handle: n.handle(settings[network]), url: n.url(settings[network]) }));
  if (config.footer) config.footer = { ...config.footer, description: settings.tagline || config.footer.description };

  const hero = channel.hero;
  if (hero) {
    if (settings.heroTitle) Object.assign(hero, { title: settings.heroTitle, highlight: settings.heroHighlight || "" });
    if (settings.heroText) hero.text = settings.heroText;
    hero.showSocial = config.social.length > 0;
  }

  // Color principal (botones): solo en modo claro; el oscuro mantiene sus colores.
  const colors = config.theme?.colors;
  if (colors && settings.color) {
    Object.assign(colors, { accent: settings.color, "accent-strong": settings.color, "accent-gradient": settings.color });
    if (document.documentElement.dataset.theme !== "dark") {
      for (const name of ["accent", "accent-strong", "accent-gradient"]) document.documentElement.style.setProperty(`--color-${name}`, settings.color);
    }
  }
  // Portada: "Nombre · Catálogo". Otras páginas: "Cómo comprar · Nombre".
  document.title = document.body.matches("[data-channel]")
    ? `${settings.name} · Catálogo`
    : `${document.title.split(" · ")[0]} · ${settings.name}`;
}

/** Venta por mayor que eligió el cliente (o ninguna). */
export function applyWholesaleSettings(priceTable, settings) {
  if (!settings) return priceTable;
  // Lo que subió o bajó la lista con "Cambiar precios" en su panel.
  if (settings.brPercent) priceTable = { ...priceTable, percent: settings.brPercent };
  if (!settings.wholesale) return { ...priceTable, wholesale: false };
  const min = settings.wholesaleMin || 5;
  return { ...priceTable, wholesale: { ...(priceTable.wholesale || {}), minPairs: min, allProducts: true, label: `Llevando ${min} o más productos surtidos` } };
}
