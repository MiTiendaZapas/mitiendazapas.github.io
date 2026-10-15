/*
 * Orden de los talles (motor/js/talles.js): números, después ropa en su orden real, después el resto.
 * Correr desde la carpeta plataforma-zapas:   node --test "pruebas/*.test.mjs"
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const { sortSizes } = await import("../motor/js/talles.js");
const order = (list) => sortSizes(list);

test("ropa: XS antes que S y XXL después de XL, sin importar cómo se cargaron", () => {
  assert.deepEqual(order(["S", "M", "L", "XL", "XS", "XXL"]), ["XS", "S", "M", "L", "XL", "XXL"]);
  assert.deepEqual(order(["xxl", "s", "XS", "m"]), ["XS", "s", "m", "xxl"]);
  assert.deepEqual(order(["3XL", "XL", "2XL", "XXS"]), ["XXS", "XL", "2XL", "3XL"]);
});

test("calzado y ojotas: de menor a mayor, con medios talles", () => {
  assert.deepEqual(order(["44", "35", "40.5", "40", "36"]), ["35", "36", "40", "40.5", "44"]);
  assert.deepEqual(order(["41/42", "37/38", "43/44", "39/40"]), ["37/38", "39/40", "41/42", "43/44"]);
});

test("mezclas: números, después letras, después otros (Único)", () => {
  assert.deepEqual(order(["Único", "M", "38", "S"]), ["38", "S", "M", "Único"]);
  assert.deepEqual(order([{ size: "L", stock: 1 }, { size: "XS", stock: 2 }]).map((s) => s.size), ["XS", "L"]);
});
