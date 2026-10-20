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
// Tiendas con dos versiones (público y revendedores, como L.A IMP o la de Fabri): cada producto
// tiene también su precio para revendedores.
const TWO_VERSIONS = Boolean(config.channels?.mayorista) && Object.keys(config.channels).length > 1;
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
  { id: "inicio", label: "Inicio", icon: "home" },
  { id: "productos", label: "Productos", icon: "bag" },
  { id: "categorias", label: "Categorías", icon: "tag" },
  { id: "tienda", label: "Mi tienda", icon: "store" },
  { id: "ayuda", label: "Ayuda", icon: "help" },
];

const state = {
  store: null, usuario: null, products: [], categories: {}, settings: {},
  limits: { imagesPerProduct: 6, products: 150 }, search: "", filter: "todos",
  // Stock de Brasil (solo algunas tiendas): modelos, precios de la lista y qué se está mirando.
  // Al entrar a Productos se ven primero los productos propios; el stock de Brasil va segundo (se maneja casi solo).
  br: null, listPricing: null, view: "propios", brSearch: "", brFilter: "todos",
  guard: null,
  listScroll: {},   // dónde estaba en cada lista, para volver ahí después de editar   // cambios sin guardar en la pantalla abierta (ver route)
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

/** Dibuja la pantalla. Lo que viene vacío (null) se saltea: así nunca aparece escrito "null". */
function show(...nodes) {
  root.replaceChildren(...nodes.flat().filter((node) => node !== null && node !== undefined && node !== false));
}

/** Ícono (los mismos dibujos de la tienda) como elemento, para usar dentro de h(). */
function ico(name, cls = "") {
  const box = document.createElement("span");
  box.innerHTML = icon(name, `panel-ico ${cls}`);
  return box.firstElementChild;
}
const withCaret = (text) => [text, ico("chevronDown", "panel-caret")];

/**
 * Pregunta propia (en vez del cartel del navegador, que dice "mitiendastock.com dice").
 * Devuelve true si toca el botón de aceptar.
 */
function ask(message, { ok = "Sí", cancel = "Cancelar", danger = false } = {}) {
  return new Promise((resolve) => {
    const finish = (value) => { dialog.close(); dialog.remove(); resolve(value); };
    const dialog = h("dialog", { class: "panel-ask", "aria-label": message },
      h("div", { class: "panel-card" },
        h("p", { class: "panel-ask__text" }, message),
        h("div", { class: "panel-ask__actions" },
          h("button", { class: "btn btn--outline btn--lg", type: "button", onclick: () => finish(false) }, cancel),
          h("button", { class: `btn btn--lg ${danger ? "panel-btn--danger" : "btn--primary"}`, type: "button", onclick: () => finish(true) }, ok))));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(false); });
    document.body.append(dialog);
    dialog.showModal();
  });
}

/**
 * Guardado "por detrás": cada toque cambia el número al instante y, cuando deja de tocar un
 * momento, se guarda una sola vez. Si falla, avisa y deshace.
 *   key: qué se está cambiando · save(): guarda · undo(): vuelve atrás si no se pudo
 */
const pendingSaves = new Map();
function saveSoon(key, save, undo) {
  const entry = pendingSaves.get(key) ?? {};
  clearTimeout(entry.timer);
  entry.undo = undo;
  entry.timer = setTimeout(async () => {
    pendingSaves.delete(key);
    try { await save(); } catch (e) { entry.undo?.(); toast(e.message, "error"); }
  }, 700);
  pendingSaves.set(key, entry);
}
// Si cierra la página con algo por guardar, se avisa.
window.addEventListener("beforeunload", (event) => { if (pendingSaves.size) event.preventDefault(); });

/** Una vibración cortita (solo en los celulares que lo permiten), al cambiar el stock. */
const buzz = () => {
  if (navigator.userActivation && !navigator.userActivation.isActive) return;   // solo justo después de un toque
  try { navigator.vibrate?.(12); } catch { /* sin vibración */ }
};

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
    sessionEnded();
    throw new Error("Tu sesión terminó. Ingresá de nuevo y volvé a tocar Guardar.");
  }
  if (!response.ok) throw new Error(data.error || "Hubo un problema. Probá de nuevo.");
  return data;
}

/**
 * Sesión vencida. Si hay algo sin guardar en pantalla, se pide la clave en una ventanita
 * encima (así no se pierde lo cargado); si no, se muestra la pantalla de ingreso.
 */
function sessionEnded() {
  if (!state.store) return showLogin("");
  if (!state.guard?.()) return showLogin("Tu sesión terminó. Ingresá de nuevo.");
  if (document.querySelector(".panel-relogin")) return;
  const user = h("input", { id: "re-usuario", class: "panel-input", autocomplete: "username", autocapitalize: "none", value: state.usuario ?? "", required: true });
  const pass = h("input", { id: "re-clave", class: "panel-input", type: "password", autocomplete: "current-password", required: true });
  const error = h("p", { class: "panel-error", role: "alert" });
  const button = h("button", { class: "btn btn--primary btn--lg", type: "submit" }, "Ingresar");
  const dialog = h("dialog", { class: "panel-relogin" },
    h("form", { class: "panel-card", onsubmit: async (event) => {
      event.preventDefault();
      button.disabled = true;
      error.textContent = "";
      try {
        await api("/ingresar", { method: "POST", body: { usuario: user.value, clave: pass.value } });
        dialog.close();
        dialog.remove();
        toast("Listo, ingresaste de nuevo. Tocá Guardar.");
      } catch (e) {
        error.textContent = e.message;
        button.disabled = false;
      }
    } },
      h("h2", {}, "Tu sesión terminó"),
      h("p", { class: "panel-muted" }, "Ingresá de nuevo. Lo que estabas cargando no se pierde."),
      field("re-usuario", "Usuario", user), field("re-clave", "Clave", pass), error, button));
  document.body.append(dialog);
  dialog.showModal();
  pass.focus();
}

/**
 * Botón que se desactiva mientras trabaja y muestra el error si falla.
 * Los botones grandes (Guardar, Aplicar…) dicen "Guardando…" mientras tanto.
 */
async function busy(button, task) {
  const label = button && (button.type === "submit" || button.classList.contains("btn--lg")) ? button.textContent : null;
  if (button) button.disabled = true;
  if (label) button.textContent = "Guardando…";
  try {
    return await task();
  } catch (e) {
    toast(e.message, "error");
    return undefined;
  } finally {
    if (button) button.disabled = false;
    if (label) button.textContent = label;
  }
}

/** Error al lado del campo (y lo muestra en pantalla). Sin mensaje, lo borra. */
function fieldError(input, message) {
  const box = input.closest(".panel-field") ?? input.parentElement;
  let note = box.querySelector(".panel-field__error");
  if (!message) { note?.remove(); input.removeAttribute("aria-invalid"); return; }
  if (!note) { note = h("p", { class: "panel-field__error", role: "alert" }); box.append(note); }
  note.textContent = message;
  input.setAttribute("aria-invalid", "true");
  input.scrollIntoView({ block: "center", behavior: "smooth" });
  input.focus({ preventScroll: true });
}

const storeUrl = (path) => `/api/tienda/${encodeURIComponent(state.store)}/${path}`;
// Link público de la tienda (el panel está en /<tienda>/panel/).
const storeLink = () => new URL("../", location.href).href;
const productLink = (product) => `${storeLink()}#p/${encodeURIComponent(product.slug)}`;

/**
 * Compartir la tienda: en el celular abre el menú de compartir (WhatsApp, Instagram…);
 * en la computadora copia el link.
 */
async function shareStore() {
  const name = state.settings.name || config.name || "mi tienda";
  const text = `¡Mirá ${name}! Elegí lo que te guste y pedilo por WhatsApp:`;
  if (navigator.share) {
    try { await navigator.share({ title: name, text, url: storeLink() }); return; } catch (e) { if (e?.name === "AbortError") return; }
  }
  try {
    await navigator.clipboard.writeText(storeLink());
    toast("Link copiado. Pegalo donde quieras compartirlo.");
  } catch {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${storeLink()}`)}`, "_blank", "noopener");
  }
}
const shareButton = (cls = "btn btn--outline btn--sm") => h("button", { class: cls, type: "button", onclick: shareStore }, "Compartir mi tienda");
const viewLink = (product, cls = "btn btn--ghost btn--sm") =>
  h("a", { class: cls, href: productLink(product), target: "_blank", rel: "noopener" }, "Ver en la tienda", ico("external"));
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

const EDIT_SCREENS = ["editar", "nuevo", "br", "precios", "precios-generales", "por-mayor", "ofertas"];

function renderTop({ loggedIn }) {
  const current = (location.hash.slice(1).split("/")[0]) || "inicio";
  const editing = EDIT_SCREENS.includes(current);
  top.classList.toggle("is-editing", loggedIn && editing);
  root.dataset.section = current;
  top.replaceChildren(
    h("div", { class: "panel-top__inner" },
      h("div", { class: "panel-top__title" },
        h("strong", {}, state.settings.name || config.name || "Mi tienda"),
        h("span", {}, "Panel de tu tienda")),
      h("div", { class: "panel-top__actions" },
        themeButton(),
        loggedIn ? h("a", { class: "btn btn--outline btn--sm", href: "../", target: "_blank", rel: "noopener" }, "Ver tienda") : null,
        loggedIn ? h("button", { class: "btn btn--ghost btn--sm", type: "button", onclick: logout }, "Salir") : null)),
    ...(loggedIn && !editing ? [h("nav", { class: "panel-tabs", "aria-label": "Secciones del panel" },
      TABS.map((t) => h("a", { href: `#${t.id}`, class: "panel-tab", "aria-current": current === t.id ? "page" : null },
        ico(t.icon), h("span", {}, t.label))))] : []));
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
  show(form);
  user.focus();
}

/**
 * "Elegí tu clave": la primera vez que entra con la clave que le pasaron. No sigue hasta que
 * la elige (así nadie se queda con la clave que conoce otra persona). Devuelve true al terminar.
 */
