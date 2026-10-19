// GET /api/panel/yo  ->  quién ingresó, a qué tienda y si todavía tiene que elegir su clave
import { json, mustChooseKey } from "../../../servidor/panel.js";

export async function onRequestGet({ env, data }) {
  return json({ ...data.session, elegirClave: await mustChooseKey(env, data.session.usuario) });
}
