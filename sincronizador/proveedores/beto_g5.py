"""Proveedor extra: zapatillas de calidad G5 de la tienda de Beto (catalogo-app-beto.vercel.app).

Su página lee un catálogo público (solo lectura, sin precios):
  GET https://app-beto-seven.vercel.app/api/catalogo -> {productos: [...]}
      producto: {id, nombre, categoria, linea, tipoTalle, foto, fotoGrande, talles: [{talle, cantidad}]}

Se toman solo los de linea "G5" y categoria "Calzado". Entran al catálogo con la
categoría "g5": las tiendas que no la activan (showG5) no los muestran.
"""
import json

import net
import settings

CONFIG = settings.EXTRA_PROVIDERS["beto_g5"]


def list_products():
    data = json.loads(net.fetch_text(CONFIG["url"]))
    products = []
    for item in data["productos"]:
        if str(item.get("linea") or "").strip().upper() != "G5":
            continue
        if str(item.get("categoria") or "").strip().lower() != "calzado":
            continue
        sizes = {}
        for entry in item.get("talles", []):
            size = str(entry.get("talle") or "").strip()
            if size:
                sizes[size] = sizes.get(size, 0) + max(int(entry.get("cantidad") or 0), 0)
        photo = item.get("fotoGrande") or item.get("foto")
        products.append({
            "ref": f"g5-{item['id']}",
            "name": item["nombre"].strip(),
            "sizes": [{"size": s, "stock": n} for s, n in sizes.items()],
            "provider_brand": None,
            "_image_urls": [photo] if photo else [],
        })
    return products


def get_image_urls(product):
    return product.get("_image_urls", [])
