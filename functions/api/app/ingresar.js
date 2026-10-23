// POST /api/app/ingresar  { usuario, clave }  ->  { ok, token, expira, tienda }
// Ingreso de la app de pedidos desde GitHub: el mismo control de usuario y clave que el panel
// (con su bloqueo por intentos), pero el token va en la respuesta, no en una cookie.
// Ese token solo sirve para /api/app/casa (ver servidor/panel.js, createAppToken).
import { checkLogin, createAppToken, fail, json } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return fail("Datos inválidos."); }
  const result = await checkLogin(env, body?.usuario, body?.clave);
  if (result.error) return fail(result.error, result.status ?? 401);
  const { token, expira } = await createAppToken(env, result);
  return json({ ok: true, token, expira, tienda: result.tienda });
}
