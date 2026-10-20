/*
 * Precio de cada producto según las listas de una tienda (las mismas reglas que usa la tienda).
 * Lo usa importar_stock_casa_panel.py para que los modelos de casa sin precio en la app pasen al
 * panel con el precio que tienen hoy.
 *
 * Uso: node herramientas/precios_de_lista.mjs <lista.json> < productos.json  ->  [{ id, unit, wholesale }]
 */
import { readFileSync } from "node:fs";
import { createPricing } from "../motor/js/pricing.js";

const pricing = createPricing(JSON.parse(readFileSync(process.argv[2], "utf8")));
const products = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(products.map((p) => {
  const { unit, wholesale } = pricing.forProduct(p);
  return { id: p.id, unit: unit ?? null, wholesale: wholesale ?? null };
})));
