// Catálogo público de una tienda con stock propio: GET /api/tienda/<tienda>/productos.json
// Siempre al día (lo que el cliente guardó en su panel se ve al recargar la tienda).
// Los productos pausados no se muestran. Si la tienda tiene stock de Brasil, va junto
// (con los cambios que hizo el cliente modelo por modelo).
import { fail, isStoreId, json, publicCatalog, publicMixedCatalog, readBrStock, readCatalog } from "../../../../servidor/panel.js";

export async function onRequestGet({ env, params }) {
  if (!isStoreId(params.tienda)) return fail("Tienda inexistente.", 404);
  const { data } = await readCatalog(env, params.tienda);
  if (!data.stockBR) return json(publicCatalog(data), 200, { "Cache-Control": "no-cache" });
  const br = await readBrStock(env, data.stockBR);
  return json(publicMixedCatalog(data, br), 200, { "Cache-Control": "no-cache" });
}
