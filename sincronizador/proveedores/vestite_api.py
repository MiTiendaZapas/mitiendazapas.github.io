"""Adaptador del proveedor (vestite-piola.vercel.app). Activo desde el 01/10.

Lee la API pública que usa su propia página (analizada en septiembre 2026):

  GET {base_url}/catalog/categories  -> [{id, name}]   (las categorías son marcas)
  GET {base_url}/catalog/products?page=N -> {items: [...], page: {page, limit, total}}
      item.variants[]: {size, color, stockDisponible}
      item.images[]:   {url}   <- URLs firmadas que VENCEN: hay que descargarlas

Es una API interna y puede cambiar: si el piloto deja de traer stock, revisar
primero que este formato siga igual.
"""
import json
import unicodedata

import net
import settings

CONFIG = settings.PROVIDERS["vestite_api"]


def _get_json(path):
    return json.loads(net.fetch_text(CONFIG["base_url"] + path))


# Colores "de relleno" que la página del proveedor no cuenta como color (copiado de su
# código el 12/10: "SIN COLOR", "UNICO" y "ÚNICO", sin importar mayúsculas ni tildes).
PLACEHOLDER_COLORS = {"SIN COLOR", "UNICO"}


def _is_without_color(color):
    text = unicodedata.normalize("NFD", str(color or "").strip().upper())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return not text or text in PLACEHOLDER_COLORS


def visible_variants(variants):
    """Los talles que muestra el proveedor al abrir el modelo (misma regla que su página).

    Si el modelo tiene algún color de verdad (ej. "Negro"), la página del proveedor
    muestra solo esos talles y deja afuera los de relleno ("SIN COLOR", "Único").
    Si todos son de relleno, los muestra todos.
    (Antes "Único" contaba como color de verdad; el proveedor lo cambió el 12/10.)
    """
    if any(not _is_without_color(v.get("color")) for v in variants):
        return [v for v in variants if not _is_without_color(v.get("color"))]
    return variants


def list_products():
    brands = {c["id"]: c["name"] for c in _get_json("/catalog/categories")}
    products, page = [], 1
    while True:
        data = _get_json(f"/catalog/products?page={page}")
        for item in data["items"]:
            sizes = {}
            for variant in visible_variants(item.get("variants", [])):
                size = str(variant.get("size") or "").strip()
                if size:
                    sizes[size] = sizes.get(size, 0) + max(int(variant.get("stockDisponible") or 0), 0)
            products.append({
                "ref": f"vp-{item['id']}",
                "name": item["name"].strip(),
                "sizes": [{"size": s, "stock": n} for s, n in sizes.items()],
                "provider_brand": brands.get(item.get("categoryId")),
                "_image_urls": [img["url"] for img in item.get("images", [])],
            })
        info = data["page"]
        if info["page"] * info["limit"] >= info["total"]:
            break
        page += 1
    return products


def get_image_urls(product):
    return product.get("_image_urls", [])
