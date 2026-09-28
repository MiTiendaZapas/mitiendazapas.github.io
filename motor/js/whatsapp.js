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
  for (const line of quote.lines) {
    const many = line.qty > 1 ? ` x${line.qty} = ${money(line.subtotal)}` : "";
    lines.push(`${line.product.name} (${line.size}) ${money(line.price)}${many}`);
  }
  lines.push("");
  const count = quote.lines.reduce((sum, line) => sum + line.qty, 0);
  const onlyFootwear = quote.lines.every((line) => line.product.category !== "indumentaria");
  lines.push(`Total: ${onlyFootwear ? plural(count, "par", "pares") : plural(count, "producto")} - ${money(quote.total)}`);
  lines.push("");
  // Condición de cambio según cómo compra: por mayor (5 o más, si eligió) o por unidad.
  // Si el texto de esa forma de compra está vacío, no se agrega la línea.
  if (channel.purchaseModes) {
    const modeLine = channel.purchaseModes[quote.canChoose ? quote.mode : "unidad"].message;
    if (modeLine) lines.push(modeLine);
  } else if (quote.canChoose) {
    lines.push(`Compra por MAYOR (${quote.minPairs} pares o más)`);
  }
  lines.push("El envío se coordina aparte.");
  return lines.join("\n");
}

export function orderLink(config, message) {
  return whatsappLink(config.contact.whatsappOrders, message);
}

export function productQueryLink(config, product, size) {
  const sizeText = size ? ` en talle ${size}` : "";
  return whatsappLink(config.contact.whatsappQueries,
    `Hola! Quería consultar por ${product.name}${sizeText}.`);
}
