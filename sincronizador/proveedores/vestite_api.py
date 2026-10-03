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

import net
import settings

CONFIG = settings.PROVIDERS["vestite_api"]


def _get_json(path):
    return json.loads(net.fetch_text(CONFIG["base_url"] + path))


def _is_without_color(color):
    return not str(color or "").strip() or str(color).strip().upper() == "SIN COLOR"


def visible_variants(variants):
    """Los talles que muestra el proveedor al abrir el modelo (misma regla que su página).

    Los talles "SIN COLOR" vienen de su tienda vieja de Tiendanube. Si el modelo
    tiene algún talle con color de verdad (ej. "Único"), la página del proveedor
    muestra solo esos y deja afuera los "SIN COLOR". Si todos son "SIN COLOR",
    los muestra todos.
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
