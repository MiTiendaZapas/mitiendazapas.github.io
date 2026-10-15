/*
 * Orden de los productos en las tiendas con stock propio (la tienda y el panel usan lo mismo).
 *
 * Por defecto: categorías de la A a la Z y, dentro de cada una, productos de la A a la Z.
 * El cliente lo cambia en su panel (Categorías → Orden de tu tienda):
 *   categoryOrder  "alfabetico" | "manual"  (el orden que armó en la lista de categorías)
 *   productOrder   "alfabetico" (A-Z) | "alfabetico-desc" (Z-A) | "marca" (marca y modelo) |
 *                  "precio" (menor a mayor) | "precio-desc" (mayor a menor) | "nuevos" | "manual" (el que armó él)
 * Los modelos del stock de Brasil no tienen fecha de carga ni orden propio: en "nuevos" y
 * "manual" quedan por marca y modelo.
 */
const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

export const CATEGORY_ORDERS = [
  { value: "alfabetico", label: "De la A a la Z" },
  { value: "manual", label: "En el orden que yo elijo" },
];
export const PRODUCT_ORDERS = [
  { value: "alfabetico", label: "De la A a la Z" },
  { value: "alfabetico-desc", label: "De la Z a la A" },
  { value: "marca", label: "Por marca y modelo" },
  { value: "precio", label: "Del más barato al más caro" },
  { value: "precio-desc", label: "Del más caro al más barato" },
  { value: "nuevos", label: "Lo último que cargo, primero" },
  { value: "manual", label: "En el orden que yo elijo" },
];

/** Códigos de las categorías en el orden en que salen en la tienda. */
export function orderedCategories(categories = {}, settings = {}) {
  const entries = Object.entries(categories);
  if (settings.categoryOrder !== "manual") entries.sort((a, b) => collator.compare(a[1], b[1]));
  return entries.map(([id]) => id);
}

const byBrand = (a, b) => (a.brand ? 0 : 1) - (b.brand ? 0 : 1) || collator.compare(a.brand ?? "", b.brand ?? "");
const WITHIN = {
  alfabetico: (a, b) => collator.compare(a.name, b.name),
  "alfabetico-desc": (a, b) => collator.compare(b.name, a.name),
  marca: (a, b) => byBrand(a, b) || collator.compare(a.name, b.name),
  precio: (a, b, price) => price(a) - price(b) || collator.compare(a.name, b.name),
  "precio-desc": (a, b, price) => price(b) - price(a) || collator.compare(a.name, b.name),
  nuevos: (a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")),
  manual: () => 0,
};

/**
 * Productos agrupados por categoría (en su orden) y ordenados dentro de cada una.
 * priceOf: el precio de cada producto (en las tiendas con stock de Brasil sale de la lista).
 */
export function sortProducts(products, categories = {}, settings = {}, priceOf = (p) => Number(p.price) || 0) {
  const rank = new Map(orderedCategories(categories, settings).map((id, i) => [id, i]));
  const order = WITHIN[settings.productOrder] ?? WITHIN.alfabetico;
  const within = (a, b) => order(a, b, priceOf);
  const position = new Map(products.map((p, i) => [p.id, i]));   // desempate: el orden de la lista
  return [...products].sort((a, b) =>
    (rank.get(a.category) ?? Infinity) - (rank.get(b.category) ?? Infinity)
    || within(a, b)
    || position.get(a.id) - position.get(b.id));
}
