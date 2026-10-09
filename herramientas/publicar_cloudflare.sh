#!/usr/bin/env bash
# Publica todas las tiendas en Cloudflare Pages (mitiendastock.com) desde esta PC.
# Toma la llave de la sesión de wrangler ("npx wrangler login", se renueva sola) y
# corre publicar_cloudflare.py. Uso:  bash herramientas/publicar_cloudflare.sh
set -e
cd "$(dirname "$0")/.."
TOKEN="$(npx wrangler auth token 2>/dev/null | tail -n 1 | tr -d '\r ')"
if [ ${#TOKEN} -lt 30 ]; then
  echo "No hay sesión de Cloudflare en esta PC: correr 'npx wrangler login'." >&2
  exit 1
fi
CLOUDFLARE_API_TOKEN="$TOKEN" CLOUDFLARE_ACCOUNT_ID=a5674ec6250ba14982dd00982b69e421 python herramientas/publicar_cloudflare.py "$@"
