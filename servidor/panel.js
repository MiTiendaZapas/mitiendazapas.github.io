/*
 * Piezas del programa del PANEL (tiendas con stock propio del cliente).
 * Corre dentro de Cloudflare (Pages Functions), no en el navegador.
 *
 * Dónde se guarda cada cosa:
 *   CATALOGO (depósito público, el de siempre):
 *     tiendas/<tienda>/productos.json   catálogo que ve el público
 *     tiendas/<tienda>/fotos/<código>   fotos de los productos
 *   PRIVADO (depósito sin acceso público):
 *     usuarios/<usuario>.json           usuario, tienda y clave cifrada
 *     intentos/<usuario>.json           ingresos fallidos (bloqueo de 15 minutos)
 *
 * Seguridad:
 *   - La tienda de cada pedido sale SIEMPRE de la sesión firmada, nunca de lo que
 *     manda el navegador: un cliente no puede tocar la tienda de otro.
 *   - Las claves se guardan cifradas (PBKDF2), nunca tal cual.
 *   - Todo lo que llega se revisa (largo, tipo, cantidad) antes de guardarlo.
 */

export const LIMITS = {
  products: 150,          // productos por tienda
  imagesPerProduct: 6,
  sizesPerProduct: 30,
  largeBytes: 900 * 1024, // foto grande (ya achicada en el celular)
  smallBytes: 200 * 1024, // foto chica
};
const SESSION_DAYS = 30;
const MAX_FAILS = 8;
const LOCK_MINUTES = 15;
const PBKDF2_ITERATIONS = 100000;   // el máximo que permite Cloudflare
const STORE_ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
const PHOTO_PATH = /^fotos\/[a-f0-9-]{36}-(lg|sm)\.(webp|jpg)$/;
const PHOTO_FILE = /^[a-f0-9-]{36}-(lg|sm)\.(webp|jpg)$/;

// --- respuestas ---------------------------------------------------------------
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}
export const fail = (message, status = 400) => json({ error: message }, status);

// --- textos y números ---------------------------------------------------------
export function slugify(text) {
  return String(text ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}
function cleanText(value, max, field, { required = false } = {}) {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (required && !text) throw new Error(`Falta ${field}.`);
  if (text.length > max) throw new Error(`${field} es muy largo (máximo ${max} letras).`);
  return text;
}
function cleanPrice(value, field, { required = false } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new Error(`Falta ${field}.`);
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > 100_000_000) throw new Error(`${field} tiene que ser un número entero mayor a 0.`);
  return n;
}
export const isStoreId = (id) => STORE_ID.test(id ?? "");
export const isPhotoFile = (name) => PHOTO_FILE.test(name ?? "");

// --- catálogo de una tienda (en el depósito CATALOGO) ---------------------------
const catalogKey = (store) => `tiendas/${store}/productos.json`;

export async function readCatalog(env, store) {
  const object = await env.CATALOGO.get(catalogKey(store));
  if (!object) return { data: { version: 1, store, categories: {}, products: [] }, etag: null };
  return { data: await object.json(), etag: object.etag };
}

/**
 * Lee, cambia y guarda el catálogo. Si otra persona (o el mismo cliente desde otro
 * celular) guardó justo en el medio, vuelve a intentar con la versión nueva en vez
 * de pisarla.
 */
export async function updateCatalog(env, store, change) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, etag } = await readCatalog(env, store);
    const result = await change(data);
    data.generatedAt = new Date().toISOString();
    data.count = data.products.length;
    data.categories = keepCategories(data);
    const options = {
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-cache" },
    };
    if (etag) options.onlyIf = { etagMatches: etag };
    const saved = await env.CATALOGO.put(catalogKey(store), JSON.stringify(data), options);
    if (saved) return result;
  }
  throw new Error("No se pudo guardar: probá de nuevo en un momento.");
}

/**
 * Categorías de la tienda, en el orden que eligió el cliente (así salen en la tienda).
 * Las crea y ordena él en su panel; si algún producto usa una que falta, se agrega al final.
 */
function keepCategories(data) {
  const kept = storeCategories(data);
  for (const product of data.products) if (!Object.hasOwn(kept, product.category)) kept[product.category] = product.category;
  return kept;
}
export const MAX_CATEGORIES = 40;

