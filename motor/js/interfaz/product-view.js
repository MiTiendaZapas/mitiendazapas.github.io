/*
 * Vista de detalle de un producto.
 * Se abre con la dirección "#p/<modelo>": así el botón "atrás" del celular la
 * cierra y el link se puede compartir. En celular ocupa toda la pantalla y en
 * computadora es una ventana con fotos a la izquierda y datos a la derecha.
 */
import { escapeHtml, plural } from "../utils.js";
import { productQueryLink } from "../whatsapp.js";
import { icon } from "./icons.js";
import { priceHtml, sizeButtonsHtml, stockStatus } from "./product-parts.js";
import { sizeTableHtml } from "./pages.js";
import { createSharer, shareButtonHtml } from "./share.js";
import { attachSwipe } from "./swipe.js";
import { createZoomViewer } from "./zoom-viewer.js";

const HASH_PREFIX = "#p/";
const ADDED_FEEDBACK_MS = 1600;

const SHARE_FEEDBACK_MS = 3000;
const SHARE_MESSAGES = {
  copied: "Link copiado",
  downloaded: "Fotos descargadas y texto copiado",
  retry: "Listo: tocá de nuevo para compartir",
  error: "No se pudo compartir",
};

export function createProductView({ config, channel, catalog, pricing, cart, overlays, onAdded, onOpenCart, onMissing }) {
  const dialog = document.createElement("dialog");
  dialog.className = "product-view";
  dialog.setAttribute("aria-labelledby", "pv-title");
  dialog.innerHTML = `
    <div class="product-view__panel" data-panel>
      <header class="product-view__bar">
        <button class="btn btn--ghost product-view__back" type="button" data-close>
          ${icon("chevronLeft")} <span>Catálogo</span>
        </button>
        <button class="cart-button" type="button" data-to-cart aria-label="Ver tu pedido">
          ${icon("bag")} <span class="cart-button__label">Tu pedido</span>
          <span class="cart-button__count" data-pv-count aria-hidden="true">0</span>
        </button>
      </header>
      <div class="product-view__layout" data-content></div>
    </div>`;
  overlays.append(dialog);

  const content = dialog.querySelector("[data-content]");
  const zoom = createZoomViewer(dialog);
  const sharer = createSharer({ config, channel });
  const originalTitle = document.title;
  let product = null;
  let state = { size: null, qty: 1 };
  let returnFocus = null;
  let navigatedInside = false;   // true si la vista se abrió desde la tienda (no desde un link compartido)

  // --- apertura y cierre, sincronizados con la dirección --------------------
  function slugFromHash() {
    return location.hash.startsWith(HASH_PREFIX) ? decodeURIComponent(location.hash.slice(HASH_PREFIX.length)) : null;
  }

  function syncWithHash() {
    const slug = slugFromHash();
    if (slug) {
      const found = catalog.getBySlug(slug);
      if (found) show(found);
      else {
        clearHash();
        onMissing?.();
      }
    } else if (dialog.open) {
      hide();
    }
  }

  function show(next) {
    if (!dialog.open) returnFocus = document.activeElement;
    product = next;
    state = { size: null, qty: 1 };
    render();
    if (!dialog.open) dialog.showModal();
    document.body.classList.add("is-locked");
    document.title = `${product.name} · ${config.name}`;
    dialog.querySelector("[data-panel]").scrollTop = 0;
    dialog.querySelector("[data-close]").focus();
  }

  function hide() {
    if (zoom.isOpen) zoom.close();
    dialog.close();
    document.title = originalTitle;
    document.body.classList.remove("is-locked");
    returnFocus?.focus?.({ preventScroll: true });
  }

  function clearHash() {
    history.replaceState(null, "", location.pathname + location.search);
  }

  /** Cerrar = volver atrás si la abrió la tienda; si vino de un link compartido, solo se limpia la dirección. */
  function close() {
    if (navigatedInside) {
      history.back();
    } else {
      clearHash();
      hide();
    }
  }

  window.addEventListener("hashchange", () => {
    navigatedInside = true;
    syncWithHash();
  });
  dialog.addEventListener("cancel", (event) => {   // tecla Esc
    event.preventDefault();
    if (zoom.isOpen) zoom.close();
    else close();
  });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
  dialog.querySelector("[data-close]").addEventListener("click", close);
  dialog.querySelector("[data-to-cart]").addEventListener("click", () => {
    // El pedido se abre recién cuando esta vista terminó de cerrarse.
    dialog.addEventListener("close", () => onOpenCart?.(), { once: true });
    close();
  });

  // --- contenido ------------------------------------------------------------
  function galleryHtml() {
    const images = product.images;
    if (!images.length) {
      return `<div class="gallery"><div class="gallery__empty img-fallback">${icon("image")}<span>Foto no disponible</span></div></div>`;
    }
    const alt = escapeHtml(product.name);
    return `
      <div class="gallery">
        <div class="gallery__viewport">
          <div class="gallery__track" data-track tabindex="0" aria-label="Fotos de ${alt}">
            ${images.map((img, i) => `
              <button class="gallery__slide" type="button" data-zoom="${i}" aria-label="Ampliar foto ${i + 1} de ${images.length}">
                <img src="${escapeHtml(img.lg)}" alt="${alt}, foto ${i + 1} de ${images.length}"
                  width="${img.w || 675}" height="${img.h || 900}" ${i === 0 ? "" : 'loading="lazy"'} decoding="async">
              </button>`).join("")}
          </div>
          ${images.length > 1 ? `
            <button class="gallery__arrow gallery__arrow--prev" type="button" data-gallery-step="-1" aria-label="Foto anterior">${icon("chevronLeft")}</button>
            <button class="gallery__arrow gallery__arrow--next" type="button" data-gallery-step="1" aria-label="Foto siguiente">${icon("chevronRight")}</button>` : ""}
          <span class="gallery__zoom-hint" aria-hidden="true">${icon("expand")} Tocá para ampliar</span>
        </div>
        ${images.length > 1 ? `
          <div class="gallery__thumbs" role="group" aria-label="Elegir foto">
            ${images.map((img, i) => `
              <button class="gallery__thumb" type="button" data-thumb="${i}" aria-label="Ver foto ${i + 1}" ${i === 0 ? 'aria-current="true"' : ""}>
                <img src="${escapeHtml(img.lg)}" alt="" width="60" height="80" loading="lazy" decoding="async">
              </button>`).join("")}
          </div>` : ""}
      </div>`;
  }

  /** Tabla de talles desplegable (solo en las categorías que la usan). */
  function sizeChartHtml() {
    const chart = config.sizeChart;
    if (!chart || !chart.categories.includes(product.category)) return "";
    return `
      <details class="size-chart-toggle">
        <summary>${icon("ruler")} <span>${escapeHtml(chart.title)}</span> ${icon("chevronDown")}</summary>
        ${sizeTableHtml(chart)}
      </details>`;
  }

  function buyHtml() {
    if (!state.size) {
      return `
        <p class="stock-hint" data-pv-hint>Elegí un talle para agregarlo a tu pedido.</p>
        <button class="btn btn--primary btn--lg add-btn" type="button" disabled>Elegí un talle</button>`;
    }
    const { remaining, hint, low } = stockStatus(cart, product.id, state.size);
    state.qty = Math.min(Math.max(state.qty, 1), Math.max(remaining, 1));
    return `
      <div class="product-view__buy-row">
        <div class="stepper" role="group" aria-label="Cantidad">
          <button class="stepper__btn" type="button" data-step="-1" aria-label="Restar uno" ${state.qty <= 1 || remaining <= 0 ? "disabled" : ""}>${icon("minus")}</button>
          <output class="stepper__value" aria-live="polite">${remaining <= 0 ? 0 : state.qty}</output>
          <button class="stepper__btn" type="button" data-step="1" aria-label="Sumar uno" ${state.qty >= remaining ? "disabled" : ""}>${icon("plus")}</button>
        </div>
        <button class="btn btn--primary btn--lg add-btn" type="button" data-add ${remaining <= 0 ? "disabled" : ""}>
          ${icon("bag")} Agregar talle ${escapeHtml(state.size)}
        </button>
      </div>
      <p class="stock-hint${low ? " is-low" : ""}">${hint}</p>`;
  }

  function render() {
    const soldOutCount = product.sizes.filter((s) => s.stock <= 0).length;
    content.innerHTML = `
      ${galleryHtml()}
      <div class="product-view__info">
        ${product.brand ? `<p class="product-card__brand">${escapeHtml(product.brand)}</p>` : ""}
        <h2 class="product-view__title" id="pv-title">${escapeHtml(product.name)}</h2>
        ${priceHtml(product, pricing)}
        <fieldset class="size-picker product-view__sizes">
          <legend class="size-picker__legend">Elegí tu talle${soldOutCount ? ` <span class="size-picker__soldout">(tachados: agotados)</span>` : ""}</legend>
          <div class="size-picker__list" data-sizes>${sizeButtonsHtml(product.sizes, state.size)}</div>
        </fieldset>
        ${sizeChartHtml()}
        <div class="product-view__buy" data-buy>${buyHtml()}</div>
        <div class="product-view__added" data-added hidden>
          <p>${icon("check")} <span data-added-text></span></p>
          <button class="btn btn--outline" type="button" data-added-cart>Ver pedido</button>
        </div>
        <div class="product-view__actions">
          <a class="product-view__consult" href="${productQueryLink(config, product, state.size)}" target="_blank" rel="noopener" data-consult>
            ${icon("whatsapp")} Consultar
          </a>
          ${shareButtonHtml(channel, icon("share"))}
        </div>
        <ul class="product-view__facts">
          <li>${icon("chat")} No se paga online: confirmamos el stock por WhatsApp.</li>
          <li>${icon("truck")} Envíos: ${escapeHtml(Object.values(config.shipping.methods).map((m) => m.label).join(" y "))}.</li>
        </ul>
      </div>`;
    updateCount();
    setupGallery();
  }

  function renderBuy() {
    content.querySelector("[data-buy]").innerHTML = buyHtml();
    content.querySelector("[data-consult]").href = productQueryLink(config, product, state.size);
  }

  function updateCount() {
    dialog.querySelector("[data-pv-count]").textContent = String(cart.count());
    dialog.querySelector("[data-to-cart]").classList.toggle("has-items", cart.count() > 0);
  }

  // --- galería --------------------------------------------------------------
  // Las fotos se mueven con transform (no con scroll): así se controla cuándo
  // un gesto cambia de foto (ver swipe.js).
  let slide = 0;

  /** Posiciona la tira de fotos; "drag" son los píxeles que el dedo la está corriendo. */
  function placeTrack(drag = 0) {
    const track = content.querySelector("[data-track]");
    if (!track) return;
    track.classList.toggle("is-dragging", drag !== 0);
    track.style.transform = `translateX(calc(${-slide * 100}% + ${drag}px))`;
  }

  function goToSlide(i) {
    if (!product.images.length) return;
    slide = Math.min(Math.max(i, 0), product.images.length - 1);
    placeTrack();
    content.querySelectorAll("[data-thumb]").forEach((thumb) => {
      if (Number(thumb.dataset.thumb) === slide) thumb.setAttribute("aria-current", "true");
      else thumb.removeAttribute("aria-current");
    });
    content.querySelectorAll("[data-zoom]").forEach((btn, i) => { btn.tabIndex = i === slide ? 0 : -1; });
  }

  const currentSlide = () => slide;

  function setupGallery() {
    slide = 0;
    const viewport = content.querySelector(".gallery__viewport");
    if (!viewport || product.images.length < 2) return;
    const last = product.images.length - 1;
    attachSwipe(viewport, {
      // En la primera y la última foto el arrastre "resiste", para que se note que no hay más.
      onMove: (dx) => placeTrack((slide === 0 && dx > 0) || (slide === last && dx < 0) ? dx / 3 : dx),
      onEnd: (step) => goToSlide(slide + step),
    });
    goToSlide(0);
  }

  content.addEventListener("keydown", (event) => {
    if (!event.target.matches("[data-track]")) return;
    if (event.key === "ArrowRight") goToSlide(currentSlide() + 1);
    if (event.key === "ArrowLeft") goToSlide(currentSlide() - 1);
  });

  // --- interacción ------------------------------------------------------------
  content.addEventListener("click", (event) => {
    const zoomBtn = event.target.closest("[data-zoom]");
    if (zoomBtn) {
      zoom.open(product.images, Number(zoomBtn.dataset.zoom), product.name);
      return;
    }
    const thumb = event.target.closest("[data-thumb]");
    if (thumb) return goToSlide(Number(thumb.dataset.thumb));
    const arrow = event.target.closest("[data-gallery-step]");
    if (arrow) return goToSlide(currentSlide() + Number(arrow.dataset.galleryStep));

    const chip = event.target.closest(".size-chip");
    if (chip && !chip.disabled) {
      state = { size: chip.dataset.size, qty: 1 };
      content.querySelectorAll("[data-sizes] .size-chip").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
      renderBuy();
      return;
    }
    const step = event.target.closest("[data-step]");
    if (step) {
      state.qty += Number(step.dataset.step);
      renderBuy();
      return;
    }
    if (event.target.closest("[data-add]")) {
      const { added } = cart.add(product.id, state.size, state.qty);
      if (added < 1) return;
      showAdded(added);
      onAdded?.({ product, size: state.size, qty: added, source: "detalle" });
      return;
    }
    const shareBtn = event.target.closest("[data-share]");
    if (shareBtn) {
      shareProduct(shareBtn);
      return;
    }
    if (event.target.closest("[data-added-cart]")) {
      dialog.querySelector("[data-to-cart]").click();
    }
  });

  /** Comparte el modelo y muestra el resultado en el mismo botón por unos segundos. */
  async function shareProduct(button) {
    if (button.getAttribute("aria-busy") === "true") return;
    const label = button.querySelector("[data-share-label]");
    const original = label.textContent;
    button.setAttribute("aria-busy", "true");
    label.textContent = "Preparando…";
    const result = await sharer.share(product);
    button.removeAttribute("aria-busy");
    const feedback = SHARE_MESSAGES[result];
    label.textContent = feedback ?? original;
    if (feedback) {
      clearTimeout(shareProduct.timer);
      shareProduct.timer = setTimeout(() => { label.textContent = original; }, SHARE_FEEDBACK_MS);
    }
  }

  /** Confirmación dentro de la vista (la ventana tapa las notificaciones de la página). */
  function showAdded(qty) {
    const size = state.size;
    state.qty = 1;
    renderBuy();
    const button = content.querySelector("[data-add]");
    button.classList.add("is-added");
    button.innerHTML = `${icon("check")} ${qty > 1 ? `${qty} agregados` : "Agregado"} · talle ${escapeHtml(size)}`;
    const banner = content.querySelector("[data-added]");
    banner.hidden = false;
    banner.querySelector("[data-added-text]").textContent =
      `${plural(qty, "par agregado", "pares agregados")} (talle ${size}). Tenés ${plural(cart.count(), "par", "pares")} en tu pedido.`;
    clearTimeout(showAdded.timer);
    showAdded.timer = setTimeout(() => { if (product) renderBuy(); }, ADDED_FEEDBACK_MS);
  }

  cart.subscribe(() => {
    if (!dialog.open) return;
    updateCount();
    const counter = dialog.querySelector("[data-to-cart]");
    counter.classList.remove("is-bumped");
    void counter.offsetWidth;
    counter.classList.add("is-bumped");
  });

  return {
    /** Abre el producto de la dirección actual, si la hay (link compartido). */
    openFromUrl: syncWithHash,
  };
}
