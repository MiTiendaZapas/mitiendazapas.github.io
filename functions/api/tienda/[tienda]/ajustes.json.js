// Ajustes públicos de una tienda con stock propio: GET /api/tienda/<tienda>/ajustes.json
// (nombre, logo, WhatsApp, redes, color, venta por mayor). La tienda los usa al abrir.
import { fail, isStoreId, json, readSettings } from "../../../../servidor/panel.js";

export async function onRequestGet({ env, params }) {
  if (!isStoreId(params.tienda)) return fail("Tienda inexistente.", 404);
  return json(await readSettings(env, params.tienda), 200, { "Cache-Control": "no-cache" });
}
