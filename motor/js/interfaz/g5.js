/*
 * Datos fijos de las zapatillas calidad G5 (tienda de Beto): sus talles son
 * EUROPEOS. La tabla sale de la guía de talles de su tienda
 * (catalogo-app-beto.vercel.app), solo con europeo, argentino y centímetros.
 */
export const G5_SIZE_CHART = {
  title: "Tabla de talles G5 (europeos)",
  hint: "Los talles de las G5 son europeos. Buscá tu talle argentino o el largo de tu pie.",
  columns: ["Europeo", "Argentino", "Largo del pie"],
  rows: [
    ["36", "35", "22,5 cm"],
    ["37,5", "36", "23,5 cm"],
    ["38", "37", "24 cm"],
    ["39", "38", "25 cm"],
    ["40", "39", "25 cm"],
    ["41", "40", "26 cm"],
    ["42", "41", "26,5 cm"],
    ["43", "42", "27,5 cm"],
    ["44", "43", "28 cm"],
    ["45", "44", "29 cm"],
  ],
};

/** "40 EU" para las G5 (talle europeo); el resto queda igual. */
export function sizeLabel(product, size) {
  return product?.category === "g5" ? `${size} EU` : String(size);
}
