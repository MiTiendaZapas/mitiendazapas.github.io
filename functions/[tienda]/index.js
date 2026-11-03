// Portada de una tienda con stock propio (/<tienda>/): antes de entregarla, le pone el
// nombre, la descripción y el logo que el cliente cargó en su panel. Así, al compartir
// el link por WhatsApp o Instagram, la vista previa muestra SU tienda.
// Catálogo sin nombre ni logo (Mi tienda → Tipo de tienda): la vista previa dice solo "Catálogo" y
// muestra la foto de uno de sus productos en vez del logo.
// Solo corre para las tiendas con stock propio (lo decide _routes.json al publicar).
import { brProducts, isStoreId, readBrStock, readCatalog, readSettings } from "../../servidor/panel.js";

class SetContent {
  constructor(value) { this.value = value; }
  element(el) {
    if (this.value) el.setAttribute("content", this.value);
    else el.remove();
  }
}

const SHARE_SECONDS = 600;

/** Foto para la vista previa de un catálogo sin marca: la portada del primer producto que se ve. */
async function productPhoto(env, store, origin) {
  const { data } = await readCatalog(env, store);
  const url = (path) => (/^https?:\/\//.test(path) ? path : `${origin}/api/tienda/${store}/${path}`);
  const own = data.products.find((p) => !p.hidden && p.images?.length);
  if (own) return url(own.images[0].sm || own.images[0].lg);
  if (data.stockBR) {
    const model = brProducts(data, await readBrStock(env, data.stockBR)).find((p) => p.status === "visible" && p.images?.length);
    if (model) return url(model.images[0].sm || model.images[0].lg);
  }
  return null;
}

/** La foto se guarda unos minutos: así no se arma el catálogo en cada visita a la portada. */
async function sharePhoto(env, store, origin, waitUntil) {
  const cache = globalThis.caches?.default;
  const key = new Request(`${origin}/_compartir/${store}`);
  const cached = cache && await cache.match(key);
  if (cached) return (await cached.text()) || null;
  let photo = null;
  try { photo = await productPhoto(env, store, origin); } catch { /* sin foto: la vista previa queda sin imagen */ }
  if (cache) {
    const stored = new Response(photo ?? "", { headers: { "Cache-Control": `public, max-age=${SHARE_SECONDS}` } });
    waitUntil?.(cache.put(key, stored));
  }
  return photo;
}

export async function onRequestGet({ request, env, params, next, waitUntil }) {
  const response = await next();
  if (!isStoreId(params.tienda) || !(response.headers.get("Content-Type") ?? "").includes("text/html")) return response;
  let settings;
  try {
    settings = await readSettings(env, params.tienda);
  } catch {
    return response;
  }
  if (!settings?.name) return response;

  const origin = new URL(request.url).origin;
  const catalog = settings.mode === "catalogo";
  const hideBrand = catalog && settings.showBrand === false;
  const title = hideBrand ? "Catálogo" : `${settings.name} · Catálogo`;
  const fallback = catalog ? "Mirá los productos, armá tu lista y consultá por WhatsApp."
    : "Elegí producto y talle, armá tu pedido y envialo por WhatsApp.";
  // Sin marca, la frase de la tienda tampoco se muestra (podría nombrarla).
  const description = (hideBrand ? settings.heroText : settings.tagline || settings.heroText) || fallback;
  const rewriter = new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(title); } })
    .on('meta[name="description"]', new SetContent(description))
    .on('meta[property="og:title"]', new SetContent(title))
    .on('meta[property="og:description"]', new SetContent(description));
  if (hideBrand) {
    // Ni el logo ni el nombre: la imagen es una foto de sus productos (o ninguna, si todavía no tiene).
    const photo = await sharePhoto(env, params.tienda, origin, waitUntil);
    rewriter
      .on('meta[property="og:image"]', new SetContent(photo))
      .on('meta[property="og:image:type"]', new SetContent(null))
      .on('meta[property="og:image:width"]', new SetContent(null))
      .on('meta[property="og:image:height"]', new SetContent(null))
      .on('meta[property="og:image:alt"]', new SetContent(null))
      .on('link[rel="icon"]', { element(el) { el.remove(); } });
  } else if (settings.logo) {
    // Logo subido en el panel: es el ícono de la pestaña y la imagen al compartir. Sin logo subido
    // quedan los de la página (antes se borraban y L.A IMP se quedaba sin ícono ni imagen al compartir).
    const image = `${origin}/api/tienda/${params.tienda}/${settings.logo.large}`;
    rewriter
      .on('meta[property="og:image"]', new SetContent(image))
      .on('meta[property="og:image:alt"]', new SetContent(`Logo de ${settings.name}`))
      .on('link[rel="icon"]', { element(el) { el.setAttribute("href", `${origin}/api/tienda/${params.tienda}/${settings.logo.small}`); } });
  }
  return rewriter.transform(response);
}
