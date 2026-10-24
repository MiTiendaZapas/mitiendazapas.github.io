/*
 * Arranque de la tienda.
 *   Páginas de la tienda (index.html, minorista.html): configuración + catálogo
 *     compartido + precios de la versión -> header, catálogo, pedido y footer.
 *   Páginas de información (paginas/*.html): header, contenido y footer; el
 *     botón "Tu pedido" lleva a la tienda con el pedido abierto.
 */
import { createCart } from "./cart.js";
import { loadCatalog, loadJson } from "./catalog.js";
import { createFilters } from "./filters.js";
import { createLinks, resolveChannel } from "./navigation.js";
import { createPricing } from "./pricing.js";
import { track } from "./analytics.js";
import { fromRoot, readStorage, whatsappLink } from "./utils.js";
import { createCartView } from "./interfaz/cart-view.js";
import { createCatalogView } from "./interfaz/catalog-view.js";
import { createFiltersView } from "./interfaz/filters-view.js";
import { renderHeader, renderHero } from "./interfaz/layout.js";
import { renderFooter, renderInfoPage } from "./interfaz/pages.js";
import { keepStockFresh } from "./stock-vivo.js";
import { orderedCategories, sortProducts } from "../vidriera/orden.js";
import { applyChannelPrices, applyStoreSettings, applyWholesaleSettings, loadStoreSettings } from "./ajustes-tienda.js";
import { createProductView } from "./interfaz/product-view.js";
import { createToaster } from "./interfaz/toast.js";
import { renderLastPairs } from "./interfaz/ultimos-pares.js";
import { isSingleSize, setCatalogWords, storeWords } from "./vocabulario.js";

const OPEN_CART_HASH = "#pedido";

// En Cloudflare (mitiendastock.com) el stock y las fotos están en su depósito R2;
// en GitHub siguen al lado de la tienda (/catalogo/).
const R2_CATALOG = "https://catalogo.mitiendastock.com/";
function catalogBase(config) {
  // Tienda con stock propio del cliente (lo carga desde su panel): el catálogo lo da
  // el programa del panel (functions/api/tienda/), siempre al día.
  if (config.manualStore) return `/api/tienda/${encodeURIComponent(config.manualStore)}/`;
  const host = location.hostname;
  const onCloudflare = host === "mitiendastock.com" || host.endsWith(".mitiendastock.com") || host.endsWith("mitiendastock.pages.dev");
  return onCloudflare ? R2_CATALOG : fromRoot(config.catalogBase);
}

const config = window.STORE_CONFIG;
const { key: channelKey, channel, isDefault } = resolveChannel(config);
const links = createLinks(config, { key: channelKey, channel, isDefault });
const storagePrefix = `${config.id}:${channelKey}`;
const overlays = document.getElementById("overlays");

// Tienda con stock propio: nombre, logo, WhatsApp, redes y color los elige el cliente en su panel.
const storeSettings = config.manualStore ? await loadStoreSettings(config) : null;
if (storeSettings) applyStoreSettings(config, channel, storeSettings);
// Aviso que escribe el cliente en su panel (por ejemplo "Envío gratis este fin de semana").
if (storeSettings?.notice) {
  const notice = document.createElement("p");
  notice.className = "store-notice";
  notice.textContent = storeSettings.notice;
  document.getElementById("site-header").before(notice);
}

renderHeader(document.getElementById("site-header"), { config, channel, links });
renderFooter(document.getElementById("site-footer"), { config, channel, links });

if (links.isStorePage) {
  await startStore();
} else {
  startInfoPage();
}

/** Página de información: contenido + contador del pedido guardado. */
function startInfoPage() {
  renderInfoPage(document.getElementById("main"), { config, channel, channelKey, links });
  const saved = readStorage(`${storagePrefix}:cart`, []);
  const count = Array.isArray(saved) ? saved.reduce((sum, line) => sum + (Number(line?.qty) || 0), 0) : 0;
  const button = document.querySelector("[data-open-cart]");
  document.querySelector("[data-cart-count]").textContent = String(count);
  button.classList.toggle("has-items", count > 0);
  button.addEventListener("click", () => { location.href = links.store(OPEN_CART_HASH); });
}

/** Trae el stock (al abrir la tienda y, después, para mantenerlo al día). */
function loadStock() {
  return loadCatalog(catalogBase(config), {
    order: config.catalogOrder,
    includeHouseStock: config.includeHouseStock !== false,
    // Tiendas con panel: las G5 llegan solo si el cliente les puso precio (las filtra el servidor).
    showG5: config.showG5 === true || Boolean(config.manualStore),
  });
}