/** Categorías de la tienda. Con stock de Brasil, las suyas van siempre (el cliente puede renombrarlas). */
export function storeCategories(data) {
  const categories = {};
  if (data.stockBR) for (const id of brCategoryIds(data)) if (!Object.hasOwn(data.categories ?? {}, id)) categories[id] = BR_CATEGORIES[id];
  return Object.assign(categories, data.categories ?? {});
}

/** Busca la categoría por su código o por su nombre (sin importar mayúsculas); si no existe, la crea. */
function categoryFor(data, value) {
  const label = cleanText(value, 30, "la categoría", { required: true });
  const categories = storeCategories(data);
  if (Object.hasOwn(categories, label)) return label;
  const match = Object.entries(categories).find(([, l]) => l.toLowerCase() === label.toLowerCase());
  if (match) return match[0];
  const id = slugify(label);
  if (!id) throw new Error("La categoría tiene que tener letras o números.");
  if (Object.keys(categories).length >= MAX_CATEGORIES) throw new Error(`Máximo ${MAX_CATEGORIES} categorías.`);
  data.categories = { ...categories, [Object.hasOwn(categories, id) ? `${id}-${Date.now() % 10000}` : id]: label };
  return Object.keys(data.categories).at(-1);
}

/** Lista nueva de categorías desde el panel: [{ id?, label }] en el orden elegido. */
export function cleanCategories(input, data) {
  if (!Array.isArray(input) || input.length > MAX_CATEGORIES) throw new Error(`Máximo ${MAX_CATEGORIES} categorías.`);
  const current = storeCategories(data);
  const result = {};
  const labels = new Set();
  for (const item of input) {
    const label = cleanText(item?.label, 30, "el nombre de la categoría", { required: true });
    if (labels.has(label.toLowerCase())) throw new Error(`La categoría "${label}" está repetida.`);
    labels.add(label.toLowerCase());
    let id = typeof item?.id === "string" && Object.hasOwn(current, item.id) ? item.id : slugify(label);
    if (!id) throw new Error("Cada categoría tiene que tener letras o números.");
    while (Object.hasOwn(result, id)) id = `${id}-2`;
    result[id] = label;
  }
  const inUse = data.products.find((p) => !Object.hasOwn(result, p.category));
  if (inUse) throw new Error(`No se puede borrar "${current[inUse.category] ?? inUse.category}": la usa "${inUse.name}". Cambiale la categoría primero.`);
  const brMissing = data.stockBR ? brCategoryIds(data).find((id) => !Object.hasOwn(result, id)) : null;
  if (brMissing) throw new Error(`"${current[brMissing] ?? BR_CATEGORIES[brMissing]}" es la categoría del stock de Brasil: se puede renombrar, pero no borrar.`);
  return result;
}

/** Revisa y ordena lo que mandó el panel para un producto. */
export function cleanProduct(input, current, data) {
  const name = cleanText(input.name, 80, "el nombre", { required: true });
  const brand = cleanText(input.brand, 40, "la marca");
  const price = cleanPrice(input.price, "el precio", { required: true });
  const wholesalePrice = cleanPrice(input.wholesalePrice, "el precio por mayor");
  if (wholesalePrice && wholesalePrice >= price) throw new Error("El precio por mayor tiene que ser menor que el precio por unidad.");

  if (!Array.isArray(input.sizes) || input.sizes.length === 0) throw new Error("Agregá al menos un talle.");
  if (input.sizes.length > LIMITS.sizesPerProduct) throw new Error(`Máximo ${LIMITS.sizesPerProduct} talles por producto.`);
  const seen = new Set();
  const sizes = input.sizes.map((s) => {
    const size = cleanText(s?.size, 12, "el talle", { required: true });
    const key = size.toLowerCase();
    if (seen.has(key)) throw new Error(`El talle ${size} está repetido.`);
    seen.add(key);
    const stock = Number(s?.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > 99999) throw new Error(`La cantidad del talle ${size} no es válida.`);
    return { size, stock };
  });

  const images = Array.isArray(input.images) ? input.images : [];
  if (images.length > LIMITS.imagesPerProduct) throw new Error(`Máximo ${LIMITS.imagesPerProduct} fotos por producto.`);
  const cleanImages = images.map((img) => {
    if (!PHOTO_PATH.test(img?.lg ?? "") || !PHOTO_PATH.test(img?.sm ?? "")) throw new Error("Hay una foto que no es válida.");
    const w = Math.round(Number(img.w)) || 900;
    const h = Math.round(Number(img.h)) || 1200;
    return { lg: img.lg, sm: img.sm, w: Math.min(Math.max(w, 1), 4000), h: Math.min(Math.max(h, 1), 4000) };
  });

  // Dirección del producto: única dentro de la tienda.
  let slug = current?.slug;
  if (!slug || slugify(current.name) !== slugify(name)) {
    const base = slugify(name) || "producto";
    const taken = new Set(data.products.filter((p) => p.id !== current?.id).map((p) => p.slug));
    slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  }
  const category = categoryFor(data, input.category);
  return {
    id: current?.id ?? `m-${crypto.randomUUID()}`,
    slug, name, brand: brand || null, category, price, wholesalePrice,
    sizes, images: cleanImages,
    // Pausado: no se ve en la tienda, pero no se borra (por ejemplo, mientras llega mercadería).
    hidden: input.hidden === true,
    // Cuándo se cargó (para el orden "lo más nuevo primero").
    createdAt: current?.createdAt ?? new Date().toISOString(),
  };
}

