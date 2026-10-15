/*
 * Activa el stock de Brasil en el panel de una tienda: la tienda muestra el stock del
 * proveedor (al día, como siempre) y el cliente puede, modelo por modelo, cambiarle el
 * precio, ocultarlo o sumarle pares que tiene en su casa. Además carga sus productos propios.
 *
 * Uso (desde la carpeta plataforma-zapas):
 *   node herramientas/activar_stock_br.mjs <tienda> [--casa] [--g5] [--local]
 *
 *   --casa   también muestra el stock de casa de L.A IMP
 *   --g5     también muestra las zapatillas calidad G5
 *   --local  en la prueba de esta computadora (wrangler pages dev), no en Cloudflare
 *
 * No borra nada de lo que el cliente ya cargó: solo cambia esas opciones.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [store] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flag = (name) => process.argv.includes(`--${name}`);
if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(store ?? "")) {
  console.error("Uso: node herramientas/activar_stock_br.mjs <tienda> [--casa] [--g5] [--local]");
  process.exit(1);
}
const where = flag("local") ? "--local" : "--remote";
const key = `mitiendastock-catalogo/tiendas/${store}/productos.json`;
const wrangler = (args) => execFileSync("npx", ["wrangler", "r2", "object", ...args, where],
  { stdio: ["ignore", "ignore", "pipe"], shell: process.platform === "win32" });

const folder = mkdtempSync(join(tmpdir(), "stock-br-"));
const file = join(folder, "productos.json");
try {
  let data = { version: 1, store, categories: {}, products: [] };
  try {
    wrangler(["get", key, "--file", file]);
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    // Solo si de verdad no tiene catálogo se arranca vacío. Cualquier otro problema (sin
    // internet, sin sesión) corta acá: nunca se pisa lo que el cliente ya cargó.
    if (!/specified key does not exist/i.test(String(error.stderr ?? ""))) {
      console.error("No se pudo leer el catálogo de la tienda. No se cambió nada.");
      process.exit(1);
    }
  }
  data.stockBR = { casa: flag("casa"), g5: flag("g5") };
  data.br ??= {};
  writeFileSync(file, JSON.stringify(data));
  wrangler(["put", key, "--file", file, "--content-type", "application/json", "--cache-control", "no-cache"]);
  console.log(`Listo. Tienda ${store}: stock de Brasil activado (stock de casa: ${data.stockBR.casa ? "sí" : "no"}, G5: ${data.stockBR.g5 ? "sí" : "no"}). Productos propios: ${data.products.length}.`);
} finally {
  rmSync(folder, { recursive: true, force: true });
}
