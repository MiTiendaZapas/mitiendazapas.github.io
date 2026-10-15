/*
 * PANEL del cliente (tiendas con stock propio). Secciones:
 *   Productos   cargar, editar, copiar, pausar, ordenar y mover stock
 *               (tiendas con stock de Brasil: además, cada modelo de Brasil con su precio,
 *               ocultarlo o sumarle los pares que el cliente tiene en su casa)
 *   Categorías  crear, renombrar, ordenar y borrar
 *   Mi tienda   nombre, logo, WhatsApp, redes, color, textos, venta por mayor y clave
 *   Ayuda       guía corta
 *
 * Habla con el programa del panel (functions/api/panel/). Todo se arma con textContent
 * (nunca HTML con datos), así nada de lo cargado puede meter código en la página.
 */
import { icon } from "../js/interfaz/icons.js";
import { createPricing } from "../js/pricing.js";
import { sortSizes } from "../js/talles.js";
import { CATEGORY_ORDERS, PRODUCT_ORDERS, sortProducts } from "../vidriera/orden.js";

const config = window.STORE_CONFIG ?? {};
const root = document.getElementById("panel");
const top = document.getElementById("panel-top");
const toastBox = document.getElementById("panel-toast");
const API = "/api/panel";
// WhatsApp de la plataforma (L.A IMP): para quien se olvidó la clave.
const HELP_WHATSAPP = "5491153773771";
const money = (n) => `$${Number(n || 0).toLocaleString("es-AR")}`;
const SIZE_PRESETS = [
  { label: "Ropa (S a XL)", sizes: ["S", "M", "L", "XL"] },
  { label: "Ropa (XS a XXL)", sizes: ["XS", "S", "M", "L", "XL", "XXL"] },
  { label: "Calzado (35 a 44)", sizes: ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44"] },
  { label: "Talle único", sizes: ["Único"] },
];
const COLORS = [
  { value: "#18181b", label: "Negro" }, { value: "#1d4ed8", label: "Azul" }, { value: "#047857", label: "Verde" },
  { value: "#b91c1c", label: "Rojo" }, { value: "#7c3aed", label: "Violeta" }, { value: "#db2777", label: "Rosa" },
  { value: "#c2410c", label: "Naranja" }, { value: "#0f766e", label: "Turquesa" },
];
const TABS = [
  { id: "productos", label: "Productos" },
  { id: "categorias", label: "Categorías" },
  { id: "tienda", label: "Mi tienda" },
  { id: "ayuda", label: "Ayuda" },
];

const state = {
  store: null, usuario: null, products: [], categories: {}, settings: {},
  limits: { imagesPerProduct: 6, products: 150 }, search: "", filter: "todos",
  // Stock de Brasil (solo algunas tiendas): modelos, precios de la lista y qué se está mirando.
  br: null, listPricing: null, view: "br", brSearch: "", brFilter: "todos",
  guard: null,   // cambios sin guardar en la pantalla abierta (ver route)
};

// --- piezas chicas ---------------------------------------------------------------
/** Crea un elemento: h("button", { class: "btn", onclick }, "Texto", otroElemento). */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "class") el.className = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

function toast(text, kind = "ok") {
  const item = h("p", { class: `panel-toast__item panel-toast__item--${kind}` }, text);
  toastBox.append(item);
  setTimeout(() => item.remove(), kind === "error" ? 6000 : 3000);
}

async function api(path, { method = "GET", body, form } = {}) {
  const options = { method, credentials: "same-origin", headers: {} };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  if (form) options.body = form;
  let response;
  try {
    response = await fetch(API + path, options);
  } catch {
    throw new Error("Sin conexión. Revisá internet y probá de nuevo.");
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== "/ingresar") {
    // Al abrir el panel sin haber ingresado no es un error: solo se pide ingresar.
    showLogin(state.store ? "Tu sesión terminó. Ingresá de nuevo." : "");
    throw new Error("Tenés que ingresar de nuevo.");
  }
  if (!response.ok) throw new Error(data.error || "Hubo un problema. Probá de nuevo.");
  return data;
}

/** Botón que se desactiva mientras trabaja y muestra el error si falla. */
async function busy(button, task) {
  if (button) button.disabled = true;
  try {
    return await task();
  } catch (e) {
    toast(e.message, "error");
    return undefined;
  } finally {
    if (button) button.disabled = false;
  }
}

const storeUrl = (path) => `/api/tienda/${encodeURIComponent(state.store)}/${path}`;
const totalStock = (product) => product.sizes.reduce((sum, s) => sum + s.stock, 0);
const categoryName = (id) => (Object.hasOwn(state.categories, id) ? state.categories[id] : id);
const field = (id, label, input, help) => h("div", { class: "panel-field" },
  h("label", { for: id }, label), input, help ? h("small", { class: "panel-muted" }, help) : null);

/**
 * Botón claro / oscuro. El panel abre en blanco; si el celular está en modo oscuro, en
 * oscuro. Lo que elige el cliente con el botón queda guardado en ese celular (theme.js).
 */
