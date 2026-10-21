/*
 * VIDRIERA: tienda para negocios con stock propio (ropa, calzado, accesorios, lo que sea).
 * Diseño propio, distinto de las tiendas de zapatillas: sin logos de marcas, categorías
 * del cliente, ficha del producto en una ventana y pedido por WhatsApp.
 *
 * Lee del programa del panel:
 *   /api/tienda/<tienda>/ajustes.json    nombre, logo, WhatsApp, redes, color, textos, por mayor
 *   /api/tienda/<tienda>/productos.json  productos con fotos, precios, talles y stock
 * Reusa del motor solo la lógica (precios, carrito, mensaje del pedido).
 */
import { createCart } from "../js/cart.js";
import { createPricing } from "../js/pricing.js";
import { buildOrderMessage } from "../js/whatsapp.js";
import { escapeHtml, money, plural, PLATFORM_URL, whatsappLink } from "../js/utils.js";
import { icon } from "../js/interfaz/icons.js";
import { orderedCategories, sortProducts } from "./orden.js";

const config = window.STORE_CONFIG ?? {};
const STORE = config.manualStore;
const API = `/api/tienda/${encodeURIComponent(STORE)}/`;
const app = document.getElementById("vidriera");
const LOW_STOCK = 2;   // "Últimas unidades" con 2 o menos en total
const NETWORKS = {
  instagram: { label: "Instagram", url: (u) => `https://www.instagram.com/${u}/` },
  tiktok: { label: "TikTok", url: (u) => `https://www.tiktok.com/@${u}` },
  facebook: { label: "Facebook", url: (u) => `https://www.facebook.com/${u}` },
};

const esc = escapeHtml;
// Fotos y logo: en mitiendastock.com salen directo del depósito público (catalogo.mitiendastock.com),
// que Cloudflare guarda en caché y no gasta pedidos del programa del panel. En la prueba local,
// del programa del panel.
const ON_CLOUDFLARE = location.hostname === "mitiendastock.com" || location.hostname.endsWith(".mitiendastock.com")
  || location.hostname.endsWith("mitiendastock.pages.dev");
const FILES = ON_CLOUDFLARE ? `https://catalogo.mitiendastock.com/tiendas/${encodeURIComponent(STORE)}/` : API;
const photo = (path) => (path ? FILES + path : "");
const state = { category: "", search: "", product: null, size: null, qty: 1, photoIndex: 0 };

