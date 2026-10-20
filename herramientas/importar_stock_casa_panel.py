"""Pasa el STOCK DE CASA de la app de pedidos (Firebase) al panel de una tienda (L.A IMP).

Desde ahora el stock de casa se maneja en el panel, como cualquier revendedor:
  - modelo de casa que también vende el proveedor  ->  "pares tuyos" en ese modelo (data.br[id].extra)
  - modelo que es solo de casa                     ->  producto propio (con su foto, talles y precio)

Además deja la tienda con stock de Brasil SIN el stock de casa del catálogo (casa: false, porque
ahora ese stock está en el panel) y con las G5 a precio de su lista (g5: true).

No borra nada que el cliente haya cargado: los productos propios con el mismo nombre se
reemplazan; el resto queda. Correrlo de nuevo vuelve a copiar el stock de la app.

Uso (desde la carpeta plataforma-zapas):
    bash herramientas/importar_stock_casa_panel.sh laimp              en Cloudflare (pasa la llave)
    python herramientas/importar_stock_casa_panel.py laimp --local    en la prueba de esta PC
    python herramientas/importar_stock_casa_panel.py laimp --simular  solo muestra qué haría
"""
import base64
import io
import json
import os
import subprocess
import sys
import tempfile
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "sincronizador"))
from classify import normalize  # noqa: E402
import stock_casa_sync  # noqa: E402

from PIL import Image  # noqa: E402

FILES = "https://catalogo.mitiendastock.com/"
LARGE, SMALL = 900, 360   # ancho de las fotos (como las achica el panel en el celular)


_ENV = None


def wrangler(args, where):
    # El Python de la tienda de Windows no ve la sesión de wrangler: se le pasa la llave (como en publicar_cloudflare.sh).
    global _ENV
    if _ENV is None:
        _ENV = dict(os.environ)
        if where == "--remote" and not _ENV.get("CLOUDFLARE_API_TOKEN"):
            raise SystemExit("Falta la llave de Cloudflare: usar  bash herramientas/importar_stock_casa_panel.sh <tienda>")
            _ENV.setdefault("CLOUDFLARE_ACCOUNT_ID", "a5674ec6250ba14982dd00982b69e421")
    return subprocess.run(["npx", "wrangler", "r2", "object", *args, where], capture_output=True, text=True,
                          encoding="utf-8", errors="replace", shell=(sys.platform == "win32"), env=_ENV)


def read_json(key, where, folder):
    target = folder / "leido.json"
    result = wrangler(["get", key, "--file", str(target)], where)
    if result.returncode != 0:
        if "specified key does not exist" in (result.stderr + result.stdout).lower():
            return None
        raise RuntimeError(f"No se pudo leer {key}: {result.stderr.strip()[-300:]}")
    return json.loads(target.read_text(encoding="utf-8"))


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "mitiendastock"}), timeout=30) as r:
        return r.read()


def list_prices(products, list_file):
    """{id: (precio, precio por mayor)} según una lista de precios de la tienda (motor/js/pricing.js)."""
    result = subprocess.run(["node", str(ROOT / "herramientas" / "precios_de_lista.mjs"), str(ROOT / list_file)],
                            input=json.dumps(products), capture_output=True, text=True, encoding="utf-8", check=True)
    return {e["id"]: (e["unit"], e["wholesale"]) for e in json.loads(result.stdout)}


def size_order(size):
    first = size.split("/")[0].replace(",", ".")
    try:
        return (0, float(first), size)
    except ValueError:
        return (1, 0, size)


