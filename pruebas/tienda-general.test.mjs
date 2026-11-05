/*
 * Tienda que no vende calzado ni ropa (pirotecnia, perfumes...): productos "sin talles" ("Único")
 * no hablan de talles ni de pares. Correr desde plataforma-zapas:   node --test "pruebas/*.test.mjs"
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const { createPricing } = await import("../motor/js/pricing.js");
const { buildOrderMessage, productQueryLink } = await import("../motor/js/whatsapp.js");
const { stockStatus } = await import("../motor/js/interfaz/product-parts.js");
const { orderChangeText } = await import("../motor/js/stock-vivo.js");
const { shareText } = await import("../motor/js/interfaz/share.js");

const torta = { id: "m-1", name: "Torta 25t", category: "tortas", price: 12000, manual: true, sizes: [{ size: "Único", stock: 1 }], available: [{ size: "Único", stock: 1 }] };
const remera = { id: "m-2", name: "Remera", category: "remeras", price: 15000, manual: true, sizes: [{ size: "M", stock: 1 }, { size: "L", stock: 3 }], available: [{ size: "M", stock: 1 }] };
const dunk = { id: "vp-1", name: "Dunk panda", category: "zapatillas", price: 66000, sizes: [{ size: "40", stock: 1 }], available: [{ size: "40", stock: 1 }] };
const cartWith = (left) => ({ qtyOf: () => 0, maxFor: () => left });

test("el cartel de stock bajo dice unidad (no par) salvo en calzado", () => {
  assert.equal(stockStatus(cartWith(1), torta, "Único").hint, "¡Última unidad!");
  assert.equal(stockStatus(cartWith(1), remera, "M").hint, "¡Última unidad!");
  assert.equal(stockStatus(cartWith(1), dunk, "40").hint, "¡Último par!");
  assert.equal(stockStatus(cartWith(5), torta, "Único").hint, "Stock: 5");
});

test("producto sin talles que ya está todo en el pedido: no habla de talle", () => {
  assert.match(stockStatus({ qtyOf: () => 1, maxFor: () => 1 }, torta, "Único").hint, /de este producto$/);
  assert.match(stockStatus({ qtyOf: () => 1, maxFor: () => 1 }, remera, "M").hint, /de este talle$/);
});

test("el pedido por WhatsApp no escribe el talle de un producto sin talles", () => {
  const pricing = createPricing({ wholesale: false, unit: { default: 1, rules: [] } });
  const config = { manualStore: "demo", orderShippingNote: false, categories: { tortas: "Tortas", remeras: "Remeras" } };
  const quote = pricing.quote([
    { product: torta, productId: torta.id, size: "Único", qty: 2 },
    { product: remera, productId: remera.id, size: "M", qty: 1 },
  ], "unidad");
  const text = buildOrderMessage({ config, channel: {}, quote });
  assert.ok(text.includes("Torta 25t $12.000 x2 = $24.000"), text);
  assert.ok(text.includes("Remera (M) $15.000"), text);
  assert.ok(!text.includes("Único"), text);
});

test("la consulta de un producto sin talles no dice 'en talle Único'", () => {
  const config = { contact: { whatsappQueries: "5491100000000" } };
  assert.ok(!decodeURIComponent(productQueryLink(config, torta, "Único")).includes("talle"));
  assert.ok(decodeURIComponent(productQueryLink(config, remera, "M")).includes("en talle M"));
});

test("aviso de stock del pedido: sin talle en productos sin talles", () => {
  assert.equal(orderChangeText([{ product: torta, size: "Único", qty: 0 }]), "Se agotó Torta 25t: lo sacamos de tu pedido.");
  assert.equal(orderChangeText([{ product: torta, size: "Único", qty: 2 }]), "De Torta 25t quedan 2: ajustamos tu pedido.");
  assert.equal(orderChangeText([{ product: remera, size: "M", qty: 0 }]), "Se agotó el talle M de Remera: lo sacamos de tu pedido.");
});

test("compartir fotos: no lista 'Talles disponibles: Único'", () => {
  assert.equal(shareText(torta), "Torta 25t");
  assert.equal(shareText(remera), "Remera\nTalles disponibles: M, L");
});
