"""Adaptador para la tienda actual del proveedor (Tiendanube).

A diferencia del piloto automático viejo, no hace falta abrir un navegador ni
entrar a cada producto para saber el stock: el listado paginado ya trae, por
cada producto, un atributo data-variants con stock por talle.
Solo se entra a la página del producto para leer su galería de fotos, y eso
se hace únicamente con productos nuevos (ver images.py).
"""
import html
import json
import re

import net
import settings

CONFIG = settings.PROVIDERS["tiendanube"]

_ITEM_SPLIT = re.compile(r'(?=<div[^>]+js-item-product)')
_PRODUCT_ID = re.compile(r'data-product-id="(\d+)"')
_VARIANTS = re.compile(r'data-variants="([^"]*)"')
_LINK = re.compile(r'href="([^"]*/productos/[^"]+)"[^>]*title="([^"]*)"')
_GALLERY_LINK = re.compile(r'<a href="([^"]+)"[^>]*class="js-product-slide-link')


def _listing_url(page):
    base = CONFIG["base_url"] + CONFIG["listing_path"]
    return (base if page == 1 else f"{base}page/{page}/") + CONFIG.get("listing_query", "")


def _stock_of(variant):
    if not variant.get("available", True):
        return 0
    stock = variant.get("stock")
    if stock is None:           # Tiendanube usa null para "stock ilimitado"
        return 99
    try:
        return max(int(stock), 0)
    except (TypeError, ValueError):
        return 0


def _parse_listing(page_html):
    products = []
    for block in _ITEM_SPLIT.split(page_html)[1:]:
        pid, variants, link = _PRODUCT_ID.search(block), _VARIANTS.search(block), _LINK.search(block)
        if not (pid and variants and link):
            continue
        sizes, cover = {}, None
        for variant in json.loads(html.unescape(variants.group(1))):
            cover = cover or variant.get("image_url")
            size = str(variant.get("option0") or "").strip()
            if size:
                sizes[size] = max(sizes.get(size, 0), _stock_of(variant))
        products.append({
            "ref": f"tn-{pid.group(1)}",
            "name": html.unescape(link.group(2)),
            "url": link.group(1),
            "sizes": [{"size": s, "stock": n} for s, n in sizes.items()],
            "provider_brand": None,   # las categorías de marca del proveedor casi no se usan
            "cover": ("https:" + cover) if cover and cover.startswith("//") else cover,
        })
    return products


def list_products():
    products, seen, page = [], set(), 1
    while True:
        found = _parse_listing(net.fetch_text(_listing_url(page)))
        if not found:
            break
        for product in found:
            if product["ref"] not in seen:
                seen.add(product["ref"])
                products.append(product)
        page += 1
    return products


def get_image_urls(product):
    """Galería completa desde la página del producto. Si no se puede leer
    (cambio de diseño, error de red), se usa la foto de portada del listado."""
    try:
        page_html = net.fetch_text(product["url"])
    except Exception as error:
        print(f"    ⚠️ No se pudo abrir la página de {product['name']}: {error}")
        page_html = ""
    urls = []
    for href in _GALLERY_LINK.findall(page_html):
        url = "https:" + href if href.startswith("//") else href
        if url not in urls:
            urls.append(url)
    if not urls and product.get("cover"):
        urls.append(product["cover"])
    return urls