function chooseKey() {
  return new Promise((resolve) => {
    renderTop({ loggedIn: false });
    const next = h("input", { id: "ck-new", class: "panel-input", type: "password", autocomplete: "new-password", minlength: 8 });
    const repeat = h("input", { id: "ck-repeat", class: "panel-input", type: "password", autocomplete: "new-password" });
    const error = h("p", { class: "panel-error", role: "alert" });
    const button = h("button", { class: "btn btn--primary btn--lg", type: "submit" }, "Guardar mi clave");
    show(h("form", { class: "panel-card panel-login", onsubmit: async (event) => {
      event.preventDefault();
      error.textContent = "";
      if (next.value.length < 8) return (error.textContent = "La clave tiene que tener 8 letras o números como mínimo.");
      if (next.value !== repeat.value) return (error.textContent = "Las dos claves no coinciden. Escribila igual las dos veces.");
      const done = await busy(button, () => api("/clave-inicial", { method: "POST", body: { nueva: next.value } }));
      if (!done) return;
      toast("¡Listo! Desde ahora entrás con tu clave.");
      resolve(true);
    } },
      h("h1", {}, "Elegí tu clave"),
      h("p", { class: "panel-muted" }, "Es tu primera vez en el panel. Elegí una clave que solo sepas vos: la vas a usar para entrar desde ahora."),
      field("ck-new", "Tu clave nueva", next, "8 letras o números como mínimo."),
      field("ck-repeat", "Repetí la clave", repeat),
      error, button,
      h("button", { class: "btn btn--ghost", type: "button", onclick: () => { logout(); resolve(false); } }, "Salir")));
    next.focus();
  });
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
    [["propios", `Mis productos (${state.products.length + brWithPairs().length})`], ["br", `Stock automático (${state.br.products.length})`]].map(([id, label]) =>
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

/**
 * Cambiar precios de golpe, en 3 pasos con botones grandes: subir o bajar, cuánto y a cuáles.
 * Antes de aplicar muestra cómo quedan algunos productos de verdad de la tienda.
 */
function renderPriceChange() {
  let direction = 1;          // 1 subir, -1 bajar
  let amount = 10;            // porcentaje elegido o "otro"
  let scope = "todos";        // "todos" | "propios" | "brasil"
  const custom = h("input", { id: "pc-custom", class: "panel-input", inputmode: "decimal", placeholder: "Ej: 12", autocomplete: "off" });
  const customField = field("pc-custom", "Porcentaje", custom);
  const steps = h("div", { class: "panel-pc" });
  const apply = h("button", { class: "btn btn--primary btn--lg", type: "submit" });

  const percent = () => (amount === "otro" ? Number(String(custom.value).replace(",", ".")) || 0 : amount);
  const choice = (options, current, onPick) => h("div", { class: "panel-pc__choices" }, options.map(([value, label]) =>
    h("button", { type: "button", class: "panel-chip", "aria-pressed": String(current === value), onclick: () => onPick(value) }, label)));

  function paint() {
    steps.replaceChildren(...[
      h("section", { class: "panel-card" }, h("h2", {}, "1. ¿Qué querés hacer?"),
        choice([[1, "Subir precios"], [-1, "Bajar precios"]], direction, (v) => { direction = v; paint(); })),
      h("section", { class: "panel-card" }, h("h2", {}, `2. ¿Cuánto querés ${direction > 0 ? "subirlos" : "bajarlos"}?`),
        choice([[5, "5%"], [10, "10%"], [15, "15%"], [20, "20%"], ["otro", "Otro"]], amount, (v) => { amount = v; paint(); if (v === "otro") custom.focus(); }),
        amount === "otro" ? customField : null),
      state.br ? h("section", { class: "panel-card" }, h("h2", {}, "3. ¿A cuáles?"),
        choice([["todos", "A todos"], ["propios", "Solo a mis productos"], ["brasil", "Solo a los de Brasil"]], scope, (v) => { scope = v; paint(); })) : null].filter(Boolean));
    const n = percent();
    const valid = n > 0 && n <= (direction > 0 ? 100 : 50);
    apply.textContent = valid ? `${direction > 0 ? "Subir" : "Bajar"} ${n}% los precios` : "Elegí cuánto";
    apply.disabled = !valid;
  }
  custom.addEventListener("input", () => { const keep = document.activeElement === custom; paint(); if (keep) custom.focus(); });

  const form = h("form", { class: "panel-editor", onsubmit: async (event) => {
    event.preventDefault();
    const n = percent();
    const what = { todos: "todos tus productos", propios: "tus productos", brasil: "los modelos de Brasil" }[state.br ? scope : "propios"];
    if (!await ask(`¿${direction > 0 ? "Subir" : "Bajar"} ${n}% los precios de ${what}?`, { ok: direction > 0 ? "Sí, subir" : "Sí, bajar" })) return;
    const done = await busy(apply, async () => {
      await api("/precios", { method: "POST", body: {
        percent: direction * n,
        own: !state.br || scope !== "brasil",
        br: Boolean(state.br) && scope !== "propios",
      } });
      await loadData();
      return true;
    });
    if (done) {
      toast(`Listo: precios ${direction > 0 ? "subidos" : "bajados"} ${n}%.`);
      location.hash = "#productos";
    }
  } },
    h("div", { class: "panel-editor__head" },
      h("a", { class: "btn btn--ghost btn--sm", href: "#productos" }, ico("chevronLeft"), "Volver"),
      h("h1", {}, "Cambiar precios")),
    h("p", { class: "panel-muted panel-intro" }, "Cambiá todos los precios de una vez, por ejemplo cuando aumenta todo."),
    steps,
    h("p", { class: "panel-muted" }, "Se redondea a los $100. También cambian el precio por mayor y las ofertas."),
    h("div", { class: "panel-savebar" }, apply));
  show(form);
  paint();
  window.scrollTo(0, 0);
}

/**
 * Precios generales: un precio para todos los modelos de Brasil y otro para todas las G5, y qué
 * pasa con los modelos nuevos (aparecen solos con ese precio o esperan a que les pongas precio).
 */
function renderGeneralPricing() {
  const current = state.pricing ?? { mode: "auto", br: {}, g5: {} };
  let mode = current.mode ?? "auto";
  const money0 = (n) => (n ? String(n) : "");
  const input = (id, value, placeholder) => h("input", { id, class: "panel-input", inputmode: "numeric", value: money0(value), placeholder });
  const sample = state.br.products.find((p) => p.category !== "g5");
  const listUnit = sample ? listPrice(sample).unit : null;
  const block = (key, title, help, placeholder) => {
    const general = current[key] ?? {};
    const unit = input(`gp-${key}-unit`, general.unit, placeholder);
    const wholesale = input(`gp-${key}-wholesale`, general.wholesale, "Opcional");
    const resaleUnit = TWO_VERSIONS ? input(`gp-${key}-r-unit`, general.mayorista?.price, "Opcional") : null;
    const resaleWholesale = TWO_VERSIONS ? input(`gp-${key}-r-wholesale`, general.mayorista?.wholesalePrice, "Opcional") : null;
    return {
      node: h("section", { class: "panel-card" }, h("h2", {}, title), h("p", { class: "panel-muted" }, help),
        h("div", { class: "panel-two" },
          field(`gp-${key}-unit`, TWO_VERSIONS ? "Precio al público" : "Precio", unit),
          field(`gp-${key}-wholesale`, TWO_VERSIONS ? "Por mayor al público" : "Precio por mayor", wholesale)),
        TWO_VERSIONS ? h("div", { class: "panel-two" },
          field(`gp-${key}-r-unit`, "Precio para revendedores", resaleUnit),
          field(`gp-${key}-r-wholesale`, "Por mayor para revendedores", resaleWholesale)) : null),
      read: () => ({
        unit: unit.value.replace(/\D/g, ""), wholesale: wholesale.value.replace(/\D/g, ""),
        ...(TWO_VERSIONS ? { mayorista: { price: resaleUnit.value.replace(/\D/g, ""), wholesalePrice: resaleWholesale.value.replace(/\D/g, "") } } : {}),
      }),
    };
  };
  const br = block("br", "Modelos de Brasil",
    listUnit ? `Un precio para todos los modelos de Brasil que no tengan el suyo. Vacío = el precio base (por ejemplo ${money(listUnit)}).` : "Un precio para todos los modelos de Brasil que no tengan el suyo.",
    listUnit ? String(listUnit) : "Ej: 60000");
  const g5 = block("g5", "Calidad G5", "Un precio para todas las G5 que no tengan el suyo. Mientras no tengan precio, las G5 no se ven en tu tienda.", "Ej: 30000");
  const modes = h("div", { class: "panel-pc__choices", role: "radiogroup", "aria-label": "Modelos nuevos" });
  const paintModes = () => modes.replaceChildren(...[["auto", "Que aparezcan solos con el precio general"], ["manual", "Que esperen a que les ponga precio"]]
    .map(([value, label]) => h("button", { type: "button", class: "panel-chip", role: "radio", "aria-checked": String(mode === value), "aria-pressed": String(mode === value),
      onclick: () => { mode = value; paintModes(); } }, label)));
  paintModes();
  const saveButton = h("button", { class: "btn btn--primary btn--lg", type: "submit" }, "Guardar");
  const form = h("form", { class: "panel-editor", onsubmit: async (event) => {
    event.preventDefault();
    const done = await busy(saveButton, async () => {
      await api("/precios-generales", { method: "POST", body: { mode, br: br.read(), g5: g5.read() } });
      await loadData();
      return true;
    });
    if (done) {
      toast("Precios generales guardados. Tu tienda ya los usa.");
      state.guard = null;
      location.hash = "#productos";
    }
  } },
    h("div", { class: "panel-editor__head" },
      h("a", { class: "btn btn--ghost btn--sm", href: "#productos" }, ico("chevronLeft"), "Volver"),
      h("h1", {}, "Precios generales")),
    br.node, g5.node,
    h("section", { class: "panel-card" }, h("h2", {}, "Modelos nuevos"),
      h("p", { class: "panel-muted" }, "Cuando entra un modelo nuevo de Brasil o de G5:"), modes,
      h("p", { class: "panel-muted" }, "Si elegís esperar, los nuevos aparecen en “Sin precio, no se ven” y en Inicio, para que les pongas precio.")),
    h("div", { class: "panel-savebar" }, saveButton));
  show(form);
  const snapshot = () => JSON.stringify([mode, br.read(), g5.read()]);
  const initial = snapshot();
  state.guard = () => snapshot() !== initial;
}

/**
 * Venta por mayor: prenderla, el mínimo general y, si quiere, un mínimo distinto por categoría
 * (esas categorías cuentan sus productos aparte; las demás suman juntas para el general).
 */
function renderWholesale() {
  const s = state.settings;
  const on = h("input", { id: "w-on", type: "checkbox", checked: s.wholesale !== false });
  const general = h("input", { id: "w-min", class: "panel-input", inputmode: "numeric", maxlength: 3, value: s.wholesaleMin || 5 });
  const perCategory = Object.entries(state.categories).map(([id, label]) => {
    const input = h("input", { id: `w-cat-${id}`, class: "panel-input panel-w-cat__input", inputmode: "numeric", maxlength: 3,
      value: s.wholesaleByCategory?.[id] ?? "", "aria-label": `Mínimo para ${label}` });
    return { id, label, input };
  });
  const generalValue = () => Number(general.value) || 5;
  const paintPlaceholders = () => perCategory.forEach(({ input }) => { input.placeholder = `${generalValue()} (general)`; });
  general.addEventListener("input", paintPlaceholders);
  paintPlaceholders();
  const body = h("div", { class: "panel-w-body" },
    h("section", { class: "panel-card" }, h("h2", {}, "Mínimo general"),
      field("w-min", "Desde cuántos productos surtidos", general, "Se pueden mezclar modelos y talles."),
      h("p", { class: "panel-muted" }, "El precio por mayor de cada producto se pone al editarlo.")),
    h("section", { class: "panel-card" }, h("h2", {}, "Mínimo por categoría (opcional)"),
      h("p", { class: "panel-muted" }, "Si una categoría tiene otro mínimo, escribilo. Esa categoría cuenta sus productos aparte; las demás suman juntas para el mínimo general."),
      h("div", { class: "panel-w-cats" }, perCategory.map(({ id, label, input }) =>
        h("label", { class: "panel-w-cat", for: `w-cat-${id}` }, h("span", {}, label), h("span", { class: "panel-w-cat__field" }, "desde", input)))),
      h("p", { class: "panel-muted" }, "Ejemplo: con Remeras desde 10 y el general en 5, quien lleva 5 zapatillas y 6 remeras paga las zapatillas por mayor y las remeras al precio normal.")));
  // El texto de abajo dice lo que pasa con el interruptor como está ahora.
  const onHint = h("small", { class: "panel-muted" });
  const paintOn = () => {
    body.hidden = !on.checked;
    onHint.textContent = on.checked
      ? "Prendido: en tu tienda se ve el precio por mayor de cada producto."
      : "Apagado: en tu tienda no se muestra ningún precio por mayor.";
  };
  on.addEventListener("change", paintOn);
  paintOn();
  const saveButton = h("button", { class: "btn btn--primary btn--lg", type: "submit" }, "Guardar");
  const read = () => ({
    wholesale: on.checked, wholesaleMin: generalValue(),
    wholesaleByCategory: Object.fromEntries(perCategory.map(({ id, input }) => [id, Number(input.value)]).filter(([, n]) => n >= 2)),
  });
  const form = h("form", { class: "panel-editor", onsubmit: async (event) => {
    event.preventDefault();
    const result = await busy(saveButton, () => api("/ajustes", { method: "POST", body: { ...state.settings, name: state.settings.name || config.name, ...read() } }));
    if (result) {
      state.settings = result.settings;
      toast("Listo: tu tienda ya usa esta venta por mayor.");
      state.guard = null;
      location.hash = "#productos";
    }
  } },
    h("div", { class: "panel-editor__head" },
      h("a", { class: "btn btn--ghost btn--sm", href: "#productos" }, ico("chevronLeft"), "Volver"),
      h("h1", {}, "Venta por mayor")),
    TWO_VERSIONS
      ? h("section", { class: "panel-card" }, h("p", {}, "Tu tienda tiene una versión para revendedores: ahí el por mayor sale de los precios para revendedores de cada producto."))
      : [h("section", { class: "panel-card" },
        h("label", { class: "panel-switch", for: "w-on" }, on, h("span", {}, "Vendo por mayor"),
          onHint)), body],
    TWO_VERSIONS ? null : h("div", { class: "panel-savebar" }, saveButton));
  show(form);
  const snapshot = () => JSON.stringify(read());
  const initial = snapshot();
  state.guard = () => !TWO_VERSIONS && snapshot() !== initial;
}

/**
 * Ofertas en grupo: una categoría entera o varios productos marcados, con el mismo descuento.
 * También saca las ofertas de esa selección. Los precios los calcula el panel y los manda juntos.
 */
function renderGroupOffers() {
  // Todo lo que se puede poner en oferta: productos propios y modelos del stock automático con precio.
  const candidates = [
    ...state.products.filter((p) => p.price).map((p) => ({ id: p.id, name: p.name, category: p.category, br: false,
      normal: p.compareAt || p.price, inOffer: Boolean(p.compareAt), product: p })),
    ...(state.br?.products ?? []).map((p) => ({ id: p.id, name: p.name, category: p.category, br: true,
      normal: p.compareAt || p.price || autoPrice(p), inOffer: Boolean(p.compareAt), product: p })).filter((c) => c.normal),
  ];
  let scope = "categoria";
  let category = Object.keys(state.categories).find((id) => candidates.some((c) => c.category === id)) ?? "";
  let amount = 20;
  let term = "";
  const picked = new Set();
  const custom = h("input", { id: "of-custom", class: "panel-input", inputmode: "numeric", placeholder: "Ej: 25", autocomplete: "off" });
  const box = h("div", { class: "panel-pc" });
  const summary = h("p", { class: "panel-of-summary", role: "status" });
  const apply = h("button", { class: "btn btn--primary btn--lg", type: "button" });
  const remove = h("button", { class: "btn btn--outline btn--lg", type: "button" });
  const percent = () => (amount === "otro" ? Number(custom.value) || 0 : amount);
  const chosen = () => (scope === "categoria" ? candidates.filter((c) => c.category === category) : candidates.filter((c) => picked.has(c.id)));
  const sale = (normal) => roundPrice(normal * (1 - percent() / 100));
  const choice = (options, current, onPick) => h("div", { class: "panel-pc__choices" }, options.map(([value, label]) =>
    h("button", { type: "button", class: "panel-chip", "aria-pressed": String(current === value), onclick: () => onPick(value) }, label)));

  function productList() {
    const shown = candidates.filter((c) => !term || c.name.toLowerCase().includes(term.toLowerCase()));
    return h("div", { class: "panel-of-list" },
      h("input", { class: "panel-input", type: "search", placeholder: "Buscar producto", value: term, "aria-label": "Buscar producto",
        oninput: (e) => { term = e.target.value; const keep = e.target.selectionStart; paint(); const s = box.querySelector('input[type="search"]'); s.focus(); s.setSelectionRange(keep, keep); } }),
      h("p", { class: "panel-muted" }, picked.size ? `${picked.size} elegidos.` : "Tocá los productos que querés poner en oferta."),
      h("ul", { class: "panel-of-items" }, shown.slice(0, 300).map((c) => h("li", {},
        h("label", { class: "panel-of-item" },
          h("input", { type: "checkbox", checked: picked.has(c.id), onchange: (e) => { if (e.target.checked) picked.add(c.id); else picked.delete(c.id); paintSummary(); } }),
          h("span", {}, h("strong", {}, c.name), h("small", { class: "panel-muted" }, `${categoryName(c.category)} · ${money(c.normal)}${c.inOffer ? " · ya en oferta" : ""}`)))))));
  }

  function paint() {
    box.replaceChildren(...[
      h("section", { class: "panel-card" }, h("h2", {}, "1. ¿A qué productos?"),
        choice([["categoria", "A una categoría entera"], ["elegir", "Elijo los productos"]], scope, (v) => { scope = v; paint(); }),
        scope === "categoria"
          ? h("select", { class: "panel-input", "aria-label": "Categoría", onchange: (e) => { category = e.target.value; paintSummary(); } },
            Object.entries(state.categories).map(([id, label]) => {
              const n = candidates.filter((c) => c.category === id).length;
              return n ? h("option", { value: id, selected: id === category }, `${label} (${n})`) : null;
            }))
          : productList()),
      h("section", { class: "panel-card" }, h("h2", {}, "2. ¿Cuánto descuento?"),
        choice([[10, "10%"], [20, "20%"], [30, "30%"], ["otro", "Otro"]], amount, (v) => { amount = v; paint(); if (v === "otro") custom.focus(); }),
        amount === "otro" ? field("of-custom", "Descuento (%)", custom) : null),
    ].filter(Boolean));
    paintSummary();
  }
  function paintSummary() {
    const list = chosen();
    const n = percent();
    const valid = list.length > 0 && n > 0 && n < 90;
    const first = list[0];
    summary.textContent = !list.length ? "Todavía no elegiste productos."
      : `${list.length === 1 ? "1 producto" : `${list.length} productos`}.` + (valid && first ? ` Por ejemplo: ${first.name}, ${money(first.normal)} → ${money(sale(first.normal))}.` : "");
    apply.textContent = valid ? `Poner en oferta (${list.length})` : "Elegí productos y descuento";
    apply.disabled = !valid;
    const withOffer = list.filter((c) => c.inOffer).length;
    remove.textContent = withOffer ? `Sacar la oferta (${withOffer})` : "Sacar la oferta";
    remove.disabled = !withOffer;
  }
  custom.addEventListener("input", paintSummary);

  const send = (items, message) => busy(null, async () => {
    const { count } = await api("/ofertas", { method: "POST", body: { items } });
    await loadData();
    toast(message(count));
    state.guard = null;
    location.hash = "#productos";
  });
  apply.addEventListener("click", async () => {
    const list = chosen();
    if (!await ask(`¿Poner ${percent()}% de descuento a ${list.length === 1 ? "1 producto" : `${list.length} productos`}?`, { ok: "Sí, poner en oferta" })) return;
    send(list.map((c) => ({ id: c.id, price: sale(c.normal), compareAt: c.normal })), (n) => `Listo: ${n} en oferta.`);
  });
  remove.addEventListener("click", async () => {
    const list = chosen().filter((c) => c.inOffer);
    if (!await ask(`¿Sacar la oferta a ${list.length === 1 ? "1 producto" : `${list.length} productos`}? Vuelven a su precio de antes.`, { ok: "Sí, sacarla", danger: true })) return;
    send(list.map((c) => ({ id: c.id, compareAt: null,
      // Modelo automático que estaba en su precio general o base: vuelve a ese (sin precio propio).
      price: c.br && c.normal === autoPrice(c.product) ? null : c.normal })), (n) => `Listo: ${n} sin oferta.`);
  });

  show(h("div", { class: "panel-editor" },
    h("div", { class: "panel-editor__head" },
      h("a", { class: "btn btn--ghost btn--sm", href: "#productos" }, ico("chevronLeft"), "Volver"),
      h("h1", {}, "Ofertas")),
    h("p", { class: "panel-muted panel-intro" }, "Poné en oferta una categoría entera o los productos que elijas, todos con el mismo descuento. En la tienda se ve el precio rebajado, el de antes tachado y el cartel “Oferta”."),
    box, summary,
    h("div", { class: "panel-savebar panel-savebar--two" }, remove, apply)));
  paint();
}

/** Botón "Ofertas" (arriba de las listas de productos). */
const offersButton = () => h("a", { class: "btn btn--outline btn--sm", href: "#ofertas" }, "Ofertas");

/** Botón "Por mayor" (arriba de las listas de productos). */
const wholesaleButton = () => h("a", { class: "btn btn--outline btn--sm", href: "#por-mayor" }, "Venta por mayor");

/**
 * Lista con un título por categoría (como en la tienda). items: [{ product, view }] ya ordenados
 * por categoría. Los modelos del stock automático dicen su calidad (Brasil o G5).
 */
const BR_QUALITY = { g5: "Calidad G5" };
function sectioned(items, { quality: withQuality = false } = {}) {
  const nodes = [];
  let current = null;
  for (const item of items) {
    const category = item.product.category;
    if (category !== current) {
      current = category;
      const count = items.filter((i) => i.product.category === category).length;
      const quality = withQuality ? (BR_QUALITY[category] ?? "Calidad Brasil") : null;
      const title = categoryName(category);
      nodes.push(h("li", { class: "panel-section", role: "presentation" },
        h("h2", {}, title),
        quality && quality !== title ? h("span", { class: "panel-section__tag" }, quality) : null,
        h("small", { class: "panel-muted" }, count === 1 ? "1 producto" : `${count} productos`)));
    }
    nodes.push(item.view);
  }
  return nodes;
}
// Orden de las categorías del stock automático: primero Brasil, al final G5.
const BR_CATEGORIES_ORDER = { zapatillas: 0, ojotas: 1, g5: 9 };
const brCategoryRank = (id) => BR_CATEGORIES_ORDER[id] ?? 5;
/** Modelos del stock automático donde el cliente cargó pares suyos (también van en "Mis productos"). */
const brWithPairs = () => (state.br?.products ?? []).filter((p) => brTotal(p, "casa") > 0);

function renderOwnProducts() {
  const full = state.products.length >= state.limits.products;
  const list = h("ul", { class: "panel-list" });
  const chips = h("div", { class: "panel-chips", role: "group", "aria-label": "Filtrar productos" });

  function renderChips() {
    const options = [
      { id: "todos", label: `Todos (${state.products.length + brWithPairs().length})` },
      { id: "sin-stock", label: `Sin stock (${state.products.filter((p) => totalStock(p) === 0).length})` },
      { id: "pausados", label: `Pausados (${state.products.filter((p) => p.hidden).length + brWithPairs().filter((p) => p.hidden).length})` },
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
    // Modelos del stock automático con pares tuyos: en su categoría, después de tus productos.
    const paired = brWithPairs().filter((p) => (state.filter === "todos" || (state.filter === "pausados" ? p.hidden : state.filter.startsWith("cat:") && p.category === state.filter.slice(4)))
      && (!term || `${p.name} ${p.brand ?? ""} ${categoryName(p.category)}`.toLowerCase().includes(term)));
    const categoryOrder = [...new Set([...shown.map((p) => p.category), ...Object.keys(state.categories)])];
    const rank = (id) => { const i = categoryOrder.indexOf(id); return i === -1 ? 999 : i; };
    const items = [
      ...shown.map((p, i) => ({ product: p, view: itemView(p, canOrder, renderAll), key: [rank(p.category), 0, i] })),
      ...paired.map((p, i) => ({ product: p, view: brItemView(p, renderAll, { inOwnList: true }), key: [rank(p.category), 1, i] })),
    ].sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2]);
    list.replaceChildren(...(items.length
      ? sectioned(items)
      : [state.products.length
        ? emptyState("search", "No hay productos con ese filtro.", "Ver todos", () => { state.filter = "todos"; state.search = ""; renderProducts(); })
        : emptyState("bag", "Todavía no cargaste productos propios.", "+ Cargar el primero", () => openEditor(null))]));
  }
  function renderAll() { renderChips(); renderItems(); }

  show(
    h("div", { class: "panel-toolbar" },
      h("button", { class: "btn btn--primary", type: "button", disabled: full, onclick: () => openEditor(null) }, "+ Nuevo producto"),
      pricesButton(),
      offersButton(),
      wholesaleButton(),
      h("span", { class: "panel-muted" }, `${state.products.length} de ${state.limits.products} productos`)),
    // En el celular, "Nuevo producto" también queda abajo a la derecha, cerca del dedo.
    full ? null : h("button", { class: "panel-fab", type: "button", "aria-label": "Nuevo producto", onclick: () => openEditor(null) }, ico("plus")),
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
    } }, ...withCaret(total === 0 ? "Sin stock" : `Stock: ${total}`));

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
        priceLine(product.price, product.compareAt, product.wholesalePrice ? ` · por mayor ${money(product.wholesalePrice)}` : null),
        TWO_VERSIONS ? h("small", { class: "panel-muted" }, `Revendedores: ${money(product.mayorista?.price || product.price)}`) : null,
        product.hidden ? h("span", { class: "panel-paused-tag" }, "Pausado: no se ve en la tienda") : null,
        tagsFor(product)),
      h("div", { class: "panel-item__actions" },
        badge,
        h("button", { class: "btn btn--outline btn--sm", type: "button", onclick: () => openEditor(product) }, "Editar"),
        h("button", { class: "btn btn--ghost btn--sm", type: "button", onclick: togglePause }, product.hidden ? "Mostrar" : "Pausar"),
        h("details", { class: "panel-more" },
          h("summary", { class: "btn btn--ghost btn--sm panel-more__dots", "aria-label": `Más opciones de ${product.name}`, title: "Más opciones" }, h("span", { "aria-hidden": "true" }, "⋯")),
          h("div", { class: "panel-more__menu" },
            h("button", { type: "button", onclick: copy }, "Copiar (otro color)"),
            h("a", { href: productLink(product), target: "_blank", rel: "noopener" }, "Ver en la tienda", ico("external")),
            canOrder && neighbor(-1) ? h("button", { type: "button", onclick: move(-1) }, "Subir un lugar") : null,
            canOrder && neighbor(1) ? h("button", { type: "button", onclick: move(1) }, "Bajar un lugar") : null)))),
    stockBox);
}

