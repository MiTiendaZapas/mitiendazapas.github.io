/*
 * Punto único para analítica. Hoy no envía nada a ningún servicio.
 * Para sumar una herramienta (con aprobación previa), alcanza con
 * implementar el envío dentro de track() y cargar su script en el HTML.
 */
export function track(eventName, data = {}) {
  if (window.STORE_CONFIG?.debug) console.debug("[analytics]", eventName, data);
}

document.addEventListener("store:order-sent", (event) => track("order_sent", event.detail));
