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

/**
 * "¿Querés una tienda así?": lleva a la página principal, que explica las tiendas y tiene el
 * contacto (antes iba directo al WhatsApp y escribían creyendo que era el dueño de la tienda).
 */
export const PLATFORM_URL = "https://mitiendastock.com/?desde=tienda";

/**
 * Número de WhatsApp completo, solo dígitos, como lo pide wa.me. Un número argentino escrito sin el
 * código de país (por ejemplo "1151237124", o "011 5123-7124", o "54 11…" sin el 9) se completa con
 * el 549: sin eso, WhatsApp lo toma como un número de otro país y el pedido no le llega a nadie
 * (le pasó a una tienda el 22/10).
 */
export function fullPhone(number) {
  let digits = String(number ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith("1115")) digits = `11${digits.slice(4)}`;   // 11 15 1234-5678
  if (digits.length === 10) digits = `549${digits}`;
  if (digits.length === 12 && digits.startsWith("54") && !digits.startsWith("549")) digits = `549${digits.slice(2)}`;
  return digits;
}

/** Número de WhatsApp limpio (solo dígitos) para armar links wa.me. */
export function whatsappLink(number, message = "") {
  return `https://wa.me/${fullPhone(number)}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
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