/** Stock rápido: "vendí uno" sin entrar a editar. Se guarda al toque. */
function renderQuickStock(product, box, badge) {
  box.replaceChildren(h("p", { class: "panel-muted" }, "Sumá o restá unidades. Se guarda solo."),
    h("div", { class: "panel-quick__grid" }, product.sizes.map((s) => {
      const value = h("output", { class: "panel-quick__value" }, s.stock);
      let pending = 0;   // toques que todavía no se guardaron
      const paint = () => {
        value.textContent = s.stock;
        const total = totalStock(product);
        badge.replaceChildren(...withCaret(total === 0 ? "Sin stock" : `Stock: ${total}`));
        badge.classList.toggle("is-empty", total === 0);
      };
      const change = (delta) => () => {
        if (s.stock + delta < 0) return;
        s.stock += delta;
        pending += delta;
        paint();
        buzz();
        saveSoon(`stock:${product.id}:${s.size}`, async () => {
          const sent = pending;
          pending = 0;
          if (!sent) return;
          const { stock } = await api("/stock", { method: "POST", body: { id: product.id, size: s.size, delta: sent } });
          if (!pending) { s.stock = stock; paint(); }
        }, () => { s.stock -= pending; pending = 0; paint(); });
      };
      return h("div", { class: "panel-quick__size" },
        h("span", { class: "panel-quick__label" }, h("strong", {}, `Talle ${s.size}`)),
        h("div", { class: "panel-stepper" },
          h("button", { type: "button", "aria-label": `Restar uno al talle ${s.size}`, onclick: change(-1) }, ico("minus")),
          value,
          h("button", { type: "button", "aria-label": `Sumar uno al talle ${s.size}`, onclick: change(1) }, ico("plus"))));
    })));
}

