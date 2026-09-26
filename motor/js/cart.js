/*
 * Estado del pedido. Guarda solo { producto, talle, cantidad } en el
 * navegador: nunca precios. Al abrir la tienda se revalida contra el
 * catálogo actual (talles agotados, stock que bajó, productos que ya no están).
 */
import { readStorage, writeStorage } from "./utils.js";

const MAX_QTY_PER_LINE = 50;

export function createCart({ storageKey, catalog }) {
  let lines = [];
  const listeners = new Set();

  function persist() {
    writeStorage(storageKey, lines.map(({ productId, size, qty }) => ({ productId, size, qty })));
  }

  function emit(event) {
    persist();
    listeners.forEach((listener) => listener(event));
  }

  function maxFor(productId, size) {
    return Math.min(catalog.stockOf(productId, size), MAX_QTY_PER_LINE);
  }

  /** Revalida lo guardado. Devuelve cuántas líneas se quitaron o ajustaron. */
  function restore() {
    const saved = readStorage(storageKey, []);
    let removed = 0;
    let adjusted = 0;
    lines = [];
    for (const entry of Array.isArray(saved) ? saved : []) {
      const qty = Math.floor(Number(entry?.qty));
      const max = maxFor(entry?.productId, String(entry?.size));
      if (!catalog.get(entry?.productId) || max < 1 || !(qty >= 1)) {
        removed += 1;
        continue;
      }
      if (qty > max) adjusted += 1;
      lines.push({ productId: entry.productId, size: String(entry.size), qty: Math.min(qty, max) });
    }
    persist();
    return { removed, adjusted };
  }

  return {
    restore,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Líneas con el producto completo, listas para mostrar o cotizar. */
    lines() {
      return lines.map((line) => ({ ...line, product: catalog.get(line.productId) })).filter((l) => l.product);
    },

    count() {
      return lines.reduce((sum, line) => sum + line.qty, 0);
    },

    qtyOf(productId, size) {
      return lines.find((l) => l.productId === productId && l.size === size)?.qty ?? 0;
    },

    maxFor,

    /** Agrega respetando el stock. Devuelve cuántas unidades se agregaron realmente. */
    add(productId, size, qty) {
      const max = maxFor(productId, size);
      const existing = lines.find((l) => l.productId === productId && l.size === size);
      const current = existing?.qty ?? 0;
      const added = Math.max(0, Math.min(Math.floor(qty), max - current));
      if (added === 0) return { added: 0, max };
      if (existing) existing.qty += added;
      else lines.push({ productId, size, qty: added });
      emit({ type: "add", productId, size, added });
      return { added, max };
    },

    setQty(productId, size, qty) {
      const line = lines.find((l) => l.productId === productId && l.size === size);
      if (!line) return;
      const next = Math.min(Math.max(Math.floor(qty), 0), maxFor(productId, size));
      if (next === 0) lines = lines.filter((l) => l !== line);
      else line.qty = next;
      emit({ type: "update", productId, size });
    },

    remove(productId, size) {
      lines = lines.filter((l) => !(l.productId === productId && l.size === size));
      emit({ type: "remove", productId, size });
    },

    clear() {
      lines = [];
      emit({ type: "clear" });
    },
  };
}
