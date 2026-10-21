"""Proveedor extra: la línea BR (calidad Brasil) de la tienda de Beto, la misma de las G5.

Sale de su mismo catálogo público (ver proveedores/beto_g5.py) y entra con la categoría
"br2" en catalogo/productos-br2.json. Ninguna tienda lo lee: solo el catálogo para
compartir de Fabri (/catalogo/fo/), donde se ve aparte como "Brasil 2".
"""
from proveedores import beto_g5


def list_products():
    return beto_g5.list_products(line="BR", prefix="br2")


def get_image_urls(product):
    return beto_g5.get_image_urls(product)
