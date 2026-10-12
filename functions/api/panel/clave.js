// POST /api/panel/clave  { actual, nueva }  ->  el cliente cambia su clave (pide la actual)
import { changePassword, fail, json } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  try {
    await changePassword(env, data.session.usuario, input?.actual, input?.nueva);
    return json({ ok: true });
  } catch (error) {
    return fail(error.message);
  }
}