/** Página de la tienda: catálogo, filtros, vista de producto y pedido. */
async function startStore() {
  renderHero(document.getElementById("hero"), { config, channel, links });
  const toaster = createToaster(document.getElementById("toast-region"));
  let cartView = null;

  const catalogView = createCatalogView(document.getElementById("catalogo"), {
    headStyle: config.catalogHeader,
    onAdded({ product, size, qty }) {
      toaster.show({
        title: qty > 1 ? `${qty} ${storeWords().footwear ? "pares" : "productos"} agregados a tu pedido` : "Agregado a tu pedido",
        text: isSingleSize(product) ? product.name : `${product.name} · Talle ${size}`,
        thumb: product.images[0]?.sm,
        action: { label: "Ver pedido", onClick: () => cartView.open() },
      });
      track("add_to_cart", { id: product.id, size, qty });
    },
  });
  catalogView.showLoading();

  try {
    const [catalog, priceTable] = await Promise.all([
      loadStock(),
      loadJson(fromRoot(channel.prices)),
    ]);
    // Tiendas con dos versiones (público y revendedores): cada una con sus precios.
    const twoVersions = Object.keys(config.channels ?? {}).length > 1;
    if (config.manualStore) applyChannelPrices(catalog.products, channelKey);
    // "pares" o "unidades", según lo que vende la tienda (ver vocabulario.js).
    setCatalogWords(catalog.products);
    const pricing = createPricing(applyWholesaleSettings(priceTable, storeSettings, { twoVersions, channel: channelKey }));
    // Tienda con panel: las categorías (sus nombres y su orden) y el orden de los productos
    // dentro de cada una los elige el cliente (Categorías → Orden de tu tienda).
    if (catalog.categories) {
      const settings = { productOrder: "marca", ...(storeSettings ?? {}) };
      const order = orderedCategories(catalog.categories, settings);
      const rest = Object.entries(config.categories ?? {}).filter(([id]) => !Object.hasOwn(catalog.categories, id));
      config.categories = { ...Object.fromEntries(order.map((id) => [id, catalog.categories[id]])), ...Object.fromEntries(rest) };
      const sorted = sortProducts(catalog.products, catalog.categories, settings, (p) => pricing.forProduct(p).unit || 0);
      catalog.products.splice(0, catalog.products.length, ...sorted);
    }
    const cart = createCart({ storageKey: `${storagePrefix}:cart`, catalog });
    const restored = cart.restore();

    catalogView.connect({ pricing, cart });
    // Tiendas con panel: cada categoría con su título arriba de sus productos.
    catalogView.render(catalog.products, { sections: catalog.categories ? config.categories : null });
    createFiltersView({ config, filters: createFilters(catalog.products), catalogView, overlays });
    renderLastPairs(document.querySelector("[data-last-pairs]"), { products: catalog.products, pricing });
    cartView = createCartView({
      config, channel, cart, pricing, overlays, storagePrefix,
      onOpenProduct: (product) => { location.hash = `#p/${encodeURIComponent(product.slug)}`; },
    });

    const productView = createProductView({
      config,
      channel,
      catalog,
      pricing,
      cart,
      overlays,
      onOpenCart: () => cartView.open(),
      onAdded: ({ product, size, qty }) => track("add_to_cart", { id: product.id, size, qty, source: "detalle" }),
      onMissing: () => toaster.show({
        variant: "warning",
        title: "Ese modelo ya no está disponible",
        text: "Puede que se haya agotado. Mirá el resto del catálogo.",
        duration: 5000,
      }),
    });

    // Viene de una página de información tocando "Tu pedido".
    if (location.hash === OPEN_CART_HASH) {
      history.replaceState(null, "", location.pathname + location.search);
      cartView.open();
    } else {
      // Un problema al abrir el modelo del link nunca tiene que tapar el catálogo.
      try {
        productView.openFromUrl();
      } catch (error) {
        console.error(error);
      }
    }

    // Con la página abierta, el stock se sigue actualizando solo.
    keepStockFresh({
      catalog, load: loadStock, cart, toaster,
      onUpdate: () => { catalogView.refreshStock(); productView.refreshStock(); },
      onOpenCart: () => cartView.open(),
    });

    if (restored.removed || restored.adjusted) {
      toaster.show({
        variant: "warning",
        title: "Actualizamos tu pedido",
        text: "Algunos talles se agotaron o bajó su stock desde tu última visita.",
        action: { label: "Revisar", onClick: () => cartView.open() },
        duration: 7000,
      });
    }
  } catch (error) {
    console.error(error);
    catalogView.showError({
      whatsappHref: whatsappLink(config.contact.whatsappQueries, `¡Hola! No me carga el catálogo, ¿me pasás los modelos disponibles?`),
    });
  }
}
