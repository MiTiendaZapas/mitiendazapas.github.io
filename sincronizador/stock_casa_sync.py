"""Baja el STOCK DE CASA de la app (AppPedidos -> pestaña "Stock de casa", en Firebase)
y reescribe zapatillas_manual.js / indumentaria.js (y las fotos nuevas de Fotos/).

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
# TiendaZapasOficial (donde viven zapatillas_manual.js, indumentaria.js y Fotos/): la misma
# carpeta que settings.LEGACY_REPO, hermana de plataforma-zapas.
REPO = Path(os.environ.get("STOCK_CASA_REPO") or (AQUI.parents[1] / "TiendaZapasOficial"))
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
        res = _http(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={self.api}", {"returnSecureToken": True})
        self.token = res["idToken"]

    def obtener(self, ruta):
        try:
            return _doc(_http(f"{self.base}/{ruta}", token=self.token))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            raise

    def listar(self, coleccion):
        out, pagina = [], ""
        while True:
            res = _http(f"{self.base}/{coleccion}?pageSize=300{pagina}", token=self.token)
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


def sincronizar(destino=None, simular=False):
    """Devuelve (hubo_cambios, mensaje). Lanza excepción solo si algo sale mal (ver sincronizar_seguro)."""
    fb = Firebase()
    meta = fb.obtener("config/stock_casa_meta")
    if not meta or not meta.get("migrado"):
        return False, "La app todavía no migró el stock de casa: se usan los archivos como están."
    docs = fb.listar("stock_casa")
    if not docs:
        return False, "No hay stock de casa en la app (vacío): no se toca nada."

    raiz = Path(destino) if destino else REPO
    estado = _cargar_estado()
    por_tipo = {"zapatillas": [], "indumentaria": []}
    fotos_nuevas = []
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
            fotos_nuevas.append((id_, foto, version))
        por_tipo[tipo].append({"modelo": d["nombre"], "talles": talles, "foto": foto})

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

    for id_, foto, version in fotos_nuevas:
        d = fb.obtener(f"stock_casa_fotos/{id_}")
        url = (d or {}).get("dataUrl", "")
        if not url.startswith("data:image"):
            continue
        cambios.append(f"foto {foto}")
        if simular:
            continue
        (raiz / foto).parent.mkdir(parents=True, exist_ok=True)
        (raiz / foto).write_bytes(base64.b64decode(url.split(",", 1)[1]))
        estado[id_] = version
    if not simular and not destino and fotos_nuevas:
        ESTADO.parent.mkdir(parents=True, exist_ok=True)
        ESTADO.write_text(json.dumps(estado, ensure_ascii=False, indent=1), encoding="utf-8")

    total = sum(len(v) for v in por_tipo.values())
    return bool(cambios), (f"Actualizado: {', '.join(cambios)}." if cambios else f"Sin cambios ({total} modelos con stock).")


def sincronizar_seguro(**kw):
    """Para usar desde el piloto: nunca lanza excepciones; si algo falla, se usan los archivos actuales."""
    try:
        hubo, msg = sincronizar(**kw)
        log(("🏠 " if hubo else "") + msg)
        return hubo
    except Exception as e:  # sin internet, Firebase caído, etc.
        log(f"⚠️ No se pudo traer el stock de la app ({type(e).__name__}: {e}). Se usan los archivos que hay.")
        return False


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--simular", action="store_true", help="no escribe nada, solo cuenta lo que cambiaría")
    ap.add_argument("--destino", help="escribe en otra carpeta en vez de en TiendaZapasOficial (para probar)")
    a = ap.parse_args()
    sys.exit(0 if sincronizar_seguro(destino=a.destino, simular=a.simular) in (True, False) else 1)
