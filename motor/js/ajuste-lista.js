/*
 * Cuánto subió o bajó la lista de precios del stock automático con "Cambiar precios" del panel,
 * para cada versión de la tienda (al público o revendedores) y cada calidad (Brasil o G5).
 * La lista queda: precio de lista × (1 + percent) + amount.
 * Lo usan la tienda, el panel y el servidor (así los tres calculan igual).
 *
 * Cada combinación guarda su ajuste en los ajustes de la tienda. Una que todavía no tiene el suyo
 * sigue a otra (así eran todas al principio: un solo ajuste, brPercent / brAmount, para todo):
 *   revendedores Brasil -> público Brasil
 *   público G5          -> público Brasil
 *   revendedores G5     -> revendedores Brasil (si tiene el suyo) -> público G5 -> público Brasil
 */
export const LIST_CELLS = {
  "publico:br": ["brPercent", "brAmount"],
  "mayorista:br": ["resalePercent", "resaleAmount"],
  "publico:g5": ["g5Percent", "g5Amount"],
  "mayorista:g5": ["g5ResalePercent", "g5ResaleAmount"],
};

function own(settings, key) {
  const [percentKey, amountKey] = LIST_CELLS[key];
  if (settings?.[percentKey] == null && settings?.[amountKey] == null) return null;
  return { percent: Number(settings[percentKey]) || 0, amount: Number(settings[amountKey]) || 0 };
}

/** { percent, amount } de la lista para una versión ("publico" | "mayorista") y calidad ("br" | "g5"). */
export function listAdjustment(settings, version, quality) {
  const chain = {
    "publico:br": ["publico:br"],
    "mayorista:br": ["mayorista:br", "publico:br"],
    "publico:g5": ["publico:g5", "publico:br"],
    "mayorista:g5": ["mayorista:g5", "mayorista:br", "publico:g5", "publico:br"],
  }[`${version === "mayorista" ? "mayorista" : "publico"}:${quality === "g5" ? "g5" : "br"}`];
  for (const key of chain) {
    const found = own(settings, key);
    if (found) return found;
  }
  return { percent: 0, amount: 0 };
}

/** La tabla de precios de una versión con sus ajustes (Brasil y G5). Sin ajustes, la misma tabla. */
export function adjustedTable(table, settings, version) {
  const br = listAdjustment(settings, version, "br");
  const g5 = listAdjustment(settings, version, "g5");
  if (!br.percent && !br.amount && !g5.percent && !g5.amount) return table;
  return { ...table, percent: br.percent, amount: br.amount, g5Adjust: g5 };
}
