// POST /api/panel/casa  { accion: "descontar"|"devolver"|"ajustar", pedido, id, talle, delta }
// La app de pedidos (en mitiendastock.com/pedidos, con la sesión del panel) descuenta o devuelve
// un par del stock de casa por un pedido, o lo ajusta a mano. Ver houseStockRequest; la misma
// lógica la usa /api/app/casa (la app desde GitHub, con token).
import { fail, houseStockRequest, json } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  try {
    return json(await houseStockRequest(env, data.session.tienda, input));
  } catch (error) {
    return fail(error.message);
  }
}
