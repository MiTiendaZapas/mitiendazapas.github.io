#!/usr/bin/env bash
# Pasa el stock de casa de la app al panel de una tienda, en Cloudflare (ver importar_stock_casa_panel.py).
# Toma la llave de la sesión de wrangler, como publicar_cloudflare.sh.  Uso:  bash herramientas/importar_stock_casa_panel.sh laimp
set -e
cd "$(dirname "$0")/.."
TOKEN="$(npx wrangler auth token 2>/dev/null | tail -n 1 | tr -d '\r ')"
if [ ${#TOKEN} -lt 30 ]; then
  echo "No hay sesión de Cloudflare en esta PC: correr 'npx wrangler login'." >&2
  exit 1
fi
CLOUDFLARE_API_TOKEN="$TOKEN" CLOUDFLARE_ACCOUNT_ID=a5674ec6250ba14982dd00982b69e421 python herramientas/importar_stock_casa_panel.py "$@"
