/*
 * Navegación entre la tienda y las páginas de información.
 *
 * Las páginas de información son las mismas para las dos versiones de la
 * tienda. Para saber desde cuál vino el cliente (y mostrar, por ejemplo, la
 * política de cambios que corresponde) se usa, en este orden:
 *   1. <body data-channel="..."> en las páginas de la tienda,
 *   2. el parámetro ?tienda=minorista del link,
 *   3. la última versión que visitó,
 *   4. la primera versión definida en la configuración.
 */
import { fromRoot, readStorage, writeStorage } from "./utils.js";

export function resolveChannel(config) {
  const keys = Object.keys(config.channels);
  const lastKey = `${config.id}:ultima-tienda`;
  const fromPage = document.body.dataset.channel;
  const fromUrl = new URL(location.href).searchParams.get("tienda");
  const remembered = readStorage(lastKey, null);
  const key = [fromPage, fromUrl, remembered].find((k) => k && keys.includes(k)) ?? keys[0];
  if (fromPage) writeStorage(lastKey, key);
  return { key, channel: config.channels[key], isDefault: key === keys[0] };
}

export function createLinks(config, channelInfo) {
  const suffix = channelInfo.isDefault ? "" : `?tienda=${encodeURIComponent(channelInfo.key)}`;
  const currentPage = document.body.dataset.page ?? null;
  return {
    currentPage,
    isStorePage: Boolean(document.body.dataset.channel),
    /** Página de la tienda (catálogo) de la versión actual, con un ancla opcional. */
    store: (hash = "") => fromRoot(channelInfo.channel.page) + hash,
    /** Página de información, manteniendo la versión de la tienda. */
    page: (page) => fromRoot(page.file) + suffix,
    pages: config.pages ?? [],
  };
}
