"""Lectura (solo lectura) del stock de casa que se carga desde el Panel Admin.

Formato de cada línea en zapatillas_manual.js / indumentaria.js:
    { modelo: 'Nombre', talles: [{"talle": 38, "stock": 1}, ...], foto: 'Fotos/Nombre.jpeg' },
"""
import json
import re

import settings
from classify import normalize as normalize_nombre

_ENTRY = re.compile(
    r"\{\s*modelo:\s*'((?:[^'\\]|\\.)*)'\s*,\s*talles:\s*(\[.*?\])\s*,\s*foto:\s*'((?:[^'\\]|\\.)*)'\s*\}",
    re.S,
)


def _unescape(js_string):
    return re.sub(r"\\(.)", r"\1", js_string)


def _traer_stock_de_la_app():
    """El stock de casa ahora se maneja desde AppPedidos > Stock de casa (Firebase).
    Antes de leer los archivos se los actualiza con eso. Si algo falla (sin internet,
    Firebase caído, módulo ausente), NO pasa nada: se leen los archivos como estaban."""
    try:
        import stock_casa_sync  # está en esta misma carpeta (sincronizador/)
        stock_casa_sync.sincronizar_seguro()
    except Exception as e:  # incluye ImportError si faltara el módulo
        print(f"  ⚠️ No se pudo traer el stock de casa de la app ({e}); se usan los archivos que hay.")


def _precios_de_casa():
    """Precios que se cargaron en la app para modelos de casa (los escribe stock_casa_sync.py).
    {nombre normalizado: (precio de venta, precio por mayor)}. Si el archivo falta, no hay precios propios."""
    ruta = settings.LEGACY_REPO / "Automatizacion" / "precios_casa.json"
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
    except Exception:
        return {}
    out = {}
    for e in datos.get("precios", []):
        try:
            out[normalize_nombre(e["nombre"])] = (int(e.get("price") or 0) or None, int(e.get("wholesalePrice") or 0) or None)
        except (KeyError, TypeError, ValueError):
            continue
    return out


def load():
    """Devuelve [(kind, {name, sizes, photo})]; kind es 'zapatillas' o 'indumentaria'."""
    _traer_stock_de_la_app()
    precios = _precios_de_casa()
    items = []
    for kind, path in settings.MANUAL_STOCK_FILES.items():
        if not path.exists():
            # Sin este archivo, los modelos de casa desaparecerían del catálogo
            # sin que nadie lo note: mejor frenar y avisar.
            raise RuntimeError(f"No se encontró el stock de casa: {path}. "
                               "Revisá LEGACY_REPO en sincronizador/settings.py.")
        for name, sizes_json, photo in _ENTRY.findall(path.read_text(encoding="utf-8")):
            try:
                raw_sizes = json.loads(sizes_json)
            except json.JSONDecodeError:
                print(f"  ⚠️ Talles ilegibles en '{name}' ({path.name}), se omite.")
                continue
            sizes = [
                {"size": str(t["talle"]).strip(), "stock": max(int(t.get("stock", 0) or 0), 0)}
                for t in raw_sizes if str(t.get("talle", "")).strip()
            ]
            item = {"name": _unescape(name), "sizes": sizes, "photo": _unescape(photo)}
            precio, mayor = precios.get(normalize_nombre(item["name"]), (None, None))
            if precio:
                item["price"] = precio                 # precio de venta cargado en la app
                if mayor:
                    item["wholesale"] = mayor          # precio por mayor (opcional)
            items.append((kind, item))
    return items
