// GET /api/panel/yo  ->  quién ingresó (y si tiene que elegir su clave)
import { json, mustChooseKey } from "../../../servidor/panel.js";

export const onRequestGet = ({ data }) => json({ ...data.session, elegirClave: mustChooseKey(data.user) });