const roundPrice = (n) => Math.max(100, Math.round(n / 100) * 100);
const OFFER_PERCENTS = [10, 20, 30];

/**
 * Recuadro "Oferta": un interruptor y el descuento con botones (10%, 20%, 30% u otro precio).
 * Muestra cómo queda en la tienda. getNormal: el precio normal (el que está escrito arriba).
 * En la tienda se guarda como precio = el de oferta y "antes" = el normal (se ve tachado).
 */
function offerBox(prefix, getNormal, initial = {}) {
  let on = Boolean(initial.on);
  let mode = 20;
  const custom = h("input", { id: `${prefix}-offer-price`, class: "panel-input", inputmode: "numeric", placeholder: "Ej: 12000" });
  if (on && initial.sale && getNormal()) {
    const percent = Math.round((1 - initial.sale / getNormal()) * 100);
    if (OFFER_PERCENTS.includes(percent) && roundPrice(getNormal() * (1 - percent / 100)) === initial.sale) mode = percent;
    else { mode = "otro"; custom.value = initial.sale; }
  }
  const toggle = h("input", { id: `${prefix}-offer`, type: "checkbox", checked: on });
  const chips = h("div", { class: "panel-offer__chips", role: "group", "aria-label": "Descuento" });
  const customField = field(`${prefix}-offer-price`, "Precio de oferta", custom);
  const preview = h("div", { class: "panel-offer__preview", role: "status" });
  const body = h("div", { class: "panel-offer__body" }, chips, customField, preview);
  const sale = () => (mode === "otro" ? Number(custom.value.replace(/\D/g, "")) || 0 : roundPrice(getNormal() * (1 - mode / 100)));

  function paint() {
    body.hidden = !on;
    customField.hidden = mode !== "otro";
    chips.replaceChildren(...[...OFFER_PERCENTS.map((n) => [n, `${n}% menos`]), ["otro", "Otro precio"]].map(([value, label]) =>
      h("button", { type: "button", class: "panel-chip", "aria-pressed": String(mode === value),
        onclick: () => { mode = value; paint(); if (value === "otro") custom.focus(); } }, label)));
    const normal = getNormal();
    const now = sale();
    if (!normal) preview.replaceChildren(h("p", { class: "panel-error" }, "Primero escribí el precio normal, arriba."));
    else if (!now || now >= normal) preview.replaceChildren(h("p", { class: "panel-error" }, `El precio de oferta tiene que ser menor que ${money(normal)}.`));
    else preview.replaceChildren(h("span", { class: "panel-muted" }, "Así se ve en tu tienda: "),
      h("strong", {}, money(now)), " ", h("s", { class: "panel-muted" }, money(normal)), " ", h("span", { class: "panel-offer__tag" }, "OFERTA"));
  }
  toggle.addEventListener("change", () => { on = toggle.checked; paint(); });
  custom.addEventListener("input", paint);
  paint();
  return {
    node: h("section", { class: "panel-card" }, h("h2", {}, "Oferta"),
      h("label", { class: "panel-switch", for: `${prefix}-offer` }, toggle, h("span", {}, "Poner en oferta"),
        h("small", { class: "panel-muted" }, "En la tienda se ve el precio rebajado, el de antes tachado y el cartel “Oferta”.")),
      body),
    refresh: paint,
    /** { on, sale, normal }. Si está prendida pero el precio no sirve, avisa con un error. */
    read: () => ({ on, sale: sale(), normal: getNormal() }),
    check() {
      if (!on) return;
      const { sale: now, normal } = this.read();
      if (!normal) throw new Error("Para la oferta, primero escribí el precio normal.");
      if (!now || now >= normal) throw new Error(`El precio de oferta tiene que ser menor que ${money(normal)}.`);
    },
  };
}

/** Precio en la lista: en oferta, con el de antes tachado (como en la tienda). */
function priceLine(price, compareAt, note) {
  return h("span", {}, price ? money(price) : "Sin precio",
    compareAt ? [" ", h("s", { class: "panel-muted" }, money(compareAt))] : null,
    note ? h("small", { class: "panel-muted" }, note) : null);
}

/** Lista vacía: un dibujo, qué pasa y un botón para seguir. */
function emptyState(iconName, text, action, onAction) {
  return h("li", { class: "panel-empty" }, ico(iconName, "panel-empty__icon"), h("p", {}, text),
    action ? h("button", { class: "btn btn--outline", type: "button", onclick: onAction }, action) : null);
}

/**
 * Precios para la tienda de revendedores (solo tiendas con dos versiones).
 * placeholders: lo que se cobra si se deja vacío (la lista de revendedores o el precio al público).
 */
function resaleFields(prefix, draft, { unitHint, wholesaleHint }) {
  if (!TWO_VERSIONS) return { node: null, read: () => ({}) };
  const current = draft.mayorista ?? {};
  const price = h("input", { id: `${prefix}-resale-price`, class: "panel-input", inputmode: "numeric", value: current.price ?? "", placeholder: unitHint.placeholder });
  const wholesale = h("input", { id: `${prefix}-resale-wholesale`, class: "panel-input", inputmode: "numeric", value: current.wholesalePrice ?? "", placeholder: wholesaleHint.placeholder });
  return {
    node: h("section", { class: "panel-card" }, h("h2", {}, "Precio en la tienda de revendedores"),
      h("p", { class: "panel-muted" }, "Tu tienda tiene dos versiones: al público y para revendedores (por mayor). Acá va el precio de la de revendedores."),
      h("div", { class: "panel-two" },
        field(`${prefix}-resale-price`, "Precio", price, unitHint.help),
        field(`${prefix}-resale-wholesale`, "Precio por mayor", wholesale, wholesaleHint.help))),
    read: () => ({ mayorista: { price: price.value.replace(/\D/g, ""), wholesalePrice: wholesale.value.replace(/\D/g, "") } }),
  };
}

/**
 * Precio por cantidad del mismo producto: "llevando 3 o más, $12.000 cada uno" (opcional).
 * getPrice: el precio por unidad (para avisar si el de cantidad no es menor).
 */
function bulkFields(prefix, draft, getPrice) {
  const current = draft.bulk ?? {};
  const min = h("input", { id: `${prefix}-bulk-min`, class: "panel-input", inputmode: "numeric", maxlength: 3, value: current.min ?? "", placeholder: "Ej: 3" });
  const price = h("input", { id: `${prefix}-bulk-price`, class: "panel-input", inputmode: "numeric", value: current.price ?? "", placeholder: "Ej: 12000" });
  const preview = h("p", { class: "panel-muted", role: "status" });
  const paint = () => {
    const n = Number(min.value), each = Number(price.value.replace(/\D/g, ""));
    preview.textContent = n >= 2 && each ? `En tu tienda dice: "Llevando ${n} o más: ${money(each)}" (de este producto, en cualquier talle).`
      : "Opcional. Para premiar al que lleva varias unidades del mismo producto.";
  };
  min.addEventListener("input", paint);
  price.addEventListener("input", paint);
  paint();
  return {
    node: h("section", { class: "panel-card" }, h("h2", {}, "Precio por cantidad"),
      h("div", { class: "panel-two" },
        field(`${prefix}-bulk-min`, "Llevando (cantidad) o más", min),
        field(`${prefix}-bulk-price`, "Precio de cada uno", price)),
      preview),
    read: () => ({ bulk: { min: min.value.replace(/\D/g, ""), price: price.value.replace(/\D/g, "") } }),
  };
}

/**
 * "Opciones de precio y más" (oferta, precio por cantidad, destacado), plegado
 * para que Editar sea corto. Si el producto ya usa alguna, viene abierto y dice cuáles.
 */
function optionsFold(draft, ...sections) {
  const used = [draft.compareAt ? "en oferta" : null, draft.bulk?.min ? "precio por cantidad" : null,
    draft.featured ? "destacado" : null].filter(Boolean);
  return h("details", { class: "panel-card panel-fold", open: used.length > 0 },
    h("summary", { class: "panel-fold__summary" },
      h("span", {}, h("strong", {}, "Opciones de precio y más"),
        h("small", { class: "panel-muted" }, used.length ? `Usando: ${used.join(", ")}.` : "Oferta, precio por cantidad y destacado.")),
      ico("chevronDown", "panel-caret")),
    h("div", { class: "panel-fold__body" }, sections));
}

/** Etiquetas chicas en la lista: destacado y oferta. */
function tagsFor(product) {
  const tags = [
    product.featured ? h("span", { class: "panel-tag" }, ico("star"), "Destacado") : null,
    product.compareAt ? h("span", { class: "panel-tag panel-tag--offer" }, "Oferta") : null,
  ].filter(Boolean);
  return tags.length ? h("span", { class: "panel-tags" }, tags) : null;
}

/**
 * Opcionales de un producto (propio o de Brasil): descripción y destacado. Devuelve los elementos para el formulario y cómo leer lo cargado.
 */
function extraFields(prefix, draft) {
  const description = h("textarea", { id: `${prefix}-description`, class: "panel-input panel-textarea", maxlength: 500, rows: 3,
    placeholder: "Ej: Algodón peinado. Calce amplio, si dudás pedí un talle menos." }, draft.description ?? "");
  const featured = h("input", { id: `${prefix}-featured`, type: "checkbox", checked: draft.featured === true });
  return {
    // La descripción va en "Datos" (junto al nombre); "Destacado", en "Opciones de precio y más".
    descriptionField: field(`${prefix}-description`, "Descripción (opcional)", description, "Material, medidas, cómo calza… Se ve al abrir el producto."),
    nodes: [
      h("label", { class: "panel-switch", for: `${prefix}-featured` }, featured, h("span", {}, "Destacado"),
        h("small", { class: "panel-muted" }, "Sale primero en su categoría.")),
    ],
    read: () => ({ description: description.value, featured: featured.checked }),
  };
}

// --- stock de Brasil ------------------------------------------------------------------
const brTotal = (product, part) => product.sizes.reduce((sum, s) => sum + s[part], 0);
const brChanged = (p) => Boolean(p.price || p.wholesalePrice || p.hidden || p.description || p.compareAt || p.featured || brTotal(p, "casa"));

/** Precio de la lista para un modelo de Brasil (sin el precio propio que le haya puesto el cliente). */
/** Precio general (Brasil o G5) que puso el cliente para los modelos sin precio propio. */
function generalPrice(product, version = "publico") {
  const general = state.pricing?.[product.category === "g5" ? "g5" : "br"] ?? {};
  return version === "mayorista" ? general.mayorista?.price ?? null : general.unit ?? null;
}
/** Qué se cobra en un modelo sin precio propio: el precio general, o si no, el de la lista (G5: nada). */
function autoPrice(product, version = "publico") {
  return generalPrice(product, version) || (product.category === "g5" && version !== "mayorista" ? null : listPrice(product, version).unit);
}
const STATUS_TEXT = { nuevo: "Nuevo: no se ve hasta que le pongas precio", "sin-precio-g5": "No se ve: las G5 necesitan precio" };

function listPrice(product, version = "publico") {
  const pricing = version === "mayorista" ? state.resalePricing : state.listPricing;
  const prices = pricing?.forProduct({ ...product, price: null, wholesalePrice: null, manual: false });
  return prices ? { unit: prices.unit, wholesale: prices.wholesale } : { unit: null, wholesale: null };
}

function matchesBrFilter(p) {
  if (state.brFilter === "cambios") return brChanged(p);
  if (state.brFilter === "ocultos") return p.hidden;
  if (state.brFilter === "sin-precio") return p.status === "nuevo" || p.status === "sin-precio-g5";
  if (state.brFilter === "casa") return brTotal(p, "casa") > 0;
  if (state.brFilter.startsWith("cat:")) return p.category === state.brFilter.slice(4);
  return true;
}

