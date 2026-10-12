"""Control: ¿la tienda muestra los mismos talles que la página del proveedor?

Hace dos revisiones:
  1. AVISO TEMPRANO: busca en el código de la página del proveedor su regla de talles
     (qué colores cuenta como "de relleno"). Si la cambió, avisa: hay que revisar
     visible_variants() en sincronizador/proveedores/vestite_api.py (pasó el 12/10).
  2. COMPARACIÓN: talle por talle, lo que da el proveedor contra lo publicado en
     catalogo.mitiendastock.com (sin contar el stock de casa).

Uso (desde la carpeta plataforma-zapas):   python herramientas/comparar_proveedor.py
Las diferencias de 1 o 2 unidades suelen ser ventas de los últimos minutos (el piloto
actualiza cada 10-15 min y no corre de 00:00 a 05:15).
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "sincronizador"))
import net  # noqa: E402
from proveedores import vestite_api  # noqa: E402

PROVIDER_PAGE = "https://vestite-piola.vercel.app/"
# La regla que copiamos de su página el 12/10/2026 (colores "de relleno").
EXPECTED_RULE = 'new Set(["SIN COLOR","UNICO","ÚNICO"])'
PUBLISHED = "https://catalogo.mitiendastock.com/productos.json"


def check_rule():
    html = net.fetch_text(PROVIDER_PAGE)
    scripts = sorted(set(re.findall(r'src="(/[^"]+\.js)"', html)))
    for src in scripts:
        code = net.fetch_text(PROVIDER_PAGE.rstrip("/") + src)
        if "SIN COLOR" in code:
            # Los programas de la página van "comprimidos": la regla puede cambiar de nombre de variable.
            found = re.search(r'new Set\(\[[^\]]*"SIN COLOR"[^\]]*\]\)', code)
            return found.group(0) if found else "(no se encontró la regla con el mismo formato)"
    return None


def provider_stock():
    stock = {}
    for item in vestite_api.list_products():
        stock[item["ref"]] = (item["name"], {s["size"]: s["stock"] for s in item["sizes"] if s["stock"] > 0})
    return stock


def published_stock():
    request = urllib.request.Request(f"{PUBLISHED}?t=control", headers={"User-Agent": "Mozilla/5.0 Chrome/120"})
    data = json.load(urllib.request.urlopen(request, timeout=60))
    stock = {}
    for p in data["products"]:
        sizes = {s["size"]: s["stock"] - s.get("casa", 0) for s in p["sizes"] if s["stock"] - s.get("casa", 0) > 0}
        stock[p["id"]] = (p["name"], sizes)
    return data.get("generatedAt"), stock


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    problems = 0
    try:
        rule = check_rule()
    except Exception as error:   # sin internet o la página cambió mucho
        rule = f"(no se pudo revisar: {error})"
    if rule == EXPECTED_RULE:
        print("Regla de talles del proveedor: igual a la que copiamos. OK")
    else:
        problems += 1
        print("ATENCIÓN: el proveedor cambió su regla de talles.")
        print(f"  Antes: {EXPECTED_RULE}")
        print(f"  Ahora: {rule}")
        print("  Revisar visible_variants() en sincronizador/proveedores/vestite_api.py")

    provider = provider_stock()
    generated, published = published_stock()
    print(f"\nCatálogo publicado: {generated}")
    for ref, (name, sizes) in provider.items():
        ours = published.get(ref, (name, {}))[1]
        if ours != sizes:
            problems += 1
            print(f"- {name}: proveedor {sizes or 'sin stock'} | tienda {ours or 'sin stock'}")
    if problems == 0:
        print("Todo igual: la tienda muestra los mismos talles que el proveedor.")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
