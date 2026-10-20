// POST /api/panel/clave  { actual, nueva }  ->  el cliente cambia su clave (pide la actual).
// Cierra las sesiones de los otros celulares y deja abierta la de este (cookie nueva).
import { changePassword, createSession, fail, json, keyVersion } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  try {
    const user = await changePassword(env, data.session.usuario, input?.actual, input?.nueva);
    return json({ ok: true }, 200, { "Set-Cookie": await createSession(env, { ...data.session, v: keyVersion(user) }) });
  } catch (error) {
    return fail(error.message);
  }
}
