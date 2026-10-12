// Control de TODO lo que entra al panel (/api/panel/...):
//   1) Los pedidos que cambian algo tienen que venir desde esta misma página (otra
//      página no puede mandarlos haciéndose pasar por el cliente).
//   2) Salvo "ingresar" y "salir", hace falta una sesión válida. La tienda sale de la sesión.
import { fail, readSession } from "../../../servidor/panel.js";

const PUBLIC = new Set(["/api/panel/ingresar", "/api/panel/salir"]);

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") {
    if (request.headers.get("Origin") !== url.origin) return fail("Pedido no permitido.", 403);
  }
  try {
    if (!PUBLIC.has(url.pathname)) {
      const session = await readSession(env, request);
      if (!session) return fail("Tenés que ingresar de nuevo.", 401);
      context.data.session = session;
    }
    const response = await context.next();
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return fail("Hubo un problema. Probá de nuevo.", 500);
  }
}