function themeButton() {
  const theme = window.storeTheme;
  if (!theme?.available) return null;
  const dark = () => theme.current() === "dark";
  const button = h("button", { class: "btn btn--ghost btn--sm panel-theme", type: "button" });
  const paint = () => {
    button.innerHTML = icon(dark() ? "sun" : "moon");
    button.setAttribute("aria-label", dark() ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
  };
  button.addEventListener("click", () => { theme.toggle(); paint(); });
  paint();
  return button;
}

function renderTop({ loggedIn }) {
  const current = (location.hash.slice(1).split("/")[0]) || "productos";
  top.replaceChildren(
    h("div", { class: "panel-top__inner" },
      h("div", { class: "panel-top__title" },
        h("strong", {}, state.settings.name || config.name || "Mi tienda"),
        h("span", {}, "Panel de tu tienda")),
      h("div", { class: "panel-top__actions" },
        themeButton(),
        loggedIn ? h("a", { class: "btn btn--outline btn--sm", href: "../", target: "_blank", rel: "noopener" }, "Ver tienda") : null,
        loggedIn ? h("button", { class: "btn btn--ghost btn--sm", type: "button", onclick: logout }, "Salir") : null)),
    ...(loggedIn ? [h("nav", { class: "panel-tabs", "aria-label": "Secciones del panel" },
      TABS.map((t) => h("a", { href: `#${t.id}`, class: "panel-tab", "aria-current": current === t.id || (t.id === "productos" && ["editar", "nuevo", "br", "precios"].includes(current)) ? "page" : null }, t.label)))] : []));
}

// --- ingreso ---------------------------------------------------------------------
function showLogin(message = "") {
  state.store = null;
  renderTop({ loggedIn: false });
  const error = h("p", { class: "panel-error", role: "alert" }, message);
  const user = h("input", { id: "usuario", name: "usuario", autocomplete: "username", autocapitalize: "none", required: true, class: "panel-input" });
  const pass = h("input", { id: "clave", name: "clave", type: "password", autocomplete: "current-password", required: true, class: "panel-input" });
  const button = h("button", { class: "btn btn--primary btn--lg", type: "submit" }, "Ingresar");
  const form = h("form", { class: "panel-card panel-login", onsubmit: async (event) => {
    event.preventDefault();
    button.disabled = true;
    error.textContent = "";
    try {
      await api("/ingresar", { method: "POST", body: { usuario: user.value, clave: pass.value } });
      await start();
    } catch (e) {
      error.textContent = e.message;
      button.disabled = false;
    }
  } },
    h("h1", {}, "Ingresá a tu panel"),
    h("p", { class: "panel-muted" }, "Con el usuario y la clave que te pasamos."),
    field("usuario", "Usuario", user), field("clave", "Clave", pass),
    error, button,
    h("a", { class: "panel-forgot", target: "_blank", rel: "noopener",
      href: `https://wa.me/${HELP_WHATSAPP}?text=${encodeURIComponent(`¡Hola! Me olvidé la clave del panel de mi tienda${config.name ? ` (${config.name})` : ""}.`)}` },
    "¿Te olvidaste la clave? Escribinos por WhatsApp"));
  root.replaceChildren(form);
  user.focus();
}

async function logout() {
  await api("/salir", { method: "POST" }).catch(() => {});
  showLogin("Saliste del panel.");
}

// --- productos: lista --------------------------------------------------------------
function matchesFilter(p) {
  if (state.filter === "sin-stock") return totalStock(p) === 0;
  if (state.filter === "pausados") return p.hidden === true;
  if (state.filter.startsWith("cat:")) return p.category === state.filter.slice(4);
  return true;
}

/** Pestaña Productos. Con stock de Brasil, arriba se elige qué mirar: Brasil o los productos propios. */
function renderProducts() {
  if (!state.br) return renderOwnProducts();
  const switcher = h("div", { class: "panel-switcher", role: "group", "aria-label": "Qué productos ver" },
    [["br", `Stock de Brasil (${state.br.products.length})`], ["propios", `Mis productos (${state.products.length})`]].map(([id, label]) =>
      h("button", { type: "button", class: "panel-switcher__btn", "aria-pressed": String(state.view === id),
        onclick: () => { state.view = id; renderProducts(); } }, label)));
  if (state.view === "br") renderBrProducts();
  else renderOwnProducts();
  root.prepend(switcher);
}

/** Botón "Cambiar precios" (arriba de las listas de productos). */
function pricesButton() {
  return h("a", { class: "btn btn--outline btn--sm", href: "#precios" }, "Cambiar precios");
}

/** Subir o bajar todos los precios en porcentaje (por ejemplo, por la inflación). */
function renderPriceChange() {
  const percent = h("input", { id: "pc-percent", class: "panel-input", inputmode: "decimal", placeholder: "Ej: 10", autocomplete: "off" });
  const direction = h("select", { id: "pc-direction", class: "panel-input" },
    h("option", { value: "1" }, "Subir"), h("option", { value: "-1" }, "Bajar"));
  const own = h("input", { id: "pc-own", type: "checkbox", checked: true });
  const br = state.br ? h("input", { id: "pc-br", type: "checkbox", checked: true }) : null;
  const preview = h("p", { class: "panel-muted", role: "status" });
  const value = () => Number(String(percent.value).replace(",", ".")) * Number(direction.value);
  const example = (price) => Math.max(100, Math.round((price * (1 + value() / 100)) / 100) * 100);
  const paint = () => {
    const v = value();
    preview.textContent = Number.isFinite(v) && v !== 0 && Math.abs(v) <= 100
      ? `Ejemplo: un producto de ${money(60000)} pasa a ${money(example(60000))}. Se redondea a los $100.`
      : "Escribí el porcentaje, por ejemplo 10.";
  };
  percent.addEventListener("input", paint);
  direction.addEventListener("change", paint);
  paint();
  const apply = h("button", { class: "btn btn--primary btn--lg", type: "submit" }, "Aplicar");
  const form = h("form", { class: "panel-editor", onsubmit: async (event) => {
    event.preventDefault();
    const v = value();
    if (!Number.isFinite(v) || v === 0) return toast("Escribí el porcentaje, por ejemplo 10.", "error");
    const what = [own.checked ? "tus productos" : null, br?.checked ? "los modelos de Brasil" : null].filter(Boolean).join(" y ");
    if (!what) return toast("Elegí a qué productos cambiarles el precio.", "error");
    if (!confirm(`¿${v > 0 ? "Subir" : "Bajar"} ${Math.abs(v)}% los precios de ${what}?`)) return;
    const done = await busy(apply, async () => {
      await api("/precios", { method: "POST", body: { percent: v, own: own.checked, br: br?.checked === true } });
      await loadData();
      return true;
    });
    if (done) {
      toast(`Listo: precios ${v > 0 ? "subidos" : "bajados"} ${Math.abs(v)}%.`);
      location.hash = "#productos";
    }
  } },
    h("div", { class: "panel-editor__head" },
      h("a", { class: "btn btn--ghost btn--sm", href: "#productos" }, "← Volver"),
      h("h1", {}, "Cambiar precios")),
    h("section", { class: "panel-card" },
      h("p", { class: "panel-muted" }, "Sube o baja todos los precios de una vez, en porcentaje. También el precio por mayor y el precio anterior de las ofertas."),
      h("div", { class: "panel-two" }, field("pc-direction", "¿Subir o bajar?", direction), field("pc-percent", "Porcentaje (%)", percent)),
      preview),
    h("section", { class: "panel-card" }, h("h2", {}, "¿A qué productos?"),
      h("label", { class: "panel-switch", for: "pc-own" }, own, h("span", {}, "Mis productos")),
      br ? h("label", { class: "panel-switch", for: "pc-br" }, br, h("span", {}, "Modelos de Brasil"),
        h("small", { class: "panel-muted" }, "Los que tienen el precio de tu lista y los que tienen tu precio.")) : null),
    h("div", { class: "panel-savebar" }, apply));
  root.replaceChildren(form);
  window.scrollTo(0, 0);
}

function renderOwnProducts() {
  const full = state.products.length >= state.limits.products;
  const list = h("ul", { class: "panel-list" });
  const chips = h("div", { class: "panel-chips", role: "group", "aria-label": "Filtrar productos" });

  function renderChips() {
    const options = [
      { id: "todos", label: `Todos (${state.products.length})` },
      { id: "sin-stock", label: `Sin stock (${state.products.filter((p) => totalStock(p) === 0).length})` },
      { id: "pausados", label: `Pausados (${state.products.filter((p) => p.hidden).length})` },
      ...Object.entries(state.categories).map(([id, label]) => ({ id: `cat:${id}`, label })),
    ];
    chips.replaceChildren(...options.map((o) => h("button", { type: "button", class: "panel-chip", "aria-pressed": String(state.filter === o.id),
      onclick: () => { state.filter = o.id; renderChips(); renderItems(); } }, o.label)));
  }
  function renderItems() {
    const term = state.search.trim().toLowerCase();
    // La lista sale en el mismo orden que la tienda.
    const shown = sortProducts(state.products, state.categories, state.settings).filter((p) => matchesFilter(p)
      && (!term || `${p.name} ${p.brand ?? ""} ${categoryName(p.category)}`.toLowerCase().includes(term)));
    // Subir / bajar solo si eligió ordenar a mano, y viendo todos (si no, sería confuso).
    const canOrder = state.settings.productOrder === "manual" && state.filter === "todos" && !term;
    list.replaceChildren(...(shown.length
      ? shown.map((p) => itemView(p, canOrder, renderAll))
      : [h("li", { class: "panel-empty" }, state.products.length ? "No hay productos con ese filtro." : "Todavía no cargaste productos. Tocá “Nuevo producto” para empezar.")]));
  }
  function renderAll() { renderChips(); renderItems(); }

  root.replaceChildren(
    h("div", { class: "panel-toolbar" },
      h("button", { class: "btn btn--primary", type: "button", disabled: full, onclick: () => openEditor(null) }, "+ Nuevo producto"),
      pricesButton(),
      h("span", { class: "panel-muted" }, `${state.products.length} de ${state.limits.products} productos`)),
    h("input", { class: "panel-input", type: "search", placeholder: "Buscar producto", value: state.search, "aria-label": "Buscar producto",
      oninput: (e) => { state.search = e.target.value; renderItems(); } }),
    chips, list);
  renderAll();
}

function itemView(product, canOrder, refresh) {
  const total = totalStock(product);
  // Vecinos de la MISMA categoría en el orden de la tienda (subir/bajar no cruza categorías).
  const ordered = sortProducts(state.products, state.categories, state.settings);
  const position = ordered.indexOf(product);
  const neighbor = (delta) => (ordered[position + delta]?.category === product.category ? ordered[position + delta] : null);
  const stockBox = h("div", { class: "panel-quick", hidden: true });
  const thumb = product.images[0]
    ? h("img", { src: storeUrl(product.images[0].sm), alt: "", width: 64, height: 80, loading: "lazy" })
    : h("span", { class: "panel-thumb--empty" }, "Sin foto");
  const badge = h("button", { class: `panel-stock${total === 0 ? " is-empty" : ""}`, type: "button", "aria-expanded": "false",
    onclick: () => {
      const open = stockBox.hidden;
      stockBox.hidden = !open;
      badge.setAttribute("aria-expanded", String(open));
      if (open) renderQuickStock(product, stockBox, badge);
    } }, total === 0 ? "Sin stock" : `${total} en stock`);

  const move = (delta) => async (event) => busy(event.currentTarget, async () => {
    const list = [...state.products];
    const a = list.indexOf(product);
    const b = list.indexOf(neighbor(delta));
    [list[a], list[b]] = [list[b], list[a]];
    await api("/orden", { method: "POST", body: { ids: list.map((p) => p.id) } });
    state.products = list;
    refresh();
  });
  const togglePause = async (event) => busy(event.currentTarget, async () => {
    const { hidden } = await api("/pausar", { method: "POST", body: { id: product.id, hidden: !product.hidden } });
    product.hidden = hidden;
    toast(hidden ? "Producto pausado: ya no se ve en la tienda." : "Producto visible otra vez en la tienda.");
    refresh();
  });
  const copy = async (event) => busy(event.currentTarget, async () => {
    const { product: created } = await api("/copiar", { method: "POST", body: { id: product.id } });
    state.products.splice(state.products.indexOf(product) + 1, 0, created);
    toast("Copia creada (pausada). Cambiale lo que haga falta y mostrala.");
    openEditor(created);
  });

  return h("li", { class: `panel-item${product.hidden ? " is-paused" : ""}` },
    h("div", { class: "panel-item__row" },
      h("div", { class: "panel-thumb" }, thumb),
      h("div", { class: "panel-item__info" },
        h("strong", {}, product.name),
        h("span", { class: "panel-muted" }, [categoryName(product.category), product.brand].filter(Boolean).join(" · ")),
        h("span", {}, money(product.price), product.wholesalePrice ? h("small", { class: "panel-muted" }, ` · por mayor ${money(product.wholesalePrice)}`) : null),
        product.hidden ? h("span", { class: "panel-paused-tag" }, "Pausado: no se ve en la tienda") : null,
        tagsFor(product)),
      h("div", { class: "panel-item__actions" },
        badge,
        h("button", { class: "btn btn--outline btn--sm", type: "button", onclick: () => openEditor(product) }, "Editar"),
        h("details", { class: "panel-more" },
          h("summary", { class: "btn btn--ghost btn--sm", "aria-label": `Más opciones de ${product.name}` }, "Más"),
          h("div", { class: "panel-more__menu" },
            h("button", { type: "button", onclick: togglePause }, product.hidden ? "Mostrar en la tienda" : "Pausar (ocultar)"),
            h("button", { type: "button", onclick: copy }, "Copiar (otro color)"),
            canOrder && neighbor(-1) ? h("button", { type: "button", onclick: move(-1) }, "Subir un lugar") : null,
            canOrder && neighbor(1) ? h("button", { type: "button", onclick: move(1) }, "Bajar un lugar") : null)))),
    stockBox);
}

/** Stock rápido: "vendí uno" sin entrar a editar. Se guarda al toque. */
function renderQuickStock(product, box, badge) {
  box.replaceChildren(h("p", { class: "panel-muted" }, "Sumá o restá unidades. Se guarda solo."),
    h("div", { class: "panel-quick__grid" }, product.sizes.map((s) => {
      const value = h("output", { class: "panel-quick__value" }, s.stock);
      const change = (delta) => (event) => busy(event.currentTarget, async () => {
        const { stock } = await api("/stock", { method: "POST", body: { id: product.id, size: s.size, delta } });
        s.stock = stock;
        value.textContent = stock;
        const total = totalStock(product);
        badge.textContent = total === 0 ? "Sin stock" : `${total} en stock`;
        badge.classList.toggle("is-empty", total === 0);
      });
      return h("div", { class: "panel-quick__size" },
        h("span", { class: "panel-quick__label" }, `Talle ${s.size}`),
        h("div", { class: "panel-stepper" },
          h("button", { type: "button", "aria-label": `Restar uno al talle ${s.size}`, onclick: change(-1) }, "−"),
          value,
          h("button", { type: "button", "aria-label": `Sumar uno al talle ${s.size}`, onclick: change(1) }, "+")));
    })));
}

/** Etiquetas chicas en la lista: destacado y oferta. */
function tagsFor(product) {
  const tags = [product.featured ? "★ Destacado" : null, product.compareAt ? "Oferta" : null].filter(Boolean);
  return tags.length ? h("span", { class: "panel-tags" }, tags.map((tag) => h("span", { class: "panel-tag" }, tag))) : null;
}

/**
 * Opcionales de un producto (propio o de Brasil): descripción, precio anterior (oferta) y
 * destacado. Devuelve los elementos para el formulario y cómo leer lo cargado.
 */
function extraFields(prefix, draft) {
  const description = h("textarea", { id: `${prefix}-description`, class: "panel-input panel-textarea", maxlength: 500, rows: 3,
    placeholder: "Ej: Algodón peinado. Calce amplio, si dudás pedí un talle menos." }, draft.description ?? "");
  const compareAt = h("input", { id: `${prefix}-compare`, class: "panel-input", inputmode: "numeric", value: draft.compareAt ?? "", placeholder: "Opcional" });
  const featured = h("input", { id: `${prefix}-featured`, type: "checkbox", checked: draft.featured === true });
  return {
    nodes: [
      field(`${prefix}-description`, "Descripción (opcional)", description, "Material, medidas, cómo calza… Se ve al abrir el producto."),
      field(`${prefix}-compare`, "Precio anterior (opcional)", compareAt, "Para mostrar una oferta: se ve tachado al lado del precio, con el cartel “Oferta”."),
      h("label", { class: "panel-switch", for: `${prefix}-featured` }, featured, h("span", {}, "Destacado"),
        h("small", { class: "panel-muted" }, "Sale primero en su categoría.")),
    ],
    read: () => ({ description: description.value, compareAt: compareAt.value.replace(/\D/g, ""), featured: featured.checked }),
  };
}

// --- stock de Brasil ------------------------------------------------------------------
const brTotal = (product, part) => product.sizes.reduce((sum, s) => sum + s[part], 0);
const brChanged = (p) => Boolean(p.price || p.wholesalePrice || p.hidden || p.description || p.compareAt || p.featured || brTotal(p, "casa"));

/** Precio de la lista para un modelo de Brasil (sin el precio propio que le haya puesto el cliente). */
function listPrice(product) {
  const prices = state.listPricing?.forProduct({ ...product, price: null, wholesalePrice: null, manual: false });
  return prices ? { unit: prices.unit, wholesale: prices.wholesale } : { unit: null, wholesale: null };
}

function matchesBrFilter(p) {
  if (state.brFilter === "cambios") return brChanged(p);
  if (state.brFilter === "ocultos") return p.hidden;
  if (state.brFilter === "casa") return brTotal(p, "casa") > 0;
  if (state.brFilter.startsWith("cat:")) return p.category === state.brFilter.slice(4);
  return true;
}

function renderBrProducts() {
  const products = [...state.br.products].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  const list = h("ul", { class: "panel-list" });
  const chips = h("div", { class: "panel-chips", role: "group", "aria-label": "Filtrar modelos de Brasil" });
  const brCategories = [...new Set(products.map((p) => p.category))];

  function renderChips() {
    const count = (fn) => products.filter(fn).length;
    const options = [
      { id: "todos", label: `Todos (${products.length})` },
      { id: "cambios", label: `Con cambios tuyos (${count(brChanged)})` },
      { id: "casa", label: `Con pares tuyos (${count((p) => brTotal(p, "casa") > 0)})` },
      { id: "ocultos", label: `Ocultos (${count((p) => p.hidden)})` },
      ...(brCategories.length > 1 ? brCategories.map((id) => ({ id: `cat:${id}`, label: categoryName(id) })) : []),
    ];
    chips.replaceChildren(...options.map((o) => h("button", { type: "button", class: "panel-chip", "aria-pressed": String(state.brFilter === o.id),
      onclick: () => { state.brFilter = o.id; renderChips(); renderItems(); } }, o.label)));
  }
  function renderItems() {
    const term = state.brSearch.trim().toLowerCase();
    const shown = products.filter((p) => matchesBrFilter(p) && (!term || `${p.name} ${p.brand ?? ""}`.toLowerCase().includes(term)));
    list.replaceChildren(...(shown.length
      ? shown.map((p) => brItemView(p, () => { renderChips(); renderItems(); }))
      : [h("li", { class: "panel-empty" }, "No hay modelos con ese filtro.")]));
  }

  root.replaceChildren(
    h("div", { class: "panel-toolbar" }, pricesButton()),
    h("p", { class: "panel-muted panel-intro" },
      "Estos modelos y su stock llegan solos y se actualizan solos. Tocá “Editar” en uno para ponerle tu precio, ocultarlo o sumar los pares que tenés en tu casa."),
    h("input", { class: "panel-input", type: "search", placeholder: "Buscar modelo", value: state.brSearch, "aria-label": "Buscar modelo",
      oninput: (e) => { state.brSearch = e.target.value; renderItems(); } }),
    chips, list);
  renderChips();
  renderItems();
}

function brItemView(product, refresh) {
  const fromBrazil = brTotal(product, "br");
  const own = brTotal(product, "casa");
  const unit = product.price || listPrice(product).unit;
  const image = product.images[0];
  const thumb = image
    ? h("img", { src: image.sm || image.lg, alt: "", width: 64, height: 80, loading: "lazy" })
    : h("span", { class: "panel-thumb--empty" }, "Sin foto");
  const toggle = async (event) => busy(event.currentTarget, async () => {
    const { change } = await api("/br", { method: "POST", body: brBody(product, { hidden: !product.hidden }) });
    product.hidden = change?.hidden === true;
    toast(product.hidden ? "Modelo oculto: ya no se ve en tu tienda." : "Modelo visible otra vez en tu tienda.");
    refresh();
  });
  const stockText = own
    ? `${fromBrazil} de Brasil + ${own} tuyos`
    : fromBrazil ? `${fromBrazil} de Brasil` : "Sin stock";
  return h("li", { class: `panel-item${product.hidden ? " is-paused" : ""}` },
    h("div", { class: "panel-item__row" },
      h("div", { class: "panel-thumb" }, thumb),
      h("div", { class: "panel-item__info" },
        h("strong", {}, product.name),
        h("span", { class: "panel-muted" }, [categoryName(product.category), product.brand].filter(Boolean).join(" · ")),
        h("span", {}, unit ? money(unit) : "Sin precio",
          h("small", { class: "panel-muted" }, product.price ? " · tu precio" : " · precio de tu lista")),
        h("span", { class: "panel-muted" }, stockText),
        product.hidden ? h("span", { class: "panel-paused-tag" }, "Oculto: no se ve en tu tienda") : null,
        tagsFor(product)),
      h("div", { class: "panel-item__actions" },
        h("button", { class: "btn btn--outline btn--sm", type: "button", onclick: () => { location.hash = `#br/${encodeURIComponent(product.id)}`; } }, "Editar"),
        h("button", { class: "btn btn--ghost btn--sm", type: "button", onclick: toggle }, product.hidden ? "Mostrar" : "Ocultar"))));
}

/** Lo que se manda al guardar un modelo de Brasil (lo que no se cambia, queda como estaba). */
function brBody(product, changes = {}) {
  return {
    id: product.id,
    price: product.price ?? "", wholesalePrice: product.wholesalePrice ?? "", hidden: product.hidden === true,
    description: product.description ?? "", compareAt: product.compareAt ?? "", featured: product.featured === true,
    extra: product.sizes.filter((s) => s.casa > 0).map((s) => ({ size: s.size, stock: s.casa })),
    ...changes,
  };
}

function renderBrEditor(product) {
  const draft = structuredClone(product);
  const list = listPrice(product);
  const price = h("input", { id: "b-price", class: "panel-input", inputmode: "numeric", value: draft.price ?? "",
    placeholder: list.unit ? `${list.unit}` : "Ej: 60000" });
  const wholesale = h("input", { id: "b-wholesale", class: "panel-input", inputmode: "numeric", value: draft.wholesalePrice ?? "",
    placeholder: list.wholesale ? `${list.wholesale}` : "Opcional" });
  const visible = h("input", { id: "b-visible", type: "checkbox", checked: !draft.hidden });
  const extras = extraFields("b", draft);
  // Si la tienda no vende por mayor, no se pide precio por mayor.
  const sellsWholesale = state.settings.name ? state.settings.wholesale === true : state.listPricing?.hasWholesale !== false;
  const sizesBox = h("div", { class: "panel-sizes" });

  function renderSizes() {
    sizesBox.replaceChildren(
      h("div", { class: "panel-br-row panel-br-row--head", "aria-hidden": "true" },
        h("span", {}, "Talle"), h("span", {}, "De Brasil"), h("span", {}, "En tu casa")),
      ...draft.sizes.map((s, i) => {
        const value = h("output", { class: "panel-quick__value" }, s.casa);
        const set = (n) => { s.casa = Math.max(0, n); value.textContent = s.casa; };
        // Un talle que Brasil no tiene se puede quitar; los de Brasil quedan siempre.
        const removable = s.fresh || s.soloCasa;
        return h("div", { class: "panel-br-row" },
          s.fresh
            ? h("input", { class: "panel-input panel-size-row__name", value: s.size, maxlength: 12, "aria-label": "Talle nuevo", placeholder: "Talle",
              oninput: (e) => { s.size = e.target.value.trim(); } })
            : h("strong", {}, s.size),
          h("span", { class: "panel-muted" }, s.br ? `${s.br}` : "—"),
          h("div", { class: "panel-stepper" },
            h("button", { type: "button", "aria-label": `Restar uno al talle ${s.size}`, onclick: () => set(s.casa - 1) }, "−"),
            value,
            h("button", { type: "button", "aria-label": `Sumar uno al talle ${s.size}`, onclick: () => set(s.casa + 1) }, "+")),
          removable ? h("button", { type: "button", class: "panel-size-row__remove", "aria-label": `Quitar talle ${s.size}`,
            onclick: () => { draft.sizes.splice(i, 1); renderSizes(); } }, "×") : h("span", {}));
      }));
  }

  const saveButton = h("button", { class: "btn btn--primary btn--lg", type: "submit" }, "Guardar");
  const save = (body, message) => busy(saveButton, async () => {
    await api("/br", { method: "POST", body });
    await loadData();
    toast(message);
    state.guard = null;
    location.hash = "#productos";
  });
  const form = h("form", { class: "panel-editor", onsubmit: (event) => {
    event.preventDefault();
    const sizes = draft.sizes.filter((s) => s.size);
    save({
      id: product.id,
      price: price.value.replace(/\D/g, ""), wholesalePrice: wholesale.value.replace(/\D/g, ""), hidden: !visible.checked,
      extra: sizes.filter((s) => s.casa > 0).map((s) => ({ size: s.size, stock: s.casa })),
      ...extras.read(),
    }, "Cambios guardados.");
  } },
    h("div", { class: "panel-editor__head" },
      h("a", { class: "btn btn--ghost btn--sm", href: "#productos" }, "← Volver"),
      h("h1", {}, product.name)),
    h("section", { class: "panel-card panel-br-head" },
      product.images[0] ? h("img", { src: product.images[0].sm || product.images[0].lg, alt: "", width: 96, height: 120 }) : null,
      h("div", {},
        h("p", {}, [categoryName(product.category), product.brand].filter(Boolean).join(" · ")),
        h("p", { class: "panel-muted" }, "Modelo del stock de Brasil: las fotos, el nombre y el stock de Brasil se actualizan solos."))),
    h("section", { class: "panel-card" }, h("h2", {}, "Precio"),
      h("div", { class: "panel-two" },
        field("b-price", "Precio", price, list.unit ? `Vacío = el de tu lista (${money(list.unit)}).` : "Vacío = el de tu lista."),
        sellsWholesale ? field("b-wholesale", "Precio por mayor", wholesale, list.wholesale ? `Vacío = el de tu lista (${money(list.wholesale)}).` : "Opcional.") : null),
      h("label", { class: "panel-switch", for: "b-visible" }, visible, h("span", {}, "Se ve en la tienda"),
        h("small", { class: "panel-muted" }, "Destildalo para ocultar este modelo de tu tienda."))),
    h("section", { class: "panel-card" }, h("h2", {}, "Opcional"), ...extras.nodes),
    h("section", { class: "panel-card" }, h("h2", {}, "Talles"),
      h("p", { class: "panel-muted" }, "“De Brasil” se actualiza solo. En “En tu casa” sumá los pares que tenés vos: en la tienda se ven todos juntos."),
      sizesBox,
      h("button", { type: "button", class: "btn btn--outline btn--sm", onclick: () => {
        draft.sizes.push({ size: "", br: 0, casa: 1, fresh: true });
        renderSizes();
        sizesBox.querySelector(".panel-br-row:last-child input")?.focus();
      } }, "+ Otro talle")),
    brChanged(product) ? h("button", { class: "btn btn--ghost panel-delete", type: "button", onclick: () => {
      if (confirm("¿Volver este modelo a lo automático? Se borran tu precio y tus pares de este modelo.")) save({ id: product.id }, "El modelo volvió a lo automático.");
    } }, "Volver todo a lo automático") : null,
    h("div", { class: "panel-savebar" }, saveButton));

  root.replaceChildren(form);
  renderSizes();
  window.scrollTo(0, 0);
  const snapshot = () => JSON.stringify([price.value, wholesale.value, visible.checked, draft.sizes, extras.read()]);
  const initial = snapshot();
  state.guard = () => snapshot() !== initial;
}

// --- productos: editar / nuevo ----------------------------------------------------
function openEditor(product) {
  location.hash = product ? `#editar/${product.id}` : "#nuevo";
}

function renderEditor(product) {
  const draft = product
    ? { ...structuredClone(product), sizes: sortSizes(product.sizes) }
    : { name: "", brand: "", category: Object.keys(state.categories)[0] ?? "", price: "", wholesalePrice: "", sizes: [], images: [], hidden: false };
  let uploading = 0;
  const progress = new Map();   // foto que se está subiendo -> porcentaje

  // Fotos
  const photos = h("div", { class: "panel-photos" });
  const fileInput = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true, onchange: (e) => addPhotos([...e.target.files]) });
  function movePhoto(i, delta) {
    const [img] = draft.images.splice(i, 1);
    draft.images.splice(i + delta, 0, img);
    renderPhotos();
  }
  function renderPhotos() {
    const last = draft.images.length - 1;
    const tiles = draft.images.map((img, i) => h("div", { class: "panel-photo" },
      h("img", { src: storeUrl(img.sm), alt: `Foto ${i + 1}` }),
      i === 0 ? h("span", { class: "panel-photo__tag" }, "Portada") : null,
      h("button", { type: "button", class: "panel-photo__btn", "aria-label": `Quitar foto ${i + 1}`,
        onclick: () => { draft.images.splice(i, 1); renderPhotos(); } }, "×"),
      h("div", { class: "panel-photo__move" },
        i > 0 ? h("button", { type: "button", "aria-label": `Mover foto ${i + 1} a la izquierda`, onclick: () => movePhoto(i, -1) }, "←") : null,
        i < last ? h("button", { type: "button", "aria-label": `Mover foto ${i + 1} a la derecha`, onclick: () => movePhoto(i, 1) }, "→") : null)));
    const canAdd = draft.images.length + uploading < state.limits.imagesPerProduct;
    const loading = [...progress.values()].map((percent) => h("div", { class: "panel-photo panel-photo--loading" },
      h("span", {}, percent < 100 ? `Subiendo… ${percent}%` : "Guardando…"),
      h("span", { class: "panel-progress", style: `--progress:${percent}%` })));
    photos.replaceChildren(...tiles, ...loading,
      ...(canAdd ? [h("button", { type: "button", class: "panel-photo panel-photo--add", onclick: () => fileInput.click() }, "+ Foto")] : []), fileInput);
  }
  async function addPhotos(files) {
    fileInput.value = "";
    const room = state.limits.imagesPerProduct - draft.images.length - uploading;
    for (const file of files.slice(0, room)) {
      uploading += 1;
      progress.set(file, 0);
      renderPhotos();
      try {
        draft.images.push(await uploadImage(file, { endpoint: "/foto", sizes: [["grande", 1200, 0.82], ["chica", 480, 0.75]],
          onProgress: (percent) => { progress.set(file, percent); renderPhotos(); } }));
      } catch (e) {
        toast(e.message, "error");
      } finally {
        uploading -= 1;
        progress.delete(file);
        renderPhotos();
      }
    }
    if (files.length > room) toast(`Máximo ${state.limits.imagesPerProduct} fotos por producto.`, "error");
  }

  // Datos
  const name = h("input", { id: "f-name", class: "panel-input", maxlength: 80, required: true, value: draft.name });
  const NEW = "__nueva__";
  const categorySelect = h("select", { id: "f-category", class: "panel-input" },
    Object.entries(state.categories).map(([id, label]) => h("option", { value: id, selected: id === draft.category }, label)),
    h("option", { value: NEW, selected: Object.keys(state.categories).length === 0 }, "+ Nueva categoría…"));
  const newCategory = h("input", { id: "f-new-category", class: "panel-input", maxlength: 30, placeholder: "Ej: Remeras, Zapatillas, Buzos" });
  const newCategoryField = field("f-new-category", "Nombre de la categoría nueva", newCategory);
  const syncCategory = () => { newCategoryField.hidden = categorySelect.value !== NEW; };
  categorySelect.addEventListener("change", syncCategory);
  const price = h("input", { id: "f-price", class: "panel-input", inputmode: "numeric", required: true, value: draft.price ?? "", placeholder: "Ej: 25000" });
  const wholesale = h("input", { id: "f-wholesale", class: "panel-input", inputmode: "numeric", value: draft.wholesalePrice ?? "", placeholder: "Opcional" });
  const min = state.settings.wholesaleMin || 5;
  const wholesaleHelp = state.settings.wholesale === false
    ? "Tu tienda no tiene venta por mayor (se activa en “Mi tienda”)."
    : `Opcional. Se aplica llevando ${min} o más productos surtidos.`;
  const visible = h("input", { id: "f-visible", type: "checkbox", checked: !draft.hidden });
  const extras = extraFields("f", draft);

  // Talles
  const sizesBox = h("div", { class: "panel-sizes" });
  function renderSizes() {
    sizesBox.replaceChildren(
      ...draft.sizes.map((s, i) => {
        const value = h("output", { class: "panel-quick__value" }, s.stock);
        const set = (n) => { s.stock = Math.max(0, n); value.textContent = s.stock; };
        return h("div", { class: "panel-size-row" },
          h("input", { class: "panel-input panel-size-row__name", value: s.size, maxlength: 12, "aria-label": "Talle", placeholder: "Talle", oninput: (e) => { s.size = e.target.value; } }),
          h("div", { class: "panel-stepper" },
            h("button", { type: "button", "aria-label": "Restar uno", onclick: () => set(s.stock - 1) }, "−"),
            value,
            h("button", { type: "button", "aria-label": "Sumar uno", onclick: () => set(s.stock + 1) }, "+")),
          h("button", { type: "button", class: "panel-size-row__remove", "aria-label": `Quitar talle ${s.size}`, onclick: () => { draft.sizes.splice(i, 1); renderSizes(); } }, "×"));
      }),
      ...(draft.sizes.length ? [] : [h("p", { class: "panel-muted" }, "Agregá los talles que tenés y cuántas unidades de cada uno.")]));
  }
  /**
   * Botones de talles: dejan EXACTAMENTE esos talles (en su orden). Los que siguen
   * conservan su cantidad; si se va a sacar alguno que tiene unidades, se pregunta antes.
   */
  const usePreset = (sizes) => {
    const key = (size) => size.trim().toLowerCase();
    const wanted = new Set(sizes.map(key));
    const losing = draft.sizes.filter((s) => s.size.trim() && !wanted.has(key(s.size)) && s.stock > 0);
    if (losing.length && !confirm(`Se van a sacar los talles ${losing.map((s) => s.size).join(", ")}, que tienen unidades cargadas. ¿Seguir?`)) return;
    const kept = new Map(draft.sizes.filter((s) => wanted.has(key(s.size))).map((s) => [key(s.size), s.stock]));
    draft.sizes = sizes.map((size) => ({ size, stock: kept.get(key(size)) ?? 0 }));
    renderSizes();
  };

  const saveButton = h("button", { class: "btn btn--primary btn--lg", type: "submit" }, "Guardar");
  const form = h("form", { class: "panel-editor", onsubmit: async (event) => {
    event.preventDefault();
    if (uploading) return toast("Esperá a que terminen de subir las fotos.", "error");
    const category = categorySelect.value === NEW ? newCategory.value : categorySelect.value;
    const body = {
      id: product?.id,
      // La marca ya no se pide (se conserva la de los productos viejos que la tenían).
      name: name.value, brand: draft.brand ?? "", category,
      price: price.value.replace(/\D/g, ""), wholesalePrice: wholesale.value.replace(/\D/g, ""),
      sizes: sortSizes(draft.sizes.map((s) => ({ size: s.size.trim(), stock: s.stock })).filter((s) => s.size)),
      images: draft.images,
      hidden: !visible.checked,
      ...extras.read(),
    };
    const saved = await busy(saveButton, async () => {
      await api("/productos", { method: "POST", body });
      await loadData();
      return true;
    });
    if (saved) {
      toast(product ? "Cambios guardados." : "Producto agregado a tu tienda.");
      state.guard = null;
      location.hash = "#productos";
    }
  } },
    h("div", { class: "panel-editor__head" },
      h("a", { class: "btn btn--ghost btn--sm", href: "#productos" }, "← Volver"),
      h("h1", {}, product ? "Editar producto" : "Nuevo producto")),
    h("section", { class: "panel-card" }, h("h2", {}, "Fotos"),
      h("p", { class: "panel-muted" }, `Hasta ${state.limits.imagesPerProduct}. La primera es la portada; con las flechas cambiás el orden.`), photos),
    h("section", { class: "panel-card" }, h("h2", {}, "Datos"),
      field("f-name", "Nombre", name),
      field("f-category", "Categoría", categorySelect), newCategoryField,
      h("div", { class: "panel-two" },
        field("f-price", "Precio", price),
        field("f-wholesale", "Precio por mayor", wholesale, wholesaleHelp)),
      h("label", { class: "panel-switch", for: "f-visible" }, visible, h("span", {}, "Se ve en la tienda"),
        h("small", { class: "panel-muted" }, "Destildalo para pausarlo sin borrarlo."))),
    h("section", { class: "panel-card" }, h("h2", {}, "Opcional"), ...extras.nodes),
    h("section", { class: "panel-card" }, h("h2", {}, "Talles y cantidades"),
      h("div", { class: "panel-presets" }, SIZE_PRESETS.map((p) => h("button", { type: "button", class: "btn btn--outline btn--sm", onclick: () => usePreset(p.sizes) }, p.label)),
        h("button", { type: "button", class: "btn btn--outline btn--sm", onclick: () => { draft.sizes.push({ size: "", stock: 0 }); renderSizes(); sizesBox.querySelector(".panel-size-row:last-of-type input")?.focus(); } }, "+ Otro talle")),
      sizesBox),
    product ? h("button", { class: "btn btn--ghost panel-delete", type: "button", onclick: () => removeProduct(product) }, "Borrar este producto") : null,
    h("div", { class: "panel-savebar" }, saveButton));

  root.replaceChildren(form);
  syncCategory();
  renderPhotos();
  renderSizes();
  window.scrollTo(0, 0);
  // Si sale sin guardar, se le pregunta (ver route).
  const snapshot = () => JSON.stringify([name.value, categorySelect.value, newCategory.value, price.value, wholesale.value,
    visible.checked, draft.sizes, draft.images, uploading, extras.read()]);
  const initial = snapshot();
  state.guard = () => snapshot() !== initial;
}

