/*
 * Grilla del catálogo y tarjetas con compra rápida:
 * talle -> cantidad -> "Agregar", sin salir de la grilla.
 */
import { escapeHtml, plural } from "../utils.js";
import { icon } from "./icons.js";
import { countText } from "./filters-view.js";
import { priceHtml, sizeButtonsHtml, stockStatus } from "./product-parts.js";

const ADDED_FEEDBACK_MS = 1600;
const EAGER_IMAGES = 4;

/**
 * Encabezado del catálogo:
 *   "compacto" (por defecto): "Catálogo" y la cantidad de modelos en una etiqueta, en la misma línea.
 *   "clasico": la versión anterior ("Stock disponible", título grande y la cantidad a un costado).
 */
function headHtml(style) {
  if (style === "clasico") {
    return `
      <div class="catalog__head">
        <div>
          <p class="eyebrow">Stock disponible</p>
          <h2 class="catalog__title" id="catalog-title">Catálogo</h2>
        </div>
        <p class="catalog__count" data-catalog-count aria-live="polite"></p>
      </div>`;
  }
  return `
    <div class="catalog__head catalog__head--compact">
      <h2 class="catalog__title" id="catalog-title">Catálogo</h2>
      <p class="catalog__count" data-catalog-count aria-live="polite"></p>
    </div>`;
}

