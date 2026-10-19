// POST /api/panel/ofertas  { items: [{ id, price, compareAt }] }  ->  pone o saca ofertas a muchos
// productos de una vez (una categoría entera o los que el cliente marcó). El panel calcula los precios.
import { applyGroupOffers, fail, json, readBrStock, readCatalog, updateCatalog } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  const store = data.session.tienda;
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  try {
    const { data: current } = await readCatalog(env, store);
    const brIds = new Set(current.stockBR ? (await readBrStock(env)).products.map((p) => p.id) : []);
    for (const id of Object.keys(current.br ?? {})) brIds.add(id);
    const count = await updateCatalog(env, store, (catalog) => applyGroupOffers(catalog, brIds, input?.items));
    return json({ ok: true, count });
  } catch (error) {
    return fail(error.message);
  }
}
