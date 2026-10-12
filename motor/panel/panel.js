/*
 * PANEL del cliente (tiendas con stock propio): cargar y cambiar productos, fotos,
 * precios, categorías, talles y cantidades desde el celular.
 *
 * Habla con el programa del panel (functions/api/panel/). Todo lo que se muestra
 * se arma con textContent (nunca HTML con datos), así nada de lo cargado puede
 * meter código en la página.
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

let state = { store: null, products: [], categories: {}, limits: { imagesPerProduct: 6, products: 150 }, search: "" };

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

const photoUrl = (path) => `/api/tienda/${encodeURIComponent(state.store)}/${path}`;
const totalStock = (product) => product.sizes.reduce((sum, s) => sum + s.stock, 0);

function renderTop({ loggedIn }) {
  top.replaceChildren(
    h("div", { class: "panel-top__inner" },
      h("div", { class: "panel-top__title" },
        h("strong", {}, config.name ?? "Mi tienda"),
        h("span", {}, "Panel de productos")),
      loggedIn ? h("div", { class: "panel-top__actions" },
        h("a", { class: "btn btn--outline btn--sm", href: "../", target: "_blank", rel: "noopener" }, "Ver mi tienda"),
        h("button", { class: "btn btn--ghost btn--sm", type: "button", onclick: logout }, "Salir")) : null));
}

// --- ingreso ---------------------------------------------------------------------
function showLogin(message = "") {
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
    h("label", { for: "usuario" }, "Usuario"), user,
    h("label", { for: "clave" }, "Clave"), pass,
    error, button);
  root.replaceChildren(form);
  user.focus();
}

async function logout() {
  await api("/salir", { method: "POST" }).catch(() => {});
  showLogin("Saliste del panel.");
}

// --- lista de productos -------------------------------------------------------------
function renderList() {
  const full = state.products.length >= state.limits.products;

  const search = h("input", { class: "panel-input", type: "search", placeholder: "Buscar producto", value: state.search, "aria-label": "Buscar producto",
    oninput: (e) => { state.search = e.target.value; renderItems(); } });
  const list = h("ul", { class: "panel-list" });
  function renderItems() {
    const t = state.search.trim().toLowerCase();
    const shown = state.products.filter((p) => !t || `${p.name} ${p.brand ?? ""} ${state.categories[p.category] ?? ""}`.toLowerCase().includes(t));
    list.replaceChildren(...(shown.length ? shown.map(itemView) : [h("li", { class: "panel-empty" },
      state.products.length ? "No hay productos con ese nombre." : "Todavía no cargaste productos. Tocá “Nuevo producto” para empezar.")]));
  }
  root.replaceChildren(
    h("div", { class: "panel-toolbar" },
      h("button", { class: "btn btn--primary", type: "button", disabled: full, onclick: () => openEditor(null) }, "+ Nuevo producto"),
      h("span", { class: "panel-muted" }, `${state.products.length} de ${state.limits.products} productos`)),
    search, list);
  renderItems();
}

function itemView(product) {
  const total = totalStock(product);
  const stockBox = h("div", { class: "panel-quick", hidden: true });
  const thumb = product.images[0]
    ? h("img", { src: photoUrl(product.images[0].sm), alt: "", width: 64, height: 80, loading: "lazy" })
    : h("span", { class: "panel-thumb--empty" }, "Sin foto");
  const badge = h("button", { class: `panel-stock${total === 0 ? " is-empty" : ""}`, type: "button", "aria-expanded": "false",
    onclick: () => {
      const open = stockBox.hidden;
      stockBox.hidden = !open;
      badge.setAttribute("aria-expanded", String(open));
      if (open) renderQuickStock(product, stockBox, badge);
    } }, total === 0 ? "Sin stock" : `${total} en stock`);
  return h("li", { class: "panel-item" },
    h("div", { class: "panel-item__row" },
      h("div", { class: "panel-thumb" }, thumb),
      h("div", { class: "panel-item__info" },
        h("strong", {}, product.name),
        h("span", { class: "panel-muted" }, [state.categories[product.category], product.brand].filter(Boolean).join(" · ")),
        h("span", {}, money(product.price), product.wholesalePrice ? h("small", { class: "panel-muted" }, ` · por mayor ${money(product.wholesalePrice)}`) : null)),
      h("div", { class: "panel-item__actions" },
        badge,
        h("button", { class: "btn btn--outline btn--sm", type: "button", onclick: () => openEditor(product) }, "Editar"))),
    stockBox);
}

/** Stock rápido: "vendí uno" sin entrar a editar. Se guarda al toque. */
function renderQuickStock(product, box, badge) {
  box.replaceChildren(h("p", { class: "panel-muted" }, "Sumá o restá unidades. Se guarda solo."),
    h("div", { class: "panel-quick__grid" }, product.sizes.map((s) => {
      const value = h("output", { class: "panel-quick__value" }, s.stock);
      const change = async (delta, button) => {
        button.disabled = true;
        try {
          const { stock } = await api("/stock", { method: "POST", body: { id: product.id, size: s.size, delta } });
          s.stock = stock;
          value.textContent = stock;
          const total = totalStock(product);
          badge.textContent = total === 0 ? "Sin stock" : `${total} en stock`;
          badge.classList.toggle("is-empty", total === 0);
        } catch (e) {
          toast(e.message, "error");
        } finally {
          button.disabled = false;
        }
      };
      return h("div", { class: "panel-quick__size" },
        h("span", { class: "panel-quick__label" }, `Talle ${s.size}`),
        h("div", { class: "panel-stepper" },
          h("button", { type: "button", "aria-label": `Restar uno al talle ${s.size}`, onclick: (e) => change(-1, e.currentTarget) }, "−"),
          value,
          h("button", { type: "button", "aria-label": `Sumar uno al talle ${s.size}`, onclick: (e) => change(1, e.currentTarget) }, "+")));
    })));
}

