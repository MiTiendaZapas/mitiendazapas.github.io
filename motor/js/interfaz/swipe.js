/*
 * Deslizar fotos con el dedo, sin que cambien por accidente.
 *
 * Con el scroll nativo del navegador la foto se movía apenas se apoyaba el
 * dedo. Acá la foto cambia solo con un gesto claro hacia el costado:
 *   - primero se espera a que el dedo se mueva unos píxeles y se decide la
 *     dirección: si va más hacia arriba/abajo, se deja hacer scroll a la página;
 *   - y cambia de foto si se arrastró buena parte del ancho, o si fue un
 *     deslizamiento rápido. Si no, la foto vuelve a su lugar.
 */
export const SWIPE = {
  LOCK_DISTANCE: 10,     // px que se mueve el dedo antes de decidir la dirección
  DIRECTION_RATIO: 1.3,  // para ser "hacia el costado", lo horizontal supera a lo vertical en esta proporción
  CHANGE_FRACTION: 0.22, // arrastrar el 22% del ancho cambia de foto...
  FLICK_SPEED: 0.45,     // ...o un deslizamiento rápido (px por milisegundo)...
  FLICK_MIN: 40,         // ...de por lo menos 40 px
};

/** Dirección del gesto una vez que el dedo se movió lo suficiente: "x", "y" o null (todavía no se sabe). */
export function swipeAxis(dx, dy) {
  if (Math.abs(dx) < SWIPE.LOCK_DISTANCE && Math.abs(dy) < SWIPE.LOCK_DISTANCE) return null;
  return Math.abs(dx) > Math.abs(dy) * SWIPE.DIRECTION_RATIO ? "x" : "y";
}

/** -1 (foto anterior), 1 (siguiente) o 0 (se queda), según cuánto y qué tan rápido se deslizó. */
export function swipeResult(dx, elapsedMs, width) {
  const fast = Math.abs(dx) >= SWIPE.FLICK_MIN && Math.abs(dx) / Math.max(elapsedMs, 1) >= SWIPE.FLICK_SPEED;
  if (Math.abs(dx) >= width * SWIPE.CHANGE_FRACTION || fast) return dx < 0 ? 1 : -1;
  return 0;
}

/**
 * Conecta el gesto a un elemento.
 *   onMove(dx): mientras se arrastra hacia el costado (para que la foto siga al dedo).
 *   onEnd(step): al soltar; step es -1, 0 o 1.
 * Después de un deslizamiento se anula el "click", así no se abre la foto ampliada sin querer.
 */
export function attachSwipe(element, { onMove, onEnd }) {
  let start = null;

  element.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button > 0) return;
    start = { x: event.clientX, y: event.clientY, time: performance.now(), axis: null, id: event.pointerId };
  });

  element.addEventListener("pointermove", (event) => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.axis) {
      start.axis = swipeAxis(dx, dy);
      if (start.axis === "x") element.setPointerCapture?.(event.pointerId);
    }
    if (start.axis === "x") onMove(dx);
  });

  function finish(event, cancelled) {
    if (!start || event.pointerId !== start.id) return;
    const { axis } = start;
    const dx = event.clientX - start.x;
    const elapsed = performance.now() - start.time;
    start = null;
    if (axis !== "x") return;
    onEnd(cancelled ? 0 : swipeResult(dx, elapsed, element.clientWidth));
    // El click que el navegador dispara al soltar no debe abrir la foto ampliada.
    // Si ese click no llega, el bloqueo se quita enseguida para no frenar el próximo toque.
    const block = (e) => { e.stopPropagation(); e.preventDefault(); };
    element.addEventListener("click", block, { capture: true, once: true });
    setTimeout(() => element.removeEventListener("click", block, { capture: true }), 350);
  }
  element.addEventListener("pointerup", (event) => finish(event, false));
  element.addEventListener("pointercancel", (event) => finish(event, true));
}
