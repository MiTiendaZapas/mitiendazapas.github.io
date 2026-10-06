/* Piezas que comparten la tarjeta del catálogo y la vista de detalle. */
import { escapeHtml, money } from "../utils.js";

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
export function sizeButtonsHtml(sizes, selectedSize, { european = false } = {}) {
  // G5: talles europeos. Un "EU" chiquito abajo del número, sin agrandar el cuadrado.
  const unit = european ? `<span class="size-chip__unit" aria-hidden="true">EU</span>` : "";
  const kind = european ? " europeo" : "";
  return sizes.map((s) => {
    const soldOut = s.stock <= 0;
    return `
      <button class="size-chip${s.size.length > 3 ? " size-chip--wide" : ""}${european ? " size-chip--eu" : ""}" type="button"
        data-size="${escapeHtml(s.size)}" aria-pressed="${s.size === selectedSize}"
        ${soldOut ? `disabled aria-label="Talle ${escapeHtml(s.size)}${kind}, agotado"` : european ? `aria-label="Talle ${escapeHtml(s.size)} europeo"` : ""}>${escapeHtml(s.size)}${unit}</button>`;
  }).join("");
}

/** Cuánto queda por agregar de un talle y qué aviso mostrar. */
/** Etiqueta de calidad para los modelos G5 (se ve en la tarjeta y en el detalle). */
export function qualityBadgeHtml(product) {
  return product.category === "g5" ? `<span class="quality-badge">Calidad G5</span>` : "";
}

export function stockStatus(cart, productId, size) {
  const inCart = cart.qtyOf(productId, size);
  const remaining = cart.maxFor(productId, size) - inCart;
  // Al elegir un talle se ve su stock: "Stock: 4". Solo cuando queda uno se resalta
  // en rojo: "¡Último par!".
  let hint;
  let low = false;
  if (remaining <= 0) {
    hint = "Ya tenés en tu pedido todo el stock de este talle";
  } else if (remaining === 1) {
    low = true;
    hint = "¡Último par!";
  } else {
    hint = `Stock: ${remaining}`;
  }
  return { inCart, remaining, hint: escapeHtml(hint), low };
}
