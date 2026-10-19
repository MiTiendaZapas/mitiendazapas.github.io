// POST /api/panel/br  { id, price?, wholesalePrice?, hidden?, extra?: [{ size, stock }] }
//   ->  guarda lo que el cliente cambió en un modelo de Brasil: su precio, ocultarlo, o los
//       pares que tiene en su casa. Sin nada de eso, el modelo vuelve a ser automático.
import { brModel, cleanBrChange, fail, json, readBrStock, readCatalog, updateCatalog } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  const store = data.session.tienda;
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  if (typeof input?.id !== "string") return fail("Datos inválidos.");
  try {
    const { data: current } = await readCatalog(env, store);
    if (!current.stockBR) return fail("Tu tienda no tiene stock de Brasil.");
    const br = await readBrStock(env, current.stockBR);
    const found = br.products.find((p) => p.id === input.id);
    const saved = current.br?.[input.id];
    if (!found && !saved?.model) return fail("Ese modelo ya no está en el stock de Brasil.");
    const change = await updateCatalog(env, store, (catalog) => {
      const base = found ? brModel(found, catalog.stockBR) : { ...catalog.br?.[input.id]?.model, id: input.id, sizes: [] };
      const cleaned = cleanBrChange(input, base);
      catalog.br = { ...(catalog.br ?? {}) };
      if (cleaned) catalog.br[input.id] = cleaned;
      else delete catalog.br[input.id];
      // Modelo nuevo: con precio propio, o si el cliente lo aprueba con el precio general, ya se ve.
      if ((input.approve === true || cleaned?.price) && !(catalog.known ?? []).includes(input.id)) {
        catalog.known = [...(catalog.known ?? []), input.id];
      }
      return cleaned;
    });
    return json({ ok: true, change });
  } catch (error) {
    return fail(error.message);
  }
}
