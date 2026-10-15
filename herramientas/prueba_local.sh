#!/usr/bin/env bash
# Prueba local de TODAS las tiendas y paneles (nada se publica).
# Arma la carpeta dist/ con lo último (más la tienda de prueba demo-br) y la abre en
# http://localhost:8788  —  Uso (desde la carpeta plataforma-zapas):  bash herramientas/prueba_local.sh
set -e
cd "$(dirname "$0")/.."
OUT="$(python herramientas/publicar_cloudflare.py --armar | tail -n 1)"
TMP="$(echo "$OUT" | sed -E 's/^Armado en (.*): tienda.*/\1/')"
rm -rf dist
cp -r "$TMP" dist
rm -rf "$TMP"
# Tiendas de prueba que no están en GitHub (no se publican nunca).
for extra in demo-br; do
  if [ -d "../repositorio-$extra" ]; then
    cp -r "../repositorio-$extra" "dist/$extra"
    python -c "import json;p='dist/_routes.json';r=json.load(open(p));r['include'].append('/$extra/');json.dump(r,open(p,'w'),indent=2)"
  fi
done
# El stock de Brasil de la prueba: el de esta computadora.
npx wrangler r2 object put mitiendastock-catalogo/productos.json --file catalogo/productos.json --content-type application/json --local > /dev/null 2>&1 || true
echo "Listo: abrí http://localhost:8788/demo-br/panel/   (para cortar: Ctrl+C)"
npx wrangler pages dev dist --port 8788 --ip 127.0.0.1
