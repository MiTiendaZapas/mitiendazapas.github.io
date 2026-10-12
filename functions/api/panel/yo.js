// GET /api/panel/yo  ->  quién ingresó y a qué tienda
import { json } from "../../../servidor/panel.js";

export const onRequestGet = ({ data }) => json(data.session);
