/*
 * Carga del catálogo compartido (productos.json, generado por sincronizador/).
 * Valida lo que llega: si un producto viene incompleto se descarta en vez
 * de romper toda la tienda.
 */
const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

/**
 * Orden del catálogo:
 *   "marca-modelo"  -> por marca (A-Z) y dentro de cada marca por modelo (A-Z).
 *                      "numeric" hace que "Jordan 4" quede antes que "Jordan 11".
 *   "mas-vendidos"  -> el orden en que los publica el proveedor.
 */
function sortProducts(products, order) {
  if (order === "mas-vendidos") return products;
  return products.sort((a, b) =>
    (a.brand ? 0 : 1) - (b.brand ? 0 : 1)          // modelos sin marca, al final
    || collator.compare(a.brand ?? "", b.brand ?? "")
    || collator.compare(a.name, b.name));
}

/**
 * includeHouseStock: false para tiendas de clientes que venden solo lo del
 * proveedor. Se descuenta el stock de casa de cada talle y desaparecen los
 * modelos que eran solo de casa.
 */
export async function loadCatalog(base, { order = "marca-modelo", includeHouseStock = true } = {}) {
  // "no-cache": el navegador pregunta si hay versión nueva (stock actualizado),
  // pero si no cambió no vuelve a descargar el archivo.
  const response = await fetch(`${base}productos.json`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`No se pudo cargar el catálogo (HTTP ${response.status})`);
  const data = await response.json();
  if (!Array.isArray(data?.products)) throw new Error("El catálogo tiene un formato inesperado");

  const products = data.products
    .filter((p) => p && typeof p.id === "string" && typeof p.name === "string" && Array.isArray(p.sizes))
    .map((p) => {
      const sizes = p.sizes
        .filter((s) => s && String(s.size ?? "").trim() !== "")
        .map((s) => {
          const house = includeHouseStock ? 0 : Number(s.casa) || 0;
          return { size: String(s.size), stock: Math.max(0, (Number(s.stock) || 0) - house) };
        });
      return {
        id: p.id,
        slug: String(p.slug || p.id),
        name: p.name.trim(),
        brand: p.brand || null,
        category: p.category || "zapatillas",
        sizes,
        available: sizes.filter((s) => s.stock > 0),
        images: (Array.isArray(p.images) ? p.images : []).map((img) => ({
          sm: img.sm ? base + img.sm : null,
          lg: base + img.lg,
          w: img.w,
          h: img.h,
        })),
      };
    })
    .filter((p) => p.available.length > 0);
  sortProducts(products, order);

  const byId = new Map(products.map((p) => [p.id, p]));
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  return {
    products,
    updatedAt: data.generatedAt ? new Date(data.generatedAt) : null,
    get: (id) => byId.get(id),
    getBySlug: (slug) => bySlug.get(slug),
    stockOf(productId, size) {
      return byId.get(productId)?.sizes.find((s) => s.size === size)?.stock ?? 0;
    },
  };
}

export async function loadJson(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`No se pudo cargar ${url} (HTTP ${response.status})`);
  return response.json();
}