// "Entendido" en la explicación del stock de Brasil: se recuerda en ese celular.
const INTRO_KEY = "panel:intro-brasil";
function seenIntro() { try { return localStorage.getItem(INTRO_KEY) === "1"; } catch { return false; } }
function rememberIntro() { try { localStorage.setItem(INTRO_KEY, "1"); } catch { /* sin memoria: se vuelve a mostrar */ } }

function renderBrProducts() {
  const products = [...state.br.products].sort((a, b) => brCategoryRank(a.category) - brCategoryRank(b.category)
    || categoryName(a.category).localeCompare(categoryName(b.category), "es") || a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
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
      ...(count((p) => p.status === "nuevo" || p.status === "sin-precio-g5")
        ? [{ id: "sin-precio", label: `Sin precio, no se ven (${count((p) => p.status === "nuevo" || p.status === "sin-precio-g5")})` }] : []),
      ...(brCategories.length > 1 ? brCategories.map((id) => ({ id: `cat:${id}`, label: categoryName(id) })) : []),
    ];
    chips.replaceChildren(...options.map((o) => h("button", { type: "button", class: "panel-chip", "aria-pressed": String(state.brFilter === o.id),
      onclick: () => { state.brFilter = o.id; renderChips(); renderItems(); } }, o.label)));
  }
  function renderItems() {
    const term = state.brSearch.trim().toLowerCase();
    const shown = products.filter((p) => matchesBrFilter(p) && (!term || `${p.name} ${p.brand ?? ""}`.toLowerCase().includes(term)));
    list.replaceChildren(...(shown.length
      ? sectioned(shown.map((p) => ({ product: p, view: brItemView(p, () => { renderChips(); renderItems(); }) })), { quality: true })
      : [emptyState("search", "No hay modelos con ese filtro.", "Ver todos", () => { state.brFilter = "todos"; state.brSearch = ""; renderProducts(); })]));
  }

  show(
    h("div", { class: "panel-toolbar" }, h("a", { class: "btn btn--primary btn--sm", href: "#precios-generales" }, "Precios generales"), pricesButton(), offersButton(), wholesaleButton()),
    seenIntro() ? null : h("div", { class: "panel-intro-box" },
      h("p", { class: "panel-muted panel-intro" },
        "Stock automático: estos modelos (de Brasil y calidad G5) y su stock llegan y se actualizan solos. Tocá “Editar” en uno para ponerle tu precio, ocultarlo o sumar los pares que tenés en tu casa."),
      h("button", { class: "btn btn--outline btn--sm", type: "button", onclick: (e) => { rememberIntro(); e.currentTarget.parentElement.remove(); } }, "Entendido")),
    h("input", { class: "panel-input", type: "search", placeholder: "Buscar modelo", value: state.brSearch, "aria-label": "Buscar modelo",
      oninput: (e) => { state.brSearch = e.target.value; renderItems(); } }),
    chips, list);
  renderChips();
  renderItems();
}

function brItemView(product, refresh, { inOwnList = false } = {}) {
  const fromBrazil = brTotal(product, "br");
  const own = brTotal(product, "casa");
  const unit = product.price || autoPrice(product);
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
  const stockText = (mine) => mine
    ? `${fromBrazil} ${product.category === "g5" ? "del proveedor" : "de Brasil"} + ${mine} tuyos`
    : fromBrazil ? `${fromBrazil} ${product.category === "g5" ? "del proveedor" : "de Brasil"}` : "Sin stock";
  const stockLine = h("span", { class: "panel-muted" }, stockText(own));
  // Al sumar o restar pares, se actualizan los textos sin cerrar el cuadro.
  const paintPairs = () => {
    const mine = brTotal(product, "casa");
    stockLine.textContent = stockText(mine);
    pairsButton.replaceChildren(...withCaret(mine ? `Mis pares: ${mine}` : "Mis pares"));
    pairsButton.classList.toggle("is-none", !mine);
  };
  // "Mis pares": sumar o restar al toque los pares que el cliente tiene en su casa.
  const quick = h("div", { class: "panel-quick", hidden: true });
  const pairsButton = h("button", { class: `panel-stock${own ? "" : " is-none"}`, type: "button", "aria-expanded": "false",
    onclick: () => {
      const open = quick.hidden;
      quick.hidden = !open;
      pairsButton.setAttribute("aria-expanded", String(open));
      if (open) renderQuickPairs(product, quick, paintPairs);
    } }, ...withCaret(own ? `Mis pares: ${own}` : "Mis pares"));
  return h("li", { class: `panel-item${product.hidden ? " is-paused" : ""}` },
    h("div", { class: "panel-item__row" },
      h("div", { class: "panel-thumb" }, thumb),
      h("div", { class: "panel-item__info" },
        h("strong", {}, product.name),
        h("span", { class: "panel-muted" }, [categoryName(product.category), product.brand].filter(Boolean).join(" · ")),
        priceLine(unit, product.compareAt, product.compareAt ? null : product.price ? " · tu precio" : generalPrice(product) ? " · precio general" : unit ? " · precio base" : null),
        TWO_VERSIONS ? h("small", { class: "panel-muted" }, `Revendedores: ${money(product.mayorista?.price || autoPrice(product, "mayorista"))}`) : null,
        STATUS_TEXT[product.status] ? h("span", { class: "panel-paused-tag" }, STATUS_TEXT[product.status]) : null,
        stockLine,
        inOwnList ? h("span", { class: "panel-auto-tag" }, product.category === "g5" ? "Stock automático · calidad G5" : "Stock automático · calidad Brasil") : null,
        product.hidden ? h("span", { class: "panel-paused-tag" }, "Oculto: no se ve en tu tienda") : null,
        tagsFor(product)),
      h("div", { class: "panel-item__actions" },
        // Modelo nuevo con precio automático disponible: se puede mostrar con ese precio, al toque.
        product.status === "nuevo" && autoPrice(product)
          ? h("button", { class: "btn btn--primary btn--sm", type: "button", onclick: (e) => busy(e.currentTarget, async () => {
            await api("/br", { method: "POST", body: brBody(product, { approve: true }) });
            await loadData();
            toast(`Listo: ya se ve en tu tienda a ${money(autoPrice(product))}.`);
            renderProducts();
          }) }, `Mostrar a ${money(autoPrice(product))}`) : null,
        pairsButton,
        h("button", { class: "btn btn--outline btn--sm", type: "button", onclick: () => { location.hash = `#br/${encodeURIComponent(product.id)}`; } }, "Editar"),
        h("button", { class: "btn btn--ghost btn--sm", type: "button", onclick: toggle }, product.hidden ? "Mostrar" : "Ocultar"))),
    quick);
}

/** Pares de casa al toque: + y − por talle, se guarda solo (como "vendí uno" en los productos propios). */
function renderQuickPairs(product, box, onChange) {
  box.replaceChildren(
    h("p", { class: "panel-muted" }, "Tus pares de cada talle. Tocá − cuando vendas uno y + cuando te llegue. Se guarda solo."),
    h("div", { class: "panel-quick__grid" }, product.sizes.map((s) => {
      const value = h("output", { class: "panel-quick__value" }, s.casa);
      const change = (delta) => () => {
        const before = product.sizes.map((x) => x.casa);
        const next = Math.max(0, s.casa + delta);
        if (next === s.casa) return;
        s.casa = next;
        s.stock = s.br + s.casa;
        value.textContent = next;
        buzz();
        onChange();
        // Se guarda una sola vez cuando deja de tocar (con todos los talles como quedaron).
        saveSoon(`pares:${product.id}`, () => api("/br", { method: "POST", body: brBody(product) }), () => {
          product.sizes.forEach((x, i) => { x.casa = before[i]; x.stock = x.br + x.casa; });
          renderQuickPairs(product, box, onChange);
          onChange();
        });
      };
      return h("div", { class: "panel-quick__size" },
        h("span", { class: "panel-quick__label" }, h("strong", {}, `Talle ${s.size}`),
          h("small", { class: "panel-muted" }, s.br ? `En Brasil: ${s.br}` : "Brasil no tiene")),
        h("div", { class: "panel-stepper" },
          h("button", { type: "button", "aria-label": `Restar un par tuyo del talle ${s.size}`, onclick: change(-1) }, ico("minus")),
          value,
          h("button", { type: "button", "aria-label": `Sumar un par tuyo al talle ${s.size}`, onclick: change(1) }, ico("plus"))));
    })));
}

/** Lo que se manda al guardar un modelo de Brasil (lo que no se cambia, queda como estaba). */
function brBody(product, changes = {}) {
  return {
    id: product.id,
    price: product.price ?? "", wholesalePrice: product.wholesalePrice ?? "", hidden: product.hidden === true,
    description: product.description ?? "", compareAt: product.compareAt ?? "", featured: product.featured === true,
    mayorista: product.mayorista ?? null, bulk: product.bulk ?? null,
    extra: product.sizes.filter((s) => s.casa > 0).map((s) => ({ size: s.size, stock: s.casa })),
    ...changes,
  };
}

