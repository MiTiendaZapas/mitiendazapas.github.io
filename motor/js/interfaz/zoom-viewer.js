/*
 * Visor de fotos a pantalla completa con zoom y paneo (sin librerías).
 *   Celular: doble toque o pellizco para ampliar, arrastrar para mover,
 *            deslizar hacia los costados para cambiar de foto.
 *   Computadora: doble clic o rueda del mouse para ampliar, arrastrar para
 *                mover, flechas del teclado para cambiar de foto.
 */
import { icon } from "./icons.js";

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const SWIPE_DISTANCE = 60;
const DOUBLE_TAP_MS = 300;

export function createZoomViewer(host) {
  const root = document.createElement("div");
  root.className = "zoom";
  root.hidden = true;
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Foto ampliada");
  root.innerHTML = `
    <div class="zoom__stage" data-stage>
      <img class="zoom__img" data-img alt="" draggable="false">
    </div>
    <button class="zoom__btn zoom__close" type="button" data-close aria-label="Cerrar foto ampliada">${icon("close")}</button>
    <button class="zoom__btn zoom__prev" type="button" data-prev aria-label="Foto anterior">${icon("chevronLeft")}</button>
    <button class="zoom__btn zoom__next" type="button" data-next aria-label="Foto siguiente">${icon("chevronRight")}</button>
    <p class="zoom__counter" data-counter aria-live="polite"></p>
    <p class="zoom__hint">Tocá dos veces o pellizcá para ampliar</p>`;
  host.append(root);

  const stage = root.querySelector("[data-stage]");
  const img = root.querySelector("[data-img]");
  const counter = root.querySelector("[data-counter]");
  let images = [];
  let index = 0;
  let altText = "";
  let scale = 1;
  let x = 0;
  let y = 0;
  let returnFocus = null;
  const pointers = new Map();
  let gesture = null;
  let lastTap = 0;

  function apply(animate = false) {
    img.style.transition = animate ? "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
    img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    root.classList.toggle("is-zoomed", scale > 1.01);
  }

  /** Evita que la foto se pueda arrastrar fuera de la pantalla. */
  function clamp() {
    const maxX = Math.max((img.offsetWidth * scale - stage.clientWidth) / 2, 0);
    const maxY = Math.max((img.offsetHeight * scale - stage.clientHeight) / 2, 0);
    x = Math.min(Math.max(x, -maxX), maxX);
    y = Math.min(Math.max(y, -maxY), maxY);
  }

  /** Amplía manteniendo quieto el punto (px, py) de la pantalla. */
  function zoomAt(nextScale, px, py, animate = false) {
    const rect = stage.getBoundingClientRect();
    const cx = px - rect.left - rect.width / 2;
    const cy = py - rect.top - rect.height / 2;
    const clamped = Math.min(Math.max(nextScale, 1), MAX_SCALE);
    const ratio = clamped / scale;
    x = cx - (cx - x) * ratio;
    y = cy - (cy - y) * ratio;
    scale = clamped;
    if (scale === 1) { x = 0; y = 0; }
    clamp();
    apply(animate);
  }

  function reset() {
    scale = 1; x = 0; y = 0;
    apply();
  }

  function show(i) {
    index = (i + images.length) % images.length;
    reset();
    img.src = images[index].lg;
    img.alt = `${altText}, foto ${index + 1} de ${images.length}`;
    counter.textContent = images.length > 1 ? `${index + 1} / ${images.length}` : "";
    root.querySelector("[data-prev]").hidden = images.length < 2;
    root.querySelector("[data-next]").hidden = images.length < 2;
  }

  function open(list, startIndex, alt) {
    images = list;
    altText = alt;
    returnFocus = document.activeElement;
    root.hidden = false;
    show(startIndex);
    root.querySelector("[data-close]").focus();
  }

  function close() {
    root.hidden = true;
    returnFocus?.focus?.();
  }

  // --- gestos --------------------------------------------------------------
  stage.addEventListener("pointerdown", (event) => {
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { type: "pinch", distance: Math.hypot(a.x - b.x, a.y - b.y), scale };
    } else if (pointers.size === 1) {
      gesture = { type: "drag", startX: event.clientX, startY: event.clientY, x, y, moved: false };
    }
  });

  stage.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture.type === "pinch" && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(gesture.scale * (distance / gesture.distance), (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (gesture.type === "drag") {
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (Math.abs(dx) + Math.abs(dy) > 6) gesture.moved = true;
      if (scale > 1) {
        x = gesture.x + dx;
        y = gesture.y + dy;
        clamp();
        apply();
      } else {
        img.style.transition = "none";
        img.style.transform = `translateX(${dx}px)`;   // se ve cómo se desliza la foto
      }
    }
  });

  function endPointer(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (gesture?.type === "drag" && pointers.size === 0) {
      const dx = event.clientX - gesture.startX;
      if (scale <= 1 && Math.abs(dx) > SWIPE_DISTANCE && images.length > 1) {
        show(index + (dx < 0 ? 1 : -1));
      } else if (scale <= 1) {
        apply(true);   // vuelve a su lugar
      }
      if (!gesture.moved) handleTap(event);
    }
    if (pointers.size < 2 && gesture?.type === "pinch") {
      gesture = null;
      if (scale < 1.05) { reset(); apply(true); }
    }
    if (pointers.size === 0) gesture = null;
  }
  stage.addEventListener("pointerup", endPointer);
  stage.addEventListener("pointercancel", endPointer);

  function handleTap(event) {
    const now = Date.now();
    if (now - lastTap < DOUBLE_TAP_MS) {
      zoomAt(scale > 1 ? 1 : DOUBLE_TAP_SCALE, event.clientX, event.clientY, true);
      lastTap = 0;
    } else {
      lastTap = now;
    }
  }

  stage.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomAt(scale * (1 - event.deltaY * 0.0015), event.clientX, event.clientY);
  }, { passive: false });

  root.querySelector("[data-close]").addEventListener("click", close);
  root.querySelector("[data-prev]").addEventListener("click", () => show(index - 1));
  root.querySelector("[data-next]").addEventListener("click", () => show(index + 1));
  root.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") show(index - 1);
    if (event.key === "ArrowRight") show(index + 1);
  });
  img.addEventListener("error", () => { img.alt = `${altText}: foto no disponible`; });

  return {
    open,
    close,
    get isOpen() { return !root.hidden; },
  };
}
