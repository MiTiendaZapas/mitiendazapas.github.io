// POST /api/panel/clave-inicial  { nueva }  ->  la primera vez que entra, el cliente elige su propia clave
// (no le pide la anterior: ya ingresó con la que le pasaron). Solo funciona si le toca elegirla.
// La sesión de este celular sigue abierta (cookie nueva); cualquier otra con la clave vieja se cierra.
import { chooseFirstKey, createSession, fail, json, keyVersion } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  try {
    const user = await chooseFirstKey(env, data.session.usuario, input?.nueva);
    return json({ ok: true }, 200, { "Set-Cookie": await createSession(env, { ...data.session, v: keyVersion(user) }) });
  } catch (error) {
    return fail(error.message);
  }
}