def to_webp(raw, width):
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    if image.width > width:
        image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    out = io.BytesIO()
    image.save(out, "WEBP", quality=82)
    return out.getvalue(), image.width, image.height


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        return 1
    store = args[0]
    where = "--local" if "--local" in sys.argv else "--remote"
    simulate = "--simular" in sys.argv

    # 1) Stock de casa de la app y catálogo del proveedor (para saber qué modelos vende).
    fb = stock_casa_sync.Firebase()
    house = []
    for doc_id, d in fb.listar("stock_casa"):
        if d.get("eliminado") or not d.get("nombre"):
            continue
        sizes = {str(t).strip(): int(n or 0) for t, n in (d.get("talles") or {}).items() if int(n or 0) > 0 and str(t).strip()}
        if sizes:
            house.append((doc_id, d, sizes))
    catalog = json.loads(fetch(FILES + "productos.json"))
    provider = {normalize(p["name"]): p for p in catalog["products"] if "proveedor" in (p.get("origin") or [])}
    house_only = {normalize(p["name"]): p for p in catalog["products"] if (p.get("origin") or []) == ["casa"]}
    # Precio de hoy de los modelos solo de casa, en la tienda y en la de revendedores (sus listas).
    listed_all = list(house_only.values())
    retail = list_prices(listed_all, "precios-minorista.json")
    resale = list_prices(listed_all, "precios-mayorista.json")

    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        key = f"mitiendastock-privado/tiendas/{store}/productos.json"
        data = read_json(key, where, folder) or {"version": 1, "store": store, "categories": {}, "products": []}
        data["stockBR"] = {"casa": False, "g5": True}
        data.setdefault("br", {})
        uploads = []
        names = set()
        extras, own = [], []
        for doc_id, d, sizes in house:
            name = d["nombre"].strip()
            match = provider.get(normalize(name))
            if match:
                change = data["br"].setdefault(match["id"], {})
                change["extra"] = dict(sorted(sizes.items(), key=lambda e: size_order(e[0])))
                extras.append(f"{match['name']} ({sum(sizes.values())} pares)")
                continue
            listed = house_only.get(normalize(name))
            # El precio que tiene hoy en la tienda (el de la app si lo cargaron, si no el de las listas).
            unit, bulk_price = retail.get(listed["id"], (None, None)) if listed else (None, None)
            price = int(d.get("precio") or 0) or int(unit or 0)
            wholesale = int(d.get("precioMayor") or 0) or int(bulk_price or 0) or None
            mayorista = None
            if listed and not d.get("precio"):
                r_unit, r_wholesale = resale.get(listed["id"], (None, None))
                if r_unit and (r_unit, r_wholesale) != (price, wholesale):
                    mayorista = {"price": int(r_unit), "wholesalePrice": int(r_wholesale) if r_wholesale and r_wholesale < r_unit else None}
            # Foto: la ya achicada del catálogo; si no está, la que se cargó en la app.
            raw = None
            if listed and listed.get("images"):
                try:
                    raw = fetch(FILES + listed["images"][0]["lg"])
                except Exception:
                    raw = None
            if raw is None:
                photo = fb.obtener(f"stock_casa_fotos/{doc_id}") or {}
                if str(photo.get("dataUrl", "")).startswith("data:image"):
                    raw = base64.b64decode(photo["dataUrl"].split(",", 1)[1])
            images = []
            if raw:
                code = str(uuid.uuid4())
                large, w, h = to_webp(raw, LARGE)
                small, _, _ = to_webp(raw, SMALL)
                for size, content in (("lg", large), ("sm", small)):
                    path = folder / f"{code}-{size}.webp"
                    path.write_bytes(content)
                    uploads.append((f"mitiendastock-catalogo/tiendas/{store}/fotos/{code}-{size}.webp", path))
                images.append({"lg": f"fotos/{code}-lg.webp", "sm": f"fotos/{code}-sm.webp", "w": w, "h": h})
            category = "indumentaria" if d.get("tipo") == "indumentaria" else (listed or {}).get("category") or "zapatillas"
            if category not in ("zapatillas", "ojotas", "g5"):
                data["categories"].setdefault(category, category.capitalize())
            if wholesale and wholesale >= (price or 0):
                wholesale = None
            names.add(normalize(name))
            own.append({
                "id": f"m-{uuid.uuid4()}", "slug": "", "name": name, "brand": (listed or {}).get("brand"), "category": category,
                "price": price or None, "wholesalePrice": wholesale, "mayorista": mayorista,
                "sizes": [{"size": s, "stock": n} for s, n in sorted(sizes.items(), key=lambda e: size_order(e[0]))], "images": images,
                "hidden": not price,   # sin precio no se puede vender: queda pausado hasta ponérselo
                "createdAt": d.get("creado") or None,
            })

        kept = [p for p in data["products"] if normalize(p["name"]) not in names]
        taken = {p["slug"] for p in kept}
        for product in own:
            base = "-".join(normalize(product["name"]).split()) or "producto"
            slug, n = base, 2
            while slug in taken:
                slug, n = f"{base}-{n}", n + 1
            taken.add(slug)
            product["slug"] = slug
            product["createdAt"] = product["createdAt"] or catalog.get("generatedAt")
        data["products"] = kept + own
        data["count"] = len(data["products"])

        print(f"Tienda {store}: {len(extras)} modelos del proveedor con pares de casa, {len(own)} productos solo de casa.")
        for line in extras:
            print(f"  + pares de casa: {line}")
        for p in own:
            money = lambda n: f"${n:,}".replace(",", ".") if n else "-"
            estado = "PAUSADO (sin precio)" if p["hidden"] else f"{money(p['price'])} / mayor {money(p['wholesalePrice'])}" + (
                f" · revendedores {money(p['mayorista']['price'])} / {money(p['mayorista']['wholesalePrice'])}" if p["mayorista"] else "")
            print(f"  + producto propio: {p['name']} · {sum(s['stock'] for s in p['sizes'])} pares · {estado} · {len(p['images'])} foto")
        if simulate:
            print("Simulación: no se guardó nada.")
            return 0
        for target, path in uploads:
            result = wrangler(["put", target, "--file", str(path), "--content-type", "image/webp"], where)
            if result.returncode != 0:
                raise RuntimeError(f"No se pudo subir una foto: {result.stderr.strip()[-300:]}")
        out = folder / "productos.json"
        out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        result = wrangler(["put", key, "--file", str(out), "--content-type", "application/json", "--cache-control", "no-cache"], where)
        if result.returncode != 0:
            raise RuntimeError(f"No se pudo guardar el catálogo: {result.stderr.strip()[-300:]}")
        print("Listo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
