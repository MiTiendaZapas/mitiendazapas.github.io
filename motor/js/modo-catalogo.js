/*
 * Modo catálogo (Mi tienda → Tipo de tienda): en vez de "pedido" con precios y total, el cliente arma
 * una lista y consulta por WhatsApp. Se puede ocultar los precios y/o el nombre y el logo de la tienda
 * (por ejemplo, un catálogo para pasar a un grupo de revendedores).
 * Lo prende main.js al abrir la tienda; el resto de las piezas solo preguntan "modo".
 */
export const modo = { on: false, prices: true, brand: true };

/** Lee los ajustes de la tienda. Sin modo catálogo todo queda como siempre. */
export function startCatalogMode(settings) {
  modo.on = settings?.mode === "catalogo";
  modo.prices = !modo.on || settings.showPrices !== false;
  modo.brand = !modo.on || settings.showBrand !== false;
  const root = document.documentElement;
  root.toggleAttribute("data-catalogo", modo.on);
  root.toggleAttribute("data-sin-precios", !modo.prices);
  return modo;
}

/** Elige el texto según el modo: say("Tu pedido", "Tu consulta"). */
export const say = (tienda, catalogo) => (modo.on ? catalogo : tienda);

/** true si hay que mostrar precios en la página. */
export const showPrices = () => modo.prices;