async function removeProduct(product) {
  if (!confirm(`¿Borrar "${product.name}"? Se borran también sus fotos. No se puede deshacer.`)) return;
  const done = await busy(null, async () => {
    await api(`/productos/${encodeURIComponent(product.id)}`, { method: "DELETE" });
    await loadData();
    return true;
  });
  if (done) {
    toast("Producto borrado.");
    state.guard = null;
    location.hash = "#productos";
  }
}

// --- categorías -------------------------------------------------------------------
/**
 * Categorías y orden de la tienda. Acá todo se guarda solo, al momento (sin botón
 * "Guardar"): son cambios chicos y así una categoría nueva ya aparece al cargar un producto.
 */
function renderCategories() {
  let rows = Object.entries(state.categories).map(([id, label]) => ({ id, label }));
  const select = (id, options, value) => h("select", { id, class: "panel-input" },
    options.map((o) => h("option", { value: o.value, selected: o.value === value }, o.label)));
  const categoryOrder = select("o-categories", CATEGORY_ORDERS, state.settings.categoryOrder ?? "alfabetico");
  const productOrder = select("o-products", PRODUCT_ORDERS, state.settings.productOrder ?? "alfabetico");
  const manual = () => categoryOrder.value === "manual";
  // Cuántos productos usan cada categoría (los propios y, si hay, los de Brasil).
  const used = (id) => state.products.filter((p) => p.category === id).length
    + (state.br?.products.filter((p) => p.category === id).length ?? 0);
  const list = h("div", { class: "panel-cats" });
  const status = h("p", { class: "panel-muted panel-autosave", role: "status" }, "Los cambios se guardan solos.");

  // Un guardado por vez, en orden (si se tocan dos cosas rápido, no se pisan).
  let queue = Promise.resolve();
  function persist(task, message) {
    status.textContent = "Guardando…";
    queue = queue.then(async () => {
      try {
        await task();
        status.textContent = "Guardado.";
        if (message) toast(message);
      } catch (e) {
        status.textContent = "No se guardó el último cambio.";
        toast(e.message, "error");
        rows = Object.entries(state.categories).map(([id, label]) => ({ id, label }));
        renderRows();
      }
    });
    return queue;
  }
  const saveCategories = (message) => persist(async () => {
    const named = rows.filter((r) => r.label.trim());
    const { categories } = await api("/categorias", { method: "POST", body: { categories: named.map((r) => ({ id: r.id, label: r.label.trim() })) } });
    state.categories = categories;
    // Las nuevas reciben su código: la lista se arma de nuevo con lo guardado.
    const pending = rows.filter((r) => !r.label.trim());
    rows = [...Object.entries(categories).map(([id, label]) => ({ id, label })), ...pending];
    renderRows();
  }, message);
  const saveOrder = () => persist(async () => {
    const { settings } = await api("/ajustes", { method: "POST", body: {
      ...state.settings, name: state.settings.name || config.name, categoryOrder: categoryOrder.value, productOrder: productOrder.value,
    } });
    state.settings = settings;
  }, "Listo: la tienda ya usa este orden.");
  categoryOrder.addEventListener("change", () => { renderRows(); saveOrder(); });
  productOrder.addEventListener("change", saveOrder);

  function renderRows() {
    // En "De la A a la Z" se muestran ordenadas así y las flechas no se usan.
    if (!manual()) rows.sort((a, b) => (a.label && b.label ? a.label.localeCompare(b.label, "es", { sensitivity: "base" }) : a.label ? -1 : 1));
    const move = (i, delta) => { rows.splice(i + delta, 0, ...rows.splice(i, 1)); renderRows(); saveCategories(); };
    list.replaceChildren(...rows.map((row, i) => {
      const count = row.id ? used(row.id) : 0;
      return h("div", { class: "panel-cat" },
        h("input", { class: "panel-input", value: row.label, maxlength: 30, "aria-label": `Nombre de la categoría ${i + 1}`, placeholder: "Nombre de la categoría",
          oninput: (e) => { row.label = e.target.value; },
          // Se guarda al terminar de escribir (al salir del casillero o con Enter).
          onchange: () => { if (row.label.trim()) saveCategories(row.id ? "Categoría renombrada." : "Categoría creada: ya la podés usar en tus productos."); },
          onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } } }),
        h("span", { class: "panel-muted panel-cat__count" }, count === 1 ? "1 producto" : `${count} productos`),
        h("div", { class: "panel-cat__actions" },
          h("button", { type: "button", "aria-label": "Subir", disabled: !manual() || i === 0 || !row.id, onclick: () => move(i, -1) }, "↑"),
          h("button", { type: "button", "aria-label": "Bajar", disabled: !manual() || i === rows.length - 1 || !row.id, onclick: () => move(i, 1) }, "↓"),
          h("button", { type: "button", "aria-label": `Borrar ${row.label}`, disabled: count > 0, title: count > 0 ? "Tiene productos: cambiales la categoría antes de borrarla" : null,
            onclick: () => {
              if (!row.id) { rows.splice(i, 1); return renderRows(); }
              if (!confirm(`¿Borrar la categoría "${row.label}"?`)) return;
              rows.splice(i, 1);
              renderRows();
              saveCategories("Categoría borrada.");
            } }, "×")));
    }), ...(rows.length ? [] : [h("p", { class: "panel-muted" }, "Todavía no tenés categorías. Agregá la primera.")]));
  }

  root.replaceChildren(
    h("section", { class: "panel-card" },
      h("h1", {}, "Orden de tu tienda"),
      h("p", { class: "panel-muted" }, "Los productos se ven agrupados por categoría. Elegí en qué orden van las categorías y cómo se ordenan los productos dentro de cada una."),
      h("div", { class: "panel-two" },
        field("o-categories", "Categorías", categoryOrder),
        field("o-products", "Productos dentro de cada categoría", productOrder, state.br
          ? "“En el orden que yo elijo” y “Lo último que cargo” valen para tus productos; los de Brasil quedan por marca y modelo."
          : "“En el orden que yo elijo”: en Productos → Más → Subir o Bajar."))),
    h("section", { class: "panel-card" },
      h("h2", {}, "Categorías"),
      h("p", { class: "panel-muted" }, "Creá, renombrá o borrá categorías (solo se puede borrar una sin productos). Con “En el orden que yo elijo”, ordenalas con las flechas."),
      list,
      h("button", { class: "btn btn--outline", type: "button", onclick: () => {
        rows.push({ id: null, label: "" });
        renderRows();
        list.querySelector(".panel-cat:last-child input")?.focus();
      } }, "+ Nueva categoría"),
      status));
  renderRows();
}

