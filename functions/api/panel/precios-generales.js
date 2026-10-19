// POST /api/panel/precios-generales  { br: { unit, wholesale, mayorista? }, g5: {...}, mode: "auto" | "manual" }
//   ->  precio para todos los modelos de Brasil y para todas las G5, y qué pasa con los modelos
//       nuevos (aparecen solos con ese precio, o esperan a que el cliente les ponga precio).
import { cleanGeneralPricing, fail, json, pricingOf, readBrStock, updateCatalog } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  try {
    const br = await readBrStock(env);
    const pricing = await updateCatalog(env, data.session.tienda, (catalog) => {
      if (!catalog.stockBR) throw new Error("Tu tienda no tiene stock de Brasil.");
      const next = cleanGeneralPricing(input);
      // Al pasar a "esperar precio", los modelos que ya están siguen viéndose: solo esperan los que entren después.
      if (next.mode === "manual" && pricingOf(catalog).mode !== "manual") catalog.known = br.products.map((p) => p.id);
      catalog.pricing = next;
      return next;
    });
    return json({ ok: true, pricing });
  } catch (error) {
    return fail(error.message);
  }
}
