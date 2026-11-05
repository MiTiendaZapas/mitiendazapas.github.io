/*
 * Mensajes de WhatsApp: pedido completo y consultas.
 * Texto plano, sin emojis que puedan verse mal.
 */
import { money, plural, whatsappLink } from "./utils.js";
import { isSingleSize } from "./vocabulario.js";
import { sizeLabel } from "./interfaz/g5.js";
import { modo } from "./modo-catalogo.js";

/**
 * Mensaje del pedido (formato pedido por el usuario el 27/09):
 *
 *   ¡Hola! Quiero hacer el siguiente pedido del catálogo de revendedores:
 *
 *   Mind beige (39/40) $35.000 x2 = $70.000
 *   Mind negras (39/40) $35.000
 *
 *   Total: 3 pares - $105.000
 *
 *   Compra por UNIDAD: cambio de talle con recargo de $5.000
 *   El envío se coordina aparte.
 *
 * "del catálogo de revendedores" sale de channel.orderSource (solo revendedores).
 * No lleva datos del cliente: nombre, dirección y envío se hablan en el chat.
 */
export function buildOrderMessage({ config, channel, quote }) {
  const lines = [];
  const source = channel.orderSource ? ` ${channel.orderSource}` : "";

  // Tiendas con panel: el saludo lo puede escribir el cliente (Mi tienda → Mensaje de los pedidos).
  lines.push(config.orderGreeting || (modo.on ? "¡Hola! Quiero consultar por estos productos del catálogo:" : `¡Hola! Quiero hacer el siguiente pedido del catálogo${source}:`));
  lines.push("");
  const itemLine = (line) => {
    // Catálogo sin precios: solo el producto, el talle y la cantidad.
    // Producto sin talles ("Único"): no se escribe el talle.
    const sizeNote = isSingleSize(line.product) ? "" : ` (${sizeLabel(line.product, line.size)})`;
    if (!modo.prices) return `${line.product.name}${sizeNote}${line.qty > 1 ? ` x${line.qty}` : ""}`;
    const many = line.qty > 1 ? ` x${line.qty} = ${money(line.subtotal)}` : "";
    return `${line.product.name}${sizeNote} ${money(line.price)}${many}`;
  };
  const count = quote.lines.reduce((sum, line) => sum + line.qty, 0);
  const onlyFootwear = !quote.allProducts && quote.lines.every((line) => isFootwear(line.product));
  const items = (n) => (onlyFootwear ? plural(n, "par", "pares") : plural(n, "producto"));
  if (quote.byQuality) {
    // Con G5 en el pedido, cada calidad va en su bloque con su subtotal (son proveedores distintos).
    for (const group of quote.groups) {
      const label = group.key === "g5" ? "G5" : "BR";
      const wholesale = quote.isWholesale && group.canChoose ? " por mayor" : "";
      lines.push(`CALIDAD ${label}`);
      group.lines.forEach((line) => lines.push(itemLine(line)));
      lines.push(`Subtotal ${label}: ${items(group.lines.reduce((s, l) => s + l.qty, 0))}${modo.prices ? `${wholesale} - ${money(group.subtotal)}` : ""}`);
      lines.push("");
    }
  } else if (byCategory(config, quote)) {
    // Tiendas con panel y productos de varias categorías: cada una con su título (así el
    // vendedor arma el pedido más fácil). Van en el orden de las categorías de la tienda.
    const order = Object.keys(config.categories ?? {});
    const groups = [...new Set(quote.lines.map((line) => line.product.category))]
      .sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));
    for (const category of groups) {
      lines.push(String(config.categories?.[category] ?? category).toUpperCase());
      quote.lines.filter((line) => line.product.category === category).forEach((line) => lines.push(itemLine(line)));
      lines.push("");
    }
  } else {
    quote.lines.forEach((line) => lines.push(itemLine(line)));
    lines.push("");
  }
  lines.push(modo.prices ? `Total: ${items(count)} - ${money(quote.total)}` : `Total: ${items(count)}`);
  lines.push("");
  // Condición de cambio según cómo compra: por mayor (5 o más, si eligió) o por unidad.
  // Si el texto de esa forma de compra está vacío, no se agrega la línea.
  // Con BR y G5, si solo una calidad llega al precio por mayor, se aclara cuál.
  const partial = quote.byQuality && quote.canChoose && quote.groups.some((g) => !g.canChoose);
  const onlyIn = partial ? ` (solo calidad ${quote.groups.filter((g) => g.canChoose).map((g) => g.key.toUpperCase()).join(" y ")})` : "";
  if (modo.on) {
    // Catálogo: no hay forma de compra ni envío que aclarar, se habla en el chat.
  } else if (channel.purchaseModes) {
    const modeLine = channel.purchaseModes[quote.canChoose ? quote.mode : "unidad"].message;
    if (modeLine) lines.push(modeLine + (quote.isWholesale ? onlyIn : ""));
  } else if (quote.canChoose) {
    lines.push(`Compra por MAYOR (${quote.minPairs} ${quote.words?.[1] ?? "pares"} o más)${onlyIn}`);
  }
  // Las tiendas de clientes no llevan esta línea (orderShippingNote: false en su configuración).
  if (config.orderShippingNote !== false && !modo.on) lines.push("El envío se coordina aparte.");
  // Texto al final que eligió el cliente (pago, envío, retiro...).
  if (config.orderFooter) lines.push("", config.orderFooter);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

/** Agrupar por categoría: solo tiendas con panel, y si el pedido tiene más de una categoría. */
function byCategory(config, quote) {
  return Boolean(config.manualStore) && new Set(quote.lines.map((line) => line.product.category)).size > 1;
}

/**
 * Calzado (se cuenta en "pares"). Todo lo demás, incluidas las categorías que crea el
 * cliente en su panel (remeras, buzos, accesorios...), se cuenta en "productos".
 */
const FOOTWEAR = new Set(["zapatillas", "ojotas", "ninos", "g5"]);
export const isFootwear = (product) => FOOTWEAR.has(product?.category);

export function orderLink(config, message) {
  return whatsappLink(config.contact.whatsappOrders, message);
}

export function productQueryLink(config, product, size) {
  const sizeText = size && !isSingleSize(product) ? ` en talle ${size}` : "";
  return whatsappLink(config.contact.whatsappQueries,
    `¡Hola! Quería consultar por ${product.name}${sizeText}.`);
}
