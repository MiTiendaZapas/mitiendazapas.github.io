/*
 * Motor de precios: lee las reglas del archivo de precios de la tienda
 * (precios-*.json) y calcula precio por unidad, por mayor y totales.
 * El precio NUNCA se guarda en el carrito: siempre se calcula acá, con los
 * datos actuales, así no se puede manipular desde el navegador.
 */
import { normalize } from "./utils.js";
import { qualityOf } from "./filters.js";

/**
 * Texto para comparar nombres con las reglas: "TL1", "TL 1" y "TL-1" quedan
 * iguales ("tl 1"), porque cada proveedor escribe distinto si el número va
 * pegado o separado. Se aplica igual al nombre y a la regla.
 */
export function priceKey(text) {
  return normalize(text)
    .replace(/-/g, " ")
    .replace(/([a-z])(?=\d)|(\d)(?=[a-z])/g, "$1$2 ")
    .replace(/\s+/g, " ")
    .trim();
}

function compileList(list) {
  return {
    default: Number(list?.default) || 0,
    rules: (list?.rules ?? []).map((rule) => ({
      price: Number(rule.price) || 0,
      bulk: rule.bulk ? { min: Number(rule.bulk.min), price: Number(rule.bulk.price) } : null,
      contains: (rule.contains ?? []).map(priceKey),
      containsAll: (rule.containsAll ?? []).map(priceKey),
      startsWith: (rule.startsWith ?? []).map(priceKey),
      category: rule.category ?? [],
    })),
  };
}

// Formas cortas de escribir una marca al principio del nombre.
const BRAND_ALIASES = { "new balance": ["nb"] };

/**
 * Nombre sin la marca adelante: "Nike mind negras" -> "mind negras".
 * Así una regla "empieza con 'mind '" también sirve si el proveedor
 * le agrega la marca al nombre.
 */
function withoutBrand(key, brand) {
  const name = priceKey(brand);
  if (!name) return key;
  for (const prefix of [name, ...(BRAND_ALIASES[name] ?? [])]) {
    if (key.startsWith(`${prefix} `)) return key.slice(prefix.length + 1);
  }
  return key;
}

function matches(rule, key, shortKey, category) {
  // Regla por categoría (ej. todas las G5): no depende del nombre.
  if (rule.category.length) return rule.category.includes(category);
  if (rule.startsWith.some((text) => key.startsWith(text) || shortKey.startsWith(text))) return true;
  if (rule.contains.some((text) => key.includes(text))) return true;
  return rule.containsAll.length > 0 && rule.containsAll.every((text) => key.includes(text));
}

function findRule(list, key, shortKey = key, category = "") {
  return list.rules.find((rule) => matches(rule, key, shortKey, category)) ?? null;
}

