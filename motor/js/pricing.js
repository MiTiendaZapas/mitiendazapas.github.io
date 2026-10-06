/*
 * Motor de precios: lee las reglas del archivo de precios de la tienda
 * (precios-*.json) y calcula precio por unidad, por mayor y totales.
 * El precio NUNCA se guarda en el carrito: siempre se calcula acá, con los
 * datos actuales, así no se puede manipular desde el navegador.
 */
import { normalize } from "./utils.js";
import { qualityOf } from "./filters.js";

function compileList(list) {
  return {
    default: Number(list?.default) || 0,
    rules: (list?.rules ?? []).map((rule) => ({
      price: Number(rule.price) || 0,
      bulk: rule.bulk ? { min: Number(rule.bulk.min), price: Number(rule.bulk.price) } : null,
      contains: (rule.contains ?? []).map(normalize),
      containsAll: (rule.containsAll ?? []).map(normalize),
      startsWith: (rule.startsWith ?? []).map(normalize),
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
  const name = normalize(brand);
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
  const wholesaleLabel = table.wholesale?.label ?? `Llevando ${minPairs} o más pares surtidos`;
  const cache = new Map();

  function resolve(product) {
    if (cache.has(product.id)) return cache.get(product.id);
    const key = normalize(product.name);
    const shortKey = withoutBrand(key, product.brand);
    const override = overrides[product.slug] ?? overrides[product.id] ?? {};
    const unitRule = findRule(unitList, key, shortKey, product.category);
    const unit = Number(override.unit) || unitRule?.price || unitList.default;
    const bulk = unitRule?.bulk ?? null;
    let wholesale = null;
    if (hasWholesale && !bulk && product.category !== "indumentaria") {
      wholesale = Number(override.wholesale) || findRule(wholesaleList, key, shortKey, product.category)?.price || wholesaleList.default;
      if (wholesale >= unit) wholesale = null;   // nunca mostrar un "precio por mayor" que no conviene
    }
    const result = { unit, wholesale, bulk };
    cache.set(product.id, result);
    return result;
  }

  return {
    hasWholesale,
    minPairs,
    wholesaleLabel,
    forProduct: resolve,

    /** Cuenta pares (todo menos indumentaria) para saber si aplica precio por mayor. */
    countPairs(lines) {
      return lines.reduce((sum, line) => sum + (line.product.category === "indumentaria" ? 0 : line.qty), 0);
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
      const groupKeys = [...new Set(lines.map((line) => qualityOf(line.product)))].sort();
      const groupPairs = new Map(groupKeys.map((key) => [key, this.countPairs(lines.filter((l) => qualityOf(l.product) === key))]));
      const qualifies = (key) => hasWholesale && groupPairs.get(key) >= minPairs;
      const pairs = this.countPairs(lines);
      const canChoose = groupKeys.some(qualifies);
      const qtyByProduct = new Map();
      for (const line of lines) qtyByProduct.set(line.product.id, (qtyByProduct.get(line.product.id) ?? 0) + line.qty);

      const priceLines = (useWholesale) => lines.map((line) => {
        const prices = resolve(line.product);
        let price = prices.unit;
        if (prices.bulk && qtyByProduct.get(line.product.id) >= prices.bulk.min) price = prices.bulk.price;
        else if (useWholesale && prices.wholesale && qualifies(qualityOf(line.product))) price = prices.wholesale;
        return { ...line, price, subtotal: price * line.qty, unitPrice: prices.unit };
      });
      const sum = (priced) => priced.reduce((acc, line) => acc + line.subtotal, 0);

      const unitLines = priceLines(false);
      const wholesaleLines = canChoose ? priceLines(true) : unitLines;
      const isWholesale = canChoose && mode === "mayor";
      const priced = isWholesale ? wholesaleLines : unitLines;
      const groups = groupKeys.map((key) => {
        const groupLines = priced.filter((line) => qualityOf(line.product) === key);
        return {
          key,
          lines: groupLines,
          pairs: groupPairs.get(key),
          canChoose: qualifies(key),
          pairsToWholesale: Math.max(minPairs - groupPairs.get(key), 0),
          subtotal: sum(groupLines),
        };
      });

      return {
        lines: priced,
        groups,
        // true si hay G5 en el pedido: el carrito y el mensaje se muestran separados por calidad.
        byQuality: groupKeys.includes("g5"),
        pairs,
        minPairs,
        canChoose,
        mode: canChoose ? mode : "unidad",
        isWholesale,
        pairsToWholesale: Math.max(minPairs - Math.max(0, ...groupPairs.values()), 0),
        total: sum(priced),
        totals: { unidad: sum(unitLines), mayor: sum(wholesaleLines) },
      };
    },
  };
}