// --- datos -----------------------------------------------------------------------
async function getJson(name) {
  const response = await fetch(API + name, { cache: "no-cache" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function prepareProducts(data) {
  return (Array.isArray(data?.products) ? data.products : [])
    .filter((p) => p && typeof p.id === "string" && typeof p.name === "string" && Array.isArray(p.sizes))
    .map((p) => {
      const sizes = p.sizes.map((s) => ({ size: String(s.size), stock: Math.max(0, Number(s.stock) || 0) }));
      return {
        id: p.id, slug: String(p.slug || p.id), name: p.name, brand: p.brand || null,
        category: p.category, price: Number(p.price) || 0, wholesalePrice: Number(p.wholesalePrice) || null,
        createdAt: p.createdAt ?? null,
        sizes, available: sizes.filter((s) => s.stock > 0), total: sizes.reduce((n, s) => n + s.stock, 0),
        images: (p.images ?? []).map((img) => ({ sm: photo(img.sm), lg: photo(img.lg), w: img.w, h: img.h })),
      };
    })
    .filter((p) => p.total > 0);
}

/** Lo que eligió el cliente en su panel, encima de lo que trae configuracion.js. */
function storeInfo(settings) {
  const s = settings?.name ? settings : {};
  const whatsapp = s.whatsapp || config.contact?.whatsappOrders || "";
  return {
    name: s.name || config.name || "Tienda",
    tagline: s.tagline || config.tagline || "",
    title: s.heroTitle || s.name || config.name || "Nuestros productos",
    highlight: s.heroHighlight || "",
    text: s.heroText || "Elegí lo que te gusta, armá tu pedido y envialo por WhatsApp. Te confirmamos el stock y coordinamos la entrega.",
    logo: s.logo ? { small: photo(s.logo.small), large: photo(s.logo.large) } : null,
    whatsapp,
    color: s.color || "#18181b",
    wholesale: s.name ? s.wholesale === true : true,
    wholesaleMin: s.wholesaleMin || 5,
    order: { categoryOrder: s.categoryOrder, productOrder: s.productOrder },
    social: Object.entries(NETWORKS).filter(([key]) => s[key]).map(([key, n]) => ({ network: key, label: n.label, url: n.url(s[key]) })),
  };
}

/** Color de los botones. En modo oscuro, si el color es muy oscuro se usa blanco para que se vea. */
function applyColor(color) {
  const root = document.documentElement;
  root.style.setProperty("--v-accent", color);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  root.style.setProperty("--v-accent-dark", light < 0.12 ? "#f4f4f5" : color);
  root.style.setProperty("--v-on-accent-dark", light < 0.12 ? "#0f0f10" : "#ffffff");
}

// --- modo claro / oscuro -----------------------------------------------------------
// Blanco por defecto. Si el celular está en modo oscuro, abre en oscuro. Con el botón
// del encabezado la persona elige, y su elección queda guardada en ese celular.
const THEME_KEY = "vidriera:tema";
const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)");
function savedTheme() {
  try { return localStorage.getItem(THEME_KEY); } catch { return null; }
}
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0f0f10" : "#ffffff");
  const button = document.querySelector("[data-theme-toggle]");
  if (button) {
    button.innerHTML = icon(theme === "dark" ? "sun" : "moon");
    button.setAttribute("aria-label", theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
  }
}
systemDark?.addEventListener?.("change", (e) => { if (!savedTheme()) setTheme(e.matches ? "dark" : "light"); });

// --- dibujo ----------------------------------------------------------------------
function headerHtml(info) {
  const mark = info.logo
    ? `<img class="v-brand__logo" src="${esc(info.logo.small)}" alt="" width="40" height="40">`
    : `<span class="v-brand__initial" aria-hidden="true">${esc(info.name.trim().charAt(0).toUpperCase())}</span>`;
  return `
    <header class="v-header">
      <div class="v-wrap v-header__inner">
        <a class="v-brand" href="#inicio" aria-label="${esc(info.name)}, ir al inicio">${mark}<span class="v-brand__name">${esc(info.name)}</span></a>
        <div class="v-header__actions">
          <button class="v-icon-btn" type="button" data-theme-toggle aria-label="Cambiar a modo oscuro">${icon("moon")}</button>
          <button class="v-icon-btn" type="button" data-open-search aria-label="Buscar">${icon("search")}</button>
          <button class="v-icon-btn v-cart-btn" type="button" data-open-cart aria-label="Ver tu pedido">
            ${icon("bag")}<span class="v-cart-btn__count" data-cart-count hidden>0</span>
          </button>
        </div>
      </div>
    </header>`;
}

function heroHtml(info) {
  const social = info.social.length ? `
    <ul class="v-social">${info.social.map((s) => `
      <li><a href="${esc(s.url)}" target="_blank" rel="noopener" aria-label="${esc(s.label)} de ${esc(info.name)}">${icon(s.network)}</a></li>`).join("")}
    </ul>` : "";
  return `
    <section class="v-hero" id="inicio" aria-labelledby="v-hero-title">
      <div class="v-wrap v-hero__inner">
        <p class="v-pill">${icon("whatsapp")} Pedidos por WhatsApp</p>
        <h1 class="v-hero__title" id="v-hero-title">${esc(info.title)}${info.highlight ? ` <span>${esc(info.highlight)}</span>` : ""}</h1>
        <p class="v-hero__text">${esc(info.text)}</p>
        <div class="v-hero__actions">
          <a class="v-btn v-btn--primary" href="#productos">Ver productos ${icon("arrowRight")}</a>
          ${info.whatsapp ? `<a class="v-btn v-btn--ghost" href="${esc(whatsappLink(info.whatsapp, `¡Hola! Vi la tienda de ${info.name} y quería hacer una consulta.`))}" target="_blank" rel="noopener">${icon("whatsapp")} Consultar</a>` : ""}
        </div>
        ${social}
      </div>
    </section>`;
}

function stepsHtml() {
  const steps = [
    ["Elegí", "Tocá un producto, elegí talle y cantidad, y agregalo a tu pedido."],
    ["Enviá", "Revisá tu pedido y envialo por WhatsApp con un toque. No se paga en la web."],
    ["Coordinamos", "Te confirmamos el stock y arreglamos el pago y la entrega por chat."],
  ];
  return `
    <section class="v-steps" aria-labelledby="v-steps-title">
      <div class="v-wrap">
        <h2 class="v-section-title" id="v-steps-title">Cómo comprar</h2>
        <ol class="v-steps__list">${steps.map(([t, d], i) => `
          <li class="v-step"><span class="v-step__n">${i + 1}</span><div><strong>${t}</strong><p>${d}</p></div></li>`).join("")}
        </ol>
      </div>
    </section>`;
}

function footerHtml(info) {
  const credit = config.platformCredit?.enabled
    ? `<a class="v-credit" href="${PLATFORM_URL}" target="_blank" rel="noopener">${esc(config.platformCredit.text)}</a>`
    : "";
  return `
    <footer class="v-footer">
      <div class="v-wrap v-footer__inner">
        <div>
          <p class="v-footer__name">${esc(info.name)}</p>
          ${info.tagline ? `<p class="v-muted">${esc(info.tagline)}</p>` : ""}
        </div>
        <div class="v-footer__links">
          ${info.whatsapp ? `<a class="v-btn v-btn--ghost v-btn--sm" href="${esc(whatsappLink(info.whatsapp))}" target="_blank" rel="noopener">${icon("whatsapp")} WhatsApp</a>` : ""}
          ${info.social.map((s) => `<a class="v-btn v-btn--ghost v-btn--sm" href="${esc(s.url)}" target="_blank" rel="noopener">${icon(s.network)} ${esc(s.label)}</a>`).join("")}
        </div>
        <p class="v-muted v-footer__legal">Los pedidos se confirman por WhatsApp. No se realizan cobros en este sitio. ${credit}</p>
      </div>
    </footer>`;
}

function cardHtml(product, pricing) {
  const prices = pricing.forProduct(product);
  const image = product.images[0];
  return `
    <li>
      <button class="v-card" type="button" data-product="${esc(product.id)}" aria-label="${esc(product.name)}, ${money(prices.unit)}. Ver detalle">
        <span class="v-card__media">
          ${image ? `<img src="${esc(image.sm || image.lg)}" alt="" loading="lazy" decoding="async" width="${image.w || 600}" height="${image.h || 750}">` : `<span class="v-card__noimg">${icon("image")}</span>`}
          ${product.total <= LOW_STOCK ? `<span class="v-badge">Últimas unidades</span>` : ""}
        </span>
        <span class="v-card__body">
          <span class="v-card__name">${esc(product.name)}</span>
          <span class="v-card__price">${money(prices.unit)}</span>
          ${prices.wholesale ? `<span class="v-card__wholesale">Por mayor ${money(prices.wholesale)}</span>` : ""}
        </span>
      </button>
    </li>`;
}

// --- arranque ----------------------------------------------------------------------
async function start() {
  app.innerHTML = `<div class="v-loading" role="status"><span class="v-spinner"></span> Cargando…</div>`;
  let settings = {};
  let data;
  try {
    [settings, data] = await Promise.all([getJson("ajustes.json").catch(() => ({})), getJson("productos.json")]);
  } catch {
    app.innerHTML = `<div class="v-wrap v-error"><p>No pudimos cargar la tienda. Revisá tu conexión y probá de nuevo.</p><button class="v-btn v-btn--primary" type="button" onclick="location.reload()">Reintentar</button></div>`;
    return;
  }
  const info = storeInfo(settings);
  applyColor(info.color);
  document.title = `${info.name} · Catálogo`;

  // Orden: categorías y productos como lo eligió el cliente (por defecto, todo de la A a la Z).
  const products = sortProducts(prepareProducts(data), data.categories ?? {}, info.order);
  const categories = orderedCategories(data.categories ?? {}, info.order)
    .filter((id) => products.some((p) => p.category === id))
    .map((id) => [id, data.categories[id]]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const catalog = {
    get: (id) => byId.get(id),
    stockOf: (id, size) => byId.get(id)?.sizes.find((s) => s.size === size)?.stock ?? 0,
  };
  const pricing = createPricing({
    wholesale: info.wholesale ? { minPairs: info.wholesaleMin, allProducts: true, label: `Llevando ${info.wholesaleMin} o más productos` } : false,
    unit: { default: 0, rules: [] }, wholesalePrice: { default: 0, rules: [] },
  });
  const cart = createCart({ storageKey: `vidriera:${STORE}:pedido`, catalog });
  cart.restore();

  app.innerHTML = `
    ${headerHtml(info)}
    <main>
      ${heroHtml(info)}
      <section class="v-catalog" id="productos" aria-labelledby="v-catalog-title">
        <div class="v-toolbar">
          <div class="v-wrap">
            <div class="v-search" data-search hidden>
              ${icon("search")}
              <input type="search" placeholder="Buscar producto" aria-label="Buscar producto" data-search-input>
              <button class="v-icon-btn v-icon-btn--sm" type="button" data-close-search aria-label="Cerrar búsqueda">${icon("close")}</button>
            </div>
            ${categories.length > 1 ? `
              <div class="v-chips" role="group" aria-label="Categorías">
                <button class="v-chip" type="button" data-category="" aria-pressed="true">Todo</button>
                ${categories.map(([id, label]) => `<button class="v-chip" type="button" data-category="${esc(id)}" aria-pressed="false">${esc(label)}</button>`).join("")}
              </div>` : ""}
          </div>
        </div>
        <div class="v-wrap">
          <div class="v-catalog__head">
            <h2 class="v-section-title" id="v-catalog-title">Productos</h2>
            <p class="v-muted" data-count aria-live="polite"></p>
          </div>
          <div data-grid></div>
          <p class="v-empty" data-empty hidden></p>
        </div>
      </section>
      ${stepsHtml()}
    </main>
    ${footerHtml(info)}
    <a class="v-cartbar" href="#pedido" data-cartbar hidden>
      <span>${icon("bag")} <span data-cartbar-text></span></span><strong data-cartbar-total></strong>
    </a>
    <dialog class="v-sheet" data-product-dialog aria-labelledby="v-product-name"></dialog>
    <dialog class="v-sheet v-sheet--side" data-cart-dialog aria-labelledby="v-cart-title"></dialog>
    <div class="v-toast" role="status" aria-live="polite" data-toast></div>`;

  const $ = (sel) => app.querySelector(sel);
  setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  $("[data-theme-toggle]").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(THEME_KEY, next); } catch { /* sin guardado: igual cambia */ }
    setTheme(next);
  });
  const grid = $("[data-grid]");
  const productDialog = $("[data-product-dialog]");
  const cartDialog = $("[data-cart-dialog]");

  // --- catálogo ---
  function renderGrid() {
    const term = state.search.trim().toLowerCase();
    const shown = products.filter((p) => (!state.category || p.category === state.category)
      && (!term || `${p.name} ${p.brand ?? ""}`.toLowerCase().includes(term)));
    // En "Todo" (sin buscar) los productos se ven separados por categoría, con su título.
    const grouped = !state.category && !term && categories.length > 1;
    grid.innerHTML = grouped
      ? categories.map(([id, label]) => {
        const items = shown.filter((p) => p.category === id);
        return items.length ? `
          <section class="v-group" aria-label="${esc(label)}">
            <h3 class="v-group__title">${esc(label)} <span class="v-muted">${items.length}</span></h3>
            <ul class="v-grid">${items.map((p) => cardHtml(p, pricing)).join("")}</ul>
          </section>` : "";
      }).join("")
      : `<ul class="v-grid">${shown.map((p) => cardHtml(p, pricing)).join("")}</ul>`;
    $("[data-count]").textContent = plural(shown.length, "producto");
    const empty = $("[data-empty]");
    empty.hidden = shown.length > 0;
    empty.textContent = products.length ? "No encontramos productos con esa búsqueda." : "Muy pronto vas a ver los productos acá.";
  }
  app.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-category]");
    if (chip) {
      state.category = chip.dataset.category;
      app.querySelectorAll("[data-category]").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
      renderGrid();
      return;
    }
    const card = event.target.closest("[data-product]");
    if (card) { location.hash = `#p/${encodeURIComponent(byId.get(card.dataset.product).slug)}`; return; }
    if (event.target.closest("[data-open-search]")) {
      $("[data-search]").hidden = false;
      $("#productos").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      $("[data-search-input]").focus();
      return;
    }
    if (event.target.closest("[data-close-search]")) {
      $("[data-search]").hidden = true;
      state.search = $("[data-search-input]").value = "";
      renderGrid();
      return;
    }
    if (event.target.closest("[data-open-cart]")) location.hash = "#pedido";
  });
  $("[data-search-input]").addEventListener("input", (e) => { state.search = e.target.value; renderGrid(); });

  // --- ficha del producto ---
  function renderProduct() {
    const p = state.product;
    const prices = pricing.forProduct(p);
    const images = p.images.length ? p.images : [null];
    const index = Math.min(state.photoIndex, images.length - 1);
    const inCart = state.size ? cart.qtyOf(p.id, state.size) : 0;
    const max = state.size ? Math.max(catalog.stockOf(p.id, state.size) - inCart, 0) : 0;
    state.qty = Math.min(Math.max(state.qty, 1), Math.max(max, 1));
    const categoryLabel = categories.find(([id]) => id === p.category)?.[1];
    productDialog.innerHTML = `
      <div class="v-product">
        <button class="v-icon-btn v-sheet__close" type="button" data-close aria-label="Cerrar">${icon("close")}</button>
        <div class="v-gallery">
          <div class="v-gallery__frame">
            ${images[index] ? `<img src="${esc(images[index].lg)}" alt="${esc(p.name)}, foto ${index + 1} de ${images.length}">` : `<span class="v-card__noimg">${icon("image")}</span>`}
            ${images.length > 1 ? `
              <button class="v-gallery__nav v-gallery__nav--prev" type="button" data-photo="${index - 1}" ${index === 0 ? "disabled" : ""} aria-label="Foto anterior">${icon("chevronLeft")}</button>
              <button class="v-gallery__nav v-gallery__nav--next" type="button" data-photo="${index + 1}" ${index === images.length - 1 ? "disabled" : ""} aria-label="Foto siguiente">${icon("chevronRight")}</button>` : ""}
          </div>
          ${images.length > 1 ? `<div class="v-thumbs">${images.map((img, i) => `
            <button type="button" class="v-thumb" data-photo="${i}" aria-label="Ver foto ${i + 1}" aria-current="${i === index}"><img src="${esc(img.sm || img.lg)}" alt=""></button>`).join("")}</div>` : ""}
        </div>
        <div class="v-product__info">
          ${categoryLabel || p.brand ? `<p class="v-eyebrow">${esc([categoryLabel, p.brand].filter(Boolean).join(" · "))}</p>` : ""}
          <h2 class="v-product__name" id="v-product-name">${esc(p.name)}</h2>
          <p class="v-product__price">${money(prices.unit)}</p>
          ${prices.wholesale ? `<p class="v-product__wholesale">Por mayor <strong>${money(prices.wholesale)}</strong> llevando ${pricing.minPairs} o más productos (podés combinar)</p>` : ""}
          <fieldset class="v-sizes">
            <legend>Elegí talle</legend>
            <div class="v-sizes__list">${p.sizes.map((s) => `
              <button type="button" class="v-size" data-size="${esc(s.size)}" aria-pressed="${s.size === state.size}" ${s.stock <= 0 ? `disabled aria-label="Talle ${esc(s.size)}, sin stock"` : ""}>${esc(s.size)}</button>`).join("")}
            </div>
            <p class="v-hint" data-hint>${state.size ? (max > 0 ? (max <= LOW_STOCK ? `¡Quedan ${max}!` : "Hay stock") : "Ya agregaste todo lo que hay de este talle") : "Tocá un talle para continuar"}</p>
          </fieldset>
          <div class="v-buy">
            <div class="v-stepper" role="group" aria-label="Cantidad">
              <button type="button" data-qty="-1" aria-label="Restar uno" ${!state.size || state.qty <= 1 ? "disabled" : ""}>${icon("minus")}</button>
              <output aria-live="polite">${state.qty}</output>
              <button type="button" data-qty="1" aria-label="Sumar uno" ${!state.size || state.qty >= max ? "disabled" : ""}>${icon("plus")}</button>
            </div>
            <button class="v-btn v-btn--primary v-btn--block" type="button" data-add ${!state.size || max <= 0 ? "disabled" : ""}>
              ${state.size ? `${icon("bag")} Agregar al pedido` : "Elegí un talle"}
            </button>
          </div>
          ${info.whatsapp ? `<a class="v-link" href="${esc(whatsappLink(info.whatsapp, `¡Hola! Quería consultar por ${p.name}${state.size ? ` en talle ${state.size}` : ""}.`))}" target="_blank" rel="noopener">${icon("whatsapp")} Consultar por este producto</a>` : ""}
        </div>
      </div>`;
  }
  productDialog.addEventListener("click", (event) => {
    if (event.target === productDialog || event.target.closest("[data-close]")) { closeToCatalog(); return; }
    const photoBtn = event.target.closest("[data-photo]");
    if (photoBtn) { state.photoIndex = Number(photoBtn.dataset.photo); renderProduct(); return; }
    const sizeBtn = event.target.closest("[data-size]");
    if (sizeBtn) { state.size = sizeBtn.dataset.size; state.qty = 1; renderProduct(); productDialog.querySelector(`[data-size="${CSS.escape(state.size)}"]`)?.focus(); return; }
    const qtyBtn = event.target.closest("[data-qty]");
    if (qtyBtn) { state.qty += Number(qtyBtn.dataset.qty); renderProduct(); productDialog.querySelector(`[data-qty="${qtyBtn.dataset.qty}"]`)?.focus(); return; }
    if (event.target.closest("[data-add]")) {
      const { added } = cart.add(state.product.id, state.size, state.qty);
      if (added) {
        toast(`${plural(added, "producto agregado", "productos agregados")} a tu pedido`, { label: "Ver pedido", hash: "#pedido" });
        closeToCatalog();
      }
    }
  });
  productDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeToCatalog(); });

  // --- pedido ---
  function renderCart() {
    const lines = cart.lines();
    const quote = pricing.quote(lines, "mayor");
    const message = lines.length ? buildOrderMessage({ config: { ...config, orderShippingNote: false }, channel: {}, quote }) : "";
    cartDialog.innerHTML = `
      <div class="v-cart">
        <div class="v-cart__head">
          <h2 id="v-cart-title">Tu pedido</h2>
          <button class="v-icon-btn" type="button" data-close aria-label="Cerrar">${icon("close")}</button>
        </div>
        ${lines.length ? `
          <ul class="v-cart__lines">${quote.lines.map((line) => `
            <li class="v-line">
              ${line.product.images[0] ? `<img src="${esc(line.product.images[0].sm || line.product.images[0].lg)}" alt="" width="64" height="80">` : `<span class="v-line__noimg"></span>`}
              <div class="v-line__info">
                <strong>${esc(line.product.name)}</strong>
                <span class="v-muted">Talle ${esc(line.size)} · ${money(line.price)}${line.price < line.unitPrice ? " (por mayor)" : ""}</span>
                <div class="v-stepper v-stepper--sm" role="group" aria-label="Cantidad de ${esc(line.product.name)}">
                  <button type="button" data-line="${esc(line.productId)}" data-line-size="${esc(line.size)}" data-delta="-1" aria-label="Restar uno">${icon("minus")}</button>
                  <output>${line.qty}</output>
                  <button type="button" data-line="${esc(line.productId)}" data-line-size="${esc(line.size)}" data-delta="1" aria-label="Sumar uno" ${line.qty >= cart.maxFor(line.productId, line.size) ? "disabled" : ""}>${icon("plus")}</button>
                </div>
              </div>
              <span class="v-line__total">${money(line.subtotal)}</span>
            </li>`).join("")}
          </ul>
          <div class="v-cart__summary">
            ${pricing.hasWholesale ? `<p class="v-note${quote.isWholesale ? " v-note--ok" : ""}">${quote.isWholesale
              ? `${icon("check")} Precio por mayor aplicado (${pricing.minPairs} o más productos).`
              : `Sumá ${plural(quote.pairsToWholesale, "producto")} más para el precio por mayor.`}</p>` : ""}
            <p class="v-cart__total"><span>Total</span><strong>${money(quote.total)}</strong></p>
            <a class="v-btn v-btn--whatsapp v-btn--block" href="${esc(whatsappLink(info.whatsapp, message))}" target="_blank" rel="noopener" data-send>${icon("whatsapp")} Enviar pedido por WhatsApp</a>
            <button class="v-link v-link--muted" type="button" data-clear>Vaciar pedido</button>
          </div>` : `
          <div class="v-cart__empty">
            <p>Todavía no agregaste productos.</p>
            <button class="v-btn v-btn--primary" type="button" data-close>Ver productos</button>
          </div>`}
      </div>`;
  }
  cartDialog.addEventListener("click", (event) => {
    if (event.target === cartDialog || event.target.closest("[data-close]")) { closeToCatalog(); return; }
    const step = event.target.closest("[data-delta]");
    if (step) {
      const { line: id, lineSize: size, delta } = step.dataset;
      cart.setQty(id, size, cart.qtyOf(id, size) + Number(delta));
      renderCart();
      return;
    }
    if (event.target.closest("[data-clear]") && confirm("¿Vaciar tu pedido?")) { cart.clear(); renderCart(); }
  });
  cartDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeToCatalog(); });

  function updateCartSummary() {
    const count = cart.count();
    const badge = $("[data-cart-count]");
    badge.hidden = count === 0;
    badge.textContent = count;
    const bar = $("[data-cartbar]");
    bar.hidden = count === 0;
    $("[data-cartbar-text]").textContent = `Ver pedido (${count})`;
    $("[data-cartbar-total]").textContent = money(pricing.quote(cart.lines(), "mayor").total);
  }
  cart.subscribe(updateCartSummary);
  updateCartSummary();

  // --- avisos ---
  let toastTimer;
  function toast(text, action) {
    const box = $("[data-toast]");
    box.innerHTML = `<span>${esc(text)}</span>${action ? `<a href="${esc(action.hash)}">${esc(action.label)}</a>` : ""}`;
    box.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove("is-visible"), 3500);
  }

  // --- navegación con el botón "atrás" del celular ---
  // Si la ventana se abrió desde la tienda, "cerrar" vuelve atrás; si se entró directo con
  // un link a un producto, se queda en la tienda (no saca a la persona del sitio).
  let openedHere = false;
  function closeToCatalog() {
    if (!(location.hash.startsWith("#p/") || location.hash === "#pedido")) return;
    if (openedHere) {
      openedHere = false;
      history.back();
    } else {
      history.replaceState(null, "", location.pathname + location.search);
      route();
    }
  }
  function route() {
    const hash = location.hash;
    const slug = hash.startsWith("#p/") ? decodeURIComponent(hash.slice(3)) : null;
    const product = slug ? products.find((p) => p.slug === slug) : null;
    if (product) {
      if (state.product?.id !== product.id) Object.assign(state, { product, size: null, qty: 1, photoIndex: 0 });
      renderProduct();
      if (!productDialog.open) productDialog.showModal();
    } else if (productDialog.open) {
      productDialog.close();
      state.product = null;
    }
    if (hash === "#pedido") {
      renderCart();
      if (!cartDialog.open) cartDialog.showModal();
    } else if (cartDialog.open) {
      cartDialog.close();
    }
  }
  window.addEventListener("hashchange", () => {
    openedHere = location.hash.startsWith("#p/") || location.hash === "#pedido";
    route();
  });

  renderGrid();
  route();
}

start();
