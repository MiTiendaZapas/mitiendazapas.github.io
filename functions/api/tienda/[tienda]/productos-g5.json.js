// Las tiendas con stock de Brasil ya reciben las G5 (si las tienen) dentro de productos.json.
// Esta dirección existe para que la tienda no muestre un error al pedirlas aparte.
import { json } from "../../../../servidor/panel.js";

export const onRequestGet = () => json({ products: [] }, 200, { "Cache-Control": "no-cache" });
