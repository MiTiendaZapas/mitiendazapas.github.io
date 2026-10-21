// POST /api/panel/foto-catalogo  { id, room }  ->  { images: [{ lg, sm, w, h }], name }
//   Copia a la tienda las fotos de un modelo del stock automático (Brasil o G5), para usarlas en
//   un producto propio (por ejemplo, un par en liquidación) sin tener que sacarle fotos de nuevo.
import { CATALOG_PHOTOS_STORES, LIMITS, copyBrPhotos, fail, json, readBrStock } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  if (!CATALOG_PHOTOS_STORES.has(data.session.tienda)) return fail("Tu tienda no tiene esta opción.", 403);
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  try {
    const model = (await readBrStock(env)).products.find((p) => p.id === input?.id);
    if (!model) throw new Error("Ese modelo ya no está en el stock.");
    const room = Math.min(Math.max(Math.trunc(Number(input?.room)) || 0, 0), LIMITS.imagesPerProduct);
    if (!room) throw new Error(`Máximo ${LIMITS.imagesPerProduct} fotos por producto.`);
    const images = await copyBrPhotos(env, data.session.tienda, model.images ?? [], room);
    if (!images.length) throw new Error("Ese modelo no tiene fotos para copiar.");
    return json({ ok: true, images, name: model.name });
  } catch (error) {
    return fail(error.message);
  }
}
