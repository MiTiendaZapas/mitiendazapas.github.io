/*
 * Pruebas automáticas del motor de la tienda (no necesitan instalar nada).
 * Correr desde la carpeta plataforma-zapas:   node --test "pruebas/*.test.mjs"
 */
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

// El motor usa algunas cosas del navegador; acá se simulan.
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
globalThis.location = new URL("http://localhost/index.html");
globalThis.history = { state: null, replaceState: (_s, _t, url) => { globalThis.location = new URL(url); } };

const { createPricing } = await import("../motor/js/pricing.js");
const { createCart } = await import("../motor/js/cart.js");
const { createFilters } = await import("../motor/js/filters.js");
const { buildOrderMessage } = await import("../motor/js/whatsapp.js");
const { escapeHtml, normalize, money, whatsappLink } = await import("../motor/js/utils.js");

// --- datos de prueba -------------------------------------------------------------
const product = (id, name, sizes, extra = {}) => ({
  id, slug: id, name, brand: extra.brand ?? "Nike", category: extra.category ?? "zapatillas",
  sizes, available: sizes.filter((s) => s.stock > 0), images: [],
});
const PRODUCTS = [
  product("p1", "Air forcé 1 blancas", [{ size: "38", stock: 2 }, { size: "40", stock: 5 }]),
  product("p2", "Panda sb dunk", [{ size: "40", stock: 1 }, { size: "41", stock: 0 }]),
  product("p3", "Jordan 11 panda", [{ size: "42", stock: 3 }], { brand: "Jordan" }),
  product("p4", "Ojotas total black", [{ size: "37/38", stock: 4 }], { category: "ojotas" }),
  product("p5", "NB 530 blanca / negro", [{ size: "36", stock: 2 }], { brand: "New Balance" }),
];
const catalog = {
  get: (id) => PRODUCTS.find((p) => p.id === id),
  stockOf: (id, size) => PRODUCTS.find((p) => p.id === id)?.sizes.find((s) => s.size === size)?.stock ?? 0,
};
const PRICES = {
  wholesale: { minPairs: 5, label: "Llevando 5 o más pares surtidos" },
  unit: { default: 43000, rules: [
    { price: 35000, contains: ["ojotas"] },
    { price: 55000, contains: ["jordan 11"] },
  ] },
  wholesalePrice: { default: 37000, rules: [
    { price: 31000, contains: ["ojotas"] },
    { price: 50000, contains: ["jordan 11"] },
    { price: 39000, containsAll: ["air force", "brillo"] },
  ] },
  overrides: { p5: { unit: 60000, wholesale: 45000 } },
};

beforeEach(() => memory.clear());

