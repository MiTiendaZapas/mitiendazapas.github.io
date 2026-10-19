/*
 * Programa de fondo del panel ("service worker"). Hace falta para que el celular deje
 * instalar el panel como aplicación (ícono en la pantalla de inicio).
 *
 * No guarda nada: todo se pide siempre a internet, así el panel siempre está al día.
 * Solo si no hay conexión, al abrir el panel muestra un aviso en vez de una página de error.
 */
const OFFLINE_PAGE = `<!DOCTYPE html><html lang="es-AR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Sin conexión</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:system-ui,sans-serif;background:#111113;color:#f4f4f5;text-align:center}
h1{font-size:22px;margin:0 0 8px}p{margin:0 0 20px;opacity:.8}button{min-height:48px;padding:0 20px;border:0;border-radius:12px;font:inherit;font-weight:600}</style>
</head><body><main><h1>Sin conexión</h1><p>Revisá tu internet y volvé a intentar.</p>
<button onclick="location.reload()">Volver a intentar</button></main></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Solo al abrir páginas del panel: si no hay internet, el aviso. Todo lo demás pasa directo.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() =>
    new Response(OFFLINE_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