/** Lo que ve el público: sin productos pausados. "manual": precio y precio por mayor salen solo del producto. */
export function publicCatalog(data) {
  return { ...data, products: data.products.filter((p) => !p.hidden).map((p) => ({ ...p, manual: true })) };
}

// --- stock de Brasil en tiendas de clientes --------------------------------------
// Una tienda con "stockBR" muestra:
//   1) el stock del proveedor, que publica el piloto en la raíz del depósito (siempre al día),
//   2) con lo que el cliente cambió en su panel, modelo por modelo (data.br[id]): su precio,
//      ocultarlo, o pares que él tiene en su casa (se suman a los de Brasil),
//   3) y sus productos propios (data.products), en las categorías que él crea.
// data.stockBR = { casa: true|false, g5: true|false } lo pone herramientas/activar_stock_br.mjs
// (el cliente no lo puede cambiar).
export const BR_CATEGORIES = { zapatillas: "Zapatillas", ojotas: "Ojotas", g5: "Calidad G5" };
const brCategoryIds = (data) => ["zapatillas", "ojotas", ...(data.stockBR?.g5 ? ["g5"] : [])];
const BR_FILES_URL = "https://catalogo.mitiendastock.com/";
const MAX_EXTRA_SIZES = 30;

/** Stock del proveedor tal como lo publicó el piloto (con o sin G5). */
export async function readBrStock(env, options = {}) {
  const files = ["productos.json", ...(options.g5 ? ["productos-g5.json"] : [])];
  const lists = await Promise.all(files.map(async (key) => {
    const object = await env.CATALOGO.get(key);
    return object ? object.json() : { products: [] };
  }));
  const products = lists.flatMap((list) => list.products ?? [])
    .filter((p) => p && typeof p.id === "string" && typeof p.name === "string" && Array.isArray(p.sizes));
  return { generatedAt: lists[0].generatedAt ?? null, products };
}