// --- mi tienda --------------------------------------------------------------------
function renderStoreSettings() {
  const s = state.settings;
  const input = (id, value, attrs = {}) => h("input", { id, class: "panel-input", value: value ?? "", ...attrs });
  const name = input("s-name", s.name || config.name, { maxlength: 50, required: true });
  const tagline = input("s-tagline", s.tagline, { maxlength: 70, placeholder: "Ej: Ropa y calzado para toda la familia" });
  const whatsapp = input("s-whatsapp", s.whatsapp, { inputmode: "tel", placeholder: "Ej: 5491123456789" });
  const instagram = input("s-instagram", s.instagram, { placeholder: "tu_usuario", autocapitalize: "none" });
  const tiktok = input("s-tiktok", s.tiktok, { placeholder: "tu_usuario", autocapitalize: "none" });
  const facebook = input("s-facebook", s.facebook, { placeholder: "tu.pagina", autocapitalize: "none" });
  const heroTitle = input("s-hero-title", s.heroTitle, { maxlength: 40, placeholder: "Ej: Ropa y zapatillas" });
  const heroHighlight = input("s-hero-highlight", s.heroHighlight, { maxlength: 40, placeholder: "Ej: al mejor precio" });
  const notice = input("s-notice", s.notice, { maxlength: 120, placeholder: "Ej: ¡Envío gratis este fin de semana!" });
  const heroText = h("textarea", { id: "s-hero-text", class: "panel-input panel-textarea", maxlength: 220, rows: 3,
    placeholder: "Ej: Elegí tu producto y talle, armá el pedido y envialo por WhatsApp." }, s.heroText ?? "");
  let color = s.color || COLORS[0].value;
  const swatches = h("div", { class: "panel-swatches", role: "radiogroup", "aria-label": "Color de los botones" });
  const renderSwatches = () => swatches.replaceChildren(...COLORS.map((c) => h("button", {
    type: "button", class: "panel-swatch", role: "radio", "aria-checked": String(c.value === color), "aria-label": c.label,
    style: `--swatch:${c.value}`, onclick: () => { color = c.value; renderSwatches(); } })));
  renderSwatches();
  const wholesaleOn = h("input", { id: "s-wholesale", type: "checkbox", checked: s.wholesale !== false });
  const wholesaleMin = input("s-wholesale-min", s.wholesaleMin || 5, { inputmode: "numeric", maxlength: 3 });

  // Logo
  const logoBox = h("div", { class: "panel-logo" });
  const logoInput = h("input", { type: "file", accept: "image/*", hidden: true, onchange: async (e) => {
    const [file] = e.target.files;
    e.target.value = "";
    if (!file) return;
    await busy(null, async () => {
      const { logo } = await uploadImage(file, { endpoint: "/logo", sizes: [["grande", 512, 0.88], ["chico", 160, 0.88]], square: true, raw: true, jpg: true });
      state.settings.logo = logo;
      toast("Logo actualizado.");
      renderLogo();
    });
  } });
  function renderLogo() {
    const logo = state.settings.logo;
    logoBox.replaceChildren(
      logo ? h("img", { src: storeUrl(logo.small), alt: "Tu logo", width: 80, height: 80 }) : h("span", { class: "panel-logo__empty" }, "Sin logo"),
      h("div", { class: "panel-logo__actions" },
        h("button", { type: "button", class: "btn btn--outline btn--sm", onclick: () => logoInput.click() }, logo ? "Cambiar logo" : "Subir logo"),
        logo ? h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: (e) => busy(e.currentTarget, async () => {
          await api("/logo", { method: "DELETE" });
          state.settings.logo = null;
          renderLogo();
        }) }, "Sacar") : null),
      logoInput);
  }
  renderLogo();

  const saveButton = h("button", { class: "btn btn--primary btn--lg", type: "submit" }, "Guardar cambios");
  const form = h("form", { class: "panel-editor", onsubmit: async (event) => {
    event.preventDefault();
    const result = await busy(saveButton, () => api("/ajustes", { method: "POST", body: {
      name: name.value, tagline: tagline.value, whatsapp: whatsapp.value,
      instagram: instagram.value, tiktok: tiktok.value, facebook: facebook.value,
      heroTitle: heroTitle.value, heroHighlight: heroHighlight.value, heroText: heroText.value, notice: notice.value,
      color, wholesale: wholesaleOn.checked, wholesaleMin: Number(wholesaleMin.value),
    } }));
    if (result) {
      state.settings = result.settings;
      renderTop({ loggedIn: true });
      toast("Listo: tu tienda ya muestra los cambios.");
      initial = snapshot();
    }
  } },
    h("h1", { class: "panel-title" }, "Mi tienda"),
    h("section", { class: "panel-card" }, h("h2", {}, "Nombre y logo"),
      field("s-name", "Nombre de la tienda", name),
      field("s-tagline", "Frase corta", tagline, "Aparece al pie y al compartir el link."),
      h("div", { class: "panel-field" }, h("span", { class: "panel-label" }, "Logo"), logoBox,
        h("small", { class: "panel-muted" }, "Mejor si es cuadrado. Aparece arriba en la tienda y al compartir el link."))),
    h("section", { class: "panel-card" }, h("h2", {}, "Contacto y redes"),
      field("s-whatsapp", "WhatsApp donde te llegan los pedidos", whatsapp, "Con código de país y área, sin 0 ni 15. Ej: 5491123456789"),
      h("div", { class: "panel-two" },
        field("s-instagram", "Instagram", instagram, "Solo tu usuario, sin @."),
        field("s-tiktok", "TikTok", tiktok, "Solo tu usuario, sin @.")),
      field("s-facebook", "Facebook", facebook, "El nombre de tu página (lo que va después de facebook.com/).")),
    h("section", { class: "panel-card" }, h("h2", {}, "Aviso arriba de la tienda"),
      field("s-notice", "Aviso (opcional)", notice, "Una franja arriba de todo en tu tienda. Dejalo vacío para no mostrar nada.")),
    h("section", { class: "panel-card" }, h("h2", {}, "Portada"),
      h("div", { class: "panel-two" },
        field("s-hero-title", "Título grande", heroTitle),
        field("s-hero-highlight", "Parte destacada del título", heroHighlight, "Va abajo del título, en otro color.")),
      field("s-hero-text", "Texto de bienvenida", heroText),
      h("div", { class: "panel-field" }, h("span", { class: "panel-label" }, "Color de los botones"), swatches)),
    h("section", { class: "panel-card" }, h("h2", {}, "Venta por mayor"),
      h("label", { class: "panel-switch", for: "s-wholesale" }, wholesaleOn, h("span", {}, "Vendo por mayor"),
        h("small", { class: "panel-muted" }, "Cada producto tiene su precio por mayor (si no le ponés, se cobra el normal).")),
      field("s-wholesale-min", "Desde cuántos productos surtidos", wholesaleMin)),
    passwordCard(),
    h("div", { class: "panel-savebar" }, saveButton));
  root.replaceChildren(form);
  // Si sale sin guardar, se le pregunta (ver route). La clave va aparte y no cuenta.
  const fields = [name, tagline, whatsapp, instagram, tiktok, facebook, heroTitle, heroHighlight, heroText, notice, wholesaleMin];
  const snapshot = () => JSON.stringify([...fields.map((f) => f.value), color, wholesaleOn.checked]);
  let initial = snapshot();
  state.guard = () => snapshot() !== initial;
}

