// Control de TODO lo que entra a /api/app/... (la app de pedidos desde GitHub, solo stock de casa).
// Va aparte de /api/panel/ (que solo acepta pedidos de su propio sitio, con su cookie):
//   - Solo se aceptan pedidos de los orígenes de APP_ORIGINS (servidor/panel.js); con cualquier otro
//     Origin (o sin Origin) no se da permiso de CORS y se rechaza con 403.
//   - Responde el pedido previo del navegador (OPTIONS). Sin cookies: la app manda su token en
//     "Authorization" (lo revisa cada entrada), por eso no hay Allow-Credentials.
import { APP_ORIGINS, fail } from "../../../servidor/panel.js";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}

export async function onRequest(context) {
  const { request } = context;
  const origin = request.headers.get("Origin");
  if (!origin || !APP_ORIGINS.includes(origin)) {
    return fail("Pedido no permitido.", 403, { "Vary": "Origin" });
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return fail("Pedido no permitido.", 405, corsHeaders(origin));
  try {
    const response = await context.next();
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(corsHeaders(origin))) headers.set(name, value);
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return fail("Hubo un problema. Probá de nuevo.", 500, corsHeaders(origin));
  }
}