/** Un modelo de Brasil sin los cambios del cliente. Las fotos van con su dirección completa. */
export function brModel(product, options = {}) {
  const sizes = product.sizes
    .filter((s) => s && String(s.size ?? "").trim() !== "")
    .map((s) => ({ size: String(s.size), stock: Math.max(0, (Number(s.stock) || 0) - (options.casa ? 0 : Number(s.casa) || 0)) }));
  const full = (path) => (!path ? null : /^https?:\/\//.test(path) ? path : BR_FILES_URL + path);
  return {
    id: product.id, slug: String(product.slug || product.id), name: product.name, brand: product.brand || null,
    category: product.category || "zapatillas", sizes,
    images: (Array.isArray(product.images) ? product.images : []).map((img) => ({ lg: full(img.lg), sm: full(img.sm), w: img.w, h: img.h })),
  };
}

/** Modelo de Brasil con lo que cambió el cliente. Cada talle dice cuánto es de Brasil (br) y cuánto suyo (casa). */
function withChanges(base, change = {}) {
  const extra = change.extra ?? {};
  const sizes = base.sizes.map((s) => ({ size: s.size, br: s.stock, casa: extra[s.size] ?? 0 }));
  // "soloCasa": un talle que Brasil no tiene (lo agregó el cliente).
  for (const [size, stock] of Object.entries(extra)) if (!sizes.some((s) => s.size === size)) sizes.push({ size, br: 0, casa: stock, soloCasa: true });
  sizes.sort((a, b) => a.size.localeCompare(b.size, "es", { numeric: true }));
  for (const s of sizes) s.stock = s.br + s.casa;
  return { ...base, sizes, price: change.price ?? null, wholesalePrice: change.wholesalePrice ?? null, hidden: change.hidden === true };
}

/**
 * Todos los modelos de Brasil de la tienda, con los cambios del cliente. Si Brasil agotó un
 * modelo del que el cliente tiene pares en su casa, sigue (con la foto y el nombre guardados).
 */
export function brProducts(data, br) {
  const changes = data.br ?? {};
  const seen = new Set();
  const list = br.products.map((p) => {
    seen.add(p.id);
    return withChanges(brModel(p, data.stockBR), changes[p.id]);
  });
  for (const [id, change] of Object.entries(changes)) {
    if (!seen.has(id) && change.model && change.extra) list.push(withChanges({ ...change.model, id, sizes: [] }, change));
  }
  return list;
}

/** Lo que ve el público en una tienda con stock de Brasil. */
export function publicMixedCatalog(data, br) {
  const fromBrazil = brProducts(data, br)
    .filter((p) => !p.hidden)
    .map(({ hidden, sizes, ...p }) => ({ ...p, sizes: sizes.map(({ size, stock }) => ({ size, stock })) }));
  const own = publicCatalog(data).products;
  const categories = storeCategories(data);
  const dates = [br.generatedAt, data.generatedAt].filter(Boolean).sort();
  return { version: 1, store: data.store, generatedAt: dates.at(-1) ?? null, categories, products: [...fromBrazil, ...own] };
}

/** Revisa lo que mandó el panel para un modelo de Brasil. Devuelve null si quedó todo automático. */
export function cleanBrChange(input, base) {
  const price = cleanPrice(input?.price, "el precio");
  const wholesalePrice = cleanPrice(input?.wholesalePrice, "el precio por mayor");
  if (price && wholesalePrice && wholesalePrice >= price) throw new Error("El precio por mayor tiene que ser menor que el precio por unidad.");
  const list = Array.isArray(input?.extra) ? input.extra : [];
  if (list.length > MAX_EXTRA_SIZES) throw new Error(`Máximo ${MAX_EXTRA_SIZES} talles.`);
  const extra = {};
  for (const item of list) {
    const size = cleanText(item?.size, 12, "el talle", { required: true });
    if (Object.hasOwn(extra, size)) throw new Error(`El talle ${size} está repetido.`);
    const stock = Number(item?.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > 9999) throw new Error(`La cantidad del talle ${size} no es válida.`);
    extra[size] = stock;
  }
  for (const size of Object.keys(extra)) if (extra[size] === 0) delete extra[size];
  const change = {};
  if (price) change.price = price;
  if (wholesalePrice) change.wholesalePrice = wholesalePrice;
  if (input?.hidden === true) change.hidden = true;
  if (Object.keys(extra).length) {
    change.extra = extra;
    // Por si Brasil lo agota: así el modelo sigue en la tienda con los pares del cliente.
    const { id, sizes, ...model } = base;
    change.model = model;
  }
  return Object.keys(change).length ? change : null;
}

/** Copia las fotos de un producto con nombres nuevos (así borrar uno no borra las del otro). */
export async function copyPhotos(env, store, images) {
  return Promise.all(images.map(async (img) => {
    const code = crypto.randomUUID();
    const ext = img.lg.endsWith(".jpg") ? "jpg" : "webp";
    const copy = { lg: `fotos/${code}-lg.${ext}`, sm: `fotos/${code}-sm.${ext}`, w: img.w, h: img.h };
    for (const size of ["lg", "sm"]) {
      const source = await env.CATALOGO.get(`tiendas/${store}/${img[size]}`);
      if (!source) throw new Error("No se encontró una de las fotos.");
      await env.CATALOGO.put(`tiendas/${store}/${copy[size]}`, source.body, { httpMetadata: source.httpMetadata });
    }
    return copy;
  }));
}

/** Borra del depósito las fotos que ya no usa ningún producto. */
export async function deletePhotos(env, store, images) {
  const keys = images.flatMap((img) => [img.lg, img.sm]).filter((p) => PHOTO_PATH.test(p)).map((p) => `tiendas/${store}/${p}`);
  if (keys.length) await env.CATALOGO.delete(keys);
}

// --- claves (PBKDF2) -----------------------------------------------------------
const encoder = new TextEncoder();
const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export async function hashPassword(password, saltBase64, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromBase64(saltBase64), iterations }, key, 256);
  return toBase64(bits);
}

