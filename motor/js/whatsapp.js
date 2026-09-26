/*
 * Mensajes de WhatsApp: pedido completo y consultas.
 * Usa *negrita* de WhatsApp y texto plano, sin emojis que puedan verse mal.
 */
import { money, whatsappLink } from "./utils.js";

/**
 * Mensaje del pedido. No lleva datos del cliente: nombre, dirección y envío
 * se hablan directo en el chat (así armar el pedido es más rápido).
 */
export function buildOrderMessage({ config, channel, quote }) {
  const lines = [];

  lines.push(`Hola ${config.name}! Quiero hacer este pedido desde la tienda (${channel.label}):`);
  lines.push("");
  lines.push("*Pedido*");
  for (const line of quote.lines) {
    lines.push(`• ${line.product.name} | Talle ${line.size} | x${line.qty} | ${money(line.price)} c/u = ${money(line.subtotal)}`);
  }
  lines.push("");
  lines.push(`Pares: ${quote.pairs}`);
  lines.push(`*TOTAL: ${money(quote.total)}*`);
  // Igual que la tienda actual: la modalidad elegida (y su condición de cambio)
  // se aclara cuando el pedido llega a la cantidad para comprar por mayor.
  if (quote.canChoose) {
    lines.push(channel.purchaseModes
      ? channel.purchaseModes[quote.mode].message
      : `Compra POR MAYOR (${quote.minPairs} o más pares surtidos).`);
  }
  lines.push("");
  lines.push("Quedo a la espera de la confirmación de stock para coordinar el envío.");
  return lines.join("\n");
}

export function orderLink(config, message) {
  return whatsappLink(config.contact.whatsappOrders, message);
}

export function productQueryLink(config, product, size) {
  const sizeText = size ? ` en talle ${size}` : "";
  return whatsappLink(config.contact.whatsappQueries,
    `Hola ${config.name}! Quería consultar por ${product.name}${sizeText}.`);
}
