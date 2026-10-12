// POST /api/panel/categorias  { categories: [{ id?, label }] }  ->  crea, renombra, ordena o borra categorías
// (no deja borrar una que todavía usa algún producto)
import { cleanCategories, fail, json, updateCatalog } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  try {
    const categories = await updateCatalog(env, data.session.tienda, (catalog) => {
      catalog.categories = cleanCategories(input?.categories, catalog);
      return catalog.categories;
    });
    return json({ ok: true, categories });
  } catch (error) {
    return fail(error.message);
  }
}