function renderBrEditor(product) {
  const draft = structuredClone(product);
  const listed = listPrice(product);
  const generalUnit = generalPrice(product);
  // Si queda vacío: el precio general (si lo puso), si no la lista. Las G5 no tienen lista.
  const list = { unit: product.category === "g5" ? generalUnit : generalUnit || listed.unit,
    wholesale: generalUnit ? state.pricing?.[product.category === "g5" ? "g5" : "br"]?.wholesale ?? null : product.category === "g5" ? null : listed.wholesale };
  // En oferta, arriba va el precio normal (vacío si es el de la lista) y el de oferta en su recuadro.
  const normalValue = draft.compareAt ? (draft.compareAt === list.unit ? "" : draft.compareAt) : draft.price;
  const price = h("input", { id: "b-price", class: "panel-input", inputmode: "numeric", value: normalValue ?? "",
    placeholder: list.unit ? `${list.unit}` : "Ej: 60000" });
  const wholesale = h("input", { id: "b-wholesale", class: "panel-input", inputmode: "numeric", value: draft.wholesalePrice ?? "",
    placeholder: list.wholesale ? `${list.wholesale}` : "Opcional" });
  const visible = h("input", { id: "b-visible", type: "checkbox", checked: !draft.hidden });
  const extras = extraFields("b", draft);
  const resaleList = listPrice(product, "mayorista");
  const resale = resaleFields("b", draft, {
    unitHint: { placeholder: resaleList.unit ? `${resaleList.unit}` : "", help: resaleList.unit ? `Vacío = el precio base para revendedores (${money(resaleList.unit)}).` : "Vacío = el precio base para revendedores." },
    wholesaleHint: { placeholder: resaleList.wholesale ? `${resaleList.wholesale}` : "Opcional", help: resaleList.wholesale ? `Vacío = el precio base (${money(resaleList.wholesale)}).` : "Opcional." },
  });
  const offer = offerBox("b", () => Number(price.value.replace(/\D/g, "")) || list.unit || 0, { on: Boolean(draft.compareAt), sale: draft.compareAt ? draft.price : null });
  price.addEventListener("input", () => offer.refresh());
  const bulk = bulkFields("b", draft);
  // Si la tienda no vende por mayor, no se pide precio por mayor.
  const sellsWholesale = TWO_VERSIONS || (state.settings.name ? state.settings.wholesale === true : state.listPricing?.hasWholesale !== false);
  const sizesBox = h("div", { class: "panel-sizes" });

  function renderSizes() {
    sizesBox.replaceChildren(
      h("div", { class: "panel-br-row panel-br-row--head", "aria-hidden": "true" },
        h("span", {}, "Talle"), h("span", {}, product.category === "g5" ? "Del proveedor" : "De Brasil"), h("span", {}, "En tu casa")),
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
            h("button", { type: "button", "aria-label": `Restar uno al talle ${s.size}`, onclick: () => set(s.casa - 1) }, ico("minus")),
            value,
            h("button", { type: "button", "aria-label": `Sumar uno al talle ${s.size}`, onclick: () => set(s.casa + 1) }, ico("plus"))),
          removable ? h("button", { type: "button", class: "panel-size-row__remove", "aria-label": `Quitar talle ${s.size}`,
            onclick: () => { draft.sizes.splice(i, 1); renderSizes(); } }, ico("close")) : h("span", {}));
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
    try { offer.check(); } catch (e) { return toast(e.message, "error"); }
    const deal = offer.read();
    const sizes = draft.sizes.filter((s) => s.size);
    save({
      id: product.id,
      price: price.value.replace(/\D/g, ""), wholesalePrice: wholesale.value.replace(/\D/g, ""), hidden: !visible.checked,
      extra: sizes.filter((s) => s.casa > 0).map((s) => ({ size: s.size, stock: s.casa })),
      ...extras.read(),
      ...resale.read(),
      ...bulk.read(),
      ...(deal.on ? { price: deal.sale, compareAt: deal.normal } : { compareAt: "" }),
    }, "Cambios guardados.");
  } },
    h("div", { class: "panel-editor__head" },
      h("a", { class: "btn btn--ghost btn--sm", href: "#productos" }, ico("chevronLeft"), "Volver"),
      h("h1", {}, product.name),
      product.hidden ? null : viewLink(product)),
    h("section", { class: "panel-card panel-br-head" },
      product.images[0] ? h("img", { src: product.images[0].sm || product.images[0].lg, alt: "", width: 96, height: 120 }) : null,
      h("div", {},
        h("p", {}, [categoryName(product.category), product.brand].filter(Boolean).join(" · ")),
        h("p", { class: "panel-muted" }, "Modelo del stock automático: las fotos, el nombre y el stock del proveedor se actualizan solos."))),
    h("section", { class: "panel-card" }, h("h2", {}, "Datos"), extras.descriptionField),
    h("section", { class: "panel-card" }, h("h2", {}, "Precio"),
      h("div", { class: "panel-two" },
        field("b-price", TWO_VERSIONS ? "Precio al público" : "Precio", price, list.unit
          ? `Vacío = ${generalUnit ? "el precio general" : "el precio base"} (${money(list.unit)}).`
          : "Las G5 necesitan un precio para verse en tu tienda (o poné uno general en “Precios generales”)."),
        sellsWholesale ? field("b-wholesale", TWO_VERSIONS ? "Por mayor al público" : "Precio por mayor", wholesale, list.wholesale ? `Vacío = el precio base (${money(list.wholesale)}).` : "Opcional.") : null),
      h("label", { class: "panel-switch", for: "b-visible" }, visible, h("span", {}, "Se ve en la tienda"),
        h("small", { class: "panel-muted" }, "Destildalo para ocultar este modelo de tu tienda."))),
    resale.node,
    optionsFold(draft, offer.node, bulk.node, h("section", { class: "panel-card" }, h("h2", {}, "Destacado"), ...extras.nodes)),
    h("section", { class: "panel-card" }, h("h2", {}, "Talles"),
      h("p", { class: "panel-muted" }, "“De Brasil” se actualiza solo. En “En tu casa” sumá los pares que tenés vos: en la tienda se ven todos juntos."),
      sizesBox,
      h("button", { type: "button", class: "btn btn--outline btn--sm", onclick: () => {
        draft.sizes.push({ size: "", br: 0, casa: 1, fresh: true });
        renderSizes();
        sizesBox.querySelector(".panel-br-row:last-child input")?.focus();
      } }, "+ Otro talle")),
    brChanged(product) ? h("button", { class: "btn btn--ghost panel-delete", type: "button", onclick: async () => {
      if (await ask("¿Volver este modelo a lo automático? Se borran tu precio y tus pares de este modelo.", { ok: "Sí, volver", danger: true })) save({ id: product.id }, "El modelo volvió a lo automático.");
    } }, "Volver todo a lo automático") : null,
    h("div", { class: "panel-savebar" }, saveButton));

  show(form);
  renderSizes();
  window.scrollTo(0, 0);
  const snapshot = () => JSON.stringify([price.value, wholesale.value, visible.checked, draft.sizes, extras.read(), offer.read(), resale.read(), bulk.read()]);
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
    : { name: "", brand: "", category: "", price: "", wholesalePrice: "", sizes: [], images: [], hidden: false };
  let uploading = 0;
  const progress = new Map();   // foto que se está subiendo -> porcentaje

  // Fotos: cerradas se ve solo la portada (menos ruido); "Ver y cambiar fotos" muestra todas.
  let photosOpen = false;
  const photosHelp = h("p", { class: "panel-muted" }, `Hasta ${state.limits.imagesPerProduct}. La primera es la portada; con las flechas cambiás el orden.`);
  const photos = h("div", { class: "panel-photos" });
  const fileInput = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true, onchange: (e) => addPhotos([...e.target.files]) });
  function movePhoto(i, delta) {
    const [img] = draft.images.splice(i, 1);
    draft.images.splice(i + delta, 0, img);
    renderPhotos();
  }
  function renderPhotos() {
    if (!photosOpen) return renderPhotosClosed();
    const last = draft.images.length - 1;
    const tiles = draft.images.map((img, i) => h("div", { class: "panel-photo" },
      h("img", { src: storeUrl(img.sm), alt: `Foto ${i + 1}` }),
      i === 0 ? h("span", { class: "panel-photo__tag" }, "Portada") : null,
      h("button", { type: "button", class: "panel-photo__btn", "aria-label": `Quitar foto ${i + 1}`,
        onclick: () => { draft.images.splice(i, 1); renderPhotos(); } }, ico("close")),
      h("div", { class: "panel-photo__move" },
        i > 0 ? h("button", { type: "button", "aria-label": `Mover foto ${i + 1} a la izquierda`, onclick: () => movePhoto(i, -1) }, ico("chevronLeft")) : null,
        i < last ? h("button", { type: "button", "aria-label": `Mover foto ${i + 1} a la derecha`, onclick: () => movePhoto(i, 1) }, ico("chevronRight")) : null)));
    const canAdd = draft.images.length + uploading < state.limits.imagesPerProduct;
    const loading = [...progress.values()].map((percent) => h("div", { class: "panel-photo panel-photo--loading" },
      h("span", {}, percent < 100 ? `Subiendo… ${percent}%` : "Guardando…"),
      h("span", { class: "panel-progress", style: `--progress:${percent}%` })));
    photos.className = "panel-photos";
    photos.replaceChildren(...tiles, ...loading,
      ...(canAdd ? [h("button", { type: "button", class: "panel-photo panel-photo--add", onclick: () => fileInput.click() }, "+ Foto")] : []),
      h("button", { type: "button", class: "btn btn--outline btn--sm panel-photos__done", onclick: () => { photosOpen = false; renderPhotos(); } }, "Listo"),
      fileInput);
    photosHelp.hidden = false;
  }
  /** Fotos cerradas: la portada y un botón. Sin fotos: "+ Agregar fotos" abre la galería del celular. */
  function renderPhotosClosed() {
    const cover = draft.images[0];
    const count = draft.images.length;
    const sending = [...progress.values()];
    photos.className = "panel-photos-closed";
    photosHelp.hidden = true;
    photos.replaceChildren(
      cover ? h("img", { class: "panel-photos-closed__cover", src: storeUrl(cover.sm), alt: "Portada" })
        : h("span", { class: "panel-photos-closed__empty" }, "Sin fotos"),
      h("div", { class: "panel-photos-closed__info" },
        sending.length ? h("p", { class: "panel-muted" }, `Subiendo… ${Math.min(...sending)}%`)
          : h("p", { class: "panel-muted" }, count ? (count === 1 ? "1 foto" : `${count} fotos`) : "Todavía no tiene fotos."),
        count
          ? h("button", { type: "button", class: "btn btn--outline btn--sm", onclick: () => { photosOpen = true; renderPhotos(); } }, "Ver y cambiar fotos")
          : h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: () => fileInput.click() }, "+ Agregar fotos")),
      fileInput);
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
  const name = h("input", { id: "f-name", class: "panel-input", maxlength: 80, value: draft.name });
  const NEW = "__nueva__";
  const categorySelect = h("select", { id: "f-category", class: "panel-input" },
    // Producto nuevo: hay que elegir la categoría (antes venía la primera y era fácil equivocarse).
    draft.category ? null : h("option", { value: "", selected: true, disabled: true }, "Elegí una categoría"),
    Object.entries(state.categories).map(([id, label]) => h("option", { value: id, selected: id === draft.category }, label)),
    h("option", { value: NEW }, "+ Nueva categoría…"));
  const newCategory = h("input", { id: "f-new-category", class: "panel-input", maxlength: 30, placeholder: "Ej: Remeras, Zapatillas, Buzos" });
  const newCategoryField = field("f-new-category", "Nombre de la categoría nueva", newCategory);
  const syncCategory = () => { newCategoryField.hidden = categorySelect.value !== NEW; };
  categorySelect.addEventListener("change", syncCategory);
  categorySelect.addEventListener("change", () => {
    const note = wholesale.closest(".panel-field")?.querySelector("small");
    if (note) note.textContent = helpText(categorySelect.value);
  });
  // En oferta, arriba va el precio normal (el que se ve tachado) y el de oferta en su recuadro.
  const price = h("input", { id: "f-price", class: "panel-input", inputmode: "numeric",
    value: (draft.compareAt || draft.price) ?? "", placeholder: "Ej: 25000" });
  const wholesale = h("input", { id: "f-wholesale", class: "panel-input", inputmode: "numeric", value: draft.wholesalePrice ?? "", placeholder: "Opcional" });
  const min = state.settings.wholesaleMin || 5;
  // El mínimo de la categoría elegida (si tiene uno propio) o el general; cambia al cambiar de categoría.
  const minFor = (category) => Number(state.settings.wholesaleByCategory?.[category]) || min;
  const helpText = (category) => (TWO_VERSIONS ? `Opcional. Llevando ${minFor(category)} o más productos surtidos.` : state.settings.wholesale === false
    ? "Tu tienda no tiene venta por mayor (se activa en “Venta por mayor”)."
    : `Opcional. Se aplica llevando ${minFor(category)} o más productos surtidos${state.settings.wholesaleByCategory?.[category] ? " de esta categoría" : ""}.`);
  const wholesaleHelp = helpText(draft.category);
  const visible = h("input", { id: "f-visible", type: "checkbox", checked: !draft.hidden });
  const extras = extraFields("f", draft);
  const resale = resaleFields("f", draft, {
    unitHint: { placeholder: "Igual que al público", help: "Vacío = el mismo precio que al público." },
    wholesaleHint: { placeholder: "Opcional", help: "Llevando varios productos (como en la tienda al público)." },
  });
  const offer = offerBox("f", () => Number(price.value.replace(/\D/g, "")) || 0, { on: Boolean(draft.compareAt), sale: draft.compareAt ? draft.price : null });
  price.addEventListener("input", () => offer.refresh());
  const bulk = bulkFields("f", draft);

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
            h("button", { type: "button", "aria-label": "Restar uno", onclick: () => set(s.stock - 1) }, ico("minus")),
            value,
            h("button", { type: "button", "aria-label": "Sumar uno", onclick: () => set(s.stock + 1) }, ico("plus"))),
          h("button", { type: "button", class: "panel-size-row__remove", "aria-label": `Quitar talle ${s.size}`, onclick: () => { draft.sizes.splice(i, 1); renderSizes(); } }, ico("close")));
      }),
      ...(draft.sizes.length ? [] : [h("p", { class: "panel-muted" }, "Agregá los talles que tenés y cuántas unidades de cada uno.")]));
  }
  /**
   * Botones de talles: dejan EXACTAMENTE esos talles (en su orden). Los que siguen
   * conservan su cantidad; si se va a sacar alguno que tiene unidades, se pregunta antes.
   */
  const usePreset = async (sizes) => {
    const key = (size) => size.trim().toLowerCase();
    const wanted = new Set(sizes.map(key));
    const losing = draft.sizes.filter((s) => s.size.trim() && !wanted.has(key(s.size)) && s.stock > 0);
    if (losing.length && !await ask(`Se van a sacar los talles ${losing.map((s) => s.size).join(", ")}, que tienen unidades cargadas. ¿Seguir?`, { ok: "Sí, sacarlos", danger: true })) return;
    const kept = new Map(draft.sizes.filter((s) => wanted.has(key(s.size))).map((s) => [key(s.size), s.stock]));
    draft.sizes = sizes.map((size) => ({ size, stock: kept.get(key(size)) ?? 0 }));
    renderSizes();
  };

  const saveButton = h("button", { class: "btn btn--primary btn--lg", type: "submit" }, "Guardar");
  const form = h("form", { class: "panel-editor", onsubmit: async (event) => {
    event.preventDefault();
    if (uploading) return toast("Esperá a que terminen de subir las fotos.", "error");
    for (const input of [name, categorySelect, newCategory, price]) fieldError(input, "");
    if (!name.value.trim()) return fieldError(name, "Escribí el nombre del producto.");
    if (!categorySelect.value) return fieldError(categorySelect, "Elegí en qué categoría va.");
    if (categorySelect.value === NEW && !newCategory.value.trim()) return fieldError(newCategory, "Escribí el nombre de la categoría nueva.");
    if (!price.value.replace(/\D/g, "")) return fieldError(price, "Escribí el precio.");
    if (!draft.sizes.some((s) => s.size.trim())) {
      sizesBox.scrollIntoView({ block: "center", behavior: "smooth" });
      return toast("Agregá al menos un talle (por ejemplo, tocá “Talle único”).", "error");
    }
    try { offer.check(); } catch (e) { return toast(e.message, "error"); }
    const deal = offer.read();
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
      ...resale.read(),
      ...bulk.read(),
      // En oferta: se cobra el de oferta y el normal se muestra tachado.
      ...(deal.on ? { price: deal.sale, compareAt: deal.normal } : { compareAt: "" }),
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
      h("a", { class: "btn btn--ghost btn--sm", href: "#productos" }, ico("chevronLeft"), "Volver"),
      h("h1", {}, product ? "Editar producto" : "Nuevo producto"),
      product && !product.hidden ? viewLink(product) : null),
    h("section", { class: "panel-card" }, h("h2", {}, "Fotos"), photosHelp, photos),
    h("section", { class: "panel-card" }, h("h2", {}, "Datos"),
      field("f-name", "Nombre", name),
      field("f-category", "Categoría", categorySelect), newCategoryField,
      extras.descriptionField,
      h("div", { class: "panel-two" },
        field("f-price", TWO_VERSIONS ? "Precio al público" : "Precio", price, "El precio normal. Para rebajarlo, usá “Oferta”, más abajo."),
        // Si la tienda no vende por mayor, no se pide (se activa en "Mi tienda").
        !TWO_VERSIONS && state.settings.wholesale === false ? null : field("f-wholesale", TWO_VERSIONS ? "Por mayor al público" : "Precio por mayor", wholesale, wholesaleHelp)),
      h("label", { class: "panel-switch", for: "f-visible" }, visible, h("span", {}, "Se ve en la tienda"),
        h("small", { class: "panel-muted" }, "Destildalo para pausarlo sin borrarlo."))),
    resale.node,
    h("section", { class: "panel-card" }, h("h2", {}, "Talles y cantidades"),
      h("div", { class: "panel-presets" }, SIZE_PRESETS.map((p) => h("button", { type: "button", class: "btn btn--outline btn--sm", onclick: () => usePreset(p.sizes) }, p.label)),
        h("button", { type: "button", class: "btn btn--outline btn--sm", onclick: () => { draft.sizes.push({ size: "", stock: 0 }); renderSizes(); sizesBox.querySelector(".panel-size-row:last-of-type input")?.focus(); } }, "+ Otro talle")),
      sizesBox),
    optionsFold(draft, offer.node, bulk.node, h("section", { class: "panel-card" }, h("h2", {}, "Destacado"), ...extras.nodes)),
    product ? h("button", { class: "btn btn--ghost panel-delete", type: "button", onclick: () => removeProduct(product) }, "Borrar este producto") : null,
    h("div", { class: "panel-savebar" }, saveButton));

  show(form);
  syncCategory();
  renderPhotos();
  renderSizes();
  window.scrollTo(0, 0);
  // Si sale sin guardar, se le pregunta (ver route).
  const snapshot = () => JSON.stringify([name.value, categorySelect.value, newCategory.value, price.value, wholesale.value,
    visible.checked, draft.sizes, draft.images, uploading, extras.read(), offer.read(), resale.read(), bulk.read()]);
  const initial = snapshot();
  state.guard = () => snapshot() !== initial;
}