function passwordCard() {
  const current = h("input", { id: "p-current", type: "password", class: "panel-input", autocomplete: "current-password" });
  const next = h("input", { id: "p-new", type: "password", class: "panel-input", autocomplete: "new-password", minlength: 8 });
  const repeat = h("input", { id: "p-repeat", type: "password", class: "panel-input", autocomplete: "new-password" });
  const button = h("button", { class: "btn btn--outline", type: "button", onclick: () => busy(button, async () => {
    if (next.value.length < 8) throw new Error("La clave nueva tiene que tener 8 letras o números como mínimo.");
    if (next.value !== repeat.value) throw new Error("Las dos claves nuevas no coinciden.");
    await api("/clave", { method: "POST", body: { actual: current.value, nueva: next.value } });
    current.value = next.value = repeat.value = "";
    toast("Clave cambiada. La próxima vez ingresá con la nueva.");
  }) }, "Cambiar clave");
  return h("section", { class: "panel-card" }, h("h2", {}, "Tu clave"),
    field("p-current", "Clave actual", current),
    h("div", { class: "panel-two" }, field("p-new", "Clave nueva", next, "8 letras o números como mínimo."), field("p-repeat", "Repetí la clave nueva", repeat)),
    button);
}

// --- ayuda -------------------------------------------------------------------------
function renderHelp() {
  const steps = [
    ["Cargá tus productos", "En “Productos” tocá “Nuevo producto”: subí fotos, poné nombre, categoría, precio y los talles con su cantidad. Tocá “Guardar” y ya aparece en tu tienda."],
    ["Cuando vendés algo", "En la lista tocá el cartel verde “… en stock” y restá con “−” el talle que vendiste. Se guarda solo. Lo que llega a 0 deja de verse en la tienda."],
    ["El mismo modelo en otro color", "Tocá “Más” → “Copiar”. Se crea una copia pausada con las mismas fotos y talles: cambiale el nombre, las fotos y las cantidades, y tildá “Se ve en la tienda”."],
    ["Pausar sin borrar", "“Más” → “Pausar” lo esconde de la tienda (por ejemplo, mientras esperás mercadería). Con “Mostrar” vuelve a aparecer."],
    ["Orden de la tienda", "Por defecto, las categorías y los productos van de la A a la Z. En “Categorías” → “Orden de tu tienda” podés elegir otro orden: lo último que cargás primero, del más barato al más caro, o el que vos armes (con las flechas en Categorías y con “Más” → “Subir / Bajar” en Productos)."],
    ["Subir todos los precios", "En “Productos” tocá “Cambiar precios”, escribí el porcentaje (por ejemplo 10) y tocá “Aplicar”. Se redondean a los $100."],
    ["Ofertas y destacados", "Al editar un producto, en “Opcional”: con “Precio anterior” se ve tachado con el cartel “Oferta”; con “Destacado” sale primero en su categoría. También podés escribir una descripción."],
    ["Tu tienda", "En “Mi tienda” cambiás el nombre, el logo, tu WhatsApp, tus redes, los textos de la portada, el aviso de arriba de la tienda, el color y la venta por mayor. También tu clave."],
    ["Los pedidos", "Tus clientes arman el pedido en la tienda y te llega armado a tu WhatsApp. Ahí confirmás stock, cobro y envío. En la web no se cobra nada."],
  ];
  if (state.br) steps.unshift(
    ["El stock de Brasil", "En “Productos” → “Stock de Brasil” están los modelos que llegan solos. No hace falta cargarlos: el stock se actualiza solo."],
    ["Tu precio en un modelo", "Tocá “Editar” en el modelo y escribí tu precio. Si lo dejás vacío, se cobra el de tu lista."],
    ["Pares que tenés en tu casa", "En el mismo modelo, en “En tu casa”, sumá con “+” los pares que tenés vos. En la tienda se ven junto con los de Brasil. Cuando vendas uno tuyo, restalo con “−”."],
    ["Ocultar un modelo", "Con “Ocultar” deja de verse en tu tienda. Con “Mostrar” vuelve."],
    ["Otras cosas que vendas", "Ropa, accesorios o lo que quieras: en “Mis productos” → “Nuevo producto”, con tus fotos y la categoría que elijas."],
  );
  root.replaceChildren(h("section", { class: "panel-card" },
    h("h1", {}, "Cómo usar tu panel"),
    h("ol", { class: "panel-help" }, steps.map(([title, text]) => h("li", {}, h("strong", {}, title), h("span", {}, text)))),
    h("p", { class: "panel-muted" }, "Tu link para compartir es el de “Ver tienda”. ¿Dudas? Escribinos por WhatsApp.")));
}

