// GET  /api/panel/productos        ->  catálogo completo de la tienda (incluso lo sin stock)
// POST /api/panel/productos  {...} ->  crea un producto (sin id) o lo cambia (con id)
import { LIMITS, cleanProduct, deletePhotos, fail, json, readCatalog, updateCatalog } from "../../../servidor/panel.js";

export async function onRequestGet({ env, data }) {
  const { data: catalog } = await readCatalog(env, data.session.tienda);
  return json({ categories: catalog.categories ?? {}, products: catalog.products, limits: LIMITS });
}

export async function onRequestPost({ request, env, data }) {
  const store = data.session.tienda;
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  try {
    let removed = [];
    const product = await updateCatalog(env, store, (catalog) => {
      const index = input?.id ? catalog.products.findIndex((p) => p.id === input.id) : -1;
      if (input?.id && index < 0) throw new Error("Ese producto ya no existe.");
      if (index < 0 && catalog.products.length >= LIMITS.products) throw new Error(`Llegaste al máximo de ${LIMITS.products} productos.`);
      const current = index >= 0 ? catalog.products[index] : null;
      const saved = cleanProduct(input, current, catalog);
      if (current) {
        const kept = new Set(saved.images.map((img) => img.lg));
        removed = current.images.filter((img) => !kept.has(img.lg));
        catalog.products[index] = saved;
      } else {
        catalog.products.unshift(saved);
      }
      return saved;
    });
    await deletePhotos(env, store, removed);
    return json({ ok: true, product });
  } catch (error) {
    return fail(error.message);
  }
}
