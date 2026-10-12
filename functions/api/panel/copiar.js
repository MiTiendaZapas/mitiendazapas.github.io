// POST /api/panel/copiar  { id }  ->  copia un producto (con sus fotos), pausado y con "(copia)" en el nombre,
// para cargar rápido el mismo modelo en otro color.
import { LIMITS, copyPhotos, fail, json, updateCatalog } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  const store = data.session.tienda;
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  try {
    const copy = await updateCatalog(env, store, async (catalog) => {
      const index = catalog.products.findIndex((p) => p.id === input?.id);
      if (index < 0) throw new Error("Ese producto ya no existe.");
      if (catalog.products.length >= LIMITS.products) throw new Error(`Llegaste al máximo de ${LIMITS.products} productos.`);
      const original = catalog.products[index];
      const name = `${original.name} (copia)`.slice(0, 80);
      const taken = new Set(catalog.products.map((p) => p.slug));
      let slug = `${original.slug}-copia`;
      for (let n = 2; taken.has(slug); n++) slug = `${original.slug}-copia-${n}`;
      const product = {
        ...structuredClone(original),
        id: `m-${crypto.randomUUID()}`, slug, name, hidden: true, createdAt: new Date().toISOString(),
        images: await copyPhotos(env, store, original.images),
      };
      catalog.products.splice(index + 1, 0, product);
      return product;
    });
    return json({ ok: true, product: copy });
  } catch (error) {
    return fail(error.message);
  }
}
