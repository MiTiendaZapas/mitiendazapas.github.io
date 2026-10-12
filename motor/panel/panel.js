/*
 * PANEL del cliente (tiendas con stock propio). Secciones:
 *   Productos   cargar, editar, copiar, pausar, ordenar y mover stock
 *   Categorías  crear, renombrar, ordenar y borrar
 *   Mi tienda   nombre, logo, WhatsApp, redes, color, textos, venta por mayor y clave
 *   Ayuda       guía corta
 *
 * Habla con el programa del panel (functions/api/panel/). Todo se arma con textContent
 * (nunca HTML con datos), así nada de lo cargado puede meter código en la página.
 */
const config = window.STORE_CONFIG ?? {};
const root = document.getElementById("panel");
const top = document.getElementById("panel-top");
const toastBox = document.getElementById("panel-toast");
const API = "/api/panel";
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

function renderTop({ loggedIn }) {
  const current = (location.hash.slice(1).split("/")[0]) || "productos";
  top.replaceChildren(
    h("div", { class: "panel-top__inner" },
      h("div", { class: "panel-top__title" },
        h("strong", {}, state.settings.name || config.name || "Mi tienda"),
        h("span", {}, "Panel de tu tienda")),
      loggedIn ? h("div", { class: "panel-top__actions" },
        h("a", { class: "btn btn--outline btn--sm", href: "../", target: "_blank", rel: "noopener" }, "Ver tienda"),
        h("button", { class: "btn btn--ghost btn--sm", type: "button", onclick: logout }, "Salir")) : null),
    loggedIn ? h("nav", { class: "panel-tabs", "aria-label": "Secciones del panel" },
      TABS.map((t) => h("a", { href: `#${t.id}`, class: "panel-tab", "aria-current": current === t.id || (t.id === "productos" && ["editar", "nuevo"].includes(current)) ? "page" : null }, t.label))) : null);
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
    error, button);
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

function renderProducts() {
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
    const shown = state.products.filter((p) => matchesFilter(p)
      && (!term || `${p.name} ${p.brand ?? ""} ${categoryName(p.category)}`.toLowerCase().includes(term)));
    // Ordenar solo tiene sentido viendo todos (si no, "subir" sería confuso).
    const canOrder = state.filter === "todos" && !term;
    list.replaceChildren(...(shown.length
      ? shown.map((p) => itemView(p, canOrder, renderAll))
      : [h("li", { class: "panel-empty" }, state.products.length ? "No hay productos con ese filtro." : "Todavía no cargaste productos. Tocá “Nuevo producto” para empezar.")]));
  }
  function renderAll() { renderChips(); renderItems(); }

  root.replaceChildren(
    h("div", { class: "panel-toolbar" },
      h("button", { class: "btn btn--primary", type: "button", disabled: full, onclick: () => openEditor(null) }, "+ Nuevo producto"),
      h("span", { class: "panel-muted" }, `${state.products.length} de ${state.limits.products} productos`)),
    h("input", { class: "panel-input", type: "search", placeholder: "Buscar producto", value: state.search, "aria-label": "Buscar producto",
      oninput: (e) => { state.search = e.target.value; renderItems(); } }),
    chips, list);
  renderAll();
}

function itemView(product, canOrder, refresh) {
  const total = totalStock(product);
  const index = state.products.indexOf(product);
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
    const ids = state.products.map((p) => p.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved);
    await api("/orden", { method: "POST", body: { ids } });
    const [p] = state.products.splice(index, 1);
    state.products.splice(index + delta, 0, p);
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
    state.products.splice(index + 1, 0, created);
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
        product.hidden ? h("span", { class: "panel-paused-tag" }, "Pausado: no se ve en la tienda") : null),
      h("div", { class: "panel-item__actions" },
        badge,
        h("button", { class: "btn btn--outline btn--sm", type: "button", onclick: () => openEditor(product) }, "Editar"),
        h("details", { class: "panel-more" },
          h("summary", { class: "btn btn--ghost btn--sm", "aria-label": `Más opciones de ${product.name}` }, "Más"),
          h("div", { class: "panel-more__menu" },
            h("button", { type: "button", onclick: togglePause }, product.hidden ? "Mostrar en la tienda" : "Pausar (ocultar)"),
            h("button", { type: "button", onclick: copy }, "Copiar (otro color)"),
            canOrder && index > 0 ? h("button", { type: "button", onclick: move(-1) }, "Subir un lugar") : null,
            canOrder && index < state.products.length - 1 ? h("button", { type: "button", onclick: move(1) }, "Bajar un lugar") : null)))),
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

