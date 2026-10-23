"""Deja la Tienda Ejemplo (mitiendastock.com/ejemplo) vacía, como la recibe un cliente nuevo.

Es la tienda para mostrarle a un cliente cómo es y cómo carga sus productos (22/10: antes era la
Demo de zapatillas). Después de mostrarla, esto borra todo lo que se cargó en su panel:
  - productos, sus fotos y las categorías
  - ajustes de "Mi tienda" (nombre, logo, WhatsApp, textos, color)
y la deja vacía, sin stock automático, con todo lo demás por defecto (configuracion.js).

El usuario del panel no se toca (ejemplo / demo123).
Solo funciona con la tienda "ejemplo" (para no borrar nunca una tienda de verdad por error).

Uso (desde la carpeta plataforma-zapas):  bash herramientas/resetear_demo.sh
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

ACCOUNT = "a5674ec6250ba14982dd00982b69e421"
STORE = "ejemplo"
API = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/r2/buckets"
# Vacía: sin productos, sin categorías y sin stock automático (solo lo que cargue el cliente).
FRESH = {"version": 1, "store": STORE, "categories": {}, "products": []}


def call(method, bucket, key="", body=None, query=None):
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    if not token:
        raise SystemExit("Falta la llave de Cloudflare: usar  bash herramientas/resetear_demo.sh")
    url = f"{API}/{bucket}/objects" + (f"/{urllib.parse.quote(key, safe='')}" if key else "")
    if query:
        url += "?" + urllib.parse.urlencode(query)
    headers = {"Authorization": f"Bearer {token}"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise


def keys(bucket, prefix):
    found, cursor = [], None
    while True:
        query = {"prefix": prefix, "per_page": 1000, **({"cursor": cursor} if cursor else {})}
        data = json.loads(call("GET", bucket, query=query))
        found += [item["key"] for item in data.get("result", [])]
        info = data.get("result_info") or {}
        cursor = info.get("cursor")
        if not cursor or not info.get("is_truncated"):
            return found


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    # Catálogo vacío (sin productos ni categorías).
    call("PUT", "mitiendastock-privado", f"tiendas/{STORE}/productos.json", json.dumps(FRESH).encode("utf-8"))
    # Fotos, logo y ajustes de "Mi tienda" (depósito público).
    files = keys("mitiendastock-catalogo", f"tiendas/{STORE}/")
    for key in files:
        call("DELETE", "mitiendastock-catalogo", key)
    print(f"Listo: la Tienda Ejemplo quedó vacía ({len(files)} archivos borrados: fotos, logo y ajustes).")


if __name__ == "__main__":
    main()
