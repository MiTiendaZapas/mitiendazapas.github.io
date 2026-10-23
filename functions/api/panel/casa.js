// POST /api/panel/casa  { accion: "descontar"|"devolver"|"ajustar", pedido, id, talle, delta }
// La app de pedidos descuenta (o devuelve) un par del stock de casa por un pedido, o lo ajusta a
// mano. Ver moveHouseStock.
//
// Al sumar pares de casa a un modelo del proveedor ("b:<id>") se guarda también una copia del
// modelo (nombre, fotos...), igual que cuando se cargan desde el panel: si después el proveedor lo
// saca de su stock, el modelo sigue en la tienda con esos pares. Un "b:<id>" que el proveedor no
// tiene (y que no estaba guardado) no se acepta.
import { brModel, fail, json, moveHouseStock, readBrStock, updateCatalog } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  let input;
  try { input = await request.json(); } catch { return fail("Datos inválidos."); }
  try {
    const code = input?.accion === "ajustar" && /^b:/.test(String(input?.id ?? "")) ? String(input.id).slice(2) : null;
    const br = code ? await readBrStock(env) : null;
    return json(await updateCatalog(env, data.session.tienda, (catalog) => {
      if (!code) return moveHouseStock(catalog, input);
      const found = br.products.find((p) => p.id === code);
      if (!found && !catalog.br?.[code]?.model) return { ok: false, motivo: "no-existe" };
      const result = moveHouseStock(catalog, input);
      const change = catalog.br?.[code];
      if (result.ok && found && change?.extra && !change.model) {
        const { id, sizes, ...model } = brModel(found, catalog.stockBR);
        change.model = model;
      }
      // Sin pares de casa, la copia ya no hace falta (igual que desde el panel).
      if (change && !change.extra && change.model) {
        delete change.model;
        if (!Object.keys(change).length) delete catalog.br[code];
      }
      return { ...result, nombre: result.nombre ?? change?.model?.name ?? found?.name ?? null };
    }));
  } catch (error) {
    return fail(error.message);
  }
}
