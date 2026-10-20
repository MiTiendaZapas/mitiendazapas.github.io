"""Baja el STOCK DE CASA y reescribe zapatillas_manual.js / indumentaria.js (y las fotos nuevas de Fotos/).

¿De dónde sale? (settings.STOCK_CASA_FUENTE, o la variable de entorno STOCK_CASA_FUENTE)
  "panel": del panel de la tienda de L.A IMP (desde el 20/10, lo maneja el socio ahí). Se lee el
           catálogo PÚBLICO de esa tienda (no hace falta ninguna llave):
             - productos propios (no pausados)             -> modelos solo de casa (con foto y precio)
             - modelos del proveedor con "pares tuyos"      -> esos pares, como stock de casa del modelo
  "app":   de AppPedidos -> pestaña "Stock de casa" (Firebase), como antes.

Así el resto de las herramientas (sincronizador/piloto, tiendas, bot, PedidosProveedor)
siguen leyendo los mismos archivos de siempre, con el mismo formato:
    { modelo: 'Nombre', talles: [{"talle": 38, "stock": 1}, ...], foto: 'Fotos/Nombre.jpeg' },

Reglas de seguridad (para no perder stock por error):
  * Si la app todavía no fue migrada, o Firebase está vacío o no responde: NO se toca nada.
  * Antes de pisar un archivo que cambia, se guarda una copia en Automatizacion/backups_stock/.
  * Solo se escribe si el contenido cambió. Nunca lanza errores hacia afuera: el piloto sigue igual.
  * Los modelos agotados (0 pares) y los eliminados no se incluyen en los archivos.

Vive en plataforma-zapas/sincronizador/ (viaja por git a la laptop del piloto) y lo llaman:
  manual_stock.load()  (cada ciclo del piloto)  y  PedidosProveedor/server.py.

Uso:  python stock_casa_sync.py [--simular] [--destino CARPETA]
"""
import argparse
import base64
import io
import json
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import os

AQUI = Path(__file__).resolve().parent                     # .../plataforma-zapas/sincronizador
# Carpeta donde viven zapatillas_manual.js, indumentaria.js y Fotos/: la misma que
# settings.LEGACY_REPO ("TiendaZapasOficial" en la PC principal, "tienda-zapatillas" en la laptop
# del piloto). Antes el nombre estaba escrito a mano y en la laptop no existía: el stock de la app
# nunca llegaba. Se puede forzar con la variable de entorno STOCK_CASA_REPO.
def _carpeta_stock_casa():
    if os.environ.get("STOCK_CASA_REPO"):
        return Path(os.environ["STOCK_CASA_REPO"])
    try:
        sys.path.insert(0, str(AQUI))
        import settings
        return Path(settings.LEGACY_REPO)
    except Exception:
        return AQUI.parents[1] / "TiendaZapasOficial"


REPO = _carpeta_stock_casa()
# Copias de seguridad y estado: dentro de Automatizacion/, que git ignora (queda solo en cada PC).
LOCAL = REPO / "Automatizacion"
BACKUPS = LOCAL / "backups_stock"
ESTADO = LOCAL / "stock_casa_estado.json"  # qué versión de cada foto ya se bajó
TIMEOUT = 25

ARCHIVOS = {
    "zapatillas": ("zapatillas_manual.js", "stock_zapatillas_manual",
                   "// Stock de zapatillas que NO se sacan de la tienda online (piloto_automatico.py\n"
                   "// nunca escribe ni pisa este archivo). GENERADO desde AppPedidos > Stock de casa:\n"
                   "// no se edita a mano (se pisa en cada vuelta del piloto)."),
    "indumentaria": ("indumentaria.js", "stock_indumentaria",
                     "// Stock de indumentaria. GENERADO desde AppPedidos > Stock de casa:\n"
                     "// no se edita a mano (se pisa en cada vuelta del piloto)."),
}


def fuente():
    return (os.environ.get("STOCK_CASA_FUENTE") or getattr(_settings(), "STOCK_CASA_FUENTE", "app") or "app").strip().lower()


def _settings():
    try:
        sys.path.insert(0, str(AQUI))
        import settings
        return settings
    except Exception:
        return None


# Tienda de L.A IMP con panel: su catálogo público trae el stock de casa (ver docstring).
PANEL_TIENDA = "laimp"
# (STOCK_CASA_PANEL_URL: para probar contra el servidor local)
PANEL_URL = os.environ.get("STOCK_CASA_PANEL_URL") or f"https://mitiendastock.com/api/tienda/{PANEL_TIENDA}/productos.json"
PANEL_FOTOS = os.environ.get("STOCK_CASA_PANEL_FOTOS") or f"https://catalogo.mitiendastock.com/tiendas/{PANEL_TIENDA}/"
# Categorías del panel que van a indumentaria.js (el resto, a zapatillas_manual.js).
CATEGORIAS_CALZADO = {"zapatillas", "ojotas", "g5", "ninos"}


