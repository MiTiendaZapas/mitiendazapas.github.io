// POST /api/panel/cerrar-sesiones  ->  cierra la sesión en TODOS los celulares y computadoras
// (por si perdió el celular o alguien más sabía la clave). En este también: tiene que ingresar de nuevo.
import { clearSession, closeAllSessions, fail, json } from "../../../servidor/panel.js";

export async function onRequestPost({ env, data }) {
  try {
    await closeAllSessions(env, data.session.usuario);
    return json({ ok: true }, 200, { "Set-Cookie": clearSession() });
  } catch (error) {
    return fail(error.message);
  }
}