export function createCatalogView(root, { onAdded, headStyle = "compacto" }) {
  const selection = new Map();   // productId -> { size, qty }
  let productsById = new Map();
  let pricing = null;
  let cart = null;

  root.innerHTML = `
    <div class="container">
      ${headHtml(headStyle)}
      <div data-catalog-toolbar></div>
      <div class="catalog__layout">
        <aside class="catalog__filters-panel" data-filters-panel aria-label="Filtros"></aside>
        <div>
          <ul class="product-grid" data-grid aria-busy="true"></ul>
          <div data-empty hidden></div>
        </div>
      </div>
    </div>`;

  const grid = root.querySelector("[data-grid]");
  const emptyBox = root.querySelector("[data-empty]");
  const countLabel = root.querySelector("[data-catalog-count]");

  // --- estados -------------------------------------------------------------
  function showLoading(count = 8) {
    grid.setAttribute("aria-busy", "true");
    grid.innerHTML = Array.from({ length: count }, () => `
      <li class="skeleton-card" aria-hidden="true">
        <div class="skeleton-card__media"></div>
        <div class="skeleton-card__line"></div>
        <div class="skeleton-card__line skeleton-card__line--short"></div>
      </li>`).join("");
    countLabel.textContent = "Cargando modelos…";
  }

  function showError({ whatsappHref } = {}) {
    grid.setAttribute("aria-busy", "false");
    countLabel.textContent = "";
    grid.innerHTML = `
      <li class="state-message" role="alert">
        ${icon("alert")}
        <h3 class="state-message__title">No pudimos cargar el catálogo</h3>
        <p class="state-message__text">Puede ser un problema de conexión. Probá de nuevo en unos segundos o consultanos por WhatsApp.</p>
        <div class="state-message__actions">
          <button class="btn btn--primary" type="button" data-retry>Reintentar</button>
          ${whatsappHref ? `<a class="btn btn--outline" href="${escapeHtml(whatsappHref)}" target="_blank" rel="noopener">${icon("whatsapp")} Consultar por WhatsApp</a>` : ""}
        </div>
      </li>`;
    grid.querySelector("[data-retry]").addEventListener("click", () => location.reload());
  }

  /** Mensaje cuando los filtros o la búsqueda no encuentran nada (null = ocultarlo). */
  function showEmpty(message) {
    emptyBox.hidden = !message;
    if (!message) return;
    const { title, text, actionLabel, onAction } = message;
    emptyBox.innerHTML = `
      <div class="state-message">
        ${icon("search")}
        <h3 class="state-message__title">${escapeHtml(title)}</h3>
        <p class="state-message__text">${escapeHtml(text)}</p>
        ${actionLabel ? `<button class="btn btn--primary" type="button" data-empty-action>${escapeHtml(actionLabel)}</button>` : ""}
      </div>`;
    if (onAction) emptyBox.querySelector("[data-empty-action]").addEventListener("click", onAction);
  }

  /**
   * Si el cliente filtró por un único talle, las tarjetas lo traen ya elegido:
   * un revendedor que busca "todo en 40" agrega cada par con un solo toque.
   * No pisa un talle que el cliente ya eligió a mano en esa tarjeta.
   */
  function preselectSize(size) {
    for (const product of productsById.values()) {
      const state = selection.get(product.id);
      if (state?.manual) continue;
      const match = size && product.available.find((s) => s.size === size);
      if (match) selection.set(product.id, { size: match.size, qty: 1, manual: false });
      else if (state) selection.delete(product.id);
      else continue;
      const card = grid.querySelector(`[data-product-id="${CSS.escape(product.id)}"]`);
      if (!card) continue;
      const chosen = selection.get(product.id)?.size;
      card.querySelectorAll(".size-chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.size === chosen)));
      card.querySelector("[data-buy]").innerHTML = buyHtml(product);
    }
  }

  /** Muestra solo los productos filtrados, sin volver a dibujar las tarjetas. */
  function showOnly(visibleIds) {
    let shown = 0;
    for (const card of grid.querySelectorAll("[data-product-id]")) {
      const visible = visibleIds.has(card.dataset.productId);
      card.parentElement.hidden = !visible;
      if (visible) shown += 1;
    }
    return shown;
  }

  // --- tarjetas ------------------------------------------------------------
  function mediaHtml(product, index) {
    const cover = product.images[0];
    const alt = escapeHtml(product.name);
    const image = cover?.sm
      ? `<img src="${escapeHtml(cover.sm)}" alt="${alt}" width="360" height="480" data-loading
           ${index < EAGER_IMAGES ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
      : `<div class="img-fallback">${icon("image")}<span>Foto no disponible</span></div>`;
    return `
      <a class="product-card__media" href="#p/${encodeURIComponent(product.slug)}" aria-label="Ver fotos y detalle de ${alt}">
        ${image}
        <span class="product-card__zoom" aria-hidden="true">${icon("expand")}</span>
      </a>`;
  }

  function cardHtml(product, index) {
    const state = selection.get(product.id);
    const nameId = `name-${product.id}`;
    return `
      <li>
        <article class="product-card" data-product-id="${escapeHtml(product.id)}" aria-labelledby="${nameId}">
          ${mediaHtml(product, index)}
          <div class="product-card__body">
            ${product.brand ? `<p class="product-card__brand">${escapeHtml(product.brand)}</p>` : ""}
            <h3 class="product-card__name" id="${nameId}">
              <a href="#p/${encodeURIComponent(product.slug)}">${escapeHtml(product.name)}</a>
            </h3>
            ${priceHtml(product, pricing)}
            <fieldset class="size-picker">
              <legend class="size-picker__legend">Talles disponibles</legend>
              <div class="size-picker__list">${sizeButtonsHtml(product.available, state?.size)}</div>
            </fieldset>
            <div class="product-card__buy" data-buy></div>
          </div>
        </article>
      </li>`;
  }

  /** Parte de la tarjeta que cambia al elegir talle, cantidad o agregar. */
  function buyHtml(product) {
    const state = selection.get(product.id);
    if (!state?.size) {
      return `
        <p class="stock-hint"></p>
        <button class="btn btn--primary add-btn" type="button" disabled>Elegí un talle</button>`;
    }
    const { remaining, hint, low } = stockStatus(cart, product.id, state.size);
    const qty = Math.min(Math.max(state.qty, 1), Math.max(remaining, 1));
    state.qty = qty;

    return `
      <div class="product-card__qty-row">
        <div class="stepper" role="group" aria-label="Cantidad">
          <button class="stepper__btn" type="button" data-step="-1" aria-label="Restar uno" ${qty <= 1 || remaining <= 0 ? "disabled" : ""}>${icon("minus")}</button>
          <output class="stepper__value" aria-live="polite">${remaining <= 0 ? 0 : qty}</output>
          <button class="stepper__btn" type="button" data-step="1" aria-label="Sumar uno" ${qty >= remaining ? "disabled" : ""}>${icon("plus")}</button>
        </div>
      </div>
      <p class="stock-hint${low ? " is-low" : ""}">${hint}</p>
      <button class="btn btn--primary add-btn" type="button" data-add ${remaining <= 0 ? "disabled" : ""}>
        ${icon("bag")} Agregar<span class="add-btn__size"> talle ${escapeHtml(state.size)}</span>
      </button>`;
  }

  function refreshCard(productId) {
    const product = productsById.get(productId);
    const card = grid.querySelector(`[data-product-id="${CSS.escape(productId)}"]`);
    if (!product || !card) return;
    const buy = card.querySelector("[data-buy]");
    if (buy.querySelector(".add-btn.is-added")) return;   // no pisar la confirmación mientras se ve
    buy.innerHTML = buyHtml(product);
  }

  function render(products) {
    productsById = new Map(products.map((p) => [p.id, p]));
    grid.setAttribute("aria-busy", "false");
    countLabel.textContent = countText(products.length, products.length, false, headStyle);
    grid.innerHTML = products.map(cardHtml).join("");
    for (const card of grid.querySelectorAll("[data-product-id]")) {
      card.querySelector("[data-buy]").innerHTML = buyHtml(productsById.get(card.dataset.productId));
    }
  }

  // --- interacción (un solo listener para toda la grilla) ------------------
  grid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-product-id]");
    if (!card) return;
    const product = productsById.get(card.dataset.productId);
    const state = selection.get(product.id) ?? { size: null, qty: 1 };

    const chip = event.target.closest(".size-chip");
    if (chip) {
      state.size = chip.dataset.size;
      state.qty = 1;
      state.manual = true;
      selection.set(product.id, state);
      card.querySelectorAll(".size-chip").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
      card.querySelector("[data-buy]").innerHTML = buyHtml(product);
      return;
    }

    const step = event.target.closest("[data-step]");
    if (step && state.size) {
      state.qty += Number(step.dataset.step);
      card.querySelector("[data-buy]").innerHTML = buyHtml(product);
      return;
    }

    if (event.target.closest("[data-add]") && state.size) {
      const { added } = cart.add(product.id, state.size, state.qty);
      if (added < 1) return;
      state.qty = 1;
      showAdded(card, product, state.size, added);
      onAdded?.({ product, size: state.size, qty: added });
    }
  });

  function showAdded(card, product, size, qty) {
    const buy = card.querySelector("[data-buy]");
    const button = buy.querySelector("[data-add]");
    button.classList.add("is-added");
    button.innerHTML = `${icon("check")} ${qty > 1 ? `${qty} agregados` : "Agregado"}<span class="add-btn__size"> · talle ${escapeHtml(size)}</span>`;
    card.classList.add("is-added");
    clearTimeout(Number(card.dataset.feedbackTimer));
    card.dataset.feedbackTimer = setTimeout(() => {
      card.classList.remove("is-added");
      buy.innerHTML = buyHtml(product);
    }, ADDED_FEEDBACK_MS);
  }

  // Imágenes: aparecen suavemente al cargar y, si fallan, se muestra un aviso.
  grid.addEventListener("load", (event) => {
    if (event.target.tagName === "IMG") event.target.removeAttribute("data-loading");
  }, true);
  grid.addEventListener("error", (event) => {
    if (event.target.tagName !== "IMG") return;
    event.target.outerHTML = `<div class="img-fallback">${icon("image")}<span>Foto no disponible</span></div>`;
  }, true);

  return {
    /** Se llama cuando ya cargaron los precios y el pedido. */
    connect(deps) {
      ({ pricing, cart } = deps);
      // Si el pedido cambia desde otro lugar (carrito, vista de detalle), se actualiza la tarjeta.
      cart.subscribe((event) => {
        if (event.productId) refreshCard(event.productId);
        else productsById.forEach((_, id) => refreshCard(id));
      });
    },
    showLoading,
    showError,
    showEmpty,
    showOnly,
    preselectSize,
    render,
    totalCount: () => productsById.size,
    layoutTop: () => root.querySelector(".catalog__layout").getBoundingClientRect().top,
    toolbar: root.querySelector("[data-catalog-toolbar]"),
    filtersPanel: root.querySelector("[data-filters-panel]"),
    setCount(text) { countLabel.textContent = text; },
  };
}
