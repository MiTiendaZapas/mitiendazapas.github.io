/*
 * Mensaje del pedido en tiendas con panel: saludo propio, productos agrupados por categoría
 * y texto al final. Correr desde la carpeta plataforma-zapas:   node --test "pruebas/*.test.mjs"
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const { createPricing } = await import("../motor/js/pricing.js");
const { buildOrderMessage } = await import("../motor/js/whatsapp.js");

const product = (id, name, category, price) => ({ id, name, category, price, manual: true, sizes: [], available: [] });
const remera = product("m-1", "Remera básica blanca", "remeras", 15000);
const buzo = product("m-2", "Buzo canguro gris", "buzos", 32000);
const dunk = { id: "vp-1", name: "Dunk panda", category: "zapatillas", price: null, sizes: [], available: [] };
const config = {
  manualStore: "demo", orderShippingNote: false,
  categories: { zapatillas: "Zapatillas", remeras: "Remeras", buzos: "Buzos" },
  orderGreeting: "¡Hola Flor! Quiero encargar esto:",
  orderFooter: "Pago por transferencia o efectivo. Envíos a todo el país.",
};
const pricing = createPricing({ wholesale: false, unit: { default: 66000, rules: [] } });
const message = (cfg, lines) => buildOrderMessage({ config: cfg, channel: {}, quote: pricing.quote(lines, "unidad") });

test("pedido con 3 categorías: cada una con su título, en el orden de la tienda", () => {
  const text = message(config, [
    { product: remera, productId: remera.id, size: "M", qty: 2 },
    { product: dunk, productId: dunk.id, size: "40", qty: 1 },
    { product: buzo, productId: buzo.id, size: "L", qty: 1 },
    { product: remera, productId: remera.id, size: "L", qty: 1 },
  ]);
  console.log(`\n${text}\n`);
  assert.equal(text, [
    "¡Hola Flor! Quiero encargar esto:", "",
    "ZAPATILLAS", "Dunk panda (40) $66.000", "",
    "REMERAS", "Remera básica blanca (M) $15.000 x2 = $30.000", "Remera básica blanca (L) $15.000", "",
    "BUZOS", "Buzo canguro gris (L) $32.000", "",
    "Total: 5 productos - $143.000", "",
    "Pago por transferencia o efectivo. Envíos a todo el país.",
  ].join("\n"));
});

test("una sola categoría o sin textos propios: como siempre", () => {
  const text = message({ ...config, orderGreeting: "", orderFooter: "" }, [{ product: remera, productId: remera.id, size: "M", qty: 1 }]);
  assert.equal(text, "¡Hola! Quiero hacer el siguiente pedido del catálogo:\n\nRemera básica blanca (M) $15.000\n\nTotal: 1 producto - $15.000");
});
