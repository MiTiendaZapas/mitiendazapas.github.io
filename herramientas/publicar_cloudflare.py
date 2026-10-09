"""Publica TODAS las tiendas en Cloudflare Pages (mitiendastock.com).

Junta en una carpeta:
  - la tienda principal (este repositorio) en la raíz: /, /mayorista, /talles, /motor...
  - cada tienda de cliente (carpetas ../repositorio-*) en /<nombre del repo de GitHub>/

y la sube con wrangler al proyecto "mitiendastock". El stock y las fotos NO van acá:
viven en el depósito R2 (catalogo.mitiendastock.com) y los sube el piloto.

Uso (desde la carpeta del proyecto):
    python herramientas/publicar_cloudflare.py            publica
    python herramientas/publicar_cloudflare.py --armar    solo arma la carpeta, sin subir
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROJECTS = ROOT.parent
PROJECT_NAME = "mitiendastock"
ACCOUNT_ID = "a5674ec6250ba14982dd00982b69e421"
OLD_URL = "https://mitiendazapas.github.io/"
NEW_URL = "https://mitiendastock.com/"

# Lo que no se publica de la tienda principal (programas internos, pruebas, guías, stock).
SKIP_MAIN = {".git", ".github", "catalogo", "sincronizador", "pruebas", "guias", "herramientas",
             "README.md", ".nojekyll", ".gitignore", "node_modules", "__pycache__"}
SKIP_CLIENT = {".git", "LEEME.md", ".gitignore", ".nojekyll"}


def client_repos():
    """{nombre en el link: carpeta} de cada tienda de cliente, según su repositorio de GitHub."""
    found = {}
    for folder in sorted(PROJECTS.glob("repositorio-*")):
        if not (folder / "configuracion.js").exists():
            continue
        remote = subprocess.run(["git", "-C", str(folder), "remote", "get-url", "origin"],
                                capture_output=True, text=True).stdout.strip()
        match = re.search(r"/([^/]+?)(?:\.git)?$", remote)
        if match:
            found[match.group(1)] = folder
    return found


def copy_tree(source, target, skip):
    for item in source.iterdir():
        if item.name in skip:
            continue
        destination = target / item.name
        if item.is_dir():
            shutil.copytree(item, destination, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        else:
            shutil.copy2(item, destination)


def build(dist):
    copy_tree(ROOT, dist, SKIP_MAIN)
    clients = client_repos()
    for name, folder in clients.items():
        if (dist / name).exists():
            raise RuntimeError(f"El cliente '{name}' choca con una carpeta de la tienda principal.")
        (dist / name).mkdir()
        copy_tree(folder, dist / name, SKIP_CLIENT)
    # Las imágenes para compartir (og:image) apuntan a la dirección nueva.
    for html in dist.rglob("*.html"):
        text = html.read_text(encoding="utf-8")
        if OLD_URL in text:
            html.write_text(text.replace(OLD_URL, NEW_URL), encoding="utf-8")
    return clients


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    dist = Path(tempfile.mkdtemp(prefix="mitiendastock-"))
    clients = build(dist)
    files = sum(1 for p in dist.rglob("*") if p.is_file())
    print(f"Armado en {dist}: tienda principal + {len(clients)} clientes ({', '.join(clients)}), {files} archivos.")
    if "--armar" in sys.argv:
        return 0
    env = dict(os.environ)
    if not env.get("CLOUDFLARE_API_TOKEN"):
        # Sesión de wrangler de esta PC ("wrangler login"): "auth token" la renueva si venció
        # (dura una hora) y devuelve la llave en la última línea.
        output = subprocess.run(["npx", "wrangler", "auth", "token"], capture_output=True, text=True,
                                shell=(sys.platform == "win32")).stdout.strip().splitlines()
        if output and re.fullmatch(r"[\w.-]{30,}", output[-1].strip()):
            env["CLOUDFLARE_API_TOKEN"] = output[-1].strip()
    env.setdefault("CLOUDFLARE_ACCOUNT_ID", ACCOUNT_ID)
    result = subprocess.run(["npx", "wrangler", "pages", "deploy", str(dist), "--project-name", PROJECT_NAME,
                             "--branch", "main", "--commit-dirty=true"], shell=(sys.platform == "win32"), env=env)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
