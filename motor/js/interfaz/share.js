/*
 * Botón "Compartir" de cada modelo. Cada versión de la tienda elige qué se comparte
 * (configuracion.js -> channels.<versión>.share):
 *   "fotos": las fotos del modelo con su nombre y talles, SIN precio ni link.
 *            Pensado para revendedores: se lo mandan a su cliente como propio.
 *   "link":  el link directo al modelo en la tienda (para la tienda al público).
 *
 * En el celular se abre el menú de compartir del teléfono (WhatsApp, Instagram...).
 * En computadora, donde ese menú casi nunca acepta fotos, se descargan las fotos
 * y se copia el texto; el link se copia.
 */
import { escapeHtml } from "../utils.js";

const JPEG_QUALITY = 0.9;

export function shareMode(channel) {
  return channel.share === "fotos" ? "fotos" : "link";
}

export function shareButtonHtml(channel, iconHtml) {
  const label = shareMode(channel) === "fotos" ? "Compartir fotos" : "Compartir";
  return `<button class="btn btn--outline share-btn" type="button" data-share>${iconHtml} <span data-share-label>${escapeHtml(label)}</span></button>`;
}

/** Texto que acompaña las fotos: nombre y talles disponibles, sin precio. */
export function shareText(product) {
  const sizes = product.sizes.filter((s) => s.stock > 0).map((s) => s.size);
  return sizes.length ? `${product.name}\nTalles disponibles: ${sizes.join(", ")}` : product.name;
}

/**
 * Comparte el modelo. Devuelve qué pasó, para mostrarlo en el botón:
 *   "shared" | "cancelled" | "copied" | "downloaded" | "retry" | "error"
 * "retry": el teléfono pidió que se vuelva a tocar el botón (las fotos ya están listas).
 */
export function createSharer({ config, channel }) {
  let pending = null;   // fotos listas para compartir, si el primer intento no pudo abrir el menú

  async function share(product) {
    try {
      if (pending?.productId === product.id) {
        const data = pending.data;
        pending = null;
        return await openShareSheet(data);
      }
      return shareMode(channel) === "fotos" ? await sharePhotos(product) : await shareLink(product);
    } catch (error) {
      console.error(error);
      return "error";
    }
  }

  async function sharePhotos(product) {
    const text = shareText(product);
    const files = await Promise.all(product.images.map((img, i) => toJpegFile(img.lg, `${product.slug}-${i + 1}.jpg`)));
    const data = { files, text };
    if (navigator.canShare?.(data)) {
      const result = await openShareSheet(data);
      if (result === "retry") pending = { productId: product.id, data };
      return result;
    }
    // Sin menú de compartir con fotos (computadora): se descargan y se copia el texto.
    for (const file of files) download(file);
    await copy(text);
    return "downloaded";
  }

  async function shareLink(product) {
    const url = new URL(`#p/${encodeURIComponent(product.slug)}`, location.href.split("#")[0]).href;
    const data = { title: product.name, text: `Mirá ${product.name} en ${config.name}`, url };
    if (navigator.share && navigator.canShare?.(data) !== false) return openShareSheet(data);
    await copy(url);
    return "copied";
  }

  return { share };
}

async function openShareSheet(data) {
  try {
    await navigator.share(data);
    return "shared";
  } catch (error) {
    if (error.name === "AbortError") return "cancelled";
    // Si tardó en preparar las fotos, el teléfono pide un toque nuevo del usuario.
    if (error.name === "NotAllowedError") return "retry";
    throw error;
  }
}

/** Las fotos de la tienda son .webp; WhatsApp las manda mejor como .jpg (y no como sticker). */
async function toJpegFile(src, name) {
  const blob = await fetch(src).then((r) => {
    if (!r.ok) throw new Error(`No se pudo bajar la foto ${src}`);
    return r.blob();
  });
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  return new File([jpeg], name, { type: "image/jpeg" });
}

function download(file) {
  const url = URL.createObjectURL(file);
  const link = Object.assign(document.createElement("a"), { href: url, download: file.name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* sin permiso para copiar: las fotos igual se descargaron */
  }
}
