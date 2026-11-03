// POST /api/panel/stock-automatico  { enabled: true | false }
//   ->  el cliente prende o apaga el stock automático (los modelos del proveedor, de Brasil y G5, que
//       llegan solos) en su tienda. Al apagarlo se guardan sus cambios (precios, pares de su casa,
//       fotos) y al volver a prenderlo siguen ahí. El stock de casa de L.A IMP no lo maneja el cliente:
//       si lo tenía, se conserva tal cual al volver a prender; una tienda nueva arranca sin él.
import { fail, json, updateCatalog } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  if (typeof input?.enabled !== "boolean") return fail("Datos inválidos.");
  try {
    const enabled = await updateCatalog(env, data.session.tienda, (catalog) => {
      if (input.enabled) {
        const saved = catalog.stockBRGuardado ?? {};
        catalog.stockBR = catalog.stockBR ?? { casa: saved.casa === true, g5: saved.g5 === true };
        delete catalog.stockBRGuardado;
        catalog.br ??= {};
      } else if (catalog.stockBR) {
        catalog.stockBRGuardado = catalog.stockBR;
        delete catalog.stockBR;
      }
      return Boolean(catalog.stockBR);
    });
    return json({ ok: true, enabled });
  } catch (error) {
    return fail(error.message);
  }
}
