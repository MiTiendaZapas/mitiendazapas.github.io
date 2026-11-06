/*
 * La app de pedidos (AppPedidos) muestra como "stock de casa" solo los pares propios de L.A IMP.
 * Una ojota propia con el mismo nombre que una del proveedor viene SUMADA en "stock" (para la tienda) y trae
 * "propio" con los pares de casa de verdad: sin leer "propio", los pares del proveedor figuraban como de casa.
 * Correr desde plataforma-zapas:   node --test "pruebas/*.test.mjs"
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const { brProducts, publicMixedCatalog, HOUSE_STORE } = await import("../servidor/panel.js");

const FILE = new URL("../../AppPedidos/stock-panel.js", import.meta.url);

/** Carga stock-panel.js con un navegador simulado y devuelve lo que la app muestra como stock de casa. */
async function stockEnLaApp(catalogo) {
  const Store = {};
  const window = {};
  const sandbox = {
    Store, window, console,
    location: { hostname: "mitiendastock.com", port: "" },
    document: { getElementById: () => null, addEventListener() {}, createElement: () => ({}), body: {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, json: async () => catalogo }),
    setInterval: () => 0, clearInterval() {}, setTimeout, clearTimeout,
    URL, Date, Number, String, Object, JSON, Promise,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(FILE, "utf8"), sandbox);
  // (viene de otro entorno de Node: se copia para poder compararlo)
  return new Promise((resolve) => Store.onStockCasa((modelos) => resolve(JSON.parse(JSON.stringify(modelos)))));
}

const brazil = {
  generatedAt: "2026-11-06T10:00:00Z",
  products: [
    { id: "vp-lv", slug: "lv-negras", name: "Ojotas Louis Vuitton negras", category: "ojotas", sizes: [{ size: "39/40", stock: 54 }, { size: "41/42", stock: 52 }], images: [] },
  ],
};
const own = (extra = {}) => ({ id: "m-1", slug: "lv-negras", name: "Ojotas Louis Vuitton negras", category: "ojotas", price: 36000, wholesalePrice: null,
  images: [], sizes: [{ size: "39/40", stock: 0 }, { size: "41/42", stock: 0 }], ...extra });
const laimp = (products) => ({ version: 1, store: HOUSE_STORE, categories: { ojotas: "Ojotas" }, products, stockBR: { casa: false, g5: false }, br: {} });

test("la app no muestra como stock de casa los pares del proveedor de una ojota con el mismo nombre", { skip: !existsSync(FILE) }, async () => {
  const catalogo = publicMixedCatalog(laimp([own()]), brazil);
  const suma = catalogo.products.find((p) => p.id === "m-1");
  assert.deepEqual(suma.sizes.map((s) => s.stock), [54, 52]);   // la tienda ve la suma
  const modelos = await stockEnLaApp(catalogo);
  assert.deepEqual(modelos["p:m-1"].talles, { "39/40": 0, "41/42": 0 });   // la app, solo los pares de casa
});

test("con pares de casa, la app muestra solo los de casa", { skip: !existsSync(FILE) }, async () => {
  const catalogo = publicMixedCatalog(laimp([own({ sizes: [{ size: "39/40", stock: 1 }, { size: "41/42", stock: 0 }] })]), brazil);
  const modelos = await stockEnLaApp(catalogo);
  assert.deepEqual(modelos["p:m-1"].talles, { "39/40": 1, "41/42": 0 });
});

test("una ojota propia pausada no hace desaparecer la del proveedor en L.A IMP", () => {
  const visibles = brProducts(laimp([own({ hidden: true })]), brazil).map((p) => p.name);
  assert.ok(visibles.includes("Ojotas Louis Vuitton negras"));
  const ocultaPorElPropio = brProducts(laimp([own()]), brazil).map((p) => p.name);
  assert.ok(!ocultaPorElPropio.includes("Ojotas Louis Vuitton negras"));   // si el propio se ve, manda el propio
});
