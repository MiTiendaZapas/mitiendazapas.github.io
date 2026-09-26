/* Utilidades compartidas: texto, dinero y DOM. */

const moneyFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

export function money(value) {
  return `$${moneyFormat.format(Math.round(value))}`;
}

/** Clave de comparación de nombres: sin tildes, minúsculas, espacios prolijos. */
export function normalize(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapa texto que viene de datos externos antes de insertarlo en HTML. */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* modo privado o almacenamiento lleno: la tienda sigue funcionando sin guardar */
  }
}

/** Número de WhatsApp limpio (solo dígitos) para armar links wa.me. */
export function whatsappLink(number, message = "") {
  const digits = String(number).replace(/\D/g, "");
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

/**
 * Ruta a un archivo de la raíz de la tienda. Las páginas dentro de "paginas/"
 * definen window.STORE_ROOT = "../" para que logo, fuentes y catálogo se
 * encuentren igual. Las direcciones completas (https://...) no se tocan.
 */
export function fromRoot(path) {
  if (!path || /^(https?:|data:|#|\/)/.test(path)) return path;
  return (window.STORE_ROOT ?? "") + path;
}
