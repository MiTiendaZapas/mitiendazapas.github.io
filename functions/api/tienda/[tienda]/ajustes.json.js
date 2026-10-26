// Ajustes públicos de una tienda con stock propio: GET /api/tienda/<tienda>/ajustes.json
// (nombre, logo, WhatsApp, redes, color, venta por mayor). La tienda los usa al abrir.
import { fail, isStoreId, json, readSettings } from "../../../../servidor/panel.js";

// Es público (la tienda los baja en cada visita): la app de pedidos en GitHub también los lee
// para mostrar los mismos precios que la tienda ("Cambiar precios" del panel vive acá).
const OPEN = { "Access-Control-Allow-Origin": "*" };

export async function onRequestGet({ env, params }) {
  if (!isStoreId(params.tienda)) return fail("Tienda inexistente.", 404);
  return json(await readSettings(env, params.tienda), 200, { "Cache-Control": "no-cache", ...OPEN });
}