// --- productos: editar / nuevo ----------------------------------------------------
function openEditor(product) {
  location.hash = product ? `#editar/${product.id}` : "#nuevo";
}

function renderEditor(product) {
  const draft = product
    ? structuredClone(product)
    : { name: "", brand: "", category: Object.keys(state.categories)[0] ?? "", price: "", wholesalePrice: "", sizes: [], images: [], hidden: false };
  let uploading = 0;

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
    const loading = Array.from({ length: uploading }, () => h("div", { class: "panel-photo panel-photo--loading" }, "Subiendo…"));
    photos.replaceChildren(...tiles, ...loading,
      ...(canAdd ? [h("button", { type: "button", class: "panel-photo panel-photo--add", onclick: () => fileInput.click() }, "+ Foto")] : []), fileInput);
  }
  async function addPhotos(files) {
    fileInput.value = "";
    const room = state.limits.imagesPerProduct - draft.images.length - uploading;
    for (const file of files.slice(0, room)) {
      uploading += 1;
      renderPhotos();
      try {
        draft.images.push(await uploadImage(file, { endpoint: "/foto", sizes: [["grande", 1200, 0.82], ["chica", 480, 0.75]] }));
      } catch (e) {
        toast(e.message, "error");
      } finally {
        uploading -= 1;
        renderPhotos();
      }
    }
    if (files.length > room) toast(`Máximo ${state.limits.imagesPerProduct} fotos por producto.`, "error");
  }

  // Datos
  const name = h("input", { id: "f-name", class: "panel-input", maxlength: 80, required: true, value: draft.name });
  const brand = h("input", { id: "f-brand", class: "panel-input", maxlength: 40, value: draft.brand ?? "" });
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
  const addSizes = (sizes) => {
    const have = new Set(draft.sizes.map((s) => s.size.toLowerCase()));
    for (const size of sizes) if (!have.has(size.toLowerCase())) draft.sizes.push({ size, stock: 0 });
    renderSizes();
  };

  const saveButton = h("button", { class: "btn btn--primary btn--lg", type: "submit" }, "Guardar");
  const form = h("form", { class: "panel-editor", onsubmit: async (event) => {
    event.preventDefault();
    if (uploading) return toast("Esperá a que terminen de subir las fotos.", "error");
    const category = categorySelect.value === NEW ? newCategory.value : categorySelect.value;
    const body = {
      id: product?.id,
      name: name.value, brand: brand.value, category,
      price: price.value.replace(/\D/g, ""), wholesalePrice: wholesale.value.replace(/\D/g, ""),
      sizes: draft.sizes.map((s) => ({ size: s.size.trim(), stock: s.stock })).filter((s) => s.size),
      images: draft.images,
      hidden: !visible.checked,
    };
    const saved = await busy(saveButton, async () => {
      await api("/productos", { method: "POST", body });
      await loadData();
      return true;
    });
    if (saved) {
      toast(product ? "Cambios guardados." : "Producto agregado a tu tienda.");
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
      field("f-brand", "Marca", brand, "Opcional."),
      h("div", { class: "panel-two" },
        field("f-price", "Precio", price),
        field("f-wholesale", "Precio por mayor", wholesale, wholesaleHelp)),
      h("label", { class: "panel-switch", for: "f-visible" }, visible, h("span", {}, "Se ve en la tienda"),
        h("small", { class: "panel-muted" }, "Destildalo para pausarlo sin borrarlo."))),
    h("section", { class: "panel-card" }, h("h2", {}, "Talles y cantidades"),
      h("div", { class: "panel-presets" }, SIZE_PRESETS.map((p) => h("button", { type: "button", class: "btn btn--outline btn--sm", onclick: () => addSizes(p.sizes) }, p.label)),
        h("button", { type: "button", class: "btn btn--outline btn--sm", onclick: () => { draft.sizes.push({ size: "", stock: 0 }); renderSizes(); sizesBox.querySelector(".panel-size-row:last-of-type input")?.focus(); } }, "+ Otro talle")),
      sizesBox),
    product ? h("button", { class: "btn btn--ghost panel-delete", type: "button", onclick: () => removeProduct(product) }, "Borrar este producto") : null,
    h("div", { class: "panel-savebar" }, saveButton));

  root.replaceChildren(form);
  syncCategory();
  renderPhotos();
  renderSizes();
  window.scrollTo(0, 0);
  if (!product) name.focus();
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
    location.hash = "#productos";
  }
}

