/*
 * "Nuevos ingresos": fila en la portada de la tienda con los productos que el cliente marcó como
 * nuevo ingreso en su panel (se ven como nuevos 30 días). Los más nuevos primero.
 * Usa el mismo diseño que "Últimos pares".
 */
import { escapeHtml, money } from "../utils.js";
import { isNewArrival } from "../catalog.js";

const MAX_CARDS = 12;

export function renderNewArrivals(root, { products, pricing }) {
  if (!root) return;
  const fresh = products
    .filter((p) => isNewArrival(p) && p.images.length && p.available.length)
    .sort((a, b) => Date.parse(b.newSince) - Date.parse(a.newSince));
  if (!fresh.length) {
    root.hidden = true;
    return;
  }
  root.hidden = false;
  root.innerHTML = `
    <div class="last-pairs__head">
      <h2 class="last-pairs__title" id="new-arrivals-title">Nuevos ingresos</h2>
      <p class="last-pairs__text">Lo último que llegó a la tienda.</p>
    </div>
    <ul class="last-pairs__list">
      ${fresh.slice(0, MAX_CARDS).map((p) => `
          <li>
            <a class="last-pair" href="#p/${encodeURIComponent(p.slug)}">
              <img class="last-pair__img" src="${escapeHtml(p.images[0].sm ?? p.images[0].lg)}" alt="" width="140" height="187" loading="lazy" decoding="async">
              <span class="last-pair__badge new-badge">Nuevo</span>
              <span class="last-pair__name">${escapeHtml(p.name)}</span>
              <span class="last-pair__price money">${money(pricing.forProduct(p).unit)}</span>
            </a>
          </li>`).join("")}
    </ul>`;
}
