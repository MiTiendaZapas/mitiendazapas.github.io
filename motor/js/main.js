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
import { createProductView } from "./interfaz/product-view.js";
import { createToaster } from "./interfaz/toast.js";

const OPEN_CART_HASH = "#pedido";

const config = window.STORE_CONFIG;
const { key: channelKey, channel, isDefault } = resolveChannel(config);
const links = createLinks(config, { key: channelKey, channel, isDefault });
const storagePrefix = `${config.id}:${channelKey}`;
const overlays = document.getElementById("overlays");

renderHeader(document.getElementById("site-header"), { config, channel, links });
renderFooter(document.getElementById("site-footer"), { config, links });

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

/** Página de la tienda: catálogo, filtros, vista de producto y pedido. */
async function startStore() {
  renderHero(document.getElementById("hero"), { config, channel, links });
  const toaster = createToaster(document.getElementById("toast-region"));
  let cartView = null;

  const catalogView = createCatalogView(document.getElementById("catalogo"), {
    headStyle: config.catalogHeader,
    onAdded({ product, size, qty }) {
      toaster.show({
        title: qty > 1 ? `${qty} pares agregados a tu pedido` : "Agregado a tu pedido",
        text: `${product.name} · Talle ${size}`,
        thumb: product.images[0]?.sm,
        action: { label: "Ver pedido", onClick: () => cartView.open() },
      });
      track("add_to_cart", { id: product.id, size, qty });
    },
  });
  catalogView.showLoading();

  try {
    const [catalog, priceTable] = await Promise.all([
      loadCatalog(fromRoot(config.catalogBase), {
        order: config.catalogOrder,
        includeHouseStock: config.includeHouseStock !== false,
      }),
      loadJson(fromRoot(channel.prices)),
    ]);
    const pricing = createPricing(priceTable);
    const cart = createCart({ storageKey: `${storagePrefix}:cart`, catalog });
    const restored = cart.restore();

    catalogView.connect({ pricing, cart });
    catalogView.render(catalog.products);
    createFiltersView({ config, filters: createFilters(catalog.products), catalogView, overlays });
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
      productView.openFromUrl();
    }

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
      whatsappHref: whatsappLink(config.contact.whatsappQueries, `Hola! No me carga el catálogo, ¿me pasás los modelos disponibles?`),
    });
  }
}