/** Compara sin cortar antes (así no se puede adivinar por cuánto tarda). */
function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const DUMMY_SALT = "c2FsLWRlLXJlbGxlbm8tcGFyYS1lc3BlcmE=";

/** Revisa usuario y clave. Devuelve { usuario, tienda } o un error con el motivo. */
export async function checkLogin(env, usuarioRaw, password) {
  const usuario = String(usuarioRaw ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario) || typeof password !== "string" || password.length > 200) {
    return { error: "Usuario o clave incorrectos." };
  }
  const attemptsKey = `intentos/${usuario}.json`;
  const attemptsObject = await env.PRIVADO.get(attemptsKey);
  const attempts = attemptsObject ? await attemptsObject.json() : { fails: 0, until: 0 };
  if (attempts.until > Date.now()) {
    return { error: `Demasiados intentos. Probá de nuevo en ${LOCK_MINUTES} minutos.`, status: 429 };
  }

  const userObject = await env.PRIVADO.get(`usuarios/${usuario}.json`);
  const user = userObject ? await userObject.json() : null;
  // Si el usuario no existe igual se calcula una clave, para tardar lo mismo.
  const hash = await hashPassword(password, user?.salt ?? DUMMY_SALT, user?.iterations ?? PBKDF2_ITERATIONS);
  if (!user || !sameText(hash, user.hash) || !isStoreId(user.tienda)) {
    attempts.fails += 1;
    if (attempts.fails >= MAX_FAILS) Object.assign(attempts, { fails: 0, until: Date.now() + LOCK_MINUTES * 60_000 });
    await env.PRIVADO.put(attemptsKey, JSON.stringify(attempts));
    return { error: "Usuario o clave incorrectos." };
  }
  if (attemptsObject) await env.PRIVADO.delete(attemptsKey);
  return { usuario, tienda: user.tienda };
}

// --- sesión firmada (cookie) ---------------------------------------------------
const toUrl64 = (text) => btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromUrl64 = (text) => atob(text.replace(/-/g, "+").replace(/_/g, "/"));

async function signingKey(env) {
  const secret = env.PANEL_SECRET;
  if (typeof secret !== "string" || secret.length < 32) throw new Error("Falta configurar PANEL_SECRET (32 letras o más).");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSession(env, { usuario, tienda }) {
  const payload = toUrl64(JSON.stringify({ u: usuario, t: tienda, exp: Date.now() + SESSION_DAYS * 86_400_000 }));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(env), encoder.encode(payload));
  const token = `${payload}.${toUrl64(String.fromCharCode(...new Uint8Array(signature)))}`;
  return `panel=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api/panel; Max-Age=${SESSION_DAYS * 86400}`;
}
export const clearSession = () => "panel=; HttpOnly; Secure; SameSite=Strict; Path=/api/panel; Max-Age=0";

