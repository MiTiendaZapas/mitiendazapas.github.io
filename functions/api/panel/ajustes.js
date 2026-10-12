// GET  /api/panel/ajustes       ->  ajustes de la tienda (nombre, logo, WhatsApp, redes, color, por mayor)
// POST /api/panel/ajustes {...} ->  los guarda (el logo se sube aparte, en /api/panel/logo)
import { cleanSettings, fail, json, readSettings, saveSettings } from "../../../servidor/panel.js";

export async function onRequestGet({ env, data }) {
  return json(await readSettings(env, data.session.tienda));
}

export async function onRequestPost({ request, env, data }) {
  const store = data.session.tienda;
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  try {
    const current = await readSettings(env, store);
    // El logo no se cambia desde acá: se conserva el que ya estaba.
    // Lo que no se manda se conserva (por ejemplo, el orden elegido en Categorías).
    const settings = cleanSettings({ ...current, ...input, logo: current.logo ?? null }, current);
    await saveSettings(env, store, settings);
    return json({ ok: true, settings });
  } catch (error) {
    return fail(error.message);
  }
}
