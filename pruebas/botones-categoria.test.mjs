/*
 * Categorías del cliente como botón arriba de la tienda (junto a Calidad BR / G5), apagado por defecto.
 * Correr desde la carpeta plataforma-zapas:   node --test "pruebas/*.test.mjs"
 */
import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.location = new URL("http://localhost/index.html");
globalThis.history = { state: null, replaceState: (_s, _t, url) => { globalThis.location = new URL(url); } };

const { createFilters } = await import("../motor/js/filters.js");
const { cleanSettings, cleanTabCategories } = await import("../servidor/panel.js");

const p = (id, category, brand = "") => ({ id, slug: id, name: id, brand, category, sizes: [{ size: "40", stock: 1 }], available: [{ size: "40", stock: 1 }], images: [] });
const WITH_G5 = [p("a", "zapatillas", "Nike"), p("b", "zapatillas", "Adidas"), p("c", "g5", "Nike"), p("n1", "ropa-nin"), p("n2", "ropa-nin"), p("r1", "remeras")];
const NO_G5 = [p("t1", "tortas"), p("t2", "tortas"), p("l1", "luces"), p("c1", "canas")];
const ids = (filters) => filters.results().map((x) => x.id).sort().join(",");

test("apagado por defecto: nada cambia (la ropa sigue en las dos calidades)", () => {
  const f = createFilters(WITH_G5);
  assert.deepEqual(f.qualities().map((q) => q.value), ["br", "g5"]);
  assert.equal(ids(f), "a,b,n1,n2,r1");
  f.setQuality("g5");
  assert.equal(ids(f), "c,n1,n2,r1");
});

test("con G5: la categoría con botón sale aparte y no se mezcla en BR ni en G5", () => {
  const f = createFilters(WITH_G5, { tabCategories: ["ropa-nin"] });
  assert.deepEqual(f.qualities().map((q) => [q.value, q.count]), [["br", 2], ["g5", 1], ["cat:ropa-nin", 2]]);
  assert.equal(ids(f), "a,b,r1");
  f.setQuality("g5");
  assert.equal(ids(f), "c,r1");
  f.setQuality("cat:ropa-nin");
  assert.equal(ids(f), "n1,n2");
  assert.equal(f.total(), 2);
  assert.equal(f.qualities().find((q) => q.selected).value, "cat:ropa-nin");
});

test("sin G5: 'Todos' más las categorías elegidas", () => {
  const f = createFilters(NO_G5, { tabCategories: ["tortas", "luces"] });
  assert.deepEqual(f.qualities().map((q) => [q.value, q.count]), [["", 4], ["cat:tortas", 2], ["cat:luces", 1]]);
  assert.equal(ids(f), "c1,l1,t1,t2");
  f.setQuality("cat:luces");
  assert.equal(ids(f), "l1");
  f.setQuality("");
  assert.equal(ids(f), "c1,l1,t1,t2");
});

test("sin G5 y sin categorías elegidas: no hay botones", () => {
  assert.deepEqual(createFilters(NO_G5).qualities(), []);
  assert.deepEqual(createFilters(NO_G5, { tabCategories: ["no-existe"] }).qualities(), []);
});

test("un botón desconocido no cambia nada", () => {
  const f = createFilters(WITH_G5, { tabCategories: ["ropa-nin"] });
  f.setQuality("cat:inventada");
  assert.equal(f.state.quality, "br");
});

test("el botón queda en la dirección y se recupera al abrir el link", () => {
  const f = createFilters(WITH_G5, { tabCategories: ["ropa-nin"] });
  f.setQuality("cat:ropa-nin");
  assert.match(location.search, /calidad=cat%3Aropa-nin/);
  const again = createFilters(WITH_G5, { tabCategories: ["ropa-nin"] });
  again.readUrl();
  assert.equal(again.state.quality, "cat:ropa-nin");
  // Si la categoría ya no es botón, el link vuelve a Calidad BR.
  const off = createFilters(WITH_G5);
  off.readUrl();
  assert.equal(off.state.quality, "br");
  f.setQuality("br");
});

test("ajuste del panel: hasta 3 códigos válidos, sin repetir; apagado por defecto", () => {
  assert.deepEqual(cleanTabCategories(undefined), []);
  assert.deepEqual(cleanTabCategories(["a", "a", "B!", 5, "b", "c", "d"]), ["a", "b", "c"]);
  assert.deepEqual(cleanSettings({ name: "Tienda" }).tabCategories, []);
  assert.deepEqual(cleanSettings({ name: "Tienda", tabCategories: ["ropa-nin"] }).tabCategories, ["ropa-nin"]);
});
