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
export async function loadCatalog(base, { order = "marca-modelo", includeHouseStock = true, showG5 = false } = {}) {
  // "no-cache": el navegador pregunta si hay versión nueva (stock actualizado),
  // pero si no cambió no vuelve a descargar el archivo.
  // GitHub deja guardar estos archivos 10 minutos (en el navegador y en sus servidores).
  // Con "?t=" cambiando cada minuto, siempre llega el stock que publicó el piloto.
  const fresh = `?t=${Math.floor(Date.now() / 60000)}`;
  const response = await fetch(`${base}productos.json${fresh}`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`No se pudo cargar el catálogo (HTTP ${response.status})`);
  const data = await response.json();
  if (!Array.isArray(data?.products)) throw new Error("El catálogo tiene un formato inesperado");
  // Las G5 vienen en su propio archivo; solo las tiendas con showG5 lo suman.
  // Si falta o falla, la tienda sigue con lo demás.
  if (showG5) {
    try {
      const extra = await fetch(`${base}productos-g5.json${fresh}`, { cache: "no-cache" });
      if (extra.ok) data.products = data.products.concat((await extra.json()).products ?? []);
    } catch { /* sin G5 por ahora */ }
  }

  const products = data.products
    .filter((p) => p && typeof p.id === "string" && typeof p.name === "string" && Array.isArray(p.sizes))
    // Zapatillas calidad G5 (otro proveedor): solo en las tiendas que las activan (showG5: true).
    .filter((p) => showG5 || p.category !== "g5")
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
