"""Proveedor extra: zapatillas de calidad G5 de la tienda de Beto (catalogo-app-beto.vercel.app).

Su página lee un catálogo público (solo lectura, sin precios):
  GET https://app-beto-seven.vercel.app/api/catalogo -> {productos: [...]}
      producto: {id, nombre, categoria, linea, tipoTalle, foto, fotoGrande, talles: [{talle, cantidad}]}

Se toman solo los de linea "G5" y categoria "Calzado". Entran al catálogo con la
categoría "g5": las tiendas que no la activan (showG5) no los muestran.
"""
import json
import re

import net
import settings

CONFIG = settings.EXTRA_PROVIDERS["beto_g5"]


_cache = {}


def _catalog():
    """Su catálogo, pedido una sola vez por vuelta del piloto (lo usan list_products y find)."""
    if "data" not in _cache:
        _cache["data"] = json.loads(net.fetch_text(CONFIG["url"]))
    return _cache["data"]


# Los códigos del proveedor van a las páginas de todas las tiendas: solo letras, números y
# guiones (auditoría 20/10). Si mandara otra cosa (por error o porque lo hackean), se limpia.
_UNSAFE_ID = re.compile(r"[^A-Za-z0-9-]")


def _to_item(item, prefix):
    safe_id = _UNSAFE_ID.sub("", str(item["id"]))[:40]
    if not safe_id:
        raise ValueError(f"Código de modelo inválido del proveedor: {item.get('nombre')!r}")
    sizes = {}
    for entry in item.get("talles", []):
        size = str(entry.get("talle") or "").strip()
        if size:
            sizes[size] = sizes.get(size, 0) + max(int(entry.get("cantidad") or 0), 0)
    photo = item.get("fotoGrande") or item.get("foto")
    return {
        "ref": f"{prefix}-{safe_id}",
        "name": item["nombre"].strip(),
        "sizes": [{"size": s, "stock": n} for s, n in sizes.items()],
        "provider_brand": None,
        "_image_urls": [photo] if photo else [],
    }


def list_products():
    products = []
    for item in _catalog()["productos"]:
        if str(item.get("linea") or "").strip().upper() != "G5":
            continue
        if str(item.get("categoria") or "").strip().lower() != "calzado":
            continue
        products.append(_to_item(item, "g5"))
    return products


def find(names):
    """Modelos de cualquier línea por su nombre exacto (sin mayúsculas ni acentos): {nombre: item}."""
    from classify import normalize
    wanted = {normalize(n): n for n in names}
    found = {}
    for item in _catalog()["productos"]:
        name = wanted.get(normalize(item.get("nombre") or ""))
        if name:
            found[name] = _to_item(item, "suma")
    return found


def get_image_urls(product):
    return product.get("_image_urls", [])
