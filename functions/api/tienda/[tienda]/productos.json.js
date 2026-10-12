// Catálogo público de una tienda con stock propio: GET /api/tienda/<tienda>/productos.json
// Siempre al día (lo que el cliente guardó en su panel se ve al recargar la tienda).
import { fail, isStoreId, json, readCatalog } from "../../../../servidor/panel.js";

export async function onRequestGet({ env, params }) {
  if (!isStoreId(params.tienda)) return fail("Tienda inexistente.", 404);
  const { data } = await readCatalog(env, params.tienda);
  return json(data, 200, { "Cache-Control": "no-cache" });
}
