// POST /api/panel/foto-catalogo  { id, room }  ->  { images: [{ lg, sm, w, h }], name }
//   Copia a la tienda las fotos de un modelo del stock automático (Brasil o G5), para usarlas en
//   un producto propio (por ejemplo, un par en liquidación) sin tener que sacarle fotos de nuevo.
//   Lo puede usar cualquier tienda que tenga el stock automático prendido.
import { LIMITS, copyBrPhotos, fail, json, readBrStock, readCatalog } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  try {
    const { data: catalog } = await readCatalog(env, data.session.tienda);
    if (!catalog.stockBR) throw new Error("Tu tienda no tiene el stock automático prendido.");
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
