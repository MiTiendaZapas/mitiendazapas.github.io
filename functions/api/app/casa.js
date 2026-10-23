// POST /api/app/casa  con "Authorization: Bearer <token>"  { accion, pedido, id, talle, delta }
// El stock de casa desde la app de pedidos en GitHub: lo mismo que /api/panel/casa (misma
// respuesta), pero con el token de /api/app/ingresar en vez de la cookie del panel.
// El token tiene que estar bien firmado y vigente, el usuario tiene que seguir existiendo, ser de
// esa tienda y tener la misma clave (cambiarla o "cerrar sesiones en todos" lo anula).
import { fail, houseStockRequest, json, keyVersion, readAppToken, readUser } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env }) {
  const token = await readAppToken(env, request);
  const user = token && await readUser(env, token.usuario);
  if (!user || user.tienda !== token.tienda || keyVersion(user) !== token.v) return fail("Tenés que ingresar de nuevo.", 401);
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  try {
    return json(await houseStockRequest(env, token.tienda, input));
  } catch (error) {
    return fail(error.message);
  }
}
