// POST /api/panel/casa  { accion: "descontar"|"devolver", pedido, id, talle }
// La app de pedidos descuenta (o devuelve) un par del stock de casa por un pedido. Ver moveHouseStock.
import { fail, json, moveHouseStock, updateCatalog } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  try {
    return json(await updateCatalog(env, data.session.tienda, (catalog) => moveHouseStock(catalog, input)));
  } catch (error) {
    return fail(error.message);
  }
}
