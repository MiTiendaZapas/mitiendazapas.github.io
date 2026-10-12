// POST /api/panel/pausar  { id, hidden }  ->  pausa (no se ve en la tienda) o vuelve a mostrar un producto
import { fail, json, updateCatalog } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  try {
    const hidden = await updateCatalog(env, data.session.tienda, (catalog) => {
      const product = catalog.products.find((p) => p.id === input?.id);
      if (!product) throw new Error("Ese producto ya no existe.");
      product.hidden = input?.hidden === true;
      return product.hidden;
    });
    return json({ ok: true, hidden });
  } catch (error) {
    return fail(error.message);
  }
}
