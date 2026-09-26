/*
 * Motor de precios: lee las reglas del archivo de precios de la tienda
 * (precios-*.json) y calcula precio por unidad, por mayor y totales.
 * El precio NUNCA se guarda en el carrito: siempre se calcula acá, con los
 * datos actuales, así no se puede manipular desde el navegador.
 */
import { normalize } from "./utils.js";

function compileList(list) {
  return {
    default: Number(list?.default) || 0,
    rules: (list?.rules ?? []).map((rule) => ({
      price: Number(rule.price) || 0,
      bulk: rule.bulk ? { min: Number(rule.bulk.min), price: Number(rule.bulk.price) } : null,
      contains: (rule.contains ?? []).map(normalize),
      containsAll: (rule.containsAll ?? []).map(normalize),
      startsWith: (rule.startsWith ?? []).map(normalize),
    })),
  };
}

function matches(rule, key) {
  if (rule.startsWith.some((text) => key.startsWith(text))) return true;
  if (rule.contains.some((text) => key.includes(text))) return true;
  return rule.containsAll.length > 0 && rule.containsAll.every((text) => key.includes(text));
}

function findRule(list, key) {
  return list.rules.find((rule) => matches(rule, key)) ?? null;
}

export function createPricing(table) {
  const unitList = compileList(table.unit);
  const wholesaleList = compileList(table.wholesalePrice);
  const overrides = table.overrides ?? {};
  const minPairs = Number(table.wholesale?.minPairs) || 5;
  const wholesaleLabel = table.wholesale?.label ?? `Llevando ${minPairs} o más pares surtidos`;
  const cache = new Map();

  function resolve(product) {
    if (cache.has(product.id)) return cache.get(product.id);
    const key = normalize(product.name);
    const override = overrides[product.slug] ?? overrides[product.id] ?? {};
    const unitRule = findRule(unitList, key);
    const unit = Number(override.unit) || unitRule?.price || unitList.default;
    const bulk = unitRule?.bulk ?? null;
    let wholesale = null;
    if (!bulk && product.category !== "indumentaria") {
      wholesale = Number(override.wholesale) || findRule(wholesaleList, key)?.price || wholesaleList.default;
      if (wholesale >= unit) wholesale = null;   // nunca mostrar un "precio por mayor" que no conviene
    }
    const result = { unit, wholesale, bulk };
    cache.set(product.id, result);
    return result;
  }

  return {
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
      const pairs = this.countPairs(lines);
      const canChoose = pairs >= minPairs;
      const qtyByProduct = new Map();
      for (const line of lines) qtyByProduct.set(line.product.id, (qtyByProduct.get(line.product.id) ?? 0) + line.qty);

      const priceLines = (useWholesale) => lines.map((line) => {
        const prices = resolve(line.product);
        let price = prices.unit;
        if (prices.bulk && qtyByProduct.get(line.product.id) >= prices.bulk.min) price = prices.bulk.price;
        else if (useWholesale && prices.wholesale) price = prices.wholesale;
        return { ...line, price, subtotal: price * line.qty, unitPrice: prices.unit };
      });
      const sum = (priced) => priced.reduce((acc, line) => acc + line.subtotal, 0);

      const unitLines = priceLines(false);
      const wholesaleLines = canChoose ? priceLines(true) : unitLines;
      const isWholesale = canChoose && mode === "mayor";
      const priced = isWholesale ? wholesaleLines : unitLines;

      return {
        lines: priced,
        pairs,
        minPairs,
        canChoose,
        mode: canChoose ? mode : "unidad",
        isWholesale,
        pairsToWholesale: Math.max(minPairs - pairs, 0),
        total: sum(priced),
        totals: { unidad: sum(unitLines), mayor: sum(wholesaleLines) },
      };
    },
  };
}