async function removeProduct(product) {
  if (!await ask(`¿Borrar "${product.name}"? Se borran también sus fotos. No se puede deshacer.`, { ok: "Sí, borrar", danger: true })) return;
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
  // Con stock de Brasil no va "en el orden que yo elijo": los modelos de Brasil no se pueden
  // ordenar a mano y para poner algo primero está "Destacado".
  const orders = state.br ? PRODUCT_ORDERS.filter((o) => o.value !== "manual") : PRODUCT_ORDERS;
  const currentOrder = orders.some((o) => o.value === state.settings.productOrder) ? state.settings.productOrder : (state.br ? "marca" : "alfabetico");
  const productOrder = select("o-products", orders, currentOrder);
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
          h("button", { type: "button", "aria-label": "Subir", disabled: !manual() || i === 0 || !row.id, onclick: () => move(i, -1) }, ico("arrowUp")),
          h("button", { type: "button", "aria-label": "Bajar", disabled: !manual() || i === rows.length - 1 || !row.id, onclick: () => move(i, 1) }, ico("arrowDown")),
          h("button", { type: "button", "aria-label": `Borrar ${row.label}`, disabled: count > 0, title: count > 0 ? "Tiene productos: cambiales la categoría antes de borrarla" : null,
            onclick: async () => {
              if (!row.id) { rows.splice(i, 1); return renderRows(); }
              if (!await ask(`¿Borrar la categoría "${row.label}"?`, { ok: "Sí, borrar", danger: true })) return;
              rows.splice(i, 1);
              renderRows();
              saveCategories("Categoría borrada.");
            } }, ico("trash"))));
    }), ...(rows.length ? [] : [h("p", { class: "panel-muted" }, "Todavía no tenés categorías. Agregá la primera.")]));
  }

  show(
    h("section", { class: "panel-card" },
      h("h1", {}, "Orden de tu tienda"),
      h("p", { class: "panel-muted" }, "Los productos se ven agrupados por categoría. Elegí en qué orden van las categorías y cómo se ordenan los productos dentro de cada una."),
      h("div", { class: "panel-two" },
        field("o-categories", "Orden de las categorías", categoryOrder),
        field("o-products", "Productos dentro de cada categoría", productOrder, state.br
          ? "Para que un producto salga primero, marcalo como “Destacado” al editarlo."
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
  const DEFAULT_GREETING = "¡Hola! Quiero hacer el siguiente pedido del catálogo:";
  const orderGreeting = input("s-order-greeting", s.orderGreeting, { maxlength: 120, placeholder: DEFAULT_GREETING });
  const orderFooter = h("textarea", { id: "s-order-footer", class: "panel-input panel-textarea", maxlength: 300, rows: 3,
    placeholder: "Ej: Pago por transferencia o efectivo. Envíos a todo el país." }, s.orderFooter ?? "");
  // Vista previa con un pedido de ejemplo: se actualiza mientras escribe.
  const orderPreview = h("pre", { class: "panel-order-preview", "aria-live": "polite" });
  const paintPreview = () => {
    const footer = orderFooter.value.trim();
    orderPreview.textContent = [orderGreeting.value.trim() || DEFAULT_GREETING, "",
      "Remera básica (M) $15.000", "Zapatillas urbanas (40) $60.000", "",
      "Total: 2 productos - $75.000", ...(footer ? ["", footer] : [])].join("\n");
  };
  orderGreeting.addEventListener("input", paintPreview);
  orderFooter.addEventListener("input", paintPreview);
  paintPreview();
  const heroText = h("textarea", { id: "s-hero-text", class: "panel-input panel-textarea", maxlength: 220, rows: 3,
    placeholder: "Ej: Elegí tu producto y talle, armá el pedido y envialo por WhatsApp." }, s.heroText ?? "");
  let color = s.color || COLORS[0].value;
  const swatches = h("div", { class: "panel-swatches", role: "radiogroup", "aria-label": "Color de los botones" });
  const renderSwatches = () => swatches.replaceChildren(...COLORS.map((c) => h("button", {
    type: "button", class: "panel-swatch", role: "radio", "aria-checked": String(c.value === color), "aria-label": c.label,
    style: `--swatch:${c.value}`, onclick: () => { color = c.value; renderSwatches(); } })));
  renderSwatches();

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
      orderGreeting: orderGreeting.value, orderFooter: orderFooter.value,
      color,
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
    h("section", { class: "panel-card" }, h("h2", {}, "Mensaje de los pedidos"),
      h("p", { class: "panel-muted" }, "Así te llega cada pedido por WhatsApp. Los productos, talles, precios y el total se completan solos."),
      field("s-order-greeting", "Saludo", orderGreeting, "Lo primero del mensaje. Vacío = el saludo de siempre."),
      field("s-order-footer", "Texto al final (opcional)", orderFooter, "Por ejemplo cómo te pagan, envíos o dónde retirar."),
      h("div", { class: "panel-field" }, h("span", { class: "panel-label" }, "Así se ve"), orderPreview)),
    h("section", { class: "panel-card" }, h("h2", {}, "Aviso arriba de la tienda"),
      field("s-notice", "Aviso (opcional)", notice, "Una franja arriba de todo en tu tienda. Dejalo vacío para no mostrar nada.")),
    h("section", { class: "panel-card" }, h("h2", {}, "Portada"),
      h("div", { class: "panel-two" },
        field("s-hero-title", "Título grande", heroTitle),
        field("s-hero-highlight", "Parte destacada del título", heroHighlight, "Va abajo del título, en otro color.")),
      field("s-hero-text", "Texto de bienvenida", heroText),
      h("div", { class: "panel-field" }, h("span", { class: "panel-label" }, "Color de los botones"), swatches)),
    TWO_VERSIONS ? null : h("section", { class: "panel-card" }, h("h2", {}, "Venta por mayor"),
      h("p", { class: "panel-muted" }, "Ahora tiene su propia pantalla, con mínimos por categoría."),
      h("a", { class: "btn btn--outline", href: "#por-mayor" }, "Configurar la venta por mayor")),
    passwordCard(),
    h("div", { class: "panel-savebar" }, saveButton));
  show(form);
  // Si sale sin guardar, se le pregunta (ver route). La clave va aparte y no cuenta.
  const fields = [name, tagline, whatsapp, instagram, tiktok, facebook, heroTitle, heroHighlight, heroText, notice, orderGreeting, orderFooter];
  const snapshot = () => JSON.stringify([...fields.map((f) => f.value), color]);
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
    toast("Clave cambiada. En los otros celulares hay que ingresar de nuevo.");
  }) }, "Cambiar clave");
  // Por si perdió el celular o alguien más sabe la clave: saca a todos (también a este).
  const closeAll = h("button", { class: "btn btn--ghost", type: "button", onclick: async () => {
    if (!await ask("¿Cerrar la sesión en todos los celulares y computadoras? Vas a tener que ingresar de nuevo, también acá.", { ok: "Sí, cerrar en todos", danger: true })) return;
    const done = await busy(closeAll, () => api("/cerrar-sesiones", { method: "POST" }));
    if (done) showLogin("Cerraste la sesión en todos los dispositivos.");
  } }, "Cerrar sesión en todos los dispositivos");
  return h("section", { class: "panel-card" }, h("h2", {}, "Tu clave"),
    field("p-current", "Clave actual", current),
    h("div", { class: "panel-two" }, field("p-new", "Clave nueva", next, "8 letras o números como mínimo. Que no sea fácil de adivinar."), field("p-repeat", "Repetí la clave nueva", repeat)),
    button,
    h("p", { class: "panel-muted" }, "¿Perdiste el celular o alguien más sabe tu clave? Cambiala y, si querés, cerrá la sesión en todos lados."),
    closeAll);
}

// --- inicio: resumen de la tienda y accesos rápidos -----------------------------------
// Instalar el panel como aplicación (ícono en la pantalla del celular).
let installPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  if (root.dataset.section === "inicio") renderHome();
});
const installed = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
// Programa de fondo: lo pide el celular para dejar instalar el panel (ver motor/panel/sw.js).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/motor/panel/sw.js", { scope: location.pathname.replace(/[^/]*$/, "") }).catch(() => {});
}

