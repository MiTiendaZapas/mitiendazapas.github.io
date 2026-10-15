/*
 * Stock siempre al día con la página abierta, sin que nadie tenga que tocar nada.
 *
 * La tienda trae el stock al abrirse. Si la persona la deja abierta (o vuelve a la
 * pestaña después de un rato), el stock puede haber cambiado. Por eso:
 *   - cada 2 minutos, y al volver a la pestaña, se pide el stock otra vez (sin recargar);
 *   - si cambió, se ve enseguida: cada modelo muestra sus talles actuales y uno agotado
 *     queda marcado "Agotado" en su lugar (la página no salta ni se pierde lo elegido);
 *   - el pedido se corrige solo, y SOLO si cambió algo del pedido sale un cartel que
 *     dice qué (por ejemplo "Se agotó el talle 40 de Dunk panda").
 * Los modelos que entran nuevos aparecen la próxima vez que se abre la tienda (sumarlos
 * en el momento movería toda la página).
 */
const EVERY_MS = 2 * 60 * 1000;
const AWAY_MS = 30 * 1000;   // al volver a la pestaña después de 30 s, se revisa enseguida

function signature(products) {
  return products.map((p) => `${p.id}:${p.sizes.map((s) => `${s.size}=${s.stock}`).join(",")}`).sort().join("|");
}

/** Pasa el stock nuevo a los modelos que ya están en pantalla (mismos objetos). */
export function applyStock(catalog, fresh) {
  for (const product of catalog.products) {
    const now = fresh.get(product.id);
    // Talles nuevos de un modelo que ya está (por ejemplo, el cliente sumó uno).
    for (const size of now?.sizes ?? []) {
      if (!product.sizes.some((s) => s.size === size.size)) product.sizes.push({ size: size.size, stock: 0 });
    }
    for (const size of product.sizes) size.stock = fresh.stockOf(product.id, size.size);
    product.available.splice(0, product.available.length, ...product.sizes.filter((s) => s.stock > 0));
  }
}

/** Texto del cartel cuando cambió algo del pedido. */
export function orderChangeText(changes) {
  if (changes.length === 1) {
    const { product, size, qty } = changes[0];
    return qty === 0
      ? `Se agotó el talle ${size} de ${product.name}: lo sacamos de tu pedido.`
      : `Del talle ${size} de ${product.name} quedan ${qty}: ajustamos tu pedido.`;
  }
  return `Cambió el stock de ${changes.length} productos de tu pedido: ya lo ajustamos.`;
}

export function keepStockFresh({ catalog, load, cart, toaster, onUpdate, onOpenCart }) {
  let last = signature(catalog.products);
  let busy = false;
  let hiddenAt = 0;

  async function check() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const fresh = await load();
      const now = signature(fresh.products);
      if (now === last) return;
      last = now;
      applyStock(catalog, fresh);
      onUpdate?.();
      const { changes } = cart.revalidate();
      if (changes.length) {
        toaster.show({
          variant: "warning",
          title: "Cambió el stock de tu pedido",
          text: orderChangeText(changes),
          action: onOpenCart ? { label: "Ver pedido", onClick: onOpenCart } : null,
          duration: 12000,
        });
      }
    } catch {
      // Sin conexión por un momento: se vuelve a intentar en la próxima vuelta.
    } finally {
      busy = false;
    }
  }

  setInterval(check, EVERY_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (Date.now() - hiddenAt > AWAY_MS) check();
  });
  // Para revisar a mano desde la consola del navegador: storeStock.check()
  window.storeStock = { check };
  return { check };
}
