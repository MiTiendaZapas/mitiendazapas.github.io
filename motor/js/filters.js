/*
 * Lógica de filtros (sin pantalla): búsqueda, marca, talle y categoría.
 * El estado se refleja en la dirección (?marca=nike&talle=40&q=dunk), así un
 * link con filtros se puede compartir y sobrevive a recargar la página.
 */
import { normalize } from "./utils.js";

const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
const PARAMS = { q: "q", brands: "marca", sizes: "talle", category: "categoria" };

/** Talles "simples" de un producto: "37/38" (ojotas) cuenta como 37 y 38. */
function simpleSizes(product) {
  const result = new Set();
  for (const s of product.available) for (const part of s.size.split("/")) result.add(part.trim());
  return result;
}

export function createFilters(products) {
  // Se precalcula lo que se busca en cada producto, así filtrar es instantáneo.
  const index = new Map(products.map((p) => [p.id, {
    text: normalize(`${p.name} ${p.brand ?? ""}`),
    sizes: simpleSizes(p),
  }]));

  const state = { q: "", brands: new Set(), sizes: new Set(), category: "" };
  const listeners = new Set();

  function matches(product, skip = null) {
    const info = index.get(product.id);
    if (skip !== "q" && state.q) {
      const words = normalize(state.q).split(" ").filter(Boolean);
      if (!words.every((word) => info.text.includes(word))) return false;
    }
    if (skip !== "brands" && state.brands.size && !state.brands.has(product.brand ?? "")) return false;
    if (skip !== "category" && state.category && product.category !== state.category) return false;
    if (skip !== "sizes" && state.sizes.size && ![...state.sizes].some((s) => info.sizes.has(s))) return false;
    return true;
  }

  /** Cuántos modelos habría con cada opción, respetando los otros filtros activos. */
  function facetCounts(field, keyOf) {
    const counts = new Map();
    for (const product of products) {
      if (!matches(product, field)) continue;
      for (const key of keyOf(product)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  function emit() {
    writeUrl();
    listeners.forEach((listener) => listener());
  }

  function writeUrl() {
    const url = new URL(location.href);
    const set = (name, value) => (value ? url.searchParams.set(name, value) : url.searchParams.delete(name));
    set(PARAMS.q, state.q.trim());
    set(PARAMS.brands, [...state.brands].join(","));
    set(PARAMS.sizes, [...state.sizes].join(","));
    set(PARAMS.category, state.category);
    history.replaceState(history.state, "", url);
  }

  function readUrl() {
    const params = new URL(location.href).searchParams;
    const list = (name) => (params.get(name) ?? "").split(",").map((v) => v.trim()).filter(Boolean);
    const brandNames = new Map(products.map((p) => [normalize(p.brand ?? ""), p.brand]));
    state.q = (params.get(PARAMS.q) ?? "").slice(0, 60);
    state.brands = new Set(list(PARAMS.brands).map((b) => brandNames.get(normalize(b))).filter(Boolean));
    state.sizes = new Set(list(PARAMS.sizes).filter((s) => /^[\d.]+$/.test(s)));
    state.category = products.some((p) => p.category === params.get(PARAMS.category)) ? params.get(PARAMS.category) : "";
  }

  return {
    state,
    readUrl,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    results() {
      return products.filter((p) => matches(p));
    },

    activeCount() {
      return state.brands.size + state.sizes.size + (state.category ? 1 : 0);
    },

    hasAny() {
      return Boolean(state.q.trim()) || this.activeCount() > 0;
    },

    options() {
      const brandCounts = facetCounts("brands", (p) => [p.brand ?? ""]);
      const sizeCounts = facetCounts("sizes", (p) => index.get(p.id).sizes);
      const categoryCounts = facetCounts("category", (p) => [p.category]);
      const allBrands = [...new Set(products.map((p) => p.brand ?? ""))].sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || collator.compare(a, b));
      const allSizes = [...new Set(products.flatMap((p) => [...index.get(p.id).sizes]))].sort(collator.compare);
      const allCategories = [...new Set(products.map((p) => p.category))];
      return {
        brands: allBrands.map((value) => ({ value, count: brandCounts.get(value) ?? 0, selected: state.brands.has(value) })),
        sizes: allSizes.map((value) => ({ value, count: sizeCounts.get(value) ?? 0, selected: state.sizes.has(value) })),
        categories: allCategories.map((value) => ({ value, count: categoryCounts.get(value) ?? 0, selected: state.category === value })),
      };
    },

    setQuery(q) { state.q = q.slice(0, 60); emit(); },
    toggleBrand(brand) { state.brands.has(brand) ? state.brands.delete(brand) : state.brands.add(brand); emit(); },
    toggleSize(size) { state.sizes.has(size) ? state.sizes.delete(size) : state.sizes.add(size); emit(); },
    setCategory(category) { state.category = state.category === category ? "" : category; emit(); },
    setOnlyBrand(brand) { state.brands = new Set(brand ? [brand] : []); emit(); },
    clear({ keepQuery = false } = {}) {
      if (!keepQuery) state.q = "";
      state.brands.clear();
      state.sizes.clear();
      state.category = "";
      emit();
    },
  };
}
