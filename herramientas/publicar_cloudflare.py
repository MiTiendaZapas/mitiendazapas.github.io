"""Publica TODAS las tiendas en Cloudflare Pages (mitiendastock.com).

Junta en una carpeta:
  - una portada neutra en la raíz (herramientas/portada.html) y /motor/ para todas las tiendas
  - la tienda de L.A IMP (este repositorio) en /laimp/: /laimp, /laimp/mayorista, /laimp/talles...
  - cada tienda de cliente (carpetas ../repositorio-*) en /<nombre del repo de GitHub>/

y la sube con wrangler al proyecto "mitiendastock". El stock y las fotos NO van acá:
viven en el depósito R2 (catalogo.mitiendastock.com) y los sube el piloto.

Uso (desde la carpeta del proyecto):
    bash herramientas/publicar_cloudflare.sh              publica (toma la llave de "wrangler login")
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
MAIN_STORE = "laimp"   # la tienda de L.A IMP: mitiendastock.com/laimp (y /laimp/mayorista)
# Páginas de la tienda de L.A IMP (carpetas con su index.html), para redirigir los links viejos.
MAIN_PAGES = ["mayorista", "como-comprar", "talles", "envios", "cambios", "preguntas", "nosotros", "revender", "paginas"]

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
    # La tienda de L.A IMP va en /laimp/ (entera: sus rutas son relativas). La raíz es una
    # portada neutra: quien corta el link de un cliente no llega a la tienda ni a los precios
    # de L.A IMP. /motor/ también va en la raíz, porque lo usan las tiendas de clientes.
    main_store = dist / MAIN_STORE
    main_store.mkdir()
    copy_tree(ROOT, main_store, SKIP_MAIN)
    shutil.copytree(ROOT / "motor", dist / "motor")
    shutil.copy2(ROOT / "herramientas" / "portada.html", dist / "index.html")
    # Links de mitiendastock.com que se usaron antes de mover la tienda a /laimp/ (09/10).
    redirects = [line for page in MAIN_PAGES for line in (
        f"/{page} /{MAIN_STORE}/{page}/ 301", f"/{page}/* /{MAIN_STORE}/{page}/:splat 301")]
    clients = client_repos()
    for name, folder in clients.items():
        if (dist / name).exists():
            raise RuntimeError(f"El cliente '{name}' choca con una carpeta ya usada.")
        (dist / name).mkdir()
        copy_tree(folder, dist / name, SKIP_CLIENT)
    # Cada página sin la barra final ("/emma") pasa a "/emma/" con un 301. Cloudflare lo hace
    # solo con un 308, que la vista previa de WhatsApp a veces no sigue (link sin imagen).
    pages = sorted({html.parent.relative_to(dist).as_posix() for html in dist.rglob("index.html")} - {"."})
    redirects += [f"/{page} /{page}/ 301" for page in pages]
    (dist / "_redirects").write_text("\n".join(redirects) + "\n", encoding="utf-8")
    # Las imágenes para compartir (og:image) apuntan a la dirección nueva.
    for html in dist.rglob("*.html"):
        text = html.read_text(encoding="utf-8")
        if OLD_URL in text:
            new_base = NEW_URL + MAIN_STORE + "/" if main_store in html.parents else NEW_URL
            html.write_text(text.replace(OLD_URL, new_base), encoding="utf-8")
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
        # El Python de la tienda de Windows no ve la sesión de wrangler: usar el .sh, que la pasa.
        print("Falta CLOUDFLARE_API_TOKEN: publicar con  bash herramientas/publicar_cloudflare.sh")
        return 1
    env.setdefault("CLOUDFLARE_ACCOUNT_ID", ACCOUNT_ID)
    result = subprocess.run(["npx", "wrangler", "pages", "deploy", str(dist), "--project-name", PROJECT_NAME,
                             "--branch", "main", "--commit-dirty=true"], shell=(sys.platform == "win32"), env=env)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
