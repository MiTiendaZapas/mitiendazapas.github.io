"""Adaptador para el proveedor FUTURO (vestite-piola.vercel.app).

NO está activo: la migración todavía no ocurrió. Queda preparado a partir de
lo que se analizó de su API pública (septiembre 2026):

  GET {base_url}/catalog/categories  -> [{id, name}]   (las categorías son marcas)
  GET {base_url}/catalog/products?page=N -> {items: [...], page: {page, limit, total}}
      item.variants[]: {size, color, stockDisponible}
      item.images[]:   {url}   <- URLs firmadas que VENCEN: hay que descargarlas

Antes de activarlo: confirmar con el proveedor que se puede usar la API y
volver a verificar el formato, porque es una API interna y puede cambiar.
"""
import json

import net
import settings

CONFIG = settings.PROVIDERS["vestite_api"]


def _get_json(path):
    return json.loads(net.fetch_text(CONFIG["base_url"] + path))


def list_products():
    brands = {c["id"]: c["name"] for c in _get_json("/catalog/categories")}
    products, page = [], 1
    while True:
        data = _get_json(f"/catalog/products?page={page}")
        for item in data["items"]:
            sizes = {}
            for variant in item.get("variants", []):
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
