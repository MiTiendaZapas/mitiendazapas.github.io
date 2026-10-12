// POST /api/panel/ingresar  { usuario, clave }  ->  deja la sesión guardada (cookie)
import { checkLogin, createSession, fail, json } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return fail("Datos inválidos."); }
  const result = await checkLogin(env, body?.usuario, body?.clave);
  if (result.error) return fail(result.error, result.status ?? 401);
  return json({ ok: true, tienda: result.tienda }, 200, { "Set-Cookie": await createSession(env, result) });
}