function renderHome() {
  const own = state.products;
  const br = state.br?.products ?? [];
  const go = (view, filter) => () => {
    state.view = view;
    if (view === "propios") state.filter = filter ?? "todos";
    else state.brFilter = filter ?? "todos";
    state.listScroll[view] = 0;
    location.hash = "#productos";
  };
  const tile = (count, label, onclick, warn = false) => h("button", { class: `panel-tile${warn && count ? " is-warn" : ""}`, type: "button", onclick },
    h("strong", {}, String(count)), h("span", {}, label));
  const tiles = [
    tile(own.length, own.length === 1 ? "producto tuyo" : "productos tuyos", go("propios")),
    tile(own.filter((p) => totalStock(p) === 0).length, "sin stock", go("propios", "sin-stock"), true),
    tile(own.filter((p) => p.compareAt).length + br.filter((p) => p.compareAt).length, "en oferta", go(own.some((p) => p.compareAt) || !state.br ? "propios" : "br", own.some((p) => p.compareAt) || !state.br ? "todos" : "cambios")),
    tile(own.filter((p) => p.hidden).length, "pausados", go("propios", "pausados")),
    ...(state.br ? [
      tile(br.filter((p) => p.status === "nuevo").length, "nuevos sin precio", go("br", "sin-precio"), true),
      tile(br.length, "en el stock automático", go("br")),
      tile(br.filter((p) => brTotal(p, "casa") > 0).length, "con pares tuyos", go("br", "casa")),
    ] : []),
  ];
  const ios = /iphone|ipad/i.test(navigator.userAgent);
  const installCard = installed() ? null : h("section", { class: "panel-card" },
    h("h2", {}, "Tené el panel en tu celular"),
    installPrompt
      ? [h("p", { class: "panel-muted" }, "Instalalo y entrás directo desde un ícono, como una aplicación."),
        h("button", { class: "btn btn--outline", type: "button", onclick: async () => {
          installPrompt.prompt();
          await installPrompt.userChoice.catch(() => null);
          installPrompt = null;
          renderHome();
        } }, "Instalar el panel")]
      : h("p", { class: "panel-muted" }, ios
        ? "En Safari tocá el botón Compartir (el cuadrado con la flecha) y después “Agregar a inicio”. Te queda un ícono para entrar directo."
        : "Abrí el panel en Google Chrome, tocá los tres puntitos de arriba y elegí “Agregar a la pantalla principal”. Te queda un ícono para entrar directo. (Con otros navegadores, el celular puede mostrar un aviso de seguridad: usá Chrome.)"));

  show(
    h("section", { class: "panel-card panel-home" },
      h("h1", {}, state.settings.name || config.name || "Tu tienda"),
      h("p", { class: "panel-muted panel-home__link" }, storeLink()),
      h("div", { class: "panel-home__actions" },
        shareButton("btn btn--primary"),
        h("a", { class: "btn btn--outline", href: "../", target: "_blank", rel: "noopener" }, "Ver tienda"))),
    h("section", { class: "panel-card" }, h("h2", {}, "Tu tienda hoy"), h("div", { class: "panel-tiles" }, tiles)),
    // G5 sin precio: no es un problema (capaz no las quiere vender), pero se le cuenta cómo mostrarlas.
    state.br && !state.pricing?.g5?.unit && br.some((p) => p.status === "sin-precio-g5")
      ? h("section", { class: "panel-card" }, h("h2", {}, "¿Querés vender calidad G5?"),
        h("p", { class: "panel-muted" }, `Tenés ${br.filter((p) => p.status === "sin-precio-g5").length} modelos G5 que todavía no se ven en tu tienda porque no tienen precio.`),
        h("a", { class: "btn btn--outline", href: "#precios-generales" }, "Ponerles precio")) : null,
    h("section", { class: "panel-card" }, h("h2", {}, "Accesos rápidos"),
      h("div", { class: "panel-home__quick" },
        h("button", { class: "btn btn--outline", type: "button", onclick: () => { state.view = "propios"; openEditor(null); } }, "+ Nuevo producto"),
        h("a", { class: "btn btn--outline", href: "#precios" }, "Cambiar precios"),
        h("a", { class: "btn btn--outline", href: "#por-mayor" }, "Venta por mayor"),
        h("a", { class: "btn btn--outline", href: "#ofertas" }, "Poner ofertas"),
        h("a", { class: "btn btn--outline", href: "#tienda" }, state.settings.notice ? "Cambiar el aviso" : "Poner un aviso"),
        h("a", { class: "btn btn--outline", href: "#ayuda" }, "¿Cómo se usa?"))),
    installCard);
}

// --- ayuda -------------------------------------------------------------------------
/** Condiciones de uso de Mi Tienda Stock (las aprobó el dueño de la plataforma el 16/10/2026). */
const TERMS = [
  "La tienda y el panel son para vender productos que tenés o que podés conseguir. No cargues productos que no existen.",
  "Usá fotos tuyas o que tengas permiso para usar.",
  "No se pueden subir fotos ni textos ofensivos, engañosos o que copien a otra marca o tienda.",
  "Los precios, el stock propio y la atención a tus clientes son tu responsabilidad. El stock de Brasil se actualiza solo, pero siempre confirmá con el cliente antes de cobrar.",
  "Cuidá tu usuario y tu clave. No se los pases a nadie.",
  "Si no se cumplen estas reglas, la tienda se puede pausar.",
  "El servicio cuesta $25.000 por mes. Si no se paga, hay unos días de margen; si sigue sin pagarse, la tienda se pausa hasta que se regularice.",
];

function termsCard() {
  return h("section", { class: "panel-card", id: "condiciones" },
    h("h2", {}, "Condiciones de uso de Mi Tienda Stock"),
    h("p", { class: "panel-muted" }, "Al usar tu tienda y este panel, aceptás estas condiciones:"),
    h("ol", { class: "panel-terms" }, TERMS.map((text) => h("li", {}, text))));
}

function renderHelp() {
  const steps = [
    ["Cargá tus productos", "En “Productos” tocá “Nuevo producto”: subí fotos, poné nombre, categoría, precio y los talles con su cantidad. Tocá “Guardar” y ya aparece en tu tienda."],
    ["Cuando vendés algo", "En la lista tocá el cartel verde “… en stock” y restá con “−” el talle que vendiste. Se guarda solo. Lo que llega a 0 deja de verse en la tienda."],
    ["El mismo modelo en otro color", "Tocá “Más” → “Copiar”. Se crea una copia pausada con las mismas fotos y talles: cambiale el nombre, las fotos y las cantidades, y tildá “Se ve en la tienda”."],
    ["Pausar sin borrar", "“Más” → “Pausar” lo esconde de la tienda (por ejemplo, mientras esperás mercadería). Con “Mostrar” vuelve a aparecer."],
    ["Orden de la tienda", "Por defecto, las categorías y los productos van de la A a la Z. En “Categorías” → “Orden de tu tienda” podés elegir otro orden: lo último que cargás primero, del más barato al más caro, o el que vos armes (con las flechas en Categorías y con “Más” → “Subir / Bajar” en Productos)."],
    ["Subir o bajar todos los precios", "En “Productos” tocá “Cambiar precios”: elegí subir o bajar, cuánto (5%, 10%…) y mirá cómo quedan antes de aplicar."],
    ["Muchos productos en oferta", "En “Productos” → “Ofertas” elegís una categoría entera o los productos que quieras, y el descuento. Ahí mismo podés sacar las ofertas."],
    ["Poner algo en oferta", "Tocá “Editar” en el producto, prendé “Poner en oferta” y elegí el descuento (10%, 20%, 30% u otro precio). En la tienda se ve el precio rebajado, el de antes tachado y el cartel “Oferta”. Para sacarla, apagá “Poner en oferta”."],
    ["Destacados y descripción", "Al editar un producto, en “Más opciones”: con “Destacado” sale primero en su categoría, y podés escribir una descripción."],
    ["Venta por mayor", "En “Productos” → “Por mayor” (o desde Inicio) la prendés, elegís desde cuántos productos y, si querés, otro mínimo para cada categoría."],
    ["Precio por cantidad", "Al editar un producto, en “Precio por cantidad”: por ejemplo “llevando 3 o más, $12.000 cada uno” de ese mismo producto."],
    ["Tu tienda", "En “Mi tienda” cambiás el nombre, el logo, tu WhatsApp, tus redes, los textos de la portada, el aviso de arriba de la tienda, el mensaje de los pedidos y el color. También tu clave."],
    ["Tenerlo como aplicación", "Abrí el panel en Google Chrome → tres puntitos → “Agregar a la pantalla principal”. En iPhone: Safari → Compartir → “Agregar a inicio”."],
    ["Compartir tu tienda", "En “Inicio” tocá “Compartir mi tienda” y elegí WhatsApp, Instagram o donde quieras."],
    ["Los pedidos", "Tus clientes arman el pedido en la tienda y te llega armado a tu WhatsApp. Ahí confirmás stock, cobro y envío. En la web no se cobra nada."],
  ];
  if (state.br) steps.unshift(
    ["El stock automático", "En “Productos” → “Stock automático” están los modelos de Brasil y de calidad G5 que llegan solos. No hace falta cargarlos: el stock se actualiza solo."],
    ["Precios generales", "En “Stock automático” → “Precios generales” ponés un precio para todos los modelos de Brasil y otro para todas las G5. Las G5 no se ven en tu tienda hasta que tengan precio."],
    ["Modelos nuevos", "Si en “Precios generales” elegís que los nuevos esperen, los que entren aparecen en Inicio como “sin precio”: tocá “Mostrar” o ponéles un precio."],
    ["Tu precio en un modelo", "Tocá “Editar” en el modelo y escribí tu precio. Si lo dejás vacío, se cobra el precio general (o el precio base que ya trae)."],
    ["Pares que tenés en tu casa", "En el mismo modelo, en “En tu casa”, sumá con “+” los pares que tenés vos. En la tienda se ven junto con los de Brasil. Cuando vendas uno tuyo, restalo con “−”."],
    ["Ocultar un modelo", "Con “Ocultar” deja de verse en tu tienda. Con “Mostrar” vuelve."],
    ["Otras cosas que vendas", "Ropa, accesorios o lo que quieras: en “Mis productos” → “Nuevo producto”, con tus fotos y la categoría que elijas."],
  );
  show(h("section", { class: "panel-card" },
    h("h1", {}, "Cómo usar tu panel"),
    h("ol", { class: "panel-help" }, steps.map(([title, text]) => h("li", {}, h("strong", {}, title), h("span", {}, text)))),
    h("p", { class: "panel-muted" }, "Tu link para compartir es el de “Ver tienda”. ¿Dudas? Escribinos por WhatsApp.")),
    termsCard());
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
  state.pricing = data.pricing ?? null;
  if (state.br && !state.priceTable) state.priceTable = await loadPriceTable(Object.values(config.channels ?? {})[0]?.prices);
  if (state.br && TWO_VERSIONS && !state.resaleTable) state.resaleTable = await loadPriceTable(config.channels.mayorista.prices);
  // Las listas con lo que subió o bajó en "Cambiar precios".
  const percent = state.settings.brPercent || 0;
  state.listPricing = state.priceTable ? createPricing({ ...state.priceTable, percent }) : null;
  state.resalePricing = state.resaleTable ? createPricing({ ...state.resaleTable, percent }) : null;
}

/** Lista de precios de una versión de la tienda (la que se cobra en los modelos de Brasil sin precio propio). */
async function loadPriceTable(file) {
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
// La posición de la pantalla la maneja el panel (si no, el celular la acomoda solo y salta).
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
window.addEventListener("beforeunload", (event) => {
  if (state.guard?.()) event.preventDefault();
});

function route() {
  if (!state.store) return;
  if (location.hash !== currentHash && state.guard?.()) {
    // Se queda donde estaba y pregunta; si dice que sí, recién ahí se va.
    const target = location.hash || "#inicio";
    history.replaceState(null, "", currentHash || "#inicio");
    ask("Tenés cambios sin guardar. ¿Salir igual? Se van a perder.", { ok: "Salir sin guardar", cancel: "Seguir editando", danger: true })
      .then((leave) => { if (leave) { state.guard = null; location.hash = target; } });
    return;
  }
  state.guard = null;
  const leaving = currentHash.slice(1).split("/")[0];
  if (leaving === "productos") state.listScroll[state.view] = scrollY;
  currentHash = location.hash;
  const [section, id] = location.hash.slice(1).split("/");
  // Cualquier pantalla que no sea la lista abre desde arriba, sin verse el salto.
  if (section !== "productos") window.scrollTo({ top: 0, behavior: "instant" });
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
  if (section === "por-mayor") return renderWholesale();
  if (section === "ofertas") return renderGroupOffers();
  if (section === "precios-generales" && state.br) return renderGeneralPricing();
  if (section === "tienda") return renderStoreSettings();
  if (section === "ayuda") return renderHelp();
  if (section === "productos") {
    renderProducts();
    // Volver a donde estaba en la lista (si venía de editar uno, por ejemplo).
    // Enseguida, antes de que se vea: así no aparece arriba y después baja.
    window.scrollTo({ top: state.listScroll?.[state.view] ?? 0, behavior: "instant" });
    return;
  }
  renderHome();
}

async function start() {
  // Mientras carga: la forma del panel en gris (se entiende que está cargando, sin saltos).
  show(h("div", { class: "panel-skeleton", "aria-busy": "true", "aria-label": "Cargando tu panel" },
    ...[1, 2, 3, 4].map(() => h("div", { class: "panel-skeleton__item" },
      h("span", { class: "panel-skeleton__thumb" }), h("span", { class: "panel-skeleton__lines" }, h("span", {}), h("span", {}))))));
  let session;
  try {
    session = await api("/yo");
  } catch {
    return;   // api() ya mostró el ingreso
  }
  if (config.manualStore && session.tienda !== config.manualStore) {
    renderTop({ loggedIn: false });
    show(h("div", { class: "panel-card" },
      h("p", {}, "Este usuario es de otra tienda."),
      h("button", { class: "btn btn--outline", type: "button", onclick: logout }, "Salir")));
    return;
  }
  state.store = session.tienda;
  state.usuario = session.usuario;
  // Primera vez con la clave que le pasaron: antes de seguir, elige la suya.
  if (session.elegirClave && !(await chooseKey())) return;
  try {
    await loadData();
  } catch (e) {
    show(h("p", { class: "panel-error" }, e.message));
    return;
  }
  route();
}

window.addEventListener("hashchange", route);
start();
