// POST /api/panel/stock  { id, size, delta, nuevo }  ->  suma o resta unidades de un talle (vendí uno, me llegaron 3...)
// Con nuevo: true agrega ese talle si el producto no lo tenía (desde "Stock" en la lista, sin entrar a editar).
// Con borrar: true lo saca del producto (por ejemplo, uno cargado mal), salvo que sea el único.
import { addSize, fail, json, updateCatalog } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  const delta = input?.borrar === true ? 0 : Number(input?.delta);
  if (!Number.isInteger(delta) || Math.abs(delta) > 9999) return fail("Cantidad inválida.");
  try {
    const result = await updateCatalog(env, data.session.tienda, (catalog) => {
      const product = catalog.products.find((p) => p.id === input?.id);
      if (!product) throw new Error("Ese producto ya no existe.");
      if (input?.borrar === true) {
        if (!product.sizes.some((s) => s.size === input?.size)) throw new Error("Ese talle ya no existe.");
        if (product.sizes.length === 1) throw new Error("Es el único talle del producto: si no lo tenés más, pausalo o borralo.");
        product.sizes = product.sizes.filter((s) => s.size !== input.size);
        return { sizes: product.sizes };
      }
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
