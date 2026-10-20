// Catálogo público de una tienda con stock propio: GET /api/tienda/<tienda>/productos.json
// Los productos pausados no se muestran. Si la tienda tiene stock de Brasil, va junto
// (con los cambios que hizo el cliente modelo por modelo).
//
// La respuesta se guarda 20 segundos en la memoria de Cloudflare (auditoría 20/10): con muchas
// visitas juntas (o alguien pidiéndolo a propósito) no se vuelve a armar en cada una. Lo que el
// cliente guarda en su panel se ve en la tienda a los pocos segundos.
import { fail, isStoreId, json, publicCatalog, publicMixedCatalog, readBrStock, readCatalog } from "../../../../servidor/panel.js";

const SECONDS = 20;

export async function onRequestGet({ request, env, params, waitUntil }) {
  if (!isStoreId(params.tienda)) return fail("Tienda inexistente.", 404);
  // Una sola copia por tienda, sin importar lo que venga después del "?".
  const url = new URL(request.url);
  const cacheKey = new Request(`${url.origin}${url.pathname}`);
  const cache = globalThis.caches?.default;
  const cached = cache && await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set("Cache-Control", "no-cache");
    return new Response(cached.body, { status: cached.status, headers });
  }

  const { data } = await readCatalog(env, params.tienda);
  const body = data.stockBR ? publicMixedCatalog(data, await readBrStock(env, data.stockBR)) : publicCatalog(data);
  // El navegador siempre pregunta ("no-cache"); la memoria de Cloudflare guarda la respuesta unos segundos.
  const response = json(body, 200, { "Cache-Control": "no-cache" });
  if (cache) {
    const stored = new Response(response.clone().body, response);
    stored.headers.set("Cache-Control", `public, max-age=${SECONDS}`);
    waitUntil(cache.put(cacheKey, stored));
  }
  return response;
}
