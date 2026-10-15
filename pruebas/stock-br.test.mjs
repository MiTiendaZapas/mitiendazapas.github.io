/*
 * Pruebas del stock de Brasil en tiendas de clientes (servidor/panel.js): lo que el cliente
 * cambia modelo por modelo, cómo se arma la tienda y los precios de sus productos propios.
 * Correr desde la carpeta plataforma-zapas:   node --test "pruebas/*.test.mjs"
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { brModel, brProducts, cleanBrChange, cleanCategories, publicMixedCatalog, storeCategories } = await import("../servidor/panel.js");
const { createPricing } = await import("../motor/js/pricing.js");

const brazil = {
  generatedAt: "2026-10-15T10:00:00Z",
  products: [
    { id: "vp-1", slug: "dunk-panda", name: "Dunk panda", brand: "Nike", category: "zapatillas",
      sizes: [{ size: "38", stock: 2 }, { size: "39", stock: 3, casa: 1 }],
      images: [{ lg: "fotos/vp-1/a-lg.webp", sm: "fotos/vp-1/a-sm.webp", w: 675, h: 900 }] },
    { id: "vp-2", slug: "mind", name: "Mind negras", brand: null, category: "ojotas",
      sizes: [{ size: "40", stock: 1 }], images: [] },
  ],
};
const store = (extra = {}) => ({ version: 1, store: "prueba", categories: {}, products: [], stockBR: { casa: false, g5: false }, br: {}, ...extra });

describe("stock de Brasil", () => {
  test("sin cambios: muestra el stock de Brasil, sin el stock de casa si la tienda no lo tiene", () => {
    const [dunk] = brProducts(store(), brazil);
    assert.deepEqual(dunk.sizes.map((s) => [s.size, s.br, s.casa, s.stock]), [["38", 2, 0, 2], ["39", 2, 0, 2]]);
    assert.equal(dunk.images[0].lg, "https://catalogo.mitiendastock.com/fotos/vp-1/a-lg.webp");
    const withHouse = brProducts(store({ stockBR: { casa: true } }), brazil)[0];
    assert.equal(withHouse.sizes[1].stock, 3);
  });

  test("los pares del cliente se suman a los de Brasil, también en talles que Brasil no tiene", () => {
    const change = cleanBrChange({ extra: [{ size: "39", stock: 2 }, { size: "41", stock: 1 }] }, brModel(brazil.products[0]));
    const [dunk] = brProducts(store({ br: { "vp-1": change } }), brazil);
    assert.deepEqual(dunk.sizes.map((s) => [s.size, s.stock]), [["38", 2], ["39", 4], ["41", 1]]);
    assert.equal(dunk.sizes[2].soloCasa, true);
  });

  test("si Brasil agota un modelo, sigue en la tienda con los pares del cliente", () => {
    const change = cleanBrChange({ extra: [{ size: "38", stock: 1 }] }, brModel(brazil.products[0]));
    const soldOut = { ...brazil, products: brazil.products.slice(1) };
    const catalog = publicMixedCatalog(store({ br: { "vp-1": change } }), soldOut);
    const dunk = catalog.products.find((p) => p.id === "vp-1");
    assert.equal(dunk.name, "Dunk panda");
    assert.deepEqual(dunk.sizes, [{ size: "38", stock: 1 }]);
    assert.equal(dunk.images[0].lg, "https://catalogo.mitiendastock.com/fotos/vp-1/a-lg.webp");
  });

  test("precio propio y ocultar; vacío vuelve a lo automático", () => {
    const base = brModel(brazil.products[1]);
    assert.equal(cleanBrChange({ price: "", wholesalePrice: "", hidden: false, extra: [{ size: "40", stock: 0 }] }, base), null);
    assert.throws(() => cleanBrChange({ price: 50000, wholesalePrice: 60000 }, base), /menor/);
    assert.throws(() => cleanBrChange({ extra: [{ size: "40", stock: -1 }] }, base), /no es válida/);
    const catalog = publicMixedCatalog(store({ br: { "vp-1": { hidden: true }, "vp-2": cleanBrChange({ price: "52000" }, base) } }), brazil);
    assert.equal(catalog.products.some((p) => p.id === "vp-1"), false);
    assert.equal(catalog.products.find((p) => p.id === "vp-2").price, 52000);
  });

  test("las categorías de Brasil siempre están; se pueden renombrar pero no borrar", () => {
    const data = store({ categories: { remeras: "Remeras" } });
    assert.deepEqual(Object.keys(storeCategories(data)), ["zapatillas", "ojotas", "remeras"]);
    const renamed = cleanCategories([{ id: "remeras", label: "Remeras" }, { id: "zapatillas", label: "Zapas" }, { id: "ojotas", label: "Ojotas" }], data);
    assert.equal(renamed.zapatillas, "Zapas");
    assert.throws(() => cleanCategories([{ id: "remeras", label: "Remeras" }, { id: "ojotas", label: "Ojotas" }], data), /no borrar/);
  });

  test("los productos propios van marcados y se cobran solo con su precio", () => {
    const own = { id: "m-1", slug: "remera", name: "Remera", category: "remeras", price: 15000, wholesalePrice: null, sizes: [{ size: "M", stock: 2 }], images: [] };
    const catalog = publicMixedCatalog(store({ products: [own] }), brazil);
    assert.equal(catalog.products.find((p) => p.id === "m-1").manual, true);
    // La lista de precios tiene precio por mayor general: al producto propio no se le aplica.
    const pricing = createPricing({ wholesale: { minPairs: 5, allProducts: true }, unit: { default: 60000, rules: [] }, wholesalePrice: { default: 12000, rules: [] } });
    assert.deepEqual(pricing.forProduct({ ...own, manual: true }), { unit: 15000, wholesale: null, bulk: null });
    // A un modelo de Brasil con precio propio (sin precio por mayor propio) sí le queda el por mayor de la lista.
    assert.deepEqual(pricing.forProduct({ id: "vp-2", name: "Mind negras", category: "ojotas", price: 52000 }), { unit: 52000, wholesale: 12000, bulk: null });
  });
});
