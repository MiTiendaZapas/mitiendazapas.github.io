"""Configuración del sincronizador de catálogo.

Es el ÚNICO lugar donde figuran las URLs del proveedor. Para migrar al
proveedor nuevo alcanza con cambiar ACTIVE_PROVIDER (y terminar su adaptador
en proveedores/).
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# --- Proveedor -------------------------------------------------------------
ACTIVE_PROVIDER = "tiendanube"

PROVIDERS = {
    "tiendanube": {
        "base_url": "https://vestitepiola.mitiendanube.com",
        "listing_path": "/productos/",
        "listing_query": "?order=best-selling",   # mismo orden que la tienda actual
    },
    # Proveedor futuro. Todavía NO se usa: la migración no ocurrió.
    "vestite_api": {
        "base_url": "https://gestion-negocio-backend.vercel.app/api/v1",
    },
}

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
REQUEST_DELAY_SEC = 0.7      # pausa entre pedidos para no castigar al proveedor
REQUEST_TIMEOUT_SEC = 30

# Productos del proveedor que nunca entran al catálogo (la indumentaria se
# carga a mano, igual que en la tienda actual).
EXCLUDE_KEYWORDS = ["remera", "baggy"]

# --- Stock manual (de casa) ------------------------------------------------
# Se LEEN (nunca se escriben) los archivos que ya edita el Panel Admin de la
# tienda actual, así el stock de casa se carga en un solo lugar.
# Hoy la tienda nueva vive en una carpeta aparte; cuando se integre en el
# mismo repositorio que la tienda actual, esta línea pasa a ser: LEGACY_REPO = ROOT
LEGACY_REPO = ROOT.parent / "TiendaZapasOficial"
MANUAL_STOCK_FILES = {
    "zapatillas": LEGACY_REPO / "zapatillas_manual.js",
    "indumentaria": LEGACY_REPO / "indumentaria.js",
}
LEGACY_PHOTOS_DIR = LEGACY_REPO   # las rutas del JS ya incluyen "Fotos/..."

# --- Salida ----------------------------------------------------------------
CATALOG_DIR = ROOT / "catalogo"
PRODUCTS_FILE = CATALOG_DIR / "productos.json"
IMAGES_DIR = CATALOG_DIR / "fotos"

STATE_DIR = ROOT / "sincronizador" / "estado"          # memoria interna (no se publica)
REPORTS_DIR = ROOT / "sincronizador" / "informes"      # informes para revisar a mano
BRAND_RULES_FILE = ROOT / "sincronizador" / "brand_rules.json"

# Imágenes (opción A optimizada: todo en el repo, lo más liviano posible).
# "sm" solo se genera para la foto de portada (la única que usa la tarjeta);
# "lg" para todas las fotos de la galería de la vista de detalle.
IMAGE_SM_PX = 480
IMAGE_LG_PX = 900
IMAGE_QUALITY = 78
MAX_IMAGES_PER_PRODUCT = 6
IMAGE_REFRESH_DAYS = 14        # cada cuánto se revisa si el proveedor cambió las fotos
IMAGE_KEEP_MISSING_DAYS = 7    # si un modelo desaparece, sus fotos se borran recién pasados estos días
IMAGES_WARN_MB = 500           # aviso si la carpeta de imágenes supera este tamaño

# Si un escaneo trae menos de esta proporción de productos que el anterior,
# NO se pisa el catálogo (probable caída o cambio del sitio del proveedor).
MIN_RATIO_VS_PREVIOUS = 0.5
