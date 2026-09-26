/* Notificaciones breves (por ejemplo, "Agregado a tu pedido"). */
import { escapeHtml } from "../utils.js";
import { icon } from "./icons.js";

const MAX_VISIBLE = 2;

export function createToaster(region) {
  function dismiss(toast) {
    if (!toast.isConnected || toast.classList.contains("is-leaving")) return;
    toast.classList.add("is-leaving");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400);   // por si la animación está desactivada
  }

  return {
    show({ title, text = "", thumb = null, variant = "success", action = null, duration = 3200 }) {
      const toast = document.createElement("div");
      toast.className = `toast toast--${variant}`;
      toast.innerHTML = `
        ${thumb
          ? `<img class="toast__thumb" src="${escapeHtml(thumb)}" alt="">`
          : `<span class="toast__icon">${icon(variant === "warning" ? "alert" : "check")}</span>`}
        <div class="toast__body">
          <p class="toast__title">${escapeHtml(title)}</p>
          ${text ? `<p class="toast__text">${escapeHtml(text)}</p>` : ""}
        </div>
        ${action ? `<button class="btn btn--outline toast__action" type="button">${escapeHtml(action.label)}</button>` : ""}`;
      if (action) {
        toast.querySelector(".toast__action").addEventListener("click", () => {
          dismiss(toast);
          action.onClick();
        });
      }
      region.append(toast);
      while (region.children.length > MAX_VISIBLE) region.firstElementChild.remove();

      let timer = setTimeout(() => dismiss(toast), duration);
      // Si el cliente apoya el mouse o el foco, no se va mientras la lee.
      toast.addEventListener("pointerenter", () => clearTimeout(timer));
      toast.addEventListener("pointerleave", () => { timer = setTimeout(() => dismiss(toast), 1500); });
      return toast;
    },
  };
}
