/*
 * Pruebas del stock de Brasil en tiendas de clientes (servidor/panel.js): lo que el cliente
 * cambia modelo por modelo, cómo se arma la tienda y los precios de sus productos propios.
 * Correr desde la carpeta plataforma-zapas:   node --test "pruebas/*.test.mjs"
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { brModel, brProducts, applyGroupOffers, changePrices, cleanBrChange, cleanupPhotos, cleanCategories, cleanProduct, publicMixedCatalog, storeCategories } = await import("../servidor/panel.js");
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
    assert.deepEqual(Object.keys(storeCategories(data)), ["zapatillas", "ojotas", "g5", "remeras"]);
    const renamed = cleanCategories([{ id: "remeras", label: "Remeras" }, { id: "zapatillas", label: "Zapas" }, { id: "ojotas", label: "Ojotas" }, { id: "g5", label: "Calidad G5" }], data);
    assert.equal(renamed.zapatillas, "Zapas");
    assert.throws(() => cleanCategories([{ id: "remeras", label: "Remeras" }, { id: "ojotas", label: "Ojotas" }, { id: "g5", label: "Calidad G5" }], data), /no borrar/);
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

  test("cambiar precios: +10% a lo propio, a los precios propios de Brasil y a la lista (redondeado a $100)", () => {
    const catalog = store({
      products: [{ id: "m-1", price: 15000, wholesalePrice: 12000, compareAt: 18000, images: [], sizes: [] }],
      br: { "vp-2": { price: 52000 }, "vp-1": { hidden: true } },
    });
    const settings = { brPercent: 0 };
    changePrices(catalog, settings, { percent: 0.1, own: true, br: true });
    assert.deepEqual([catalog.products[0].price, catalog.products[0].wholesalePrice, catalog.products[0].compareAt], [16500, 13200, 19800]);
    assert.equal(catalog.br["vp-2"].price, 57200);
    assert.equal(catalog.br["vp-1"].price, undefined);       // sin precio propio: sube con la lista
    assert.ok(Math.abs(settings.brPercent - 0.1) < 1e-9);
    changePrices(catalog, settings, { percent: 0.1, own: false, br: true });
    assert.ok(Math.abs(settings.brPercent - 0.21) < 1e-9);    // dos subas de 10% = 21%
    const pricing = createPricing({ wholesale: false, unit: { default: 60000, rules: [] }, percent: settings.brPercent });
    assert.equal(pricing.forProduct({ id: "x", name: "Dunk", category: "zapatillas" }).unit, 72600);
    assert.equal(pricing.forProduct({ id: "y", name: "Dunk", category: "zapatillas", price: 50000 }).unit, 50000);
  });

  test("opcionales: descripción, oferta (tiene que ser más cara) y destacado", () => {
    const data = store();
    const base = { name: "Remera", category: "Remeras", price: 15000, sizes: [{ size: "M", stock: 1 }], images: [] };
    const product = cleanProduct({ ...base, description: "  Algodón  ", compareAt: "20000", featured: true }, null, data);
    assert.deepEqual([product.description, product.compareAt, product.featured], ["Algodón", 20000, true]);
    assert.throws(() => cleanProduct({ ...base, compareAt: 15000 }, null, data), /más alto/);
    const plain = cleanProduct(base, null, data);
    assert.deepEqual([plain.description, plain.compareAt, plain.featured], [null, null, false]);
  });

  test("limpieza: borra solo las fotos que ningún producto usa y que tienen más de un día", async () => {
    const day = 86_400_000;
    const objects = [
      { key: "tiendas/t/fotos/a-lg.webp", uploaded: new Date(Date.now() - 3 * day) },   // la usa un producto
      { key: "tiendas/t/fotos/b-lg.webp", uploaded: new Date(Date.now() - 3 * day) },   // suelta y vieja: se borra
      { key: "tiendas/t/fotos/c-lg.webp", uploaded: new Date() },                       // suelta pero recién subida
    ];
    let deleted = [];
    const env = { CATALOGO: { list: async () => ({ objects, truncated: false }), delete: async (keys) => { deleted = keys; } } };
    const data = { products: [{ images: [{ lg: "fotos/a-lg.webp", sm: "fotos/a-sm.webp" }] }] };
    assert.equal(await cleanupPhotos(env, "t", data), 1);
    assert.deepEqual(deleted, ["tiendas/t/fotos/b-lg.webp"]);
  });

  test("producto propio: no le aplica ninguna regla de la lista (ni precio por cantidad)", () => {
    const pricing = createPricing({ wholesale: false, unit: { default: 60000, rules: [{ price: 20000, contains: ["remera"], bulk: { min: 10, price: 15000 } }] } });
    const own = { id: "m-9", name: "Remera básica", category: "remeras", price: 12000, manual: true };
    assert.deepEqual(pricing.forProduct(own), { unit: 12000, wholesale: null, bulk: null });
  });

  test("G5: no se ven hasta que tienen precio; modelos nuevos en modo manual esperan precio", () => {
    const withG5 = { ...brazil, products: [...brazil.products,
      { id: "g5-1", slug: "dunk-g5", name: "Dunk G5", category: "g5", sizes: [{ size: "40", stock: 2 }], images: [] }] };
    const ids = (data) => publicMixedCatalog(data, withG5).products.map((p) => p.id);
    assert.deepEqual(ids(store()), ["vp-1", "vp-2"]);                                   // G5 sin precio: no se ve
    const g5 = publicMixedCatalog(store({ pricing: { g5: { unit: 30000 } } }), withG5).products.find((p) => p.id === "g5-1");
    assert.deepEqual([g5.price, g5.wholesalePrice, g5.noWholesale], [30000, null, true]); // precio general, sin por mayor
    // Modo manual: los que ya estaban se ven; uno nuevo espera hasta tener precio propio.
    const manual = store({ pricing: { mode: "manual", g5: { unit: 30000 } }, known: ["vp-1", "g5-1"] });
    assert.deepEqual(ids(manual), ["vp-1", "g5-1"]);
    assert.equal(brProducts(manual, withG5).find((p) => p.id === "vp-2").status, "nuevo");
    assert.deepEqual(ids({ ...manual, br: { "vp-2": { price: 50000 } } }), ["vp-1", "vp-2", "g5-1"]);
    // Precio general de Brasil: los modelos sin precio propio salen con ese precio.
    const general = publicMixedCatalog(store({ pricing: { br: { unit: 55000, wholesale: 40000 } } }), withG5).products.find((p) => p.id === "vp-1");
    assert.deepEqual([general.price, general.wholesalePrice], [55000, 40000]);
  });

  test("por mayor: mínimo distinto por categoría (cuenta aparte) y precio por cantidad de un producto", () => {
    const pricing = createPricing({ wholesale: { minPairs: 5, allProducts: true, byCategory: { remeras: 10 } }, unit: { default: 0, rules: [] } });
    const zapa = { id: "m-z", name: "Zapa", category: "zapatillas", price: 50000, wholesalePrice: 40000, manual: true };
    const remera = { id: "m-r", name: "Remera", category: "remeras", price: 15000, wholesalePrice: 12000, manual: true };
    const buzo = { id: "m-b", name: "Buzo", category: "buzos", price: 30000, wholesalePrice: 25000, manual: true, bulk: { min: 3, price: 26000 } };
    const line = (product, qty) => ({ product, productId: product.id, size: "M", qty });
    // 5 zapatillas llegan al general (5); 6 remeras no llegan a su mínimo (10).
    const q = pricing.quote([line(zapa, 5), line(remera, 6)], "mayor");
    assert.deepEqual(q.lines.map((l) => l.price), [40000, 15000]);
    assert.equal(pricing.wholesaleLabelFor(remera), "Llevando 10 o más de esta categoría (surtidos)");
    // Precio por cantidad: 3 buzos del mismo modelo, cada uno a 26.000 (aunque no llegue al por mayor).
    assert.deepEqual(pricing.quote([line(buzo, 3)], "unidad").lines.map((l) => l.price), [26000]);
    assert.deepEqual(pricing.quote([line(buzo, 2)], "unidad").lines.map((l) => l.price), [30000]);
  });

  test("ofertas en grupo: pone y saca oferta a productos propios y modelos automáticos", () => {
    const catalog = store({ products: [{ id: "m-1", name: "Remera", price: 20000, wholesalePrice: 17000, images: [], sizes: [] }], br: {} });
    const brIds = new Set(["vp-1"]);
    applyGroupOffers(catalog, brIds, [{ id: "m-1", price: 16000, compareAt: 20000 }, { id: "vp-1", price: 48000, compareAt: 60000 }, { id: "no-existe", price: 1 }]);
    assert.deepEqual([catalog.products[0].price, catalog.products[0].compareAt, catalog.products[0].wholesalePrice], [16000, 20000, null]);
    assert.deepEqual(catalog.br["vp-1"], { price: 48000, compareAt: 60000 });
    // Sacar: el propio vuelve a su precio; el automático vuelve al general/base (sin precio propio).
    applyGroupOffers(catalog, brIds, [{ id: "m-1", price: 20000, compareAt: null }, { id: "vp-1", price: null, compareAt: null }]);
    assert.deepEqual([catalog.products[0].price, catalog.products[0].compareAt], [20000, null]);
    assert.equal(catalog.br["vp-1"], undefined);
    assert.throws(() => applyGroupOffers(catalog, brIds, [{ id: "m-1", price: 20000, compareAt: 15000 }]), /más alto/);
  });
});
