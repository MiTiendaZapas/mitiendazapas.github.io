// POST /api/panel/orden  { ids: [...] }  ->  orden de los productos en la tienda (el primero sale primero)
import { fail, json, updateCatalog } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  const ids = input?.ids;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) return fail("Orden inválido.");
  try {
    await updateCatalog(env, data.session.tienda, (catalog) => {
      const byId = new Map(catalog.products.map((p) => [p.id, p]));
      if (ids.length !== byId.size || new Set(ids).size !== ids.length || !ids.every((id) => byId.has(id))) {
        throw new Error("La lista cambió mientras ordenabas. Volvé a cargar el panel.");
      }
      catalog.products = ids.map((id) => byId.get(id));
    });
    return json({ ok: true });
  } catch (error) {
    return fail(error.message);
  }
}
