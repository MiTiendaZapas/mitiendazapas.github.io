/*
 * Pedido: contador del header, barra fija en celular y panel.
 * Un solo paso: revisar el pedido y enviarlo por WhatsApp. Llevando la cantidad
 * mínima (5 o más pares) el precio por mayor se aplica solo: ya no se elige entre
 * por mayor o por unidad (nadie lo usaba, 26/10). No se piden datos: nombre y envío
 * se coordinan en el chat.
 */
import { escapeHtml, money, plural, whatsappLink } from "../utils.js";
import { buildOrderMessage, isFootwear, orderLink } from "../whatsapp.js";
import { isSingleSize, storeWords } from "../vocabulario.js";
import { icon } from "./icons.js";
import { sizeLabel } from "./g5.js";
import { socialLinksHtml } from "./social.js";
import { modo, say } from "../modo-catalogo.js";

export function createCartView({ config, channel, cart, pricing, overlays, onOpenProduct }) {
  const headerButton = document.querySelector("[data-open-cart]");
  const headerCount = document.querySelector("[data-cart-count]");
  // El precio por mayor se aplica solo al llegar a la cantidad. Los textos de "purchaseModes"
  // (si la tienda los tiene) siguen sirviendo para la página de cambios y el mensaje del pedido.
  const purchaseMode = "mayor";
  let sent = false;   // true después de tocar "Enviar pedido por WhatsApp"

  // --- barra fija (celular) --------------------------------------------------
  const bar = document.createElement("div");
  bar.className = "cart-bar";
  bar.innerHTML = `
    <button class="cart-bar__button" type="button" data-open-cart>
      <span class="cart-bar__count" data-bar-count>0</span>
      <span class="cart-bar__summary">
        <span class="cart-bar__title">${say("Ver tu pedido", "Ver tu consulta")}</span>
        <span class="cart-bar__detail" data-bar-detail></span>
      </span>
      <span class="cart-bar__cta"><span class="cart-bar__cta-text">Continuar</span> ${icon("chevronRight")}</span>
    </button>`;
  document.body.append(bar);

  // --- panel -----------------------------------------------------------------
  const dialog = document.createElement("dialog");
  dialog.className = "drawer";
  dialog.setAttribute("aria-labelledby", "drawer-title");
  dialog.innerHTML = `
    <div class="drawer__panel">
      <header class="drawer__header">
        <div>
          <h2 class="drawer__title" id="drawer-title" tabindex="-1">${say("Tu pedido", "Tu consulta")}</h2>
        </div>
        <button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon("close")}</button>
      </header>
      <div class="drawer__body" data-body></div>
      <footer class="drawer__footer" data-footer></footer>
    </div>`;
  overlays.append(dialog);

  const body = dialog.querySelector("[data-body]");
  const footer = dialog.querySelector("[data-footer]");

  function open() {
    sent = false;
    render();
    dialog.showModal();
    document.body.classList.add("is-locked");
  }

  function close() {
    dialog.close();
  }

  dialog.addEventListener("close", () => document.body.classList.remove("is-locked"));
  // Tocar fuera del panel (sobre el fondo oscuro) lo cierra.
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
  dialog.querySelector("[data-close]").addEventListener("click", close);
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-open-cart]")) open();
  });

  const currentQuote = () => pricing.quote(cart.lines(), purchaseMode);

  // --- resumen (header + barra) ------------------------------------------------
  /** "3 pares" si son todos calzados; "3 productos" si hay indumentaria. */
  function itemsText(count) {
    const onlyFootwear = !pricing.allProducts && cart.lines().every((line) => isFootwear(line.product));
    return onlyFootwear ? plural(count, "par", "pares") : plural(count, "producto");
  }

  function updateSummary({ bump = false } = {}) {
    const count = cart.count();
    const quote = currentQuote();
    const showWholesale = quote.canChoose;
    headerCount.textContent = String(count);
    headerButton.classList.toggle("has-items", count > 0);
    headerButton.setAttribute("aria-label", count ? `${say("Ver tu pedido", "Ver tu consulta")}, ${itemsText(count)}` : say("Ver tu pedido, vacío", "Ver tu consulta, vacía"));
    bar.classList.toggle("is-visible", count > 0);
    bar.querySelector("[data-bar-count]").textContent = String(count);
    bar.querySelector("[data-bar-detail]").textContent = count
      ? (modo.prices ? `${itemsText(count)} · ${money(showWholesale ? quote.totals.mayor : quote.total)}${showWholesale ? " por mayor" : ""}` : itemsText(count))
      : "";
    if (bump) {
      for (const el of [headerButton, bar]) {
        el.classList.remove("is-bumped");
        void el.offsetWidth;   // reinicia la animación
        el.classList.add("is-bumped");
      }
    }
  }

  // --- paso 1: revisar ---------------------------------------------------------
  function wholesaleProgress(quote) {
    if (quote.pairs === 0 || !pricing.hasWholesale || !modo.prices) return "";
    if (quote.byQuality) return "";   // con BR y G5, cada bloque muestra su propio aviso
    if (quote.canChoose) {
      const savings = quote.totals.unidad - quote.totals.mayor;
      return `
        <div class="wholesale-meter is-done">
          <p>${icon("check")} <strong>Precio por mayor aplicado</strong>${savings > 0 ? ` · ahorrás <span class="money">${money(savings)}</span>` : ""}</p>
        </div>`;
    }
    const percent = Math.round((quote.pairs / pricing.minPairs) * 100);
    return `
      <div class="wholesale-meter">
        <p>Sumá <strong>${plural(quote.pairsToWholesale, ...pricing.words)} más</strong> (surtidos) para el precio por mayor.</p>
        <div class="wholesale-meter__track" role="progressbar" aria-valuemin="0" aria-valuemax="${pricing.minPairs}" aria-valuenow="${quote.pairs}" aria-label="${escapeHtml(pricing.words[1])} para precio por mayor">
          <span style="width:${percent}%"></span>
        </div>
      </div>`;
  }

  function renderReview() {
    const quote = currentQuote();
    if (!quote.lines.length) {
      body.innerHTML = `
        <div class="state-message state-message--flat">
          ${icon("bag")}
          <h3 class="state-message__title">${say("Tu pedido está vacío", "Tu consulta está vacía")}</h3>
          <p class="state-message__text">${storeWords().footwear ? "Elegí un talle en cualquier modelo" : "Elegí lo que te guste"} y tocá “Agregar”. Lo vas a ver acá.</p>
        </div>`;
      footer.innerHTML = `<button class="btn btn--primary btn--block btn--lg" type="button" data-close-drawer>Ver catálogo</button>`;
      footer.querySelector("[data-close-drawer]").addEventListener("click", close);
      return;
    }

    const lineHtml = (line) => {
      const max = cart.maxFor(line.productId, line.size);
      const thumb = line.product.images[0]?.sm;
      return `
        <li class="cart-line" data-line-product="${escapeHtml(line.productId)}" data-line-size="${escapeHtml(line.size)}">
          <button class="cart-line__open" type="button" data-line-open aria-label="Ver fotos de ${escapeHtml(line.product.name)}">
            ${thumb ? `<img class="cart-line__thumb" src="${escapeHtml(thumb)}" alt="" width="60" height="80" loading="lazy">` : `<span class="cart-line__thumb"></span>`}
          </button>
          <div class="cart-line__info">
            <p class="cart-line__name"><button class="cart-line__name-btn" type="button" data-line-open>${escapeHtml(line.product.name)}</button></p>
            <p class="cart-line__meta">${isSingleSize(line.product) ? (modo.prices ? `<span class="money">${money(line.price)}</span> c/u` : "") : `Talle <strong>${escapeHtml(sizeLabel(line.product, line.size))}</strong>${modo.prices ? ` · <span class="money">${money(line.price)}</span> c/u` : ""}`}</p>
            <div class="cart-line__controls">
              <div class="stepper stepper--sm" role="group" aria-label="Cantidad de ${escapeHtml(line.product.name)}${isSingleSize(line.product) ? "" : ` talle ${escapeHtml(line.size)}`}">
                <button class="stepper__btn" type="button" data-line-step="-1" aria-label="Restar uno" ${line.qty <= 1 ? "disabled" : ""}>${icon("minus")}</button>
                <output class="stepper__value">${line.qty}</output>
                <button class="stepper__btn" type="button" data-line-step="1" aria-label="Sumar uno" ${line.qty >= max ? "disabled" : ""}>${icon("plus")}</button>
              </div>
              <button class="cart-line__remove" type="button" data-line-remove>${icon("trash")} Quitar</button>
            </div>
          </div>
          ${modo.prices ? `<p class="cart-line__subtotal money">${money(line.subtotal)}</p>` : ""}
        </li>`;
    };
    // Con G5 en el pedido: un bloque por calidad, con su subtotal y su aviso de precio por mayor.
    const groupHint = (group, label) => {
      if (!pricing.hasWholesale || !modo.prices) return "";
      if (group.canChoose) return `<p class="cart-group__hint is-done">${icon("check")} Precio por mayor aplicado</p>`;
      return `<p class="cart-group__hint">Sumá <strong>${plural(group.pairsToWholesale, "par", "pares")} ${label} más</strong> para el precio por mayor de esta calidad.</p>`;
    };
    const linesHtml = quote.byQuality
      ? quote.groups.map((group) => {
          const label = group.key === "g5" ? "G5" : "BR";
          return `
            <section class="cart-group cart-group--${group.key}">
              <header class="cart-group__head">
                <span class="cart-group__title">Calidad ${label}</span>
                <span class="cart-group__sum">${plural(group.pairs, "par", "pares")}${modo.prices ? ` · <span class="money">${money(group.subtotal)}</span>` : ""}</span>
              </header>
              ${groupHint(group, label)}
              <ul class="cart-lines">${group.lines.map(lineHtml).join("")}</ul>
            </section>`;
        }).join("")
      : `<ul class="cart-lines">${quote.lines.map(lineHtml).join("")}</ul>`;

    body.innerHTML = `
      ${wholesaleProgress(quote)}
      ${linesHtml}
      <p class="drawer__note">${icon("chat")} ${say("No se paga por la web. Te confirmamos el stock por WhatsApp y ahí coordinamos el envío.", "Enviás la lista por WhatsApp y te respondemos con la disponibilidad.")}</p>`;

    footer.innerHTML = `
      ${modo.prices ? `<div class="drawer__total">
        <span>Total <small>(${itemsText(cart.count())}${quote.canChoose ? ", por mayor" : ""}, sin envío)</small></span>
        <strong class="money">${money(quote.total)}</strong>
      </div>` : `<div class="drawer__total"><span>${itemsText(cart.count())}</span></div>`}
      <a class="btn btn--whatsapp btn--block btn--lg" href="${orderLink(config, buildOrderMessage({ config, channel, quote }))}" target="_blank" rel="noopener" data-send>
        ${icon("whatsapp")} ${say("Enviar pedido por WhatsApp", "Enviar consulta por WhatsApp")}</a>`;
    footer.querySelector("[data-send]")?.addEventListener("click", () => {
      document.dispatchEvent(new CustomEvent("store:order-sent", { detail: { total: quote.total, items: cart.count() } }));
      sent = true;
      // La ayuda aparece un instante después, para no interferir con la apertura de WhatsApp.
      setTimeout(render, 300);
    });
  }

  body.addEventListener("click", (event) => {
    const lineEl = event.target.closest("[data-line-product]");
    if (!lineEl) return;
    const { lineProduct, lineSize } = lineEl.dataset;
    // Tocar la foto o el nombre abre ese modelo (el botón "Tu pedido" de la vista vuelve acá).
    if (event.target.closest("[data-line-open]")) {
      const line = cart.lines().find((l) => l.productId === lineProduct);
      if (line) {
        close();
        onOpenProduct?.(line.product);
      }
      return;
    }
    const stepBtn = event.target.closest("[data-line-step]");
    if (stepBtn) cart.setQty(lineProduct, lineSize, cart.qtyOf(lineProduct, lineSize) + Number(stepBtn.dataset.lineStep));
    if (event.target.closest("[data-line-remove]")) cart.remove(lineProduct, lineSize);
  });

  // --- después de enviar ----------------------------------------------------------
  function renderSent() {
    const quote = currentQuote();
    if (!quote.lines.length) {
      sent = false;
      renderReview();
      return;
    }
    const message = buildOrderMessage({ config, channel, quote });
    const social = socialLinksHtml(config, { className: "social-list--center" });
    body.innerHTML = `
      <div class="sent-panel">
        <span class="sent-panel__icon">${icon("check")}</span>
        <h3 class="sent-panel__title">${say("¡Listo! Se abrió WhatsApp con tu pedido", "¡Listo! Se abrió WhatsApp con tu consulta")}</h3>
        <p class="sent-panel__text">${say("Tocá enviar en el chat y te confirmamos el stock y el envío.", "Tocá enviar en el chat y te respondemos enseguida.")}</p>
      </div>
      <div class="sent-help">
        <p><strong>¿No se abrió WhatsApp?</strong> Copiá el mensaje, abrí nuestro chat y pegalo.</p>
        <div class="sent-help__actions">
          <button class="btn btn--outline" type="button" data-copy>Copiar mensaje</button>
          <a class="btn btn--outline" href="${whatsappLink(config.contact.whatsappOrders)}" target="_blank" rel="noopener">${icon("whatsapp")} Abrir chat</a>
          <button class="btn btn--ghost" type="button" data-clear>${say("Ya lo envié, vaciar pedido", "Ya la envié, vaciar la lista")}</button>
        </div>
      </div>
      ${social ? `
        <div class="sent-social">
          <p class="sent-social__title">${escapeHtml(config.socialInvite ?? "Seguinos en las redes")}</p>
          ${social}
        </div>` : ""}`;
    footer.innerHTML = `<button class="btn btn--outline btn--block btn--lg" type="button" data-back-to-cart>${icon("chevronLeft")} ${say("Volver al pedido", "Volver a la consulta")}</button>`;
    footer.querySelector("[data-back-to-cart]").addEventListener("click", () => { sent = false; render(); });
    body.querySelector("[data-copy]").addEventListener("click", async (event) => {
      try {
        await navigator.clipboard.writeText(message);
        event.target.textContent = "¡Copiado!";
      } catch {
        event.target.textContent = "No se pudo copiar";
      }
    });
    body.querySelector("[data-clear]").addEventListener("click", () => {
      cart.clear();
      close();
    });
  }

  function render() {
    if (sent) renderSent();
    else renderReview();
  }

  cart.subscribe((event) => {
    updateSummary({ bump: event.type === "add" });
    if (dialog.open && !sent) render();
  });
  updateSummary();

  return { open, close, updateSummary };
}
