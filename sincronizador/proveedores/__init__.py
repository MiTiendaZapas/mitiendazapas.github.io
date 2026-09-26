"""Adaptadores de proveedor.

Cada adaptador expone dos funciones y devuelve datos en el MISMO formato,
así el resto del sistema no sabe (ni le importa) de dónde vienen:

    list_products() -> [
        {
            "ref": "tn-281297951",          # id estable dentro del proveedor
            "name": "Panda sb dunk",
            "sizes": [{"size": "38", "stock": 3}, ...],   # incluye talles en 0
            "provider_brand": "Nike" | None,
        },
        ...
    ]

    get_image_urls(product) -> ["https://.../foto1.webp", ...]   # la más grande disponible
"""
import importlib

import settings


def load_active():
    return importlib.import_module(f"proveedores.{settings.ACTIVE_PROVIDER}")