// --- categorías -------------------------------------------------------------------
function renderCategories() {
  const rows = Object.entries(state.categories).map(([id, label]) => ({ id, label }));
  const used = (id) => state.products.filter((p) => p.category === id).length;
  const list = h("div", { class: "panel-cats" });
  const saveButton = h("button", { class: "btn btn--primary btn--lg", type: "button" }, "Guardar categorías");

  function renderRows() {
    list.replaceChildren(...rows.map((row, i) => {
      const count = row.id ? used(row.id) : 0;
      return h("div", { class: "panel-cat" },
        h("input", { class: "panel-input", value: row.label, maxlength: 30, "aria-label": `Nombre de la categoría ${i + 1}`, placeholder: "Nombre",
          oninput: (e) => { row.label = e.target.value; } }),
        h("span", { class: "panel-muted panel-cat__count" }, count === 1 ? "1 producto" : `${count} productos`),
        h("div", { class: "panel-cat__actions" },
          h("button", { type: "button", "aria-label": "Subir", disabled: i === 0, onclick: () => { rows.splice(i - 1, 0, ...rows.splice(i, 1)); renderRows(); } }, "↑"),
          h("button", { type: "button", "aria-label": "Bajar", disabled: i === rows.length - 1, onclick: () => { rows.splice(i + 1, 0, ...rows.splice(i, 1)); renderRows(); } }, "↓"),
          h("button", { type: "button", "aria-label": `Borrar ${row.label}`, disabled: count > 0, title: count > 0 ? "Tiene productos: cambiales la categoría antes de borrarla" : null,
            onclick: () => { rows.splice(i, 1); renderRows(); } }, "×")));
    }), ...(rows.length ? [] : [h("p", { class: "panel-muted" }, "Todavía no tenés categorías. Agregá la primera.")]));
  }
  saveButton.addEventListener("click", () => busy(saveButton, async () => {
    const { categories } = await api("/categorias", { method: "POST", body: { categories: rows.map((r) => ({ id: r.id, label: r.label })) } });
    state.categories = categories;
    toast("Categorías guardadas.");
    renderCategories();
  }));

  root.replaceChildren(h("section", { class: "panel-card" },
    h("h1", {}, "Categorías"),
    h("p", { class: "panel-muted" }, "Así se agrupan tus productos en la tienda, en este orden. Solo se puede borrar una categoría sin productos."),
    list,
    h("button", { class: "btn btn--outline", type: "button", onclick: () => { rows.push({ id: null, label: "" }); renderRows(); list.querySelector(".panel-cat:last-child input")?.focus(); } }, "+ Nueva categoría")),
    h("div", { class: "panel-savebar" }, saveButton));
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
      heroTitle: heroTitle.value, heroHighlight: heroHighlight.value, heroText: heroText.value,
      color, wholesale: wholesaleOn.checked, wholesaleMin: Number(wholesaleMin.value),
    } }));
    if (result) {
      state.settings = result.settings;
      renderTop({ loggedIn: true });
      toast("Listo: tu tienda ya muestra los cambios.");
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
    ["Ordenar", "“Más” → “Subir” o “Bajar” cambia el lugar del producto en la tienda: lo de arriba se ve primero. Las categorías se ordenan en “Categorías”."],
    ["Tu tienda", "En “Mi tienda” cambiás el nombre, el logo, tu WhatsApp, tus redes, los textos de la portada, el color y la venta por mayor. También tu clave."],
    ["Los pedidos", "Tus clientes arman el pedido en la tienda y te llega armado a tu WhatsApp. Ahí confirmás stock, cobro y envío. En la web no se cobra nada."],
  ];
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

/**
 * Achica la foto (WEBP si el celular puede, si no JPG) y la sube.
 * sizes: [[nombre del campo, lado máximo, calidad], ...]. square: recorta al medio (logo).
 */
async function uploadImage(file, { endpoint, sizes, square = false, raw = false, jpg = false }) {
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
  const result = await api(endpoint, { method: "POST", form });
  return raw ? result : { lg: result.lg, sm: result.sm, w: result.w, h: result.h };
}

// --- arranque y navegación -------------------------------------------------------------
async function loadData() {
  const [data, settings] = await Promise.all([api("/productos"), api("/ajustes")]);
  state.products = data.products;
  state.categories = data.categories;
  state.limits = data.limits ?? state.limits;
  state.settings = settings ?? {};
}

function route() {
  if (!state.store) return;
  const [section, id] = location.hash.slice(1).split("/");
  renderTop({ loggedIn: true });
  if (section === "editar") {
    const product = state.products.find((p) => p.id === decodeURIComponent(id ?? ""));
    if (product) return renderEditor(product);
  }
  if (section === "nuevo") return renderEditor(null);
  if (section === "categorias") return renderCategories();
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
