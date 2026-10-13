/*
 * Stock siempre al día con la página abierta.
 *
 * La tienda trae el stock al abrirse. Si la persona la deja abierta (o vuelve a la
 * pestaña después de un rato), el stock puede haber cambiado. Por eso:
 *   - cada 2 minutos, y al volver a la pestaña, se pide el stock otra vez (sin recargar);
 *   - si cambió, se actualizan los números por dentro: el pedido no deja agregar más de
 *     lo que hay y se corrige solo si algo se agotó;
 *   - y se avisa con un cartel "Se actualizó el stock · Actualizar" para ver los cambios
 *     (modelos nuevos, talles que se agotaron) sin perder el pedido.
 */
const EVERY_MS = 2 * 60 * 1000;
const AWAY_MS = 30 * 1000;   // al volver a la pestaña después de 30 s, se revisa enseguida

function signature(products) {
  return products.map((p) => `${p.id}:${p.sizes.map((s) => `${s.size}=${s.stock}`).join(",")}`).sort().join("|");
}

/** Pasa el stock nuevo a los modelos que ya están en pantalla (mismos objetos). */
function applyStock(catalog, fresh) {
  for (const product of catalog.products) {
    for (const size of product.sizes) size.stock = fresh.stockOf(product.id, size.size);
    product.available.splice(0, product.available.length, ...product.sizes.filter((s) => s.stock > 0));
  }
}

export function keepStockFresh({ catalog, load, cart, toaster }) {
  let last = signature(catalog.products);
  let warned = false;
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
      const { removed, adjusted } = cart.revalidate();
      const orderChanged = removed > 0 || adjusted > 0;
      // Un solo cartel: si se agotó algo del pedido, siempre; si no, solo la primera vez.
      if (orderChanged || !warned) {
        warned = true;
        toaster.show({
          variant: orderChanged ? "warning" : undefined,
          title: orderChanged ? "Se agotó algo de tu pedido" : "Se actualizó el stock",
          text: orderChanged
            ? "Ya lo corregimos. Tocá Actualizar para ver el stock nuevo."
            : "Tocá para ver los cambios. Tu pedido se mantiene.",
          action: { label: "Actualizar", onClick: () => location.reload() },
          duration: orderChanged ? 12000 : 10000,
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