// --- imágenes: se achican en el celular antes de subir -------------------------------
async function shrink(bitmap, max, quality, type, square) {
  const side = Math.min(bitmap.width, bitmap.height);
  const sw = square ? side : bitmap.width;
  const sh = square ? side : bitmap.height;
  const scale = Math.min(1, max / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext("2d");
  if (type === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  return { blob, w: canvas.width, h: canvas.height };
}

/** Sube un formulario mostrando el avance (fetch no avisa cuánto lleva subido). */
function uploadWithProgress(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", API + path);
    request.withCredentials = true;
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      let data = {};
      try { data = JSON.parse(request.responseText); } catch { /* respuesta vacía */ }
      if (request.status === 401) {
        showLogin("Tu sesión terminó. Ingresá de nuevo.");
        return reject(new Error("Tenés que ingresar de nuevo."));
      }
      if (request.status < 200 || request.status >= 300) return reject(new Error(data.error || "No se pudo subir la foto. Probá de nuevo."));
      resolve(data);
    });
    request.addEventListener("error", () => reject(new Error("Sin conexión. Revisá internet y probá de nuevo.")));
    request.send(form);
  });
}

/**
 * Achica la foto (WEBP si el celular puede, si no JPG) y la sube.
 * sizes: [[nombre del campo, lado máximo, calidad], ...]. square: recorta al medio (logo).
 */
