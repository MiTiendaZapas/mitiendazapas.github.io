"""Sube el catálogo (stock y fotos) al depósito R2 de Cloudflare (catalogo.mitiendastock.com).

Sube solo lo que cambió desde la última vez (lo recuerda en estado/r2_subidos.json)
y borra del depósito las fotos que ya no están en el catálogo.

Credenciales (NUNCA van a GitHub ni a las tiendas):
  - variable de entorno CLOUDFLARE_API_TOKEN, o
  - el archivo sincronizador/estado/cloudflare_token.txt (la carpeta estado/ no se sube).
  El token necesita permiso "R2 Storage: Edit" en la cuenta de Cloudflare.

Uso manual:   python sincronizador/r2.py            (sube lo que falte)
              python sincronizador/r2.py --revisar  (solo dice qué subiría)
"""
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import settings  # noqa: E402

CONFIG = settings.CLOUDFLARE_R2
STATE_FILE = settings.STATE_DIR / "r2_subidos.json"
TOKEN_FILE = settings.STATE_DIR / "cloudflare_token.txt"
API = "https://api.cloudflare.com/client/v4/accounts/{account}/r2/buckets/{bucket}/objects/{key}"

# Las fotos llevan un código en el nombre: si cambian, cambia el nombre, así que se
# pueden guardar para siempre. El stock se pide siempre nuevo (las tiendas usan "?t=").
CACHE = {".json": "public, max-age=30", "default": "public, max-age=31536000, immutable"}
TYPES = {".json": "application/json; charset=utf-8", ".webp": "image/webp", ".jpg": "image/jpeg",
         ".jpeg": "image/jpeg", ".png": "image/png"}


def _token():
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    if not token and TOKEN_FILE.exists():
        token = TOKEN_FILE.read_text(encoding="utf-8").strip()
    if not token:
        raise RuntimeError(f"Falta el token de Cloudflare (variable CLOUDFLARE_API_TOKEN o {TOKEN_FILE}).")
    return token


def _request(method, key, token, body=None, headers=None):
    url = API.format(account=CONFIG["account_id"], bucket=CONFIG["bucket"], key=urllib.request.quote(key))
    request = urllib.request.Request(url, data=body, method=method,
                                     headers={"Authorization": f"Bearer {token}", **(headers or {})})
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.status
        except urllib.error.HTTPError as error:
            if error.code == 404 and method == "DELETE":
                return 404
            if attempt == 3 or error.code in (400, 401, 403):
                raise RuntimeError(f"{method} {key}: HTTP {error.code} {error.read()[:200]!r}") from None
        except urllib.error.URLError:
            if attempt == 3:
                raise


def _local_files():
    """{clave en el depósito: archivo local} de todo lo que se publica del catálogo."""
    root = settings.CATALOG_DIR
    files = {}
    for path in root.rglob("*"):
        if path.is_file() and not path.name.endswith(".tmp"):
            files[path.relative_to(root).as_posix()] = path
    return files


def _fingerprint(path):
    return hashlib.sha1(path.read_bytes()).hexdigest()


def sync(dry_run=False, workers=12):
    """Sube lo nuevo o cambiado y borra lo que ya no existe. Devuelve (subidos, borrados)."""
    state = json.loads(STATE_FILE.read_text(encoding="utf-8")) if STATE_FILE.exists() else {}
    files = _local_files()
    current = {key: _fingerprint(path) for key, path in files.items()}
    # El stock va al final, para que nunca apunte a una foto que todavía no se subió.
    to_upload = sorted((k for k, h in current.items() if state.get(k) != h), key=lambda k: k.endswith(".json"))
    to_delete = [k for k in state if k not in current]
    if dry_run:
        return to_upload, to_delete
    token = _token()

    def upload(key):
        suffix = Path(key).suffix.lower()
        headers = {"Content-Type": TYPES.get(suffix, "application/octet-stream"),
                   "Cache-Control": CACHE.get(suffix, CACHE["default"])}
        _request("PUT", key, token, files[key].read_bytes(), headers)
        return key

    photos = [k for k in to_upload if not k.endswith(".json")]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for key in pool.map(upload, photos):
            state[key] = current[key]
    for key in (k for k in to_upload if k.endswith(".json")):
        upload(key)
        state[key] = current[key]
    for key in to_delete:
        _request("DELETE", key, token)
        state.pop(key, None)
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=0), encoding="utf-8")
    return to_upload, to_delete


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    review = "--revisar" in sys.argv
    uploaded, deleted = sync(dry_run=review)
    verb = "Subiría" if review else "Subidos"
    print(f"{verb}: {len(uploaded)} archivos | {'borraría' if review else 'borrados'}: {len(deleted)}")
