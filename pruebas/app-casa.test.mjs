/*
 * Pruebas de la entrada de la app de pedidos desde GitHub (/api/app/...): CORS solo para
 * mitiendazapas.github.io, token propio que no se cruza con la cookie del panel, y solo stock de casa.
 * Sin internet: el depósito se simula en memoria.
 * Correr desde la carpeta plataforma-zapas:   node --test "pruebas/*.test.mjs"
 */
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

const panel = await import("../servidor/panel.js");
const { onRequest: appMiddleware } = await import("../functions/api/app/_middleware.js");
const { onRequestPost: appIngresar } = await import("../functions/api/app/ingresar.js");
const { onRequestPost: appCasa } = await import("../functions/api/app/casa.js");
const { onRequest: panelMiddleware } = await import("../functions/api/panel/_middleware.js");

const GITHUB = "https://mitiendazapas.github.io";
const SECRET = "una-clave-de-prueba-de-mas-de-32-letras-123";

/** Depósito en memoria con lo mínimo de R2 que usa el servidor (get / put con etag / delete). */
function bucket(initial = {}) {
  const items = new Map(Object.entries(initial).map(([k, v]) => [k, { text: JSON.stringify(v), etag: "e0" }]));
  let n = 0;
  return {
    items,
    async get(key) {
      const item = items.get(key);
      return item ? { etag: item.etag, json: async () => JSON.parse(item.text), text: async () => item.text } : null;
    },
    async put(key, value, options = {}) {
      const current = items.get(key);
      if (options.onlyIf?.etagMatches && current?.etag !== options.onlyIf.etagMatches) return null;
      items.set(key, { text: typeof value === "string" ? value : JSON.stringify(value), etag: `e${++n}` });
      return {};
    },
    async delete(keys) { for (const key of [keys].flat()) items.delete(key); },
  };
}

let env;
beforeEach(async () => {
  const salt = "c2FsLWRlLXBydWViYQ==";
  const user = { usuario: "socio", tienda: "laimp", salt, iterations: 1000, hash: await panel.hashPassword("clave-buena", salt, 1000), creado: "2026-10-20T00:00:00Z" };
  env = {
    PANEL_SECRET: SECRET,
    PRIVADO: bucket({
      "usuarios/socio.json": user,
      "tiendas/laimp/productos.json": { version: 1, store: "laimp", categories: {}, products: [
        { id: "m-1", slug: "remera", name: "Remera", category: "zapatillas", sizes: [{ size: "40", stock: 2 }], images: [] },
      ], stockBR: { casa: false, g5: true }, br: {} },
    }),
    CATALOGO: bucket({ "productos.json": { products: [] }, "productos-g5.json": { products: [] } }),
  };
});

