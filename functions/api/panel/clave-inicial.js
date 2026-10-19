// POST /api/panel/clave-inicial  { nueva }  ->  la primera vez que entra, el cliente elige su propia clave
// (no le pide la anterior: ya ingresó con la que le pasaron). Solo funciona si le toca elegirla.
import { chooseFirstKey, fail, json } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  try {
    await chooseFirstKey(env, data.session.usuario, input?.nueva);
    return json({ ok: true });
  } catch (error) {
    return fail(error.message);
  }
}
