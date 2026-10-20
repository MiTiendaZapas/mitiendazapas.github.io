/*
 * Palabras de la tienda según lo que vende (se decide solo, mirando su catálogo):
 *   - si todo es calzado (zapatillas, ojotas, niños, G5): "pares", "Últimos pares", "Último par"
 *   - si vende otras cosas (ropa, accesorios, perfumes...): "unidades", "Últimas unidades"...
 * Así una tienda de ropa o de perfumes no habla de "pares".
 *
 * Además, un producto sin talles (cargado con "Talle único") no pide "Elegí un talle": se
 * agrega directo.
 */
const FOOTWEAR = new Set(["zapatillas", "ojotas", "ninos", "g5"]);
export const isFootwear = (product) => FOOTWEAR.has(product?.category);

const SHOES = { footwear: true, units: "pares", last: "Últimos pares" };
const GOODS = { footwear: false, units: "unidades", last: "Últimas unidades" };
let words = SHOES;

/** Se llama una vez, con el catálogo de la tienda ya cargado. */
export function setCatalogWords(products) {
  words = products.length && !products.every(isFootwear) ? GOODS : SHOES;
  return words;
}
export const storeWords = () => words;

/** "Último par" / "Quedan 2 pares" (calzado) o "Última unidad" / "Quedan 2" (lo demás). */
export function leftText(product, left) {
  if (isFootwear(product)) return left === 1 ? "Último par" : `Quedan ${left} pares`;
  return left === 1 ? "Última unidad" : `Quedan ${left}`;
}

/** "par" para calzado, "producto" para lo demás (por ejemplo, "Pedir este par"). */
export const itemWord = (product) => (isFootwear(product) ? "par" : "producto");

// "Talle único" y parecidos: el producto no tiene talles para elegir.
const SINGLE = /^(u|ú|unico|único|talle unico|talle único|tu|t\.u\.|one size|os|sin talle|-)$/i;
export const isSingleSize = (product) => product?.sizes?.length === 1 && SINGLE.test(String(product.sizes[0].size).trim());
