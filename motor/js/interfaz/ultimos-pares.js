/*
 * "Últimos pares": fila en la portada de la tienda al público con modelos a los
 * que les queda poco stock. Se arma sola con el stock del catálogo (no necesita
 * datos de ventas). En cada visita muestra una selección distinta.
 */
import { escapeHtml, money, plural } from "../utils.js";

const MAX_STOCK = 3;      // "pocos" = 3 pares o menos en total
const MAX_CARDS = 10;
const CATEGORIES = new Set(["zapatillas", "ninos", "ojotas"]);

function totalStock(product) {
  return product.sizes.reduce((sum, s) => sum + (s.stock > 0 ? s.stock : 0), 0);
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function renderLastPairs(root, { products, pricing }) {
  if (!root) return;
  const few = products.filter((p) => CATEGORIES.has(p.category) && p.images.length && totalStock(p) > 0 && totalStock(p) <= MAX_STOCK);
  if (few.length < 3) {           // con muy pocos no vale la pena mostrar la fila
    root.hidden = true;
    return;
  }
  root.hidden = false;
  root.innerHTML = `
    <div class="last-pairs__head">
      <h2 class="last-pairs__title" id="last-pairs-title">Últimos pares</h2>
      <p class="last-pairs__text">Quedan pocos: aprovechalos antes de que se agoten.</p>
    </div>
    <ul class="last-pairs__list">
      ${shuffle(few).slice(0, MAX_CARDS).map((p) => {
        const left = totalStock(p);
        return `
          <li>
            <a class="last-pair" href="#p/${encodeURIComponent(p.slug)}">
              <img class="last-pair__img" src="${escapeHtml(p.images[0].sm ?? p.images[0].lg)}" alt="" width="140" height="187" loading="lazy" decoding="async">
              <span class="last-pair__badge">${left === 1 ? "Último par" : `Quedan ${plural(left, "par", "pares")}`}</span>
              <span class="last-pair__name">${escapeHtml(p.name)}</span>
              <span class="last-pair__price money">${money(pricing.forProduct(p).unit)}</span>
            </a>
          </li>`;
      }).join("")}
    </ul>`;
}