async function uploadImage(file, { endpoint, sizes, square = false, raw = false, jpg = false, onProgress = null }) {
  if (!file.type.startsWith("image/")) throw new Error("Ese archivo no es una foto.");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("No se pudo leer la foto. Probá con otra.");
  }
  // El logo va en JPG: es lo que mejor muestra WhatsApp en la vista previa del link.
  const probe = jpg ? null : await shrink(bitmap, 32, 0.8, "image/webp", square);
  const type = probe?.blob?.type === "image/webp" ? "image/webp" : "image/jpeg";
  const ext = type === "image/webp" ? "webp" : "jpg";
  const form = new FormData();
  let first = null;
  for (const [fieldName, max, quality] of sizes) {
    let out = await shrink(bitmap, max, quality, type, square);
    if (out.blob.size > 850 * 1024) out = await shrink(bitmap, Math.round(max * 0.8), 0.7, type, square);
    form.append(fieldName, out.blob, `${fieldName}.${ext}`);
    first ??= out;
  }
  form.append("w", first.w);
  form.append("h", first.h);
  const result = onProgress ? await uploadWithProgress(endpoint, form, onProgress) : await api(endpoint, { method: "POST", form });
  return raw ? result : { lg: result.lg, sm: result.sm, w: result.w, h: result.h };
}