export function createPricing(table) {
  const unitList = compileList(table.unit);
  const wholesaleList = compileList(table.wholesalePrice);
  const overrides = table.overrides ?? {};
  // "wholesale": false = la tienda no vende por mayor (no se muestra nada de precio por mayor).
  const hasWholesale = table.wholesale !== false;
  const minPairs = Number(table.wholesale?.minPairs) || 5;
  // Tiendas con stock propio (ropa y calzado del cliente): todo suma para el precio por mayor.
  const allProducts = table.wholesale?.allProducts === true;
  const countsForWholesale = (product) => allProducts || product.category !== "indumentaria";
  // Cómo se nombran las unidades en carrito y pedido: "pares" o, con ropa y calzado juntos, "productos".
  const words = allProducts ? ["producto", "productos"] : ["par", "pares"];
  const wholesaleLabel = table.wholesale?.label ?? `Llevando ${minPairs} o más pares surtidos`;
  // Tiendas con panel: un mínimo distinto por categoría ({ remeras: 10 }). Esas categorías cuentan
  // sus productos por separado; las demás suman juntas para el mínimo general.
  const byCategory = table.wholesale?.byCategory ?? {};
  const groupOf = (product) => (byCategory[product.category] ? `cat:${product.category}` : qualityOf(product));
  const minOf = (key) => (key.startsWith("cat:") ? Number(byCategory[key.slice(4)]) || minPairs : minPairs);
  // Tiendas con panel: "Cambiar precios" sube (o baja) la lista en este porcentaje (0.1 = 10%).
  // No toca los productos con precio propio (esos ya se cambiaron uno por uno).
  const percent = Number(table.percent) || 0;
  const adjust = (price) => (percent && price ? Math.max(100, Math.round((price * (1 + percent)) / 100) * 100) : price);
  const cache = new Map();

  function resolve(product) {
    if (cache.has(product.id)) return cache.get(product.id);
    const key = priceKey(product.name);
    const shortKey = withoutBrand(key, product.brand);
    const own = product.price ? { unit: product.price, wholesale: product.wholesalePrice } : {};
    const override = overrides[product.slug] ?? overrides[product.id] ?? own;
    // Producto propio del cliente: solo su precio (ninguna regla de la lista, ni "llevando 10 o más").
    const unitRule = product.manual ? null : findRule(unitList, key, shortKey, product.category);
    const unit = Number(override.unit) || adjust(unitRule?.price || unitList.default);
    // Precio por cantidad del mismo producto: el que puso el cliente en su panel, o el de la lista.
    const own_bulk = product.bulk?.min && product.bulk?.price && product.bulk.price < unit ? { min: product.bulk.min, price: product.bulk.price } : null;
    const bulk = own_bulk ?? (product.manual ? null : unitRule?.bulk ?? null);
    let wholesale = null;
    if (hasWholesale && !bulk && countsForWholesale(product)) {
      // Producto propio del cliente: solo su precio por mayor (nunca el de la lista de precios).
      wholesale = product.manual
        ? Number(product.wholesalePrice) || null
        : Number(override.wholesale) || adjust(findRule(wholesaleList, key, shortKey, product.category)?.price || wholesaleList.default);
      if (override.wholesale === false || product.noWholesale) wholesale = null;   // "sin precio por mayor" elegido a mano
      if (!wholesale || wholesale >= unit) wholesale = null;   // sin precio por mayor (0) se cobra el de unidad   // nunca mostrar un "precio por mayor" que no conviene
    }
    const result = { unit, wholesale, bulk };
    cache.set(product.id, result);
    return result;
  }

  return {
    hasWholesale,
    minPairs,
    allProducts,
    words,
    wholesaleLabel,
    /** El texto del por mayor de un producto (con su mínimo, si su categoría tiene uno propio). */
    wholesaleLabelFor(product) {
      const own = Number(byCategory[product?.category]);
      return own ? `Llevando ${own} o más de esta categoría (surtidos)` : wholesaleLabel;
    },
    forProduct: resolve,

    /** Cuenta pares (todo menos indumentaria) para saber si aplica precio por mayor. */
    countPairs(lines) {
      return lines.reduce((sum, line) => sum + (countsForWholesale(line.product) ? line.qty : 0), 0);
    },

    /**
     * lines: [{ product, size, qty }]. Devuelve cada línea con su precio y el total.
     *
     * Llevando minPairs o más pares surtidos, el cliente ELIGE (como en la
     * tienda actual): mode "mayor" (precio por mayor, sin cambio de talle) o
     * "unidad" (precio por unidad, con cambio de talle). Mientras no elija
     * (mode null) se calculan los dos totales para mostrarle ambas opciones.
     * Indumentaria: precio especial llevando bulk.min unidades del mismo producto.
     */
    quote(lines, mode = null) {
      // Calidades (BR y G5): cada una cuenta SUS pares para el precio por mayor,
      // porque son de proveedores y precios distintos. Sin G5 hay un solo grupo
      // y todo funciona como siempre.
      // Con mínimos por categoría, esas categorías también son grupos aparte.
      const groupKeys = [...new Set(lines.map((line) => groupOf(line.product)))].sort();
      const groupPairs = new Map(groupKeys.map((key) => [key, this.countPairs(lines.filter((l) => groupOf(l.product) === key))]));
      const qualifies = (key) => hasWholesale && groupPairs.get(key) >= minOf(key);
      const pairs = this.countPairs(lines);
      const canChoose = groupKeys.some(qualifies);
      const qtyByProduct = new Map();
      for (const line of lines) qtyByProduct.set(line.product.id, (qtyByProduct.get(line.product.id) ?? 0) + line.qty);

      const priceLines = (useWholesale) => lines.map((line) => {
        const prices = resolve(line.product);
        let price = prices.unit;
        if (prices.bulk && qtyByProduct.get(line.product.id) >= prices.bulk.min) price = prices.bulk.price;
        else if (useWholesale && prices.wholesale && qualifies(groupOf(line.product))) price = prices.wholesale;
        return { ...line, price, subtotal: price * line.qty, unitPrice: prices.unit };
      });
      const sum = (priced) => priced.reduce((acc, line) => acc + line.subtotal, 0);

      const unitLines = priceLines(false);
      const wholesaleLines = canChoose ? priceLines(true) : unitLines;
      const isWholesale = canChoose && mode === "mayor";
      const priced = isWholesale ? wholesaleLines : unitLines;
      const groups = groupKeys.map((key) => {
        const groupLines = priced.filter((line) => groupOf(line.product) === key);
        return {
          key,
          lines: groupLines,
          pairs: groupPairs.get(key),
          canChoose: qualifies(key),
          pairsToWholesale: Math.max(minOf(key) - groupPairs.get(key), 0),
          min: minOf(key),
          subtotal: sum(groupLines),
        };
      });

      return {
        lines: priced,
        groups,
        // true si hay G5 en el pedido: el carrito y el mensaje se muestran separados por calidad.
        byQuality: groupKeys.includes("g5"),
        byCategory: groupKeys.some((key) => key.startsWith("cat:")),
        pairs,
        minPairs,
        words,
        allProducts,
        canChoose,
        mode: canChoose ? mode : "unidad",
        isWholesale,
        pairsToWholesale: Math.min(...groupKeys.map((key) => Math.max(minOf(key) - groupPairs.get(key), 0)), Math.max(minPairs, 0)),
        total: sum(priced),
        totals: { unidad: sum(unitLines), mayor: sum(wholesaleLines) },
      };
    },
  };
}
