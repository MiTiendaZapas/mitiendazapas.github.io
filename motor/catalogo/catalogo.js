/*
 * CATÁLOGO para compartir: el stock de una tienda, sin precios ni pedidos y sin el nombre de
 * ninguna tienda, así cualquier revendedor lo manda como propio. Calidad Brasil y G5 separadas.
 *   /catalogo/     stock de L.A IMP (Brasil + stock de casa + G5), el mismo de su tienda
 *   /catalogo/fo/  stock de la tienda de Fabri (Brasil sin el stock de casa + Brasil 2 + G5)
 * Los filtros quedan en el link (?calidad=…&q=…&marca=…&talle=…&tipo=…&orden=…&modelo=…): al
 * compartirlo, el otro lo abre igual.
 */
import { loadCatalog } from "../js/catalog.js";
import { compareSizes } from "../js/talles.js";
import { icon } from "../js/interfaz/icons.js";
import { brandLogo } from "../js/interfaz/marcas.js";

// De dónde sale el stock de cada catálogo (<body data-stock="…">).
const SOURCES = {
  laimp: { base: "/api/tienda/laimp/", includeHouseStock: true, files: ["productos-g5.json"] },
  // "Brasil 2": la calidad Brasil de la tienda de las G5 (la trae el piloto aparte).
  fo: { base: "https://catalogo.mitiendastock.com/", includeHouseStock: false, files: ["productos-br2.json", "productos-g5.json"] },
};
const SOURCE = SOURCES[document.body.dataset.stock] ?? SOURCES.laimp;
// Modelos sin marca cargada: se busca la marca en el nombre ("Pumas 180" -> Puma).
const KNOWN_BRANDS = ["New Balance", "Nike", "Jordan", "Adidas", "Puma", "Vans", "Fila", "Converse", "Asics", "Reebok", "Lacoste", "Crocs"];
const THEME_KEY = "catalogo:tema";
const TYPES = { zapatillas: "Zapatillas", ojotas: "Ojotas" };
const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

const $ = (id) => document.getElementById(id);
const esc = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const normal = (text) => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

let catalog = null;
const state = { calidad: "br", q: "", marca: "", talle: "", tipo: "", orden: "marca", modelo: "" };
const DEFAULTS = { calidad: "br", orden: "marca" };
// Calidades, cada una aparte (solo se muestran las que tienen modelos).
const QUALITIES = [
  { id: "br", label: "Brasil" },
  { id: "br2", label: "Brasil 2", note: "Los modelos de Brasil 2 vienen en talle brasileño (BR).", sizes: "talles brasileños (BR)" },
  { id: "g5", label: "G5", note: "Las G5 vienen en talle europeo (EU).", sizes: "talles europeos (EU)" },
];
const qualityOf = (p) => (p.category === "g5" || p.category === "br2" ? p.category : "br");
const inQuality = (p) => qualityOf(p) === state.calidad;

// --- link con los filtros -----------------------------------------------------------
function readUrl() {
  const params = new URLSearchParams(location.search);
  for (const key of Object.keys(state)) state[key] = params.get(key) ?? DEFAULTS[key] ?? "";
  if (!QUALITIES.some((q) => q.id === state.calidad)) state.calidad = "br";
}
function writeUrl() {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) if (value && value !== DEFAULTS[key]) params.set(key, value);
  const query = params.toString();
  history.replaceState(null, "", location.pathname + (query ? `?${query}` : ""));
}

// --- filtros ------------------------------------------------------------------------
const brandOf = (p) => p.brand || "Otras";
const matches = (p, skip) =>
  inQuality(p)
  && (skip === "q" || !state.q || normal(`${p.brand ?? ""} ${p.name}`).includes(normal(state.q)))
  && (skip === "marca" || !state.marca || normal(brandOf(p)) === normal(state.marca))
  && (skip === "talle" || !state.talle || p.available.some((s) => s.size === state.talle))
  && (skip === "tipo" || !state.tipo || p.category === state.tipo);

function visibleProducts() {
  const list = catalog.products.filter((p) => matches(p));
  if (state.orden === "talles") return list.sort((a, b) => b.available.length - a.available.length || collator.compare(a.name, b.name));
  return list;   // loadCatalog ya los ordena por marca y modelo
}

