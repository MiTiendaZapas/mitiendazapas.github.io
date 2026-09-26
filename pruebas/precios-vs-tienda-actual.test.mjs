/*
 * Control de migración: compara, modelo por modelo, los precios de la tienda
 * nueva con las funciones de precio de la tienda actual (TiendaZapasOficial).
 * Solo LEE la tienda actual. Si no la encuentra, la prueba se saltea.
 *
 * Tiene sentido mientras convivan las dos tiendas: si después se cambian
 * precios a propósito en la tienda nueva, esta prueba va a marcar diferencias.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const legacy = path.resolve(root, "../TiendaZapasOficial");
const { createPricing } = await import("../motor/js/pricing.js");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalogo/productos.json"), "utf8")).products;

function legacyPriceFunctions(file) {
  // Solo se ejecutan las funciones de precio (el resto del archivo usa la página).
  const source = fs.readFileSync(file, "utf8");
  const context = {};
  vm.runInNewContext(`${source.slice(0, source.indexOf("function procesarTallesOjota"))}
    this.unit = obtenerPrecioMinorista; this.wholesale = obtenerPrecioMayorista;`, context);
  return context;
}

const cases = [
  ["L.A IMP revendedores", "tienda.js", "precios-mayorista.json"],
  ["L.A IMP minorista", "minorista.js", "precios-minorista.json"],
  ["ClienteA revendedores", "revendedores/clienteA/tienda.js", "clientes/cliente-a/precios-mayorista.json"],
  ["ClienteA minorista", "revendedores/clienteA/minorista.js", "clientes/cliente-a/precios-minorista.json"],
];

// Cambios de precio hechos a propósito en la tienda nueva (precio por mayor esperado).
// 26/09: las Samba tejida y brillitos pasan a $42.000 por mayor en L.A IMP.
const SAMBAS_42 = { "Samba tejida": 42000, "Samba brillitos": 42000 };
const intentional = { "L.A IMP revendedores": SAMBAS_42, "L.A IMP minorista": SAMBAS_42 };

for (const [name, legacyFile, pricesFile] of cases) {
  test(`${name}: mismos precios que la tienda actual`, { skip: !fs.existsSync(path.join(legacy, legacyFile)) && "no se encontró la tienda actual" }, () => {
    const old = legacyPriceFunctions(path.join(legacy, legacyFile));
    const pricing = createPricing(JSON.parse(fs.readFileSync(path.join(root, pricesFile), "utf8")));
    const differences = catalog.flatMap((product) => {
      const now = pricing.forProduct(product);
      const nowWholesale = now.wholesale ?? now.unit;
      const before = [old.unit(product.name), intentional[name]?.[product.name] ?? old.wholesale(product.name)];
      return before[0] === now.unit && before[1] === nowWholesale
        ? []
        : [`${product.name}: antes ${before.join("/")} ahora ${now.unit}/${nowWholesale}`];
    });
    assert.deepEqual(differences, []);
  });
}