const req = (url, { origin = GITHUB, method = "POST", body, token, cookie } = {}) => new Request(`https://mitiendastock.com${url}`, {
  method,
  headers: { ...(origin ? { Origin: origin } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}),
    ...(body ? { "Content-Type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const throughApp = (request, handler) => appMiddleware({ request, env, data: {}, next: () => handler({ request, env, data: {} }) });
async function login(clave = "clave-buena") {
  const response = await throughApp(req("/api/app/ingresar", { body: { usuario: "socio", clave } }), appIngresar);
  return { response, body: await response.json() };
}

describe("app de pedidos desde GitHub (/api/app)", () => {
  test("otro origen (o sin origen): 403 y sin permiso de CORS", async () => {
    for (const origin of ["https://otra-pagina.com", "https://mitiendazapas.github.io.malo.com", null]) {
      const response = await throughApp(req("/api/app/ingresar", { origin, body: { usuario: "socio", clave: "clave-buena" } }), appIngresar);
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
    }
  });

  test("pedido previo (OPTIONS) de GitHub: permiso solo para ese origen, sin cookies", async () => {
    const response = await throughApp(req("/api/app/casa", { method: "OPTIONS" }), () => { throw new Error("no debería llegar"); });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), GITHUB);
    assert.equal(response.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
    assert.equal(response.headers.get("Access-Control-Allow-Headers"), "Content-Type, Authorization");
    assert.equal(response.headers.get("Access-Control-Allow-Credentials"), null);
    assert.equal(response.headers.get("Vary"), "Origin");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  });

  test("ingresar: con la clave buena devuelve el token (no una cookie); con la mala, 401", async () => {
    const good = await login();
    assert.equal(good.response.status, 200);
    assert.equal(good.response.headers.get("Set-Cookie"), null);
    assert.equal(good.response.headers.get("Access-Control-Allow-Origin"), GITHUB);
    assert.equal(good.body.ok, true);
    assert.equal(good.body.tienda, "laimp");
    assert.ok(good.body.token && good.body.expira > Date.now() + 29 * 86_400_000);
    const bad = await login("clave-mala");
    assert.equal(bad.response.status, 401);
    assert.ok(bad.body.error);
  });

  test("con el token se ajusta el stock de casa y responde igual que /api/panel/casa", async () => {
    const { body: { token } } = await login();
    const response = await throughApp(req("/api/app/casa", { token, body: { accion: "ajustar", id: "p:m-1", talle: "40", delta: 1 } }), appCasa);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, antes: 2, despues: 3, nombre: "Remera", id: "p:m-1", talle: "40" });
  });

  test("sin token: el stock de casa de L.A IMP, de a un par por vez (pedido del usuario, 24/10)", async () => {
    const one = await throughApp(req("/api/app/casa", { body: { accion: "ajustar", id: "p:m-1", talle: "40", delta: 1 } }), appCasa);
    assert.equal(one.status, 200);
    assert.deepEqual(await one.json(), { ok: true, antes: 2, despues: 3, nombre: "Remera", id: "p:m-1", talle: "40" });
    const many = await throughApp(req("/api/app/casa", { body: { accion: "ajustar", id: "p:m-1", talle: "40", delta: 5 } }), appCasa);
    assert.equal(many.status, 400);
    assert.equal((await many.json()).error, "Desde la app se suma o se resta de a un par por vez.");
    const sold = await throughApp(req("/api/app/casa", { body: { accion: "descontar", pedido: "pedido-1", id: "p:m-1", talle: "40" } }), appCasa);
    assert.equal((await sold.json()).despues, 2);
  });

  test("con un token válido se puede ajustar más de un par", async () => {
    const { body: { token } } = await login();
    const response = await throughApp(req("/api/app/casa", { token, body: { accion: "ajustar", id: "p:m-1", talle: "40", delta: 3 } }), appCasa);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).despues, 5);
  });

  test("un token alterado o vencido no da permisos de más: cuenta como sin token", async () => {
    const { body: { token } } = await login();
    const [payload, signature] = token.split(".");
    const content = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    const forged = btoa(JSON.stringify({ ...content, t: "otra" })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const expired = await panel.createAppToken(env, { usuario: "socio", tienda: "laimp", v: content.v });
    const realNow = Date.now;
    Date.now = () => realNow() + 31 * 86_400_000;   // 31 días después
    try {
      const late = await throughApp(req("/api/app/casa", { token: expired.token, body: { accion: "ajustar", id: "p:m-1", talle: "40", delta: 5 } }), appCasa);
      assert.equal(late.status, 400);
    } finally {
      Date.now = realNow;
    }
    for (const bad of [`${forged}.${signature}`, `${payload}.AAAA`, "no-es-un-token"]) {
      const many = await throughApp(req("/api/app/casa", { token: bad, body: { accion: "ajustar", id: "p:m-1", talle: "40", delta: 5 } }), appCasa);
      assert.equal(many.status, 400);
    }
    // El token alterado decía otra tienda: igual se toca solo L.A IMP.
    const one = await throughApp(req("/api/app/casa", { token: `${forged}.${signature}`, body: { accion: "ajustar", id: "p:m-1", talle: "40", delta: 1 } }), appCasa);
    assert.equal((await one.json()).despues, 3);
    assert.equal(JSON.parse(env.PRIVADO.items.get("tiendas/laimp/productos.json").text).products[0].sizes[0].stock, 3);
  });

  test("la cookie del panel no da permisos en /api/app/casa, y el token de la app no sirve en /api/panel", async () => {
    const result = await panel.checkLogin(env, "socio", "clave-buena");
    const cookie = (await panel.createSession(env, result)).split(";")[0];          // "panel=<token del panel>"
    const panelToken = cookie.slice("panel=".length);
    const withPanelToken = await throughApp(req("/api/app/casa", { token: panelToken, cookie, body: { accion: "ajustar", id: "p:m-1", talle: "40", delta: 5 } }), appCasa);
    assert.equal(withPanelToken.status, 400);

    const { body: { token } } = await login();
    const panelRequest = req("/api/panel/casa", { origin: "https://mitiendastock.com", cookie: `panel=${token}`, token, body: { accion: "ajustar", id: "p:m-1", talle: "40", delta: 1 } });
    const response = await panelMiddleware({ request: panelRequest, env, data: {}, next: () => { throw new Error("no debería llegar"); } });
    assert.equal(response.status, 401);
    // La sesión del panel de verdad sigue funcionando.
    assert.deepEqual(await panel.readSession(env, req("/x", { cookie })), { usuario: "socio", tienda: "laimp", v: result.v });
  });

  test("al cambiar la clave (o cerrar sesiones en todos), el token pierde sus permisos", async () => {
    const { body: { token } } = await login();
    await panel.closeAllSessions(env, "socio");
    const response = await throughApp(req("/api/app/casa", { token, body: { accion: "ajustar", id: "p:m-1", talle: "40", delta: 5 } }), appCasa);
    assert.equal(response.status, 400);
  });

  test("solo acciones de stock de casa: cualquier otra se rechaza", async () => {
    const { body: { token } } = await login();
    for (const [accion, withToken] of [["precios", true], ["borrar", true], ["productos", false], [undefined, false]]) {
      const response = await throughApp(req("/api/app/casa", { token: withToken ? token : null, body: { accion, id: "p:m-1", talle: "40", delta: 1 } }), appCasa);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, "Acción inválida.");
    }
  });
});

describe("ojotas de casa desde la app", () => {
  test("al sumarle pares a una ojota del proveedor queda marcada, y sigue marcada al llegar a 0", async () => {
    env.CATALOGO = bucket({ "productos.json": { products: [
      { id: "vp-oj", slug: "ojotas-total-black", name: "Ojotas total black", category: "ojotas", sizes: [{ size: "39/40", stock: 9 }], images: [] },
    ] }, "productos-g5.json": { products: [] } });
    const read = () => JSON.parse(env.PRIVADO.items.get("tiendas/laimp/productos.json").text).br["vp-oj"];
    const send = (delta) => throughApp(req("/api/app/casa", { body: { accion: "ajustar", id: "b:vp-oj", talle: "39/40", delta } }), appCasa);
    assert.equal((await (await send(1)).json()).despues, 1);
    assert.equal(read().soloCasa, true);
    assert.equal((await (await send(-1)).json()).despues, 0);
    assert.deepEqual(read(), { soloCasa: true });
    const { house } = await panel.readBrStock(env);
    assert.ok(house.ids.has("vp-oj"));
  });
});
