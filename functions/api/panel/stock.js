// POST /api/panel/stock  { id, size, delta, nuevo }  ->  suma o resta unidades de un talle (vendí uno, me llegaron 3...)
// Con nuevo: true agrega ese talle si el producto no lo tenía (desde "Stock" en la lista, sin entrar a editar).
import { addSize, fail, json, updateCatalog } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  const delta = Number(input?.delta);
  if (!Number.isInteger(delta) || Math.abs(delta) > 9999) return fail("Cantidad inválida.");
  try {
    const result = await updateCatalog(env, data.session.tienda, (catalog) => {
      const product = catalog.products.find((p) => p.id === input?.id);
      if (!product) throw new Error("Ese producto ya no existe.");
      if (input?.nuevo === true) {
        const size = addSize(product, input?.size, Math.max(delta, 0));
        return { stock: size.stock, size: size.size, sizes: product.sizes };
      }
      const size = product.sizes.find((s) => s.size === input?.size);
      if (!size) throw new Error("Ese talle ya no existe.");
      size.stock = Math.min(Math.max(size.stock + delta, 0), 99999);
      return { stock: size.stock };
    });
    return json({ ok: true, ...result });
  } catch (error) {
    return fail(error.message);
  }
}
