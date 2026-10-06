/*
 * Mensajes de WhatsApp: pedido completo y consultas.
 * Texto plano, sin emojis que puedan verse mal.
 */
import { money, plural, whatsappLink } from "./utils.js";

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

  lines.push(`¡Hola! Quiero hacer el siguiente pedido del catálogo${source}:`);
  lines.push("");
  const itemLine = (line) => {
    const many = line.qty > 1 ? ` x${line.qty} = ${money(line.subtotal)}` : "";
    return `${line.product.name} (${line.size}) ${money(line.price)}${many}`;
  };
  const count = quote.lines.reduce((sum, line) => sum + line.qty, 0);
  const onlyFootwear = quote.lines.every((line) => line.product.category !== "indumentaria");
  const items = (n) => (onlyFootwear ? plural(n, "par", "pares") : plural(n, "producto"));
  if (quote.byQuality) {
    // Con G5 en el pedido, cada calidad va en su bloque con su subtotal (son proveedores distintos).
    for (const group of quote.groups) {
      const label = group.key === "g5" ? "G5" : "BR";
      const wholesale = quote.isWholesale && group.canChoose ? " por mayor" : "";
      lines.push(`CALIDAD ${label}`);
      group.lines.forEach((line) => lines.push(itemLine(line)));
      lines.push(`Subtotal ${label}: ${items(group.lines.reduce((s, l) => s + l.qty, 0))}${wholesale} - ${money(group.subtotal)}`);
      lines.push("");
    }
  } else {
    quote.lines.forEach((line) => lines.push(itemLine(line)));
    lines.push("");
  }
  lines.push(`Total: ${items(count)} - ${money(quote.total)}`);
  lines.push("");
  // Condición de cambio según cómo compra: por mayor (5 o más, si eligió) o por unidad.
  // Si el texto de esa forma de compra está vacío, no se agrega la línea.
  // Con BR y G5, si solo una calidad llega al precio por mayor, se aclara cuál.
  const partial = quote.byQuality && quote.canChoose && quote.groups.some((g) => !g.canChoose);
  const onlyIn = partial ? ` (solo calidad ${quote.groups.filter((g) => g.canChoose).map((g) => g.key.toUpperCase()).join(" y ")})` : "";
  if (channel.purchaseModes) {
    const modeLine = channel.purchaseModes[quote.canChoose ? quote.mode : "unidad"].message;
    if (modeLine) lines.push(modeLine + (quote.isWholesale ? onlyIn : ""));
  } else if (quote.canChoose) {
    lines.push(`Compra por MAYOR (${quote.minPairs} pares o más)${onlyIn}`);
  }
  // Las tiendas de clientes no llevan esta línea (orderShippingNote: false en su configuración).
  if (config.orderShippingNote !== false) lines.push("El envío se coordina aparte.");
  return lines.join("\n").trimEnd();
}

export function orderLink(config, message) {
  return whatsappLink(config.contact.whatsappOrders, message);
}

export function productQueryLink(config, product, size) {
  const sizeText = size ? ` en talle ${size}` : "";
  return whatsappLink(config.contact.whatsappQueries,
    `¡Hola! Quería consultar por ${product.name}${sizeText}.`);
}
