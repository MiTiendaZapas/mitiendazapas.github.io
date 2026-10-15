// POST /api/panel/ingresar  { usuario, clave }  ->  deja la sesión guardada (cookie)
// De paso (sin demorar el ingreso) borra las fotos que se subieron y nunca se guardaron.
import { checkLogin, cleanupPhotos, createSession, fail, json, readCatalog } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, waitUntil }) {
  let body;
  try { body = await request.json(); } catch { return fail("Datos inválidos."); }
  const result = await checkLogin(env, body?.usuario, body?.clave);
  if (result.error) return fail(result.error, result.status ?? 401);
  waitUntil((async () => {
    try {
      const { data } = await readCatalog(env, result.tienda);
      await cleanupPhotos(env, result.tienda, data);
    } catch { /* se intenta de nuevo en el próximo ingreso */ }
  })());
  return json({ ok: true, tienda: result.tienda }, 200, { "Set-Cookie": await createSession(env, result) });
}