// --- utilidades ---------------------------------------------------------------------
describe("utilidades", () => {
  test("normalize ignora tildes, mayúsculas y espacios de más", () => {
    assert.equal(normalize("  Air  Forcé 1 / Blancas "), "air force 1/blancas");
  });
  test("escapeHtml neutraliza HTML de datos externos", () => {
    assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
  test("money usa formato argentino", () => {
    assert.equal(money(187000), "$187.000");
  });
  test("whatsappLink limpia el número y codifica el mensaje", () => {
    assert.equal(whatsappLink("+54 9 11 5377-3771", "Hola & chau"), "https://wa.me/5491153773771?text=Hola%20%26%20chau");
  });
});

// --- precios ----------------------------------------------------------------------
describe("precios", () => {
  const pricing = createPricing(PRICES);
  const byId = (id) => PRODUCTS.find((p) => p.id === id);

  test("gana la primera regla que coincide y, si ninguna, el precio por defecto", () => {
    assert.deepEqual(pricing.forProduct(byId("p3")), { unit: 55000, wholesale: 50000, bulk: null });
    assert.deepEqual(pricing.forProduct(byId("p1")), { unit: 43000, wholesale: 37000, bulk: null });
    assert.equal(pricing.forProduct(byId("p4")).unit, 35000);
  });
  test("los precios fijos por modelo (overrides) tienen prioridad", () => {
    assert.deepEqual(pricing.forProduct(byId("p5")), { unit: 60000, wholesale: 45000, bulk: null });
  });
  test("menos de 5 pares: precio por unidad y no hay elección", () => {
    const q = pricing.quote([{ product: byId("p1"), size: "40", qty: 4 }], "mayor");
    assert.equal(q.canChoose, false);
    assert.equal(q.total, 4 * 43000);
    assert.equal(q.pairsToWholesale, 1);
  });
  test("5 pares surtidos: se calculan los dos totales y se aplica el elegido", () => {
    const lines = [{ product: byId("p1"), size: "40", qty: 3 }, { product: byId("p3"), size: "42", qty: 2 }];
    const sinElegir = pricing.quote(lines, null);
    assert.equal(sinElegir.canChoose, true);
    assert.deepEqual(sinElegir.totals, { unidad: 3 * 43000 + 2 * 55000, mayor: 3 * 37000 + 2 * 50000 });
    assert.equal(pricing.quote(lines, "mayor").total, 3 * 37000 + 2 * 50000);
    assert.equal(pricing.quote(lines, "unidad").total, 3 * 43000 + 2 * 55000);
  });
});

// --- carrito ------------------------------------------------------------------------
describe("carrito", () => {
  test("no deja agregar más que el stock del talle", () => {
    const cart = createCart({ storageKey: "t:cart", catalog });
    assert.equal(cart.add("p2", "40", 3).added, 1);
    assert.equal(cart.add("p2", "40", 1).added, 0);
    assert.equal(cart.qtyOf("p2", "40"), 1);
  });
  test("nunca guarda precios en el navegador", () => {
    const cart = createCart({ storageKey: "t:cart", catalog });
    cart.add("p1", "40", 2);
    assert.deepEqual(JSON.parse(localStorage.getItem("t:cart")), [{ productId: "p1", size: "40", qty: 2 }]);
  });
  test("al volver, revalida contra el stock actual (agotados, stock menor, datos manipulados)", () => {
    localStorage.setItem("t:cart", JSON.stringify([
      { productId: "p1", size: "40", qty: 99 },     // más que el stock -> se ajusta a 5
      { productId: "p2", size: "41", qty: 1 },      // talle agotado -> se quita
      { productId: "no-existe", size: "40", qty: 1 },
      { productId: "p3", size: "42", qty: -4 },     // cantidad inválida -> se quita
      { productId: "p1", size: "38", qty: 1, price: 1 },  // un "precio" agregado a mano se ignora
    ]));
    const cart = createCart({ storageKey: "t:cart", catalog });
    assert.deepEqual(cart.restore(), { removed: 3, adjusted: 1 });
    assert.equal(cart.qtyOf("p1", "40"), 5);
    assert.equal(cart.count(), 6);
  });
  test("un JSON roto en el navegador no rompe la tienda", () => {
    localStorage.setItem("t:cart", "{roto");
    const cart = createCart({ storageKey: "t:cart", catalog });
    assert.deepEqual(cart.restore(), { removed: 0, adjusted: 0 });
    assert.equal(cart.count(), 0);
  });
});

// --- filtros ------------------------------------------------------------------------
describe("filtros", () => {
  test("la búsqueda tolera tildes y busca también por marca", () => {
    const f = createFilters(PRODUCTS);
    f.setQuery("air force");
    assert.deepEqual(f.results().map((p) => p.id), ["p1"]);
    f.setQuery("new balance 530");
    assert.deepEqual(f.results().map((p) => p.id), ["p5"]);
  });
  test("el talle 38 incluye ojotas 37/38 y solo cuenta talles con stock", () => {
    const f = createFilters(PRODUCTS);
    f.toggleSize("38");
    assert.deepEqual(f.results().map((p) => p.id), ["p1", "p4"]);
    f.clear();
    f.toggleSize("41");   // p2 tiene el 41 pero agotado
    assert.deepEqual(f.results().map((p) => p.id), []);
  });
  test("los filtros quedan en la dirección y se pueden leer de un link", () => {
    const f = createFilters(PRODUCTS);
    f.toggleBrand("Jordan");
    assert.equal(location.search, "?marca=Jordan");
    globalThis.location = new URL("http://localhost/index.html?marca=nike&talle=40,<script>");
    const g = createFilters(PRODUCTS);
    g.readUrl();
    assert.deepEqual([...g.state.brands], ["Nike"]);
    assert.deepEqual([...g.state.sizes], ["40"]);   // el valor raro se descarta
  });
});

// --- mensaje de WhatsApp ------------------------------------------------------------
describe("mensaje de WhatsApp", () => {
  const config = { name: "Tienda Test" };
  const pricing = createPricing(PRICES);
  const lines = [{ product: PRODUCTS[0], productId: "p1", size: "40", qty: 5 }];

  test("con elección: aclara la modalidad y su condición de cambio", () => {
    const channel = { label: "Revendedores", purchaseModes: { mayor: { message: "Compra POR MAYOR: sin cambio de talle." }, unidad: { message: "x" } } };
    const msg = buildOrderMessage({ config, channel, quote: pricing.quote(lines, "mayor") });
    assert.match(msg, /Air forcé 1 blancas \| Talle 40 \| x5 \| \$37\.000 c\/u = \$185\.000/);
    assert.match(msg, /\*TOTAL: \$185\.000\*/);
    assert.match(msg, /Compra POR MAYOR: sin cambio de talle\./);
    // Sin datos del cliente ni del envío: eso se habla en el chat.
    assert.doesNotMatch(msg, /Cliente|Envío:|Dirección/);
  });
  test("sin elección (tiendas de clientes): precio por mayor automático", () => {
    const msg = buildOrderMessage({ config, channel: { label: "Por mayor" }, quote: pricing.quote(lines, "mayor") });
    assert.match(msg, /Compra POR MAYOR \(5 o más pares surtidos\)\./);
  });
});
