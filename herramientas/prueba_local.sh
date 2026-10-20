#!/usr/bin/env bash
# Prueba local de TODAS las tiendas y paneles (nada se publica).
# Arma la carpeta dist/ con lo último (más las tiendas de prueba: demo-br y laimp-panel) y la abre en
# http://localhost:8788  —  Uso (desde la carpeta plataforma-zapas):  bash herramientas/prueba_local.sh
set -e
cd "$(dirname "$0")/.."
# Con --prueba suma las tiendas de prueba (demo-br y L.A IMP con panel en /laimp-panel/).
OUT="$(python herramientas/publicar_cloudflare.py --armar --prueba | tail -n 1)"
TMP="$(echo "$OUT" | sed -E 's/^Armado en (.*): tienda.*/\1/')"
rm -rf dist
cp -r "$TMP" dist
rm -rf "$TMP"
# El stock de Brasil de la prueba: el de esta computadora.
npx wrangler r2 object put mitiendastock-catalogo/productos.json --file catalogo/productos.json --content-type application/json --local > /dev/null 2>&1 || true
npx wrangler r2 object put mitiendastock-catalogo/productos-g5.json --file catalogo/productos-g5.json --content-type application/json --local > /dev/null 2>&1 || true
echo "Listo: abrí http://localhost:8788/laimp-panel/panel/  (para cortar: Ctrl+C)"
npx wrangler pages dev dist --port 8788 --ip 127.0.0.1
