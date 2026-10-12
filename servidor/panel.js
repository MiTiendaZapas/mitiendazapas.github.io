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
    data.categories = usedCategories(data);
    const options = {
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-cache" },
    };
    if (etag) options.onlyIf = { etagMatches: etag };
    const saved = await env.CATALOGO.put(catalogKey(store), JSON.stringify(data), options);
    if (saved) return result;
  }
  throw new Error("No se pudo guardar: probá de nuevo en un momento.");
}

/** Solo quedan las categorías que usa algún producto. */
function usedCategories(data) {
  const used = {};
  for (const product of data.products) used[product.category] = data.categories?.[product.category] ?? product.category;
  return used;
}

/** Revisa y ordena lo que mandó el panel para un producto. */
export function cleanProduct(input, current, data) {
  const name = cleanText(input.name, 80, "el nombre", { required: true });
  const brand = cleanText(input.brand, 40, "la marca");
  const categoryLabel = cleanText(input.category, 30, "la categoría", { required: true });
  const category = slugify(categoryLabel);
  if (!category) throw new Error("La categoría tiene que tener letras o números.");
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
  data.categories = { ...(data.categories ?? {}), [category]: categoryLabel };
  return {
    id: current?.id ?? `m-${crypto.randomUUID()}`,
    slug, name, brand: brand || null, category, price, wholesalePrice,
    sizes, images: cleanImages,
  };
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
