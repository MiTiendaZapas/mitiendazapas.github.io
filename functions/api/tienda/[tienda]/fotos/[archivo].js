// Fotos de una tienda con stock propio: GET /api/tienda/<tienda>/fotos/<archivo>
// Cada foto tiene un nombre único que nunca se reutiliza: se puede guardar para siempre.
import { isPhotoFile, isStoreId } from "../../../../../servidor/panel.js";

export async function onRequestGet({ env, params }) {
  if (!isStoreId(params.tienda) || !isPhotoFile(params.archivo)) return new Response("No encontrada", { status: 404 });
  const object = await env.CATALOGO.get(`tiendas/${params.tienda}/fotos/${params.archivo}`);
  if (!object) return new Response("No encontrada", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": params.archivo.endsWith(".jpg") ? "image/jpeg" : "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
