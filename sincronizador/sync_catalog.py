"""Sincronizador del catálogo compartido.

    proveedor (adaptador) + stock de casa  ->  catalogo/productos.json + catalogo/fotos/

Uso:
    python sincronizador/sync_catalog.py                  escaneo completo con imágenes
    python sincronizador/sync_catalog.py --no-images      solo datos (reutiliza imágenes ya bajadas)
    python sincronizador/sync_catalog.py --dry-run        no escribe el catálogo, solo informa
    python sincronizador/sync_catalog.py --only "Panda sb dunk; Mind beige"   prueba con pocos modelos
    python sincronizador/sync_catalog.py --force          escribe aunque el catálogo se achique mucho

Este archivo solo actualiza el catálogo en la PC. Publicarlo en GitHub (y
repetirlo cada 15-20 minutos) lo hace piloto.py.
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8")

import manual_stock  # noqa: E402
import settings  # noqa: E402
from classify import Classifier, clean_name, normalize, slugify  # noqa: E402
from images import ImageStore, _retry  # noqa: E402
from proveedores import load_active  # noqa: E402


def _size_sort_key(entry):
    first = entry["size"].split("/")[0]
    return (0, float(first), entry["size"]) if first.replace(".", "", 1).isdigit() else (1, 0, entry["size"])


def _add_sizes(target, sizes):
    for entry in sizes:
        target[entry["size"]] = target.get(entry["size"], 0) + entry["stock"]


def build_products(provider_items, manual_items, classifier):
    """Fusiona proveedor + casa por nombre normalizado (misma idea que mezclar_stock.js)."""
    by_key = {}
    ordered = []

    def upsert(key, product_id, name):
        if key not in by_key:
            by_key[key] = {"id": product_id, "name": name, "sizes": {}, "house": {}, "origin": [],
                           "provider_item": None, "manual_photo": None, "kind": "zapatillas",
                           "provider_brand": None}
            ordered.append(key)
        return by_key[key]

    # Primero el stock de casa (como en la tienda actual), después el proveedor.
    for kind, item in manual_items:
        product = upsert(normalize(item["name"]), f"casa-{slugify(item['name'])}", clean_name(item["name"]))
        _add_sizes(product["sizes"], item["sizes"])
        _add_sizes(product["house"], item["sizes"])   # cuánto de cada talle es stock de casa
        product["origin"].append("casa")
        product["kind"] = kind
        product["manual_photo"] = product["manual_photo"] or item["photo"]

    for item in provider_items:
        if any(word in normalize(item["name"]) for word in settings.EXCLUDE_KEYWORDS):
            continue
        product = upsert(normalize(item["name"]), item["ref"], clean_name(item["name"]))
        if product["provider_item"] is None:
            # Si el modelo también está en el stock de casa, el id y el nombre que
            # se muestran son los del proveedor (más estables; las fotos salen de ahí).
            product["id"] = item["ref"]
            product["name"] = clean_name(item["name"])
            product["provider_item"] = item
            product["provider_brand"] = item.get("provider_brand")
        _add_sizes(product["sizes"], item["sizes"])
        product["origin"].append("proveedor")

    products, used_slugs = [], set()
    for key in ordered:
        raw = by_key[key]
        # "casa": parte del stock que es de casa (las tiendas de clientes pueden excluirla).
        sizes = sorted((
            {"size": s, "stock": n, **({"casa": raw["house"][s]} if raw["house"].get(s) else {})}
            for s, n in raw["sizes"].items()
        ), key=_size_sort_key)
        if not any(s["stock"] > 0 for s in sizes):
            continue
        slug = slugify(raw["name"]) or raw["id"]
        while slug in used_slugs:
            slug += "-2"
        used_slugs.add(slug)
        default_category = "indumentaria" if raw["kind"] == "indumentaria" else "zapatillas"
        products.append({
            "id": raw["id"],
            "slug": slug,
            "name": raw["name"],
            "brand": classifier.brand(raw["name"], raw["provider_brand"]),
            "category": classifier.category(raw["name"], sizes, default_category),
            "sizes": sizes,
            "origin": sorted(set(raw["origin"])),
            "images": [],
            "name_key": key,
            "_provider_item": raw["provider_item"],
            "_manual_photo": raw["manual_photo"],
        })
    return products


def _photos_folder_index():
    """Fotos cargadas a mano en la carpeta Fotos/ (Panel Admin), por nombre de modelo."""
    folder = settings.LEGACY_PHOTOS_DIR / "Fotos"
    if not folder.is_dir():
        return {}
    return {normalize(f.stem.replace("/", " ")): f for f in folder.iterdir()
            if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")}


def attach_images(products, provider, store, download):
    """Fotos de cada modelo. Orden de preferencia:
      1. las del proveedor,
      2. la foto del stock de casa (si el modelo es solo de casa),
      3. si el proveedor no tiene fotos: las que ya teníamos de ese modelo con otro
         código (por ejemplo, del proveedor anterior),
      4. la foto con el mismo nombre en la carpeta Fotos/ del Panel Admin.
    Las de 3 y 4 son de respaldo: apenas el proveedor cargue las suyas, se reemplazan.
    """
    pending = [p for p in products if download and store.needs_check(p["id"])]
    photos_folder = _photos_folder_index() if pending else {}
    for product in products:
        product["images"] = store.current(product["id"])
    for number, product in enumerate(pending, 1):
        print(f"  [{number}/{len(pending)}] imágenes de {product['name']}")
        sources = provider.get_image_urls(product["_provider_item"]) if product["_provider_item"] else []
        if not sources and product["_manual_photo"]:
            local = settings.LEGACY_PHOTOS_DIR / product["_manual_photo"]
            if local.exists():
                sources = [local]
        if sources:
            product["images"] = store.update(product["id"], sources)
        elif not product["images"]:
            product["images"] = store.reuse_by_name(product["id"], product["name_key"])
            fallback = photos_folder.get(normalize(product["name"].replace("/", " ")))
            if not product["images"] and fallback:
                print(f"    ♻️ {product['id']}: sin fotos en el proveedor, se usa {fallback.name} de la carpeta Fotos/.")
                product["images"] = store.update(product["id"], [fallback], reused=True)
        if number % 10 == 0:
            store.save_state()     # si se corta la luz, no se pierde lo ya descargado


class SyncLock:
    """Evita que dos sincronizaciones corran a la vez (ej. laptop y PC)."""
    path = settings.STATE_DIR / "sync.lock"
    max_age_sec = 2 * 3600    # un candado más viejo que esto quedó de una corrida cortada

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists() and time.time() - self.path.stat().st_mtime < self.max_age_sec:
            raise RuntimeError(f"Ya hay una sincronización en curso ({self.path}). "
                               "Si no es así, borrá ese archivo y volvé a intentar.")
        self.path.write_text(str(os.getpid()), encoding="utf-8")
        return self

    def __exit__(self, *exc):
        self.path.unlink(missing_ok=True)


def write_json_atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    _retry(lambda: os.replace(temp, path))


def main():
    try:
        with SyncLock():
            return run()
    except RuntimeError as error:
        print(f"❌ {error}")
        return 1
    except Exception as error:     # red caída, proveedor cambió el HTML, etc.: el catálogo anterior queda intacto
        print(f"❌ Error inesperado, no se modificó el catálogo: {type(error).__name__}: {error}")
        return 1


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="nombres separados por ';' (modo prueba)")
    parser.add_argument("--no-images", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true",
                        help="escribir aunque haya muchos menos modelos que antes (achique real del proveedor)")
    args = parser.parse_args()

    started = time.time()
    provider = load_active()
    print(f"Proveedor activo: {settings.ACTIVE_PROVIDER}")

    provider_items = provider.list_products()
    print(f"Productos publicados por el proveedor: {len(provider_items)}")
    manual_items = manual_stock.load()   # si falta un archivo de stock de casa, corta acá
    print(f"Modelos de stock de casa: {len(manual_items)}")

    products = build_products(provider_items, manual_items, Classifier())
    if args.only:
        wanted = {normalize(n) for n in args.only.split(";") if n.strip()}
        products = [p for p in products if normalize(p["name"]) in wanted]
        missing = wanted - {normalize(p["name"]) for p in products}
        if missing:
            print(f"  ⚠️ Sin stock o inexistentes: {', '.join(sorted(missing))}")
    print(f"Modelos con stock (fusionados): {len(products)}")
    if not products:
        raise RuntimeError("No quedó ningún modelo con stock: no se escribe un catálogo vacío.")

    if not args.only and not args.force and settings.PRODUCTS_FILE.exists():
        previous = json.loads(settings.PRODUCTS_FILE.read_text(encoding="utf-8")).get("count", 0)
        if previous and len(products) < previous * settings.MIN_RATIO_VS_PREVIOUS:
            print(f"❌ Se detectaron {len(products)} modelos contra {previous} del catálogo anterior. "
                  "No se pisa el catálogo (¿caída o cambio del proveedor?). "
                  "Si el achique es real, correr con --force.")
            return 1

    store = ImageStore()
    store.remember_names(products)
    if not args.dry_run:
        try:
            attach_images(products, provider, store, download=not args.no_images)
        finally:
            store.save_state()

    without_brand = [p["name"] for p in products if not p["brand"]]
    settings.REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    (settings.REPORTS_DIR / "brand-review.json").write_text(
        json.dumps(sorted(without_brand), ensure_ascii=False, indent=1), encoding="utf-8")

    brands = {}
    for p in products:
        brands[p["brand"] or "(sin marca)"] = brands.get(p["brand"] or "(sin marca)", 0) + 1
    categories = {}
    for p in products:
        categories[p["category"]] = categories.get(p["category"], 0) + 1
    print("Marcas:", dict(sorted(brands.items(), key=lambda kv: -kv[1])))
    print("Categorías:", categories)
    print(f"Fusionados casa + proveedor: {sum(1 for p in products if len(p['origin']) == 2)}")
    print(f"Sin imagen: {sum(1 for p in products if not p['images'])}")
    if without_brand:
        print(f"Para revisar marca ({len(without_brand)}): {', '.join(without_brand)}")

    if args.dry_run:
        print("Modo --dry-run: no se escribió el catálogo.")
        return 0

    for p in products:
        p.pop("_provider_item")
        p.pop("_manual_photo")
        p.pop("name_key")
    write_json_atomic(settings.PRODUCTS_FILE, {
        "version": int(time.time()),
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "count": len(products),
        "products": products,
    })
    store.mark_seen(p["id"] for p in products)
    if not args.only and not args.no_images:
        store.cleanup({p["id"] for p in products})
    store.save_state()
    size_mb = store.total_mb()
    print(f"Imágenes: {size_mb:.1f} MB en {settings.IMAGES_DIR}")
    if size_mb > settings.IMAGES_WARN_MB:
        print(f"⚠️ Las imágenes superan {settings.IMAGES_WARN_MB} MB: conviene evaluar la opción C (Cloudflare R2).")
    print(f"✅ Catálogo escrito: {settings.PRODUCTS_FILE} ({time.time() - started:.0f}s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
