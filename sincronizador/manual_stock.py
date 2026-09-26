"""Lectura (solo lectura) del stock de casa que se carga desde el Panel Admin.

Formato de cada línea en zapatillas_manual.js / indumentaria.js:
    { modelo: 'Nombre', talles: [{"talle": 38, "stock": 1}, ...], foto: 'Fotos/Nombre.jpeg' },
"""
import json
import re

import settings

_ENTRY = re.compile(
    r"\{\s*modelo:\s*'((?:[^'\\]|\\.)*)'\s*,\s*talles:\s*(\[.*?\])\s*,\s*foto:\s*'((?:[^'\\]|\\.)*)'\s*\}",
    re.S,
)


def _unescape(js_string):
    return re.sub(r"\\(.)", r"\1", js_string)


def load():
    """Devuelve [(kind, {name, sizes, photo})]; kind es 'zapatillas' o 'indumentaria'."""
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
            items.append((kind, {"name": _unescape(name), "sizes": sizes, "photo": _unescape(photo)}))
    return items
