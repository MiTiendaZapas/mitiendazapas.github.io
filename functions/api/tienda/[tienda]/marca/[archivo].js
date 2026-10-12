// Logo de una tienda con stock propio: GET /api/tienda/<tienda>/marca/<archivo>
import { isLogoFile, isStoreId } from "../../../../../servidor/panel.js";

export async function onRequestGet({ env, params }) {
  if (!isStoreId(params.tienda) || !isLogoFile(params.archivo)) return new Response("No encontrado", { status: 404 });
  const object = await env.CATALOGO.get(`tiendas/${params.tienda}/marca/${params.archivo}`);
  if (!object) return new Response("No encontrado", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": params.archivo.endsWith(".jpg") ? "image/jpeg" : "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
