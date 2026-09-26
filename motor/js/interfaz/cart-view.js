/*
 * Pedido: contador del header, barra fija en celular y panel.
 * Un solo paso: revisar el pedido, elegir por mayor o por unidad (si lleva
 * 5 o más pares) y enviarlo por WhatsApp. No se piden datos: nombre y envío
 * se coordinan en el chat.
 */
import { escapeHtml, money, plural, readStorage, whatsappLink, writeStorage } from "../utils.js";
import { buildOrderMessage, orderLink } from "../whatsapp.js";
import { icon } from "./icons.js";
import { socialLinksHtml } from "./social.js";

const MODE_KEY = "purchase-mode";


export function createCartView({ config, channel, cart, pricing, overlays, storagePrefix, onOpenProduct }) {
  const headerButton = document.querySelector("[data-open-cart]");
  const headerCount = document.querySelector("[data-cart-count]");
  const modeKey = `${storagePrefix}:${MODE_KEY}`;
  // Si la versión de la tienda define "purchaseModes", el cliente elige por mayor o
  // por unidad. Si no, el precio por mayor se aplica solo al llegar a la cantidad.
  const modes = channel.purchaseModes ?? null;
  let purchaseMode = modes ? readStorage(modeKey, null) : "mayor";   // "mayor" | "unidad" | null (sin elegir)
  let sent = false;   // true después de tocar "Enviar pedido por WhatsApp"

  // --- barra fija (celular) --------------------------------------------------
  const bar = document.createElement("div");
  bar.className = "cart-bar";
  bar.innerHTML = `
    <button class="cart-bar__button" type="button" data-open-cart>
      <span class="cart-bar__count" data-bar-count>0</span>
      <span class="cart-bar__summary">
        <span class="cart-bar__title">Ver tu pedido</span>
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
          <h2 class="drawer__title" id="drawer-title" tabindex="-1">Tu pedido</h2>
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
  const needsModeChoice = (quote) => Boolean(modes) && quote.canChoose && !purchaseMode;

  // --- resumen (header + barra) ------------------------------------------------
  /** "3 pares" si son todos calzados; "3 productos" si hay indumentaria. */
  function itemsText(count) {
    const onlyFootwear = cart.lines().every((line) => line.product.category !== "indumentaria");
    return onlyFootwear ? plural(count, "par", "pares") : plural(count, "producto");
  }

  function updateSummary({ bump = false } = {}) {
    const count = cart.count();
    const quote = currentQuote();
    // Si todavía no eligió, se muestra el total por mayor como referencia.
    const showWholesale = quote.canChoose && quote.mode !== "unidad";
    headerCount.textContent = String(count);
    headerButton.classList.toggle("has-items", count > 0);
    headerButton.setAttribute("aria-label", count ? `Ver tu pedido, ${itemsText(count)}` : "Ver tu pedido, vacío");
    bar.classList.toggle("is-visible", count > 0);
    bar.querySelector("[data-bar-count]").textContent = String(count);
    bar.querySelector("[data-bar-detail]").textContent = count
      ? `${itemsText(count)} · ${money(showWholesale ? quote.totals.mayor : quote.total)}${showWholesale ? " por mayor" : ""}`
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
  function modeChoice(quote) {
    return `
      <fieldset class="mode-choice" aria-describedby="mode-help">
        <legend class="mode-choice__legend">Llevás ${plural(quote.pairs, "par", "pares")}: ¿cómo querés comprar?</legend>
        <p class="mode-choice__help" id="mode-help">Con ${pricing.minPairs} o más pares surtidos podés elegir.</p>
        <div class="choice-list">
          ${["mayor", "unidad"].map((key) => `
            <label class="choice">
              <input type="radio" name="purchaseMode" value="${key}" ${purchaseMode === key ? "checked" : ""}>
              <span class="choice__box choice__box--row">
                <span>
                  <span class="choice__title">${escapeHtml(modes[key].title)}</span>
                  <span class="choice__text">${escapeHtml(modes[key].note)}</span>
                </span>
                <strong class="choice__price money">${money(quote.totals[key])}</strong>
              </span>
            </label>`).join("")}
        </div>
      </fieldset>`;
  }

  function wholesaleProgress(quote) {
    if (quote.pairs === 0) return "";
    if (quote.canChoose && modes) return modeChoice(quote);
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
        <p>Sumá <strong>${plural(quote.pairsToWholesale, "par", "pares")} más</strong> (surtidos) para el precio por mayor.</p>
        <div class="wholesale-meter__track" role="progressbar" aria-valuemin="0" aria-valuemax="${pricing.minPairs}" aria-valuenow="${quote.pairs}" aria-label="Pares para precio por mayor">
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
          <h3 class="state-message__title">Tu pedido está vacío</h3>
          <p class="state-message__text">Elegí un talle en cualquier modelo y tocá “Agregar”. Lo vas a ver acá.</p>
        </div>`;
      footer.innerHTML = `<button class="btn btn--primary btn--block btn--lg" type="button" data-close-drawer>Ver catálogo</button>`;
      footer.querySelector("[data-close-drawer]").addEventListener("click", close);
      return;
    }

    body.innerHTML = `
      ${wholesaleProgress(quote)}
      <ul class="cart-lines">
        ${quote.lines.map((line) => {
          const max = cart.maxFor(line.productId, line.size);
          const thumb = line.product.images[0]?.sm;
          return `
            <li class="cart-line" data-line-product="${escapeHtml(line.productId)}" data-line-size="${escapeHtml(line.size)}">
              <button class="cart-line__open" type="button" data-line-open aria-label="Ver fotos de ${escapeHtml(line.product.name)}">
                ${thumb ? `<img class="cart-line__thumb" src="${escapeHtml(thumb)}" alt="" width="60" height="80" loading="lazy">` : `<span class="cart-line__thumb"></span>`}
              </button>
              <div class="cart-line__info">
                <p class="cart-line__name"><button class="cart-line__name-btn" type="button" data-line-open>${escapeHtml(line.product.name)}</button></p>
                <p class="cart-line__meta">Talle <strong>${escapeHtml(line.size)}</strong> · <span class="money">${money(line.price)}</span> c/u</p>
                <div class="cart-line__controls">
                  <div class="stepper stepper--sm" role="group" aria-label="Cantidad de ${escapeHtml(line.product.name)} talle ${escapeHtml(line.size)}">
                    <button class="stepper__btn" type="button" data-line-step="-1" aria-label="Restar uno" ${line.qty <= 1 ? "disabled" : ""}>${icon("minus")}</button>
                    <output class="stepper__value">${line.qty}</output>
                    <button class="stepper__btn" type="button" data-line-step="1" aria-label="Sumar uno" ${line.qty >= max ? "disabled" : ""}>${icon("plus")}</button>
                  </div>
                  <button class="cart-line__remove" type="button" data-line-remove>${icon("trash")} Quitar</button>
                </div>
              </div>
              <p class="cart-line__subtotal money">${money(line.subtotal)}</p>
            </li>`;
        }).join("")}
      </ul>
      <p class="drawer__note">${icon("chat")} No se paga online. Te confirmamos el stock por WhatsApp y ahí coordinamos el envío.</p>`;

    const pending = needsModeChoice(quote);
    footer.innerHTML = `
      <div class="drawer__total">
        <span>Total <small>(${itemsText(cart.count())}${quote.canChoose && !pending ? `, ${modes ? modes[quote.mode].title.toLowerCase() : "por mayor"}` : ""}, sin envío)</small></span>
        ${pending ? `<span class="drawer__pending">Elegí por mayor o por unidad</span>` : `<strong class="money">${money(quote.total)}</strong>`}
      </div>
      ${pending
        ? `<button class="btn btn--whatsapp btn--block btn--lg" type="button" disabled>${icon("whatsapp")} Enviar pedido por WhatsApp</button>`
        : `<a class="btn btn--whatsapp btn--block btn--lg" href="${orderLink(config, buildOrderMessage({ config, channel, quote }))}" target="_blank" rel="noopener" data-send>
            ${icon("whatsapp")} Enviar pedido por WhatsApp</a>`}`;
    footer.querySelector("[data-send]")?.addEventListener("click", () => {
      document.dispatchEvent(new CustomEvent("store:order-sent", { detail: { total: quote.total, items: cart.count() } }));
      sent = true;
      // La ayuda aparece un instante después, para no interferir con la apertura de WhatsApp.
      setTimeout(render, 300);
    });
  }

  body.addEventListener("change", (event) => {
    if (event.target.name !== "purchaseMode") return;
    purchaseMode = event.target.value;
    writeStorage(modeKey, purchaseMode);
    render();
    updateSummary();
  });

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
    if (!quote.lines.length || needsModeChoice(quote)) {
      sent = false;
      renderReview();
      return;
    }
    const message = buildOrderMessage({ config, channel, quote });
    const social = socialLinksHtml(config, { handles: true, className: "social-list--stack" });
    body.innerHTML = `
      <div class="sent-panel">
        <span class="sent-panel__icon">${icon("check")}</span>
        <h3 class="sent-panel__title">¡Listo! Se abrió WhatsApp con tu pedido</h3>
        <p class="sent-panel__text">Tocá enviar en el chat y te confirmamos el stock y el envío.</p>
      </div>
      <div class="sent-help">
        <p><strong>¿No se abrió WhatsApp?</strong> Copiá el mensaje, abrí nuestro chat y pegalo.</p>
        <div class="sent-help__actions">
          <button class="btn btn--outline" type="button" data-copy>Copiar mensaje</button>
          <a class="btn btn--outline" href="${whatsappLink(config.contact.whatsappOrders)}" target="_blank" rel="noopener">${icon("whatsapp")} Abrir chat</a>
          <button class="btn btn--ghost" type="button" data-clear>Ya lo envié, vaciar pedido</button>
        </div>
      </div>
      ${social ? `
        <div class="sent-social">
          <p class="sent-social__title">${escapeHtml(config.socialInvite ?? "Seguinos en las redes")}</p>
          ${social}
        </div>` : ""}`;
    footer.innerHTML = `<button class="btn btn--outline btn--block btn--lg" type="button" data-back-to-cart>${icon("chevronLeft")} Volver al pedido</button>`;
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
    // Si el pedido baja de la cantidad mínima (o se vacía), la elección se vuelve a pedir.
    if (modes && purchaseMode && !pricing.quote(cart.lines()).canChoose) {
      purchaseMode = null;
      writeStorage(modeKey, null);
    }
    updateSummary({ bump: event.type === "add" });
    if (dialog.open && !sent) render();
  });
  updateSummary();

  return { open, close, updateSummary };
}