function chip(label, { pressed, count, onClick, extraClass = "", logo = null, disabled = false }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `c-chip ${extraClass}`;
  button.setAttribute("aria-pressed", String(pressed));
  button.disabled = disabled;
  button.innerHTML = `${logo ?? ""}<span>${esc(label)}</span>${count == null ? "" : `<span class="c-chip__count">${count}</span>`}`;
  button.addEventListener("click", onClick);
  return button;
}
const toggle = (key, value) => () => { state[key] = state[key] === value ? "" : value; update(); };

function paintQuality() {
  const present = QUALITIES.map((q) => ({ ...q, count: catalog.products.filter((p) => qualityOf(p) === q.id).length })).filter((q) => q.count);
  const box = $("calidad");
  box.hidden = present.length < 2;
  box.style.setProperty("--c-quality-count", present.length);
  const note = QUALITIES.find((q) => q.id === state.calidad)?.note;
  $("calidad-nota").hidden = !note;
  $("calidad-nota").textContent = note ?? "";
  box.querySelector(".c-quality__options").replaceChildren(...present.map(({ id, label, count }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(state.calidad === id));
    button.innerHTML = `<span class="c-quality__name">${label}</span><span class="c-quality__count">${count} ${count === 1 ? "modelo" : "modelos"}</span>`;
    button.addEventListener("click", () => {
      if (state.calidad === id) return;
      // Cada calidad tiene sus marcas y sus tipos: al cambiar, esos filtros vuelven a empezar.
      Object.assign(state, { calidad: id, marca: "", tipo: "" });
      update();
    });
    return button;
  }));
}

function paintFilters() {
  paintQuality();
  // Tipo (zapatillas / ojotas / lo que cargó la tienda): solo si hay más de uno.
  const types = [...new Set(catalog.products.filter(inQuality).map((p) => p.category))];
  $("f-categoria").hidden = types.length < 2;
  $("f-categoria").querySelector(".c-chips").replaceChildren(...types.map((type) => {
    const count = catalog.products.filter((p) => p.category === type && matches(p, "tipo")).length;
    return chip(TYPES[type] ?? catalog.categories?.[type] ?? type, { pressed: state.tipo === type, count, disabled: !count && state.tipo !== type, onClick: toggle("tipo", type) });
  }));

  // Marcas: las que tienen modelos con los demás filtros, de más a menos modelos.
  const brands = new Map();
  for (const p of catalog.products) if (matches(p, "marca")) brands.set(brandOf(p), (brands.get(brandOf(p)) ?? 0) + 1);
  if (state.marca && ![...brands.keys()].some((b) => normal(b) === normal(state.marca))) brands.set(state.marca, 0);
  $("f-marca").replaceChildren(
    chip("Todas", { pressed: !state.marca, onClick: () => { state.marca = ""; update(); } }),
    ...[...brands].sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0])).map(([brand, count]) =>
      chip(brand, { pressed: normal(state.marca) === normal(brand), count, logo: brandLogo(brand, "c-chip__logo"), onClick: toggle("marca", brand) })));

  // Talles: todos los que hay en el catálogo; los que no tienen modelos con los demás filtros, apagados.
  const sizes = [...new Set(catalog.products.filter(inQuality).flatMap((p) => p.available.map((s) => s.size)))].sort(compareSizes);
  $("f-talle").replaceChildren(...sizes.map((size) => {
    const count = catalog.products.filter((p) => matches(p, "talle") && p.available.some((s) => s.size === size)).length;
    return chip(size, { pressed: state.talle === size, extraClass: "c-chip--size", disabled: !count && state.talle !== size,
      onClick: toggle("talle", size) });
  }));
  for (const label of $("f-talle").querySelectorAll(".c-chip")) label.setAttribute("aria-label", `Talle ${label.textContent}`);
  // En el celular las filas se deslizan: la marca y el talle elegidos quedan a la vista.
  for (const row of [$("f-marca"), $("f-talle")]) {
    const pressed = row.querySelector('[aria-pressed="true"]');
    if (pressed && row.scrollWidth > row.clientWidth) row.scrollLeft = pressed.offsetLeft - row.offsetLeft - (row.clientWidth - pressed.offsetWidth) / 2;
  }
}

