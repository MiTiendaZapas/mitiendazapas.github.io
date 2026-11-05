/*
 * Ojotas de L.A IMP con el mismo nombre que una del proveedor: la tienda muestra la suma de las dos,
 * pero el catálogo público también dice cuántos pares son propios ("propio"). El piloto toma de ahí el
 * stock de casa que comparten las demás tiendas (si tomara la suma, contaba dos veces el del proveedor).
 * Correr desde plataforma-zapas:   node --test "pruebas/*.test.mjs"
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const { publicMixedCatalog, HOUSE_STORE } = await import("../servidor/panel.js");

const brazil = {
  generatedAt: "2026-11-05T10:00:00Z",
  products: [
    { id: "vp-lv", slug: "ojotas-lv-negras", name: "Ojotas Louis Vuitton negras", category: "ojotas",
      sizes: [{ size: "39/40", stock: 55 }, { size: "41/42", stock: 52 }], images: [] },
  ],
};
const own = { id: "m-1", slug: "ojotas-lv-negras", name: "Ojotas Louis Vuitton negras", category: "ojotas", price: 36000, wholesalePrice: null,
  manual: true, images: [], sizes: [{ size: "39/40", stock: 1 }, { size: "43/44", stock: 2 }] };
const data = (store) => ({ version: 1, store, categories: { ojotas: "Ojotas" }, products: [own], stockBR: { casa: false, g5: false }, br: {} });

test("L.A IMP: la ojota propia muestra la suma, pero informa cuántos pares son propios", () => {
  const product = publicMixedCatalog(data(HOUSE_STORE), brazil).products.find((p) => p.id === "m-1");
  assert.deepEqual(product.sizes.map((s) => [s.size, s.stock, s.propio]), [["39/40", 56, 1], ["41/42", 52, 0], ["43/44", 2, 2]]);
});

test("otras tiendas: no cambia nada (no hay suma ni 'propio')", () => {
  const product = publicMixedCatalog(data("fo"), brazil).products.find((p) => p.id === "m-1");
  assert.deepEqual(product.sizes.map((s) => [s.size, s.stock, s.propio]), [["39/40", 1, undefined], ["43/44", 2, undefined]]);
});
