// POST /api/panel/precios  { percent: 10, own: true, br: true }  ->  sube (o baja, con negativo) los
// precios de golpe: los de sus productos y, si tiene stock de Brasil, los de esos modelos.
// En porcentaje se redondean a los $100 más cercanos. Con { amount: 1000 } en vez de percent, todos
// suben (o bajan, con negativo) ese monto fijo (por ejemplo, cuando el proveedor sube $1.000 todo).
import { changePrices, fail, json, readSettings, saveSettings, updateCatalog } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  const store = data.session.tienda;
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  const byAmount = input?.amount !== undefined;
  const amount = Number(input?.amount);
  const percent = Number(input?.percent);
  if (byAmount) {
    if (!Number.isInteger(amount) || amount === 0 || amount % 100 !== 0 || Math.abs(amount) > 100000) {
      return fail("Poné un monto en pesos, de a $100 (por ejemplo 1000).");
    }
  } else if (!Number.isFinite(percent) || percent === 0 || percent < -50 || percent > 100) {
    return fail("Poné un porcentaje entre -50 y 100 (por ejemplo 10).");
  }
  const own = input?.own === true;
  const br = input?.br === true;
  if (!own && !br) return fail("Elegí a qué productos cambiarles el precio.");
  try {
    const settings = await readSettings(env, store);
    await updateCatalog(env, store, (catalog) => {
      if (br && !catalog.stockBR) throw new Error("Tu tienda no tiene stock de Brasil.");
      changePrices(catalog, settings, { ...(byAmount ? { amount } : { percent: percent / 100 }), own, br: br && Boolean(catalog.stockBR) });
    });
    if (br) await saveSettings(env, store, settings);
    return json({ ok: true, brPercent: settings.brPercent ?? 0, brAmount: settings.brAmount ?? 0 });
  } catch (error) {
    return fail(error.message);
  }
}
