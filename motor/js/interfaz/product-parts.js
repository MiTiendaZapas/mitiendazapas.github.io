/* Piezas que comparten la tarjeta del catálogo y la vista de detalle. */
import { escapeHtml, money, plural } from "../utils.js";

const LOW_STOCK = 3;

/** Precio por unidad y, debajo, el precio por mayor (o por cantidad en indumentaria). */
export function priceHtml(product, pricing) {
  const prices = pricing.forProduct(product);
  let bulkLine = "";
  if (prices.bulk) {
    bulkLine = `<p class="price__bulk">Llevando ${prices.bulk.min} o más: <strong class="money">${money(prices.bulk.price)}</strong></p>`;
  } else if (prices.wholesale) {
    bulkLine = `<p class="price__bulk">${escapeHtml(pricing.wholesaleLabel)}: <strong class="money">${money(prices.wholesale)}</strong></p>`;
  }
  return `<div class="price"><p class="price__unit money">${money(prices.unit)}</p>${bulkLine}</div>`;
}

/**
 * Botones de talle. En la tarjeta se muestran solo los disponibles; en la
 * vista de detalle se muestra la curva completa con los agotados tachados.
 */
export function sizeButtonsHtml(sizes, selectedSize) {
  return sizes.map((s) => {
    const soldOut = s.stock <= 0;
    return `
      <button class="size-chip${s.size.length > 3 ? " size-chip--wide" : ""}" type="button"
        data-size="${escapeHtml(s.size)}" aria-pressed="${s.size === selectedSize}"
        ${soldOut ? `disabled aria-label="Talle ${escapeHtml(s.size)}, agotado"` : ""}>${escapeHtml(s.size)}</button>`;
  }).join("");
}

/** Cuánto queda por agregar de un talle y qué aviso mostrar. */
export function stockStatus(cart, productId, size) {
  const inCart = cart.qtyOf(productId, size);
  const remaining = cart.maxFor(productId, size) - inCart;
  let hint = inCart > 0 ? `${plural(inCart, "par", "pares")} del ${size} en tu pedido` : "";
  let low = false;
  if (remaining <= 0) {
    hint = `Ya tenés en tu pedido todo el stock del talle ${size}`;
  } else if (remaining <= LOW_STOCK) {
    low = true;
    hint = `Últimos ${remaining} en talle ${size}${inCart ? ` · ${inCart} en tu pedido` : ""}`;
  }
  return { inCart, remaining, hint: escapeHtml(hint), low };
}