def _bajar(url):
    # Cloudflare frena los pedidos sin nombre de programa (protección anti-bots).
    req = urllib.request.Request(url, headers={"User-Agent": "mitiendastock-piloto/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return r.read()


def log(msg):
    print(f"[stock de casa] {msg}", flush=True)


# ------------------------------------------------------------------ Firebase (REST)
def _leer_config():
    """apiKey / projectId de AppPedidos (archivo local o, si no está, el publicado)."""
    texto = None
    local = REPO.parent / "AppPedidos" / "firebase-config.js"
    if local.exists():  # si no está (otra PC), se baja la copia publicada: no tiene nada secreto
        texto = local.read_text(encoding="utf-8")
    else:
        with urllib.request.urlopen("https://mitiendazapas.github.io/AppPedidos/firebase-config.js", timeout=TIMEOUT) as r:
            texto = r.read().decode("utf-8")
    api = re.search(r"apiKey:\s*['\"]([^'\"]+)['\"]", texto)
    pid = re.search(r"projectId:\s*['\"]([^'\"]+)['\"]", texto)
    if not api or not pid:
        raise RuntimeError("No se pudo leer la configuración de Firebase.")
    return api.group(1), pid.group(1)


def _http(url, datos=None, token=None):
    cab = {"Content-Type": "application/json"}
    if token:
        cab["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=(json.dumps(datos).encode() if datos is not None else None), headers=cab)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8"))


def _valor(v):
    """Convierte un valor tipado de Firestore REST a Python."""
    if "stringValue" in v:
        return v["stringValue"]
    if "integerValue" in v:
        return int(v["integerValue"])
    if "doubleValue" in v:
        return float(v["doubleValue"])
    if "booleanValue" in v:
        return v["booleanValue"]
    if "mapValue" in v:
        return {k: _valor(x) for k, x in v["mapValue"].get("fields", {}).items()}
    if "arrayValue" in v:
        return [_valor(x) for x in v["arrayValue"].get("values", [])]
    return None


def _doc(d):
    return {k: _valor(v) for k, v in d.get("fields", {}).items()}


class Firebase:
    def __init__(self):
        self.api, self.pid = _leer_config()
        self.base = f"https://firestore.googleapis.com/v1/projects/{self.pid}/databases/(default)/documents"
        # El stock de casa se lee SIN cuenta: las reglas nuevas dejan leer solo eso (stock, fotos y
        # su versión) a cualquiera, y nada más (auditoría 20/10). Mientras sigan las reglas viejas
        # ("hace falta una cuenta"), se entra como anónimo como antes.
        self.token = None

    def _pedir(self, url):
        try:
            return _http(url, token=self.token)
        except urllib.error.HTTPError as e:
            if e.code != 403 or self.token:
                raise
            res = _http(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={self.api}", {"returnSecureToken": True})
            self.token = res["idToken"]
            return _http(url, token=self.token)

    def obtener(self, ruta):
        try:
            return _doc(self._pedir(f"{self.base}/{ruta}"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            raise

    def listar(self, coleccion):
        out, pagina = [], ""
        while True:
            res = self._pedir(f"{self.base}/{coleccion}?pageSize=300{pagina}")
            for d in res.get("documents", []):
                out.append((d["name"].rsplit("/", 1)[-1], _doc(d)))
            if not res.get("nextPageToken"):
                return out
            pagina = f"&pageToken={res['nextPageToken']}"


# ------------------------------------------------------------------ archivos .js
def limpiar_nombre_archivo(nombre):
    n = nombre.replace("/", " ").replace("\\", " ").replace(" ", " ")
    return " ".join(n.split())


def escapar_js(s):
    return s.replace("\\", "\\\\").replace("'", "\\'")


def _orden_talle(t):
    m = re.match(r"\d+(?:\.\d+)?", t)
    return (float(m.group(0)) if m else 0.0, t)


def _talle_json(t):
    return int(t) if re.fullmatch(r"\d+", t) else t


def armar_js(modelos, variable, encabezado):
    lineas = [encabezado.rstrip(), "", f"const {variable} = ["]
    for m in sorted(modelos, key=lambda p: p["modelo"].lower()):
        talles = [{"talle": _talle_json(t), "stock": n} for t, n in sorted(m["talles"].items(), key=lambda x: _orden_talle(x[0]))]
        lineas.append(f"    {{ modelo: '{escapar_js(m['modelo'])}', talles: {json.dumps(talles, ensure_ascii=False)}, foto: '{escapar_js(m['foto'])}' }},")
    lineas.append("];\n")
    return "\n".join(lineas)


def _cargar_estado():
    try:
        return json.loads(ESTADO.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _desde_app(raiz, estado):
    """Stock de casa de AppPedidos (Firebase). Devuelve (por_tipo, precios, fotos_nuevas) o un mensaje si no hay."""
    fb = Firebase()
    meta = fb.obtener("config/stock_casa_meta")
    if not meta or not meta.get("migrado"):
        return "La app todavía no migró el stock de casa: se usan los archivos como están."
    docs = fb.listar("stock_casa")
    if not docs:
        return "No hay stock de casa en la app (vacío): no se toca nada."
    por_tipo = {"zapatillas": [], "indumentaria": []}
    fotos_nuevas = []   # (clave, ruta de la foto, versión, función que trae los bytes)
    precios = []        # precios cargados para modelos con stock (ver manual_stock._precios_de_casa)
    for id_, d in docs:
        if d.get("eliminado") or not d.get("nombre"):
            continue
        tipo = d.get("tipo") if d.get("tipo") in por_tipo else "zapatillas"
        talles = {str(t): int(n) for t, n in (d.get("talles") or {}).items() if int(n or 0) > 0}
        if not talles:
            continue  # agotado: no se ofrece
        foto = d.get("fotoRuta") or f"Fotos/{limpiar_nombre_archivo(d['nombre'])}.jpg"
        version = d.get("fotoVersion")
        if version and (estado.get(id_) != version or not (raiz / foto).exists()):
            def traer(id_=id_):
                url = (fb.obtener(f"stock_casa_fotos/{id_}") or {}).get("dataUrl", "")
                return base64.b64decode(url.split(",", 1)[1]) if url.startswith("data:image") else None
            fotos_nuevas.append((id_, foto, version, traer))
        por_tipo[tipo].append({"modelo": d["nombre"], "talles": talles, "foto": foto})
        precio = int(d.get("precio") or 0)
        if precio > 0:
            precios.append({"nombre": d["nombre"], "price": precio, "wholesalePrice": int(d.get("precioMayor") or 0) or None})
    return por_tipo, precios, fotos_nuevas


def _a_jpg(contenido):
    """Las fotos del panel son WEBP: se guardan como JPG, como las de siempre en Fotos/."""
    from PIL import Image
    salida = io.BytesIO()
    Image.open(io.BytesIO(contenido)).convert("RGB").save(salida, "JPEG", quality=90)
    return salida.getvalue()


def _desde_panel(raiz, estado):
    """Stock de casa del panel de L.A IMP (catálogo público). Devuelve (por_tipo, precios, fotos_nuevas) o un mensaje."""
    datos = json.loads(_bajar(PANEL_URL).decode("utf-8"))
    productos = datos.get("products")
    if not isinstance(productos, list) or not productos:
        return "El panel de L.A IMP no devolvió productos: no se toca nada."
    por_tipo = {"zapatillas": [], "indumentaria": []}
    fotos_nuevas, precios = [], []
    for p in productos:
        nombre = str(p.get("name") or "").strip()
        if not nombre:
            continue
        if p.get("manual"):
            # Producto propio = modelo solo de casa.
            talles = {str(s["size"]): int(s.get("stock") or 0) for s in p.get("sizes", []) if int(s.get("stock") or 0) > 0}
        else:
            # Modelo del proveedor: solo los pares que cargó el socio ("extra").
            talles = {str(s["size"]): int(s.get("extra") or 0) for s in p.get("sizes", []) if int(s.get("extra") or 0) > 0}
        if not talles:
            continue
        tipo = "zapatillas" if not p.get("manual") or p.get("category") in CATEGORIAS_CALZADO else "indumentaria"
        foto = f"Fotos/{limpiar_nombre_archivo(nombre)}.jpg"
        imagenes = p.get("images") or []
        if p.get("manual") and imagenes and imagenes[0].get("lg"):
            lg = imagenes[0]["lg"]
            clave = f"panel:{p.get('id')}"
            if estado.get(clave) != lg or not (raiz / foto).exists():
                url = lg if lg.startswith("http") else PANEL_FOTOS + lg
                fotos_nuevas.append((clave, foto, lg, lambda url=url: _a_jpg(_bajar(url))))
        por_tipo[tipo].append({"modelo": nombre, "talles": talles, "foto": foto})
        # Precio propio del panel. Si es el que salió de la lista de L.A IMP ("fromList"), no va:
        # así cada tienda usa su propia lista para ese modelo.
        precio = int(p.get("price") or 0)
        if p.get("manual") and precio > 0 and not p.get("fromList"):
            mayor = int(p.get("wholesalePrice") or 0) or None
            precios.append({"nombre": nombre, "price": precio, "wholesalePrice": mayor if mayor and mayor < precio else None})
    if not any(por_tipo.values()):
        return "El panel de L.A IMP no tiene stock de casa: no se toca nada."
    return por_tipo, precios, fotos_nuevas


def sincronizar(destino=None, simular=False):
    """Devuelve (hubo_cambios, mensaje). Lanza excepción solo si algo sale mal (ver sincronizar_seguro)."""
    raiz = Path(destino) if destino else REPO
    estado = _cargar_estado()
    origen = fuente()
    leido = _desde_panel(raiz, estado) if origen == "panel" else _desde_app(raiz, estado)
    if isinstance(leido, str):
        return False, leido
    por_tipo, precios, fotos_nuevas = leido

    cambios = []
    for tipo, (archivo, variable, encabezado) in ARCHIVOS.items():
        nuevo = armar_js(por_tipo[tipo], variable, encabezado)
        ruta = raiz / archivo
        actual = ruta.read_text(encoding="utf-8") if ruta.exists() else ""
        if nuevo.replace("\r\n", "\n") == actual.replace("\r\n", "\n"):
            continue
        cambios.append(f"{archivo} ({len(por_tipo[tipo])} modelos)")
        if simular:
            continue
        if ruta.exists() and not destino:
            BACKUPS.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ruta, BACKUPS / f"{time.strftime('%Y%m%d_%H%M%S')}_{archivo}")
            for viejo in sorted(BACKUPS.glob(f"*_{archivo}"))[:-40]:
                viejo.unlink()
        tmp = ruta.with_suffix(".tmp")
        tmp.write_text(nuevo, encoding="utf-8")
        tmp.replace(ruta)

    # Los precios van aparte (los .js tienen un formato fijo que leen varias herramientas): un
    # archivito que lee manual_stock.load() y el sincronizador pone en el catálogo.
    ruta_precios = raiz / "Automatizacion" / "precios_casa.json"
    nuevo_precios = json.dumps({"precios": sorted(precios, key=lambda e: e["nombre"].lower())}, ensure_ascii=False, indent=1)
    actual_precios = ruta_precios.read_text(encoding="utf-8") if ruta_precios.exists() else None
    if (actual_precios is None and precios) or (actual_precios is not None and actual_precios.strip() != nuevo_precios.strip()):
        cambios.append(f"precios de casa ({len(precios)})")
        if not simular:
            ruta_precios.parent.mkdir(parents=True, exist_ok=True)
            tmp = ruta_precios.with_suffix(".tmp")
            tmp.write_text(nuevo_precios, encoding="utf-8")
            tmp.replace(ruta_precios)

    for clave, foto, version, traer in fotos_nuevas:
        if simular:
            cambios.append(f"foto {foto}")
            continue
        contenido = traer()
        if not contenido:
            continue
        cambios.append(f"foto {foto}")
        (raiz / foto).parent.mkdir(parents=True, exist_ok=True)
        (raiz / foto).write_bytes(contenido)
        estado[clave] = version
    if not simular and not destino and fotos_nuevas:
        ESTADO.parent.mkdir(parents=True, exist_ok=True)
        ESTADO.write_text(json.dumps(estado, ensure_ascii=False, indent=1), encoding="utf-8")

    total = sum(len(v) for v in por_tipo.values())
    de = "panel de L.A IMP" if origen == "panel" else "app"
    return bool(cambios), (f"Actualizado desde {de}: {', '.join(cambios)}." if cambios else f"Sin cambios ({total} modelos con stock, desde {de}).")


def sincronizar_seguro(**kw):
    """Para usar desde el piloto: nunca lanza excepciones; si algo falla, se usan los archivos actuales."""
    try:
        hubo, msg = sincronizar(**kw)
        log(("🏠 " if hubo else "") + msg)
        return hubo
    except Exception as e:  # sin internet, Firebase caído, etc.
        log(f"⚠️ No se pudo traer el stock de casa ({fuente()}: {type(e).__name__}: {e}). Se usan los archivos que hay.")
        return False


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--simular", action="store_true", help="no escribe nada, solo cuenta lo que cambiaría")
    ap.add_argument("--destino", help="escribe en otra carpeta en vez de en TiendaZapasOficial (para probar)")
    a = ap.parse_args()
    sys.exit(0 if sincronizar_seguro(destino=a.destino, simular=a.simular) in (True, False) else 1)
