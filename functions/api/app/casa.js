// POST /api/app/casa  { accion, pedido, id, talle, delta }  (con o sin "Authorization: Bearer <token>")
// El stock de casa desde la app de pedidos en GitHub: lo mismo que /api/panel/casa (misma respuesta).
//
// Sin token (pedido del usuario, 24/10: que la app de GitHub no pida usuario y clave): solo el stock
// de casa de L.A IMP, y "ajustar" de a un par por vez (+1 o −1, lo que mandan los botones de la app).
// Solo pasa el control de origen (_middleware.js: mitiendazapas.github.io), que NO frena a quien arme
// el pedido a mano: el usuario lo sabe y lo aceptó. Nunca se tocan precios ni productos desde acá.
//
// Con un token válido (de /api/app/ingresar) se usa su tienda, sin el límite de a un par. Un token
// vencido, alterado o de antes de cambiar la clave no da ningún permiso extra: cuenta como sin token.
import { fail, houseStockRequest, json, keyVersion, readAppToken, readUser } from "../../../servidor/panel.js";

const STORE_WITHOUT_TOKEN = "laimp";

export async function onRequestPost({ request, env }) {
  const token = await readAppToken(env, request);
  const user = token && await readUser(env, token.usuario);
  const signedIn = Boolean(user && user.tienda === token.tienda && keyVersion(user) === token.v);
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  if (!signedIn && input?.accion === "ajustar" && Math.abs(Number(input?.delta)) !== 1) {
    return fail("Desde la app se suma o se resta de a un par por vez.");
  }
  try {
    return json(await houseStockRequest(env, signedIn ? token.tienda : STORE_WITHOUT_TOKEN, input));
  } catch (error) {
    return fail(error.message);
  }
}