// --- editar / nuevo producto -----------------------------------------------------
function openEditor(product) {
  history.pushState({ editor: true }, "", product ? `#editar/${product.id}` : "#nuevo");
  renderEditor(product);
}

function renderEditor(product) {
  const draft = product
    ? structuredClone(product)
    : { name: "", brand: "", category: "", price: "", wholesalePrice: "", sizes: [], images: [] };
  draft.category = product ? (state.categories[product.category] ?? product.category) : "";
  let uploading = 0;

  // Fotos
  const photos = h("div", { class: "panel-photos" });
  const fileInput = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true, onchange: (e) => addPhotos([...e.target.files]) });
  function renderPhotos() {
    const tiles = draft.images.map((img, i) => h("div", { class: "panel-photo" },
      h("img", { src: photoUrl(img.sm), alt: `Foto ${i + 1}` }),
      i === 0 ? h("span", { class: "panel-photo__tag" }, "Portada") : h("button", { type: "button", class: "panel-photo__btn panel-photo__btn--left", "aria-label": "Usar de portada",
        onclick: () => { draft.images.unshift(...draft.images.splice(i, 1)); renderPhotos(); } }, "★"),
      h("button", { type: "button", class: "panel-photo__btn", "aria-label": `Quitar foto ${i + 1}`,
        onclick: () => { draft.images.splice(i, 1); renderPhotos(); } }, "×")));
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
        draft.images.push(await uploadPhoto(file));
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
  const field = (id, label, input, help) => h("div", { class: "panel-field" }, h("label", { for: id }, label), input, help ? h("small", { class: "panel-muted" }, help) : null);
  const name = h("input", { id: "f-name", class: "panel-input", maxlength: 80, required: true, value: draft.name });
  const brand = h("input", { id: "f-brand", class: "panel-input", maxlength: 40, value: draft.brand ?? "" });
  const categoryList = h("datalist", { id: "f-categories" }, Object.values(state.categories).map((c) => h("option", { value: c })));
  const category = h("input", { id: "f-category", class: "panel-input", maxlength: 30, required: true, list: "f-categories", value: draft.category, placeholder: "Ej: Remeras, Zapatillas" });
  const price = h("input", { id: "f-price", class: "panel-input", inputmode: "numeric", required: true, value: draft.price ?? "", placeholder: "Ej: 25000" });
  const wholesale = h("input", { id: "f-wholesale", class: "panel-input", inputmode: "numeric", value: draft.wholesalePrice ?? "", placeholder: "Opcional" });

  // Talles
  const sizesBox = h("div", { class: "panel-sizes" });
  function renderSizes() {
    sizesBox.replaceChildren(
      ...draft.sizes.map((s, i) => {
        const value = h("output", { class: "panel-quick__value" }, s.stock);
        const set = (n) => { s.stock = Math.max(0, n); value.textContent = s.stock; };
        return h("div", { class: "panel-size-row" },
          h("input", { class: "panel-input panel-size-row__name", value: s.size, maxlength: 12, "aria-label": "Talle", oninput: (e) => { s.size = e.target.value; } }),
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
    saveButton.disabled = true;
    const body = {
      id: product?.id,
      name: name.value, brand: brand.value, category: category.value,
      price: price.value.replace(/\D/g, ""), wholesalePrice: wholesale.value.replace(/\D/g, ""),
      sizes: draft.sizes.map((s) => ({ size: s.size.trim(), stock: s.stock })).filter((s) => s.size),
      images: draft.images,
    };
    try {
      await api("/productos", { method: "POST", body });
      await loadProducts();
      toast(product ? "Cambios guardados." : "Producto agregado a tu tienda.");
      history.back();
    } catch (e) {
      toast(e.message, "error");
      saveButton.disabled = false;
    }
  } },
    h("div", { class: "panel-editor__head" },
      h("button", { class: "btn btn--ghost btn--sm", type: "button", onclick: () => history.back() }, "← Volver"),
      h("h1", {}, product ? "Editar producto" : "Nuevo producto")),
    h("section", { class: "panel-card" }, h("h2", {}, "Fotos"), h("p", { class: "panel-muted" }, `Hasta ${state.limits.imagesPerProduct}. La primera es la portada (con ★ elegís otra).`), photos),
    h("section", { class: "panel-card" }, h("h2", {}, "Datos"),
      field("f-name", "Nombre", name),
      field("f-category", "Categoría", category, "Elegí una que ya tenés o escribí una nueva."), categoryList,
      field("f-brand", "Marca", brand, "Opcional."),
      h("div", { class: "panel-two" },
        field("f-price", "Precio", price),
        field("f-wholesale", "Precio por mayor", wholesale, "Opcional. Se aplica llevando 5 o más productos surtidos."))),
    h("section", { class: "panel-card" }, h("h2", {}, "Talles y cantidades"),
      h("div", { class: "panel-presets" }, SIZE_PRESETS.map((p) => h("button", { type: "button", class: "btn btn--outline btn--sm", onclick: () => addSizes(p.sizes) }, p.label)),
        h("button", { type: "button", class: "btn btn--outline btn--sm", onclick: () => { draft.sizes.push({ size: "", stock: 0 }); renderSizes(); sizesBox.querySelector(".panel-size-row:last-child input")?.focus(); } }, "+ Otro talle")),
      sizesBox),
    product ? h("button", { class: "btn btn--ghost panel-delete", type: "button", onclick: () => removeProduct(product) }, "Borrar este producto") : null,
    h("div", { class: "panel-savebar" }, saveButton));

  root.replaceChildren(form);
  renderPhotos();
  renderSizes();
  window.scrollTo(0, 0);
  (product ? null : name)?.focus();
}

async function removeProduct(product) {
  if (!confirm(`¿Borrar "${product.name}"? Se borran también sus fotos. No se puede deshacer.`)) return;
  try {
    await api(`/productos/${encodeURIComponent(product.id)}`, { method: "DELETE" });
    await loadProducts();
    toast("Producto borrado.");
    history.back();
  } catch (e) {
    toast(e.message, "error");
  }
}

// --- fotos: se achican en el celular antes de subir --------------------------------
async function shrink(bitmap, max, quality, type) {
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  return { blob, w: canvas.width, h: canvas.height };
}

async function uploadPhoto(file) {
  if (!file.type.startsWith("image/")) throw new Error("Ese archivo no es una foto.");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("No se pudo leer la foto. Probá con otra.");
  }
  // WEBP pesa menos; si el celular no sabe armarlo (algunos iPhone viejos), JPG.
  let large = await shrink(bitmap, 1200, 0.82, "image/webp");
  const type = large.blob?.type === "image/webp" ? "image/webp" : "image/jpeg";
  if (type === "image/jpeg") large = await shrink(bitmap, 1200, 0.82, type);
  if (large.blob.size > 850 * 1024) large = await shrink(bitmap, 1000, 0.7, type);
  const small = await shrink(bitmap, 480, 0.75, type);
  const form = new FormData();
  const ext = type === "image/webp" ? "webp" : "jpg";
  form.append("grande", large.blob, `grande.${ext}`);
  form.append("chica", small.blob, `chica.${ext}`);
  form.append("w", large.w);
  form.append("h", large.h);
  const { lg, sm, w, h: height } = await api("/foto", { method: "POST", form });
  return { lg, sm, w, h: height };
}

// --- arranque --------------------------------------------------------------------------
async function loadProducts() {
  const data = await api("/productos");
  state.products = data.products;
  state.categories = data.categories;
  state.limits = data.limits ?? state.limits;
}

function route() {
  const match = location.hash.match(/^#editar\/(.+)$/);
  if (match) {
    const product = state.products.find((p) => p.id === decodeURIComponent(match[1]));
    if (product) return renderEditor(product);
  }
  if (location.hash === "#nuevo") return renderEditor(null);
  renderList();
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
    renderTop({ loggedIn: true });
    root.replaceChildren(h("div", { class: "panel-card" }, h("p", {}, "Este usuario es de otra tienda. Salí e ingresá con el usuario de esta tienda.")));
    return;
  }
  state.store = session.tienda;
  renderTop({ loggedIn: true });
  try {
    await loadProducts();
  } catch (e) {
    root.replaceChildren(h("p", { class: "panel-error" }, e.message));
    return;
  }
  route();
}

window.addEventListener("popstate", () => { if (state.store) route(); });
start();
