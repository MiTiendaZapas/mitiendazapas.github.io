/*
 * Crea (o cambia) el usuario y la clave del panel de una tienda con stock propio.
 *
 * Uso (desde la carpeta plataforma-zapas):
 *   node herramientas/crear_usuario_panel.mjs <tienda> <usuario> [--local]
 *
 * Inventa una clave segura (o usa la de PANEL_CLAVE), la muestra UNA vez (para pasársela al cliente) y guarda
 * en el depósito PRIVADO solo la clave cifrada. Con --local la guarda en la prueba
 * de esta computadora (wrangler pages dev) en vez de Cloudflare.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPassword } from "../servidor/panel.js";

const [store, userRaw] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const local = process.argv.includes("--local");
const user = String(userRaw ?? "").toLowerCase();
if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(store ?? "") || !/^[a-z0-9._-]{3,40}$/.test(user)) {
  console.error("Uso: node herramientas/crear_usuario_panel.mjs <tienda> <usuario> [--local]");
  process.exit(1);
}

// Clave fácil de dictar: 3 grupos de 4 letras y números, sin los que se confunden (0/O, 1/l).
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
// Se descartan los números que darían más chances a algunas letras (todas igual de probables).
const letters = [];
while (letters.length < 12) {
  for (const n of crypto.getRandomValues(new Uint8Array(24))) {
    if (n < 248 && letters.length < 12) letters.push(ALPHABET[n % ALPHABET.length]);
  }
}
// Una clave elegida a mano (por ejemplo, para la tienda de demostración) va en la variable
// PANEL_CLAVE, no en el comando, para que no quede en el historial.
const chosen = process.env.PANEL_CLAVE;
if (chosen !== undefined && (chosen.length < 6 || chosen.length > 100)) {
  console.error("PANEL_CLAVE tiene que tener entre 6 y 100 letras o números.");
  process.exit(1);
}
const password = chosen ?? letters.join("").replace(/(.{4})(?!$)/g, "$1-");

const salt = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
const iterations = 100000;
const record = { usuario: user, tienda: store, salt, iterations, hash: await hashPassword(password, salt, iterations), creado: new Date().toISOString() };

const folder = mkdtempSync(join(tmpdir(), "panel-"));
const file = join(folder, "usuario.json");
try {
  writeFileSync(file, JSON.stringify(record));
  const args = ["wrangler", "r2", "object", "put", `mitiendastock-privado/usuarios/${user}.json`, "--file", file,
    "--content-type", "application/json", local ? "--local" : "--remote"];
  execFileSync("npx", args, { stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32" });
} finally {
  rmSync(folder, { recursive: true, force: true });
}
console.log(`Listo. Tienda: ${store} · Usuario: ${user} · Clave: ${password}`);
console.log("Pasale la clave al cliente por un medio privado. No queda guardada en ningún lado sin cifrar.");
