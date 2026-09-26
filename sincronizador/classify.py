"""Normalización de nombres y clasificación por marca y categoría."""
import json
import re
import unicodedata

import settings


def normalize(text):
    """Clave de comparación: sin tildes, minúsculas, espacios prolijos.

    "Air forcé 1  blancas" y "air force 1 blancas" dan la misma clave, así el
    stock manual se fusiona con el del proveedor aunque varíe una tilde.
    """
    text = unicodedata.normalize("NFKD", str(text).replace(" ", " "))
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    text = re.sub(r"\s*/\s*", "/", text)
    return " ".join(text.split())


def clean_name(text):
    text = re.sub(r"\s*/\s*", " / ", str(text).replace(" ", " "))
    return " ".join(text.split())


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", normalize(text)).strip("-")


def _has_word(name_key, words):
    padded = f" {re.sub(r'[^a-z0-9]+', ' ', name_key)} "
    return any(f" {normalize(w)} " in padded for w in words)


class Classifier:
    def __init__(self):
        rules = json.loads(settings.BRAND_RULES_FILE.read_text(encoding="utf-8"))
        self.brands = rules["brands"]
        self.overrides = {normalize(k): v for k, v in rules.get("overrides", {}).items()}
        self.categories = rules["categories"]

    def brand(self, name, provider_brand=None):
        key = normalize(name)
        if key in self.overrides:
            return self.overrides[key] or None
        if provider_brand:
            # El proveedor puede escribir la marca distinto ("New balance"):
            # se usa el nombre oficial de brand_rules.json para no duplicar filtros.
            official = {normalize(r["brand"]): r["brand"] for r in self.brands}
            return official.get(normalize(provider_brand), provider_brand.strip().title())
        for rule in self.brands:
            if _has_word(key, rule["contains"]):
                return rule["brand"]
        return None

    def category(self, name, sizes, default="zapatillas"):
        key = normalize(name)
        ojotas = self.categories["ojotas"]
        if (_has_word(key, ojotas["contains"])
                or any(key.startswith(normalize(p)) for p in ojotas["starts_with"])
                or any("/" in s["size"] for s in sizes)):
            return "ojotas"
        if _has_word(key, self.categories["ninos"]["contains"]):
            return "ninos"
        return default