export async function readSession(env, request) {
  const cookie = request.headers.get("Cookie") ?? "";
  const token = cookie.split(/;\s*/).find((part) => part.startsWith("panel="))?.slice(6);
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  try {
    const bytes = Uint8Array.from(fromUrl64(signature), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", await signingKey(env), bytes, encoder.encode(payload));
    if (!valid) return null;
    const session = JSON.parse(fromUrl64(payload));
    if (!session.exp || session.exp < Date.now() || !isStoreId(session.t)) return null;
    return { usuario: session.u, tienda: session.t };
  } catch {
    return null;
  }
}

// --- fotos ---------------------------------------------------------------------
/** Tipo real del archivo según sus primeros bytes (no se confía en el nombre). */
export function imageType(bytes) {
  const b = new Uint8Array(bytes.slice(0, 12));
  const ascii = (from, to) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  return null;
}

// --- ajustes de la tienda (los cambia el cliente: nombre, logo, WhatsApp, redes...) ---
const settingsKey = (store) => `tiendas/${store}/ajustes.json`;
const LOGO_PATH = /^marca\/[a-f0-9-]{36}-(512|160)\.(webp|jpg)$/;
const COLORS = new Set(["#18181b", "#1d4ed8", "#047857", "#b91c1c", "#7c3aed", "#db2777", "#c2410c", "#0f766e"]);
export const isLogoFile = (name) => /^[a-f0-9-]{36}-(512|160)\.(webp|jpg)$/.test(name ?? "");

export async function readSettings(env, store) {
  const object = await env.CATALOGO.get(settingsKey(store));
  return object ? object.json() : {};
}
export async function saveSettings(env, store, settings) {
  await env.CATALOGO.put(settingsKey(store), JSON.stringify(settings), {
    httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-cache" },
  });
}

/** Revisa los ajustes que mandó el panel. Las redes se arman desde el usuario (@nombre). */
export function cleanSettings(input, current = {}) {
  const phone = String(input?.whatsapp ?? "").replace(/\D/g, "");
  if (phone && (phone.length < 10 || phone.length > 15)) throw new Error("El WhatsApp tiene que tener código de país y área. Ej: 5491123456789");
  const handle = (value, field) => {
    const text = String(value ?? "").trim().replace(/^@/, "").replace(/^https?:\/\/[^/]+\//, "").replace(/\/$/, "");
    if (text && !/^[A-Za-z0-9._]{1,30}$/.test(text)) throw new Error(`El usuario de ${field} no es válido.`);
    return text;
  };
  const min = Number(input?.wholesaleMin);
  const color = String(input?.color ?? "");
  const logo = input?.logo ?? current.logo ?? null;
  if (logo && (!LOGO_PATH.test(logo.large ?? "") || !LOGO_PATH.test(logo.small ?? ""))) throw new Error("El logo no es válido.");
  return {
    name: cleanText(input?.name, 50, "el nombre de la tienda", { required: true }),
    tagline: cleanText(input?.tagline, 70, "la frase"),
    heroTitle: cleanText(input?.heroTitle, 40, "el título"),
    heroHighlight: cleanText(input?.heroHighlight, 40, "la parte destacada del título"),
    heroText: cleanText(input?.heroText, 220, "el texto de la portada"),
    whatsapp: phone,
    instagram: handle(input?.instagram, "Instagram"),
    tiktok: handle(input?.tiktok, "TikTok"),
    facebook: handle(input?.facebook, "Facebook"),
    color: COLORS.has(color) ? color : "#18181b",
    wholesale: input?.wholesale === true,
    wholesaleMin: Number.isInteger(min) && min >= 2 && min <= 100 ? min : 5,
    // Orden de la tienda: categorías (alfabético o el que eligió) y productos dentro de cada una.
    categoryOrder: input?.categoryOrder === "manual" ? "manual" : "alfabetico",
    productOrder: ["alfabetico", "nuevos", "precio", "manual"].includes(input?.productOrder) ? input.productOrder : "alfabetico",
    logo,
  };
}

/** Cambia la clave del usuario que ingresó (pide la actual). */
export async function changePassword(env, usuario, current, next) {
  if (typeof next !== "string" || next.length < 8 || next.length > 100) throw new Error("La clave nueva tiene que tener entre 8 y 100 letras o números.");
  const object = await env.PRIVADO.get(`usuarios/${usuario}.json`);
  const user = object ? await object.json() : null;
  if (!user) throw new Error("Usuario inexistente.");
  const hash = await hashPassword(String(current ?? ""), user.salt, user.iterations ?? PBKDF2_ITERATIONS);
  if (!sameText(hash, user.hash)) throw new Error("La clave actual no es correcta.");
  const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
  const updated = { ...user, salt, iterations: PBKDF2_ITERATIONS, hash: await hashPassword(next, salt), cambiada: new Date().toISOString() };
  await env.PRIVADO.put(`usuarios/${usuario}.json`, JSON.stringify(updated));
}
