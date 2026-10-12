// Portada de una tienda con stock propio (/<tienda>/): antes de entregarla, le pone el
// nombre, la descripción y el logo que el cliente cargó en su panel. Así, al compartir
// el link por WhatsApp o Instagram, la vista previa muestra SU tienda.
// Solo corre para las tiendas con stock propio (lo decide _routes.json al publicar).
import { isStoreId, readSettings } from "../../servidor/panel.js";

class SetContent {
  constructor(value) { this.value = value; }
  element(el) {
    if (this.value) el.setAttribute("content", this.value);
    else el.remove();
  }
}

export async function onRequestGet({ request, env, params, next }) {
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
  const title = `${settings.name} · Catálogo`;
  const description = settings.tagline || settings.heroText || "Elegí producto y talle, armá tu pedido y envialo por WhatsApp.";
  const image = settings.logo ? `${origin}/api/tienda/${params.tienda}/${settings.logo.large}` : "";
  return new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(title); } })
    .on('meta[name="description"]', new SetContent(description))
    .on('meta[property="og:title"]', new SetContent(title))
    .on('meta[property="og:description"]', new SetContent(description))
    .on('meta[property="og:image"]', new SetContent(image))
    .on('meta[property="og:image:alt"]', new SetContent(image ? `Logo de ${settings.name}` : ""))
    .on('link[rel="icon"]', { element(el) { if (image) el.setAttribute("href", `${origin}/api/tienda/${params.tienda}/${settings.logo.small}`); else el.remove(); } })
    .transform(response);
}
