// DELETE /api/panel/productos/<id>  ->  borra el producto y sus fotos
import { deletePhotos, fail, json, updateCatalog } from "../../../../servidor/panel.js";

export async function onRequestDelete({ env, data, params }) {
  const store = data.session.tienda;
  try {
    const removed = await updateCatalog(env, store, (catalog) => {
      const product = catalog.products.find((p) => p.id === params.id);
      if (!product) throw new Error("Ese producto ya no existe.");
      catalog.products = catalog.products.filter((p) => p.id !== params.id);
      return product;
    });
    await deletePhotos(env, store, removed.images);
    return json({ ok: true });
  } catch (error) {
    return fail(error.message);
  }
}