// --- tarjetas: todas las fotos del modelo (se deslizan; en la compu, flechas) -------------
const photoOf = (img) => img.sm || img.lg;
// Algunos modelos llegan del proveedor sin foto: un cuadro que lo dice (no una tarjeta vacía).
const NO_PHOTO = `<div class="c-nophoto">${icon("image")}<span>Sin foto</span></div>`;
// Al abrir solo se baja la primera foto de cada modelo (la chica): bajar todas de entrada eran
// más de 90 fotos grandes a la vez y en el celular el catálogo quedaba gris un buen rato.
// Las demás se bajan cuando la persona desliza las fotos de ese modelo.
const EAGER_CARDS = 6;
function card(p, index = EAGER_CARDS) {
  const title = `${p.brand ?? ""} ${p.name}`.trim();
  const sizes = p.available.map((s) => `<li${s.size === state.talle ? ' class="is-match"' : ""}>${esc(s.size)}</li>`).join("");
  const many = p.images.length > 1;
  const li = document.createElement("li");
  li.innerHTML = `
    <article class="c-card">
      <div class="c-photos">
        <div class="c-photos__track">${p.images.length ? p.images.map((img, i) => i === 0
          ? `<img src="${esc(photoOf(img))}" alt="${esc(title)}, foto 1" ${index < EAGER_CARDS ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="400" height="400">`
          : `<img data-src="${esc(photoOf(img))}" alt="${esc(title)}, foto ${i + 1}" decoding="async" width="400" height="400">`).join("")
          : NO_PHOTO}</div>
        ${many ? `<div class="c-dots" aria-hidden="true">${p.images.map((_, i) => `<span${i ? "" : ' class="is-on"'}></span>`).join("")}</div>
          <button class="c-arrow c-arrow--prev" type="button" aria-label="Foto anterior" hidden>${icon("chevronLeft")}</button>
          <button class="c-arrow c-arrow--next" type="button" aria-label="Foto siguiente">${icon("chevronRight")}</button>` : ""}
      </div>
      <button class="c-card__body" type="button" aria-label="${esc(title)}: ver fotos y talles">
        ${p.brand ? `<span class="c-card__brand">${esc(p.brand)}</span>` : ""}
        <span class="c-card__name">${esc(p.name)}</span>
        <ul class="c-sizes" aria-label="Talles disponibles">${sizes}</ul>
      </button>
    </article>`;
  const track = li.querySelector(".c-photos__track");
  li.querySelector(".c-card__body").addEventListener("click", () => openSheet(p));
  track.addEventListener("click", () => openSheet(p, Math.round(track.scrollLeft / track.clientWidth)));
  if (many) {
    const dots = [...li.querySelectorAll(".c-dots span")];
    const [prev, next] = li.querySelectorAll(".c-arrow");
    const loadRest = () => {
      for (const img of track.querySelectorAll("img[data-src]")) { img.src = img.dataset.src; img.removeAttribute("data-src"); }
    };
    const go = (step) => { loadRest(); track.scrollBy({ left: step * track.clientWidth, behavior: "smooth" }); };
    prev.addEventListener("click", () => go(-1));
    next.addEventListener("click", () => go(1));
    // En la compu, al pasar el mouse ya se bajan (así al tocar la flecha la foto está).
    track.addEventListener("pointerenter", loadRest, { once: true });
    track.addEventListener("touchstart", loadRest, { once: true, passive: true });
    track.addEventListener("scroll", () => {
      loadRest();
      const index = Math.round(track.scrollLeft / track.clientWidth);
      dots.forEach((dot, i) => dot.classList.toggle("is-on", i === index));
      prev.hidden = index === 0;
      next.hidden = index === p.images.length - 1;
    }, { passive: true });
  }
  return li;
}

function paintGrid() {
  const list = visibleProducts();
  const grid = $("modelos");
  grid.setAttribute("aria-busy", "false");
  const filtered = state.q || state.marca || state.talle || state.tipo;
  $("cantidad").textContent = `${list.length} ${list.length === 1 ? "modelo" : "modelos"}${state.talle ? ` en talle ${state.talle}` : ""}`;
  $("limpiar").hidden = !filtered;
  if (!list.length) {
    grid.innerHTML = `<li class="c-empty"><p><strong>No hay modelos con esos filtros.</strong></p><p class="c-muted">Probá con otro talle o con otra marca.</p>
      <button class="c-btn c-btn--ghost" type="button">Limpiar filtros</button></li>`;
    grid.querySelector("button").addEventListener("click", clearFilters);
    return;
  }
  grid.replaceChildren(...list.map((p, i) => card(p, i)));
}

function update() {
  writeUrl();
  paintFilters();
  paintGrid();
}

function clearFilters() {
  Object.assign(state, { q: "", marca: "", talle: "", tipo: "" });   // la calidad queda
  $("buscar").value = "";
  $("buscar-borrar").hidden = true;
  update();
}

// --- ficha del modelo ---------------------------------------------------------------
function openSheet(p, photo = 0) {
  const sheet = $("ficha");
  const images = p.images.map((img, i) => `<img src="${esc(img.lg)}" alt="${esc(p.name)}, foto ${i + 1} de ${p.images.length}" loading="${i ? "lazy" : "eager"}" width="${img.w || 675}" height="${img.h || 900}">`).join("");
  const sizes = p.available.map((s) => `<li${s.size === state.talle ? ' class="is-match"' : ""}>${esc(s.size)}</li>`).join("");
  sheet.innerHTML = `
    <div class="c-sheet__head"><button class="c-icon-btn" type="button" data-close aria-label="Cerrar">${icon("close")}</button></div>
    <div class="c-sheet__grid">
    <div class="c-sheet__media">
      <div class="c-gallery">${images || NO_PHOTO}</div>
      ${p.images.length > 1 ? `<p class="c-gallery-count">${p.images.length} fotos · deslizá para ver</p>` : ""}
    </div>
    <div class="c-sheet__body">
      ${p.brand ? `<span class="c-card__brand">${esc(p.brand)}</span>` : ""}
      <h2 id="ficha-titulo">${esc(p.name)}</h2>
      ${(() => { const q = QUALITIES.find((x) => x.id === qualityOf(p)); return `<p class="c-muted" style="margin:0">Calidad ${esc(q.label)}${q.sizes ? ` · ${q.sizes}` : ""}</p>`; })()}
      <div><p class="c-filter__title" style="margin-bottom:8px">Talles disponibles</p><ul class="c-sheet__sizes">${sizes}</ul></div>
      <button class="c-btn" type="button" data-photo>${icon("image")} Mandar foto</button>
    </div>
    </div>`;
  sheet.querySelector("[data-close]").addEventListener("click", () => sheet.close());
  sheet.querySelector("[data-photo]").addEventListener("click", (event) => sendPhoto(p, event.currentTarget));
  sheet.querySelector("[data-photo]").hidden = !p.images.length;
  state.modelo = p.slug;
  writeUrl();
  if (!sheet.open) sheet.showModal();
  sheet.scrollTop = 0;
  const gallery = sheet.querySelector(".c-gallery");
  if (photo) gallery.scrollLeft = photo * gallery.clientWidth;
}

// --- compartir, tema y avisos -------------------------------------------------------
function toast(text) {
  const box = $("aviso");
  box.textContent = text;
  box.classList.add("is-on");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove("is-on"), 2200);
}

