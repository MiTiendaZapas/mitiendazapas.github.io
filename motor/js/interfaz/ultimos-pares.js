/*
 * "Últimos pares" (o "Últimas unidades" si la tienda no vende solo calzado): fila en la portada
 * de la tienda al público con productos a los que les queda poco stock. Se arma sola con el
 * stock del catálogo (no necesita datos de ventas). En cada visita muestra una selección distinta.
 */
import { escapeHtml, money } from "../utils.js";
import { isFootwear, leftText, storeWords } from "../vocabulario.js";

const MAX_STOCK = 3;      // "pocos" = 3 o menos en total
const MAX_CARDS = 10;

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
  const words = storeWords();
  // Tienda de calzado: solo calzado (como siempre). Tienda con otras cosas: cualquier producto.
  const few = products.filter((p) => (!words.footwear || isFootwear(p)) && p.images.length && totalStock(p) > 0 && totalStock(p) <= MAX_STOCK);
  if (few.length < 3) {           // con muy pocos no vale la pena mostrar la fila
    root.hidden = true;
    return;
  }
  root.hidden = false;
  root.innerHTML = `
    <div class="last-pairs__head">
      <h2 class="last-pairs__title" id="last-pairs-title">${words.last}</h2>
      <p class="last-pairs__text">Quedan pocos: aprovechalos antes de que se agoten.</p>
    </div>
    <ul class="last-pairs__list">
      ${shuffle(few).slice(0, MAX_CARDS).map((p) => {
        const left = totalStock(p);
        return `
          <li>
            <a class="last-pair" href="#p/${encodeURIComponent(p.slug)}">
              <img class="last-pair__img" src="${escapeHtml(p.images[0].sm ?? p.images[0].lg)}" alt="" width="140" height="187" loading="lazy" decoding="async">
              <span class="last-pair__badge">${leftText(p, left)}</span>
              <span class="last-pair__name">${escapeHtml(p.name)}</span>
              <span class="last-pair__price money">${money(pricing.forProduct(p).unit)}</span>
            </a>
          </li>`;
      }).join("")}
    </ul>`;
}
