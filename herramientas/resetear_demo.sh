#!/usr/bin/env bash
# Deja la Tienda Ejemplo vacía (ver resetear_demo.py). Toma la llave de la sesión de wrangler.
# Uso (desde la carpeta plataforma-zapas):  bash herramientas/resetear_demo.sh
set -e
cd "$(dirname "$0")/.."
TOKEN="$(npx wrangler auth token 2>/dev/null | tail -n 1 | tr -d '\r ')"
if [ ${#TOKEN} -lt 30 ]; then
  echo "No hay sesión de Cloudflare en esta PC: correr 'npx wrangler login'." >&2
  exit 1
fi
CLOUDFLARE_API_TOKEN="$TOKEN" python herramientas/resetear_demo.py