async function share(title = "Catálogo") {
  const url = location.href;
  if (navigator.share) {
    try { await navigator.share({ title, text: `Mirá el stock: ${title}`, url }); } catch { /* la persona canceló */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copiado");
  } catch {
    window.prompt("Copiá este link:", url);
  }
}

/**
 * "Mandar foto": la foto de portada del modelo como imagen (JPG, así WhatsApp no la toma como
 * sticker). En el celular se abre el menú de compartir para elegir a quién mandarla; donde no
 * se puede (la mayoría de las computadoras), se descarga.
 */
async function sendPhoto(p, button) {
  const label = button.innerHTML;
  button.disabled = true;
  button.textContent = "Preparando foto…";
  try {
    // Se pide de nuevo ("?foto"): la que ya mostró la página quedó guardada sin permiso para copiarla.
    const url = new URL(p.images[0].lg, location.href);
    url.searchParams.set("foto", "1");
    const response = await fetch(url, { mode: "cors", cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    const jpg = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    const name = `${(p.slug || "modelo").replace(/[^a-z0-9-]/gi, "")}.jpg`;
    const file = new File([jpg], name, { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); } catch { /* la persona canceló */ }
    } else {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(file);
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
      toast("Foto descargada");
    }
  } catch {
    toast("No se pudo preparar la foto. Probá de nuevo.");
  } finally {
    button.disabled = false;
    button.innerHTML = label;
  }
}

function paintTheme() {
  const dark = document.documentElement.dataset.theme === "dark";
  const button = $("tema");
  button.innerHTML = icon(dark ? "sun" : "moon");
  button.setAttribute("aria-label", dark ? "Pasar a modo claro" : "Pasar a modo oscuro");
  document.querySelector('meta[name="theme-color"]').content = dark ? "#0f0f10" : "#ffffff";
}

function updatedText(date) {
  if (!date || Number.isNaN(date.getTime())) return "Stock actualizado todo el tiempo";
  const time = date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const day = (d) => d.toLocaleDateString("es-AR");
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const when = day(date) === day(today) ? "hoy" : day(date) === day(yesterday) ? "ayer" : date.toLocaleDateString("es-AR", { day: "numeric", month: "numeric" });
  return `Stock actualizado: ${when} ${time}`;
}

// --- carga --------------------------------------------------------------------------
function paintWaiting() {
  const wait = `<li><div class="c-card c-card--wait" aria-hidden="true"><div class="c-wait-img"></div><div class="c-card__body"><div class="c-wait-line" style="width:40%"></div><div class="c-wait-line"></div><div class="c-wait-line" style="width:70%"></div></div></div></li>`;
  $("modelos").innerHTML = wait.repeat(8);
  $("modelos").setAttribute("aria-busy", "true");
}

async function start() {
  paintWaiting();
  try {
    catalog = await loadCatalog(SOURCE.base, { includeHouseStock: SOURCE.includeHouseStock, showG5: true, extraFiles: SOURCE.files });
    for (const p of catalog.products) p.brand ||= KNOWN_BRANDS.find((b) => normal(p.name).includes(normal(b))) ?? null;
    // Con las marcas encontradas en el nombre, se vuelve a ordenar por marca y modelo.
    catalog.products.sort((a, b) => (a.brand ? 0 : 1) - (b.brand ? 0 : 1) || collator.compare(a.brand ?? "", b.brand ?? "") || collator.compare(a.name, b.name));
    if (!catalog.products.some(inQuality)) state.calidad = "br";
  } catch {
    $("actualizado").textContent = "No se pudo cargar el stock";
    $("modelos").setAttribute("aria-busy", "false");
    $("modelos").innerHTML = `<li class="c-empty"><p><strong>No se pudo cargar el stock.</strong></p><p class="c-muted">Revisá tu conexión y probá de nuevo.</p>
      <button class="c-btn" type="button">Reintentar</button></li>`;
    $("modelos").querySelector("button").addEventListener("click", start);
    return;
  }
  $("actualizado").textContent = updatedText(catalog.updatedAt);
  $("orden").value = state.orden === "talles" ? "talles" : "marca";
  update();
  const model = state.modelo && catalog.getBySlug(state.modelo);
  if (model) openSheet(model);
  else if (state.modelo) { state.modelo = ""; writeUrl(); }
}

readUrl();
$("buscar").value = state.q;
$("buscar").insertAdjacentHTML("beforebegin", icon("search"));
$("buscar-borrar").innerHTML = icon("close");
$("buscar-borrar").hidden = !state.q;
$("compartir").innerHTML = icon("share");
paintTheme();

let typing;
$("buscar").addEventListener("input", (event) => {
  $("buscar-borrar").hidden = !event.target.value;
  clearTimeout(typing);
  typing = setTimeout(() => { state.q = event.target.value.trim(); if (catalog) update(); }, 200);
});
$("buscar-borrar").addEventListener("click", () => {
  $("buscar").value = "";
  $("buscar-borrar").hidden = true;
  state.q = "";
  if (catalog) update();
  $("buscar").focus();
});
$("orden").addEventListener("change", (event) => { state.orden = event.target.value; if (catalog) update(); });
$("limpiar").addEventListener("click", clearFilters);
$("compartir").addEventListener("click", () => share());
$("tema").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try { localStorage.setItem(THEME_KEY, dark ? "dark" : "light"); } catch { /* sin guardar: igual cambia */ }
  paintTheme();
});
const sheet = $("ficha");
sheet.addEventListener("close", () => { state.modelo = ""; writeUrl(); });
// Tocar afuera de la ficha la cierra.
sheet.addEventListener("click", (event) => { if (event.target === sheet) sheet.close(); });

start();
