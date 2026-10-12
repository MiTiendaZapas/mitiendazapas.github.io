/*
 * Orden de los productos en las tiendas con stock propio (la tienda y el panel usan lo mismo).
 *
 * Por defecto: categorías de la A a la Z y, dentro de cada una, productos de la A a la Z.
 * El cliente lo cambia en su panel (Categorías → Orden de tu tienda):
 *   categoryOrder  "alfabetico" | "manual"  (el orden que armó en la lista de categorías)
 *   productOrder   "alfabetico" | "nuevos" | "precio" (menor a mayor) | "manual" (el que armó él)
 */
const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

export const CATEGORY_ORDERS = [
  { value: "alfabetico", label: "De la A a la Z" },
  { value: "manual", label: "En el orden que yo elijo" },
];
export const PRODUCT_ORDERS = [
  { value: "alfabetico", label: "De la A a la Z" },
  { value: "nuevos", label: "Lo último que cargo, primero" },
  { value: "precio", label: "Del más barato al más caro" },
  { value: "manual", label: "En el orden que yo elijo" },
];

/** Códigos de las categorías en el orden en que salen en la tienda. */
export function orderedCategories(categories = {}, settings = {}) {
  const entries = Object.entries(categories);
  if (settings.categoryOrder !== "manual") entries.sort((a, b) => collator.compare(a[1], b[1]));
  return entries.map(([id]) => id);
}

const WITHIN = {
  alfabetico: (a, b) => collator.compare(a.name, b.name),
  nuevos: (a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")),
  precio: (a, b) => (Number(a.price) || 0) - (Number(b.price) || 0) || collator.compare(a.name, b.name),
  manual: () => 0,
};

/** Productos agrupados por categoría (en su orden) y ordenados dentro de cada una. */
export function sortProducts(products, categories = {}, settings = {}) {
  const rank = new Map(orderedCategories(categories, settings).map((id, i) => [id, i]));
  const within = WITHIN[settings.productOrder] ?? WITHIN.alfabetico;
  const position = new Map(products.map((p, i) => [p.id, i]));   // desempate: el orden de la lista
  return [...products].sort((a, b) =>
    (rank.get(a.category) ?? Infinity) - (rank.get(b.category) ?? Infinity)
    || within(a, b)
    || position.get(a.id) - position.get(b.id));
}
