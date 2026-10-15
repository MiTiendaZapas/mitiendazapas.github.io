/*
 * Orden de los talles, igual en el panel, en la tienda y en el servidor:
 *   números de menor a mayor (35, 36... también "37/38" y "40.5"),
 *   después letras de ropa en su orden real (XXS, XS, S, M, L, XL, XXL, XXXL),
 *   y al final cualquier otro (por ejemplo "Único"), de la A a la Z.
 */
const LETTERS = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL"];
const ALIASES = { "2XS": "XXS", "3XS": "XXXS", "2XL": "XXL", "3XL": "XXXL", "4XL": "XXXXL" };
const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

function sizeKey(size) {
  const text = String(size ?? "").trim().toUpperCase();
  // Primero las letras: "2XL" empieza con un número pero es ropa.
  const letter = LETTERS.indexOf(ALIASES[text] ?? text);
  if (letter >= 0) return [1, letter, text];
  const number = text.match(/^\d+([.,]\d+)?/);
  if (number) return [0, Number(number[0].replace(",", ".")), text];
  return [2, 0, text];
}

/** Compara dos talles (textos). */
export function compareSizes(a, b) {
  const [ga, na, ta] = sizeKey(a);
  const [gb, nb, tb] = sizeKey(b);
  return ga - gb || na - nb || collator.compare(ta, tb);
}

/** Ordena una lista de talles ({ size, ... } o textos) sin cambiar la original. */
export function sortSizes(list) {
  return [...list].sort((a, b) => compareSizes(a?.size ?? a, b?.size ?? b));
}
