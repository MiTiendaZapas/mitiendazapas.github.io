#!/usr/bin/env bash
# Visitas de las tiendas (Cloudflare). Uso:  bash herramientas/estadisticas.sh [días]
set -e
cd "$(dirname "$0")/.."
TOKEN="$(npx wrangler auth token 2>/dev/null | tail -n 1 | tr -d '\r ')"
if [ ${#TOKEN} -lt 30 ]; then
  echo "No hay sesión de Cloudflare en esta PC: correr 'npx wrangler login'." >&2
  exit 1
fi
# Las visitas desde esta PC (pruebas) no se cuentan.
IPS_PROPIAS="$(curl -s https://api.ipify.org) $IPS_PROPIAS" CLOUDFLARE_API_TOKEN="$TOKEN" python herramientas/estadisticas.py "$@"