// --- arranque y navegación -------------------------------------------------------------
async function loadData() {
  const [data, settings] = await Promise.all([api("/productos"), api("/ajustes")]);
  state.products = data.products;
  state.categories = data.categories;
  state.limits = data.limits ?? state.limits;
  state.settings = settings ?? {};
  state.br = data.stockBR ? { products: data.brProducts ?? [], options: data.stockBR, updatedAt: data.brUpdatedAt } : null;
  if (state.br && !state.priceTable) state.priceTable = await loadPriceTable();
  // La lista con lo que subió o bajó en "Cambiar precios".
  state.listPricing = state.priceTable ? createPricing({ ...state.priceTable, percent: state.settings.brPercent || 0 }) : null;
}

/** Lista de precios de la tienda (la que se cobra en los modelos de Brasil sin precio propio). */
async function loadPriceTable() {
  const file = Object.values(config.channels ?? {})[0]?.prices;
  if (!file) return null;
  try {
    const response = await fetch(`../${file}`, { cache: "no-cache" });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/**
 * Cambios sin guardar: cada pantalla con botón "Guardar" deja en state.guard cómo saber
 * si hay algo sin guardar. Si se va a otra pestaña o cierra la página, se pregunta antes.
 */
let currentHash = location.hash;
window.addEventListener("beforeunload", (event) => {
  if (state.guard?.()) event.preventDefault();
});

function route() {
  if (!state.store) return;
  if (location.hash !== currentHash && state.guard?.()
    && !confirm("Tenés cambios sin guardar. ¿Salir igual? Se van a perder.")) {
    history.replaceState(null, "", currentHash || "#productos");
    return;
  }
  state.guard = null;
  currentHash = location.hash;
  const [section, id] = location.hash.slice(1).split("/");
  renderTop({ loggedIn: true });
  if (section === "editar") {
    const product = state.products.find((p) => p.id === decodeURIComponent(id ?? ""));
    if (product) return renderEditor(product);
  }
  if (section === "nuevo") return renderEditor(null);
  if (section === "br" && state.br) {
    const product = state.br.products.find((p) => p.id === decodeURIComponent(id ?? ""));
    if (product) return renderBrEditor(product);
  }
  if (section === "categorias") return renderCategories();
  if (section === "precios") return renderPriceChange();
  if (section === "tienda") return renderStoreSettings();
  if (section === "ayuda") return renderHelp();
  renderProducts();
}

async function start() {
  root.replaceChildren(h("p", { class: "panel-muted panel-loading" }, "Cargando…"));
  let session;
  try {
    session = await api("/yo");
  } catch {
    return;   // api() ya mostró el ingreso
  }
  if (config.manualStore && session.tienda !== config.manualStore) {
    renderTop({ loggedIn: false });
    root.replaceChildren(h("div", { class: "panel-card" },
      h("p", {}, "Este usuario es de otra tienda."),
      h("button", { class: "btn btn--outline", type: "button", onclick: logout }, "Salir")));
    return;
  }
  state.store = session.tienda;
  state.usuario = session.usuario;
  try {
    await loadData();
  } catch (e) {
    root.replaceChildren(h("p", { class: "panel-error" }, e.message));
    return;
  }
  route();
}

window.addEventListener("hashchange", route);
start();
