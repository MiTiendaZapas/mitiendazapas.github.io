// POST /api/panel/stock  { id, size, delta }  ->  suma o resta unidades de un talle (vendí uno, me llegaron 3...)
import { fail, json, updateCatalog } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  const delta = Number(input?.delta);
  if (!Number.isInteger(delta) || Math.abs(delta) > 9999) return fail("Cantidad inválida.");
  try {
    const stock = await updateCatalog(env, data.session.tienda, (catalog) => {
      const size = catalog.products.find((p) => p.id === input?.id)?.sizes.find((s) => s.size === input?.size);
      if (!size) throw new Error("Ese talle ya no existe.");
      size.stock = Math.min(Math.max(size.stock + delta, 0), 99999);
      return size.stock;
    });
    return json({ ok: true, stock });
  } catch (error) {
    return fail(error.message);
  }
}
