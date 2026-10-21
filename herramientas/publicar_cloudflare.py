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
    bash herramientas/publicar_cloudflare.sh --prueba     sube a un link de PRUEBA
        (https://prueba.mitiendastock.pages.dev), nunca a mitiendastock.com. Suma las
        tiendas de prueba sin GitHub (../repositorio-demo-br). Usa los mismos depósitos.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
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
             "README.md", ".nojekyll", ".gitignore", "node_modules", "__pycache__",
             # El programa del panel no se publica como archivo: wrangler lo arma desde functions/.
             "functions", "servidor", "wrangler.toml", ".dev.vars", ".wrangler", "dist"}
SKIP_CLIENT = {".git", "LEEME.md", ".gitignore", ".nojekyll"}


TEST_STORES = ["demo-br"]   # tiendas de prueba (sin GitHub): solo van al link de prueba
TEST_BRANCH = "prueba"
# Prueba de la tienda de L.A IMP con panel (stock de casa en el panel, 20/10): la misma tienda,
# en /laimp-panel/, con el catálogo que arma el panel de "laimp". Solo en el link de prueba.
MAIN_PANEL_TEST = "laimp-panel"
# True: la tienda real de L.A IMP (/laimp/) ya es tienda con panel (el stock de casa se maneja ahí).
MAIN_STORE_PANEL = True
# True: todas las tiendas de clientes son tiendas con panel (22/10): su catálogo lo arma el panel
# (stock de Brasil con los precios de su lista de siempre) y cada cliente maneja su tienda solo.
# Antes hay que activarlas con herramientas/activar_stock_br.mjs y crearles usuario.
CLIENT_PANELS = True
PANEL_PAGE = """<!DOCTYPE html>
<html lang="es-AR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Panel · {name}</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="apple-touch-icon" href="/motor/panel/icono-192.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Mi panel">
  <meta name="theme-color" content="#f5f5f3">
  <script>document.write('<script src="../configuracion.js?t=' + Math.floor(Date.now() / 60000) + '"><\/script>');</script>
  <script src="/motor/js/theme.js"></script>
  <link rel="stylesheet" href="/motor/css/tienda.css">
  <link rel="stylesheet" href="/motor/panel/panel.css">
  <script type="module" src="/motor/panel/panel.js"></script>
</head>
<body class="panel-page">
  <header class="panel-top" id="panel-top"></header>
  <main class="panel-main" id="panel"></main>
  <div class="panel-toast" id="panel-toast" role="status" aria-live="polite"></div>
  <noscript><p class="noscript">Para usar el panel necesitás activar JavaScript.</p></noscript>
</body>
</html>
"""
PANEL_MANIFEST = {"name": "", "short_name": "Mi panel", "start_url": "./", "scope": "./", "display": "standalone",
                  "background_color": "#111113", "theme_color": "#111113", "lang": "es-AR", "icons": [
                      {"src": "/motor/panel/icono-192.png", "sizes": "192x192", "type": "image/png"},
                      {"src": "/motor/panel/icono-512.png", "sizes": "512x512", "type": "image/png"},
                      {"src": "/motor/panel/icono-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}


# App de pedidos de L.A IMP (../AppPedidos) en /pedidos/: así puede descontar el stock de casa
# en el panel de la tienda con la misma sesión (ver AppPedidos/stock-panel.js).
ORDERS_APP = PROJECTS / "AppPedidos"
SKIP_ORDERS_APP = {".git", ".claude", ".gitignore", "README.md"}


def add_panel(folder, store_id, name):
    """Convierte una tienda en tienda con panel: su catálogo lo arma el panel de store_id."""
    config = folder / "configuracion.js"
    text = config.read_text(encoding="utf-8")
    new = re.sub(r'^(\s*)id:\s*"[^"]*",', lambda m: f'{m.group(0)}\n{m.group(1)}manualStore: "{store_id}",', text, count=1, flags=re.M)
    if new == text:
        raise RuntimeError(f"No se encontró el id en {config}")
    config.write_text(new, encoding="utf-8")
    (folder / "panel").mkdir(exist_ok=True)
    page = PANEL_PAGE.replace("{name}", name)
    manifest = {**PANEL_MANIFEST, "name": f"Panel · {name}"}
    # Con logo, el panel usa el logo de la tienda como ícono (pestaña del navegador, app instalada
    # en el celular e iPhone), con un nombre de nuevo archivo (si no, los celulares muestran el viejo).
    icons = panel_icons(folder)
    if icons:
        page = page.replace('<link rel="apple-touch-icon" href="/motor/panel/icono-192.png">',
                            f'<link rel="apple-touch-icon" href="{icons["180"]}">\n'
                            f'  <link rel="icon" type="image/png" sizes="32x32" href="{icons["32"]}">\n'
                            f'  <link rel="icon" type="image/png" sizes="192x192" href="{icons["192"]}">')
        manifest["short_name"] = name[:12]
        manifest["icons"] = [
            {"src": icons["192"], "sizes": "192x192", "type": "image/png"},
            {"src": icons["512"], "sizes": "512x512", "type": "image/png"},
            {"src": icons["512m"], "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ]
    (folder / "panel" / "index.html").write_text(page, encoding="utf-8")
    (folder / "panel" / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def panel_icons(folder):
    """Íconos del panel hechos con el logo de la tienda (marca/logo-…512.*). {} si no tiene logo."""
    # "logo-512.webp" (L.A IMP) o "logo-<tienda>-512.webp" (tiendas de clientes).
    logo = next((path for pattern in ("logo-512.*", "logo-*-512.*") for path in sorted((folder / "marca").glob(pattern))
                 if path.suffix.lower() in (".webp", ".png", ".jpg")), None)
    if not logo:
        return {}
    from PIL import Image
    import hashlib
    code = hashlib.sha1(logo.read_bytes()).hexdigest()[:8]
    source = Image.open(logo).convert("RGBA")
    out = {}
    # Pestaña del navegador (32) y app de Android (192, 512): transparentes, solo el logo.
    # iPhone (180) y el recortado en círculo (512m): con fondo blanco (ahí lo transparente se ve negro o mal).
    for key, size, pad, white in (("32", 32, 0, False), ("180", 180, 0, True), ("192", 192, 0, False),
                                  ("512", 512, 0, False), ("512m", 512, 0.12, True)):
        canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255 if white else 0))
        inner = round(size * (1 - 2 * pad))
        logo_img = source.copy()
        logo_img.thumbnail((inner, inner), Image.LANCZOS)
        canvas.alpha_composite(logo_img, ((size - logo_img.width) // 2, (size - logo_img.height) // 2))
        # "t": nombre nuevo para que los celulares y navegadores no sigan mostrando el de fondo blanco.
        name = f"icono-{key}-{code}{'' if white else 't'}.png"
        (canvas.convert("RGB") if white else canvas).save(folder / "panel" / name, "PNG", optimize=True)
        out[key] = name
    return out


def client_repos(test=False):
    """{nombre en el link: carpeta} de cada tienda de cliente, según su repositorio de GitHub."""
    found = {}
    if test:
        for name in TEST_STORES:
            if (PROJECTS / f"repositorio-{name}" / "configuracion.js").exists():
                found[name] = PROJECTS / f"repositorio-{name}"
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


NOT_FOUND_PAGE = """<!DOCTYPE html>
<html lang="es-AR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Página no encontrada</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f5f5f3;color:#18181b;text-align:center;padding:24px}
@media (prefers-color-scheme:dark){body{background:#111113;color:#f4f4f5}}h1{font-size:24px;margin:0 0 8px}p{margin:0 0 20px;opacity:.75}
a{display:inline-block;padding:12px 20px;border-radius:999px;background:currentColor}a span{color:#f5f5f3;font-weight:600}@media (prefers-color-scheme:dark){a span{color:#111113}}</style>
</head><body><main><h1>No encontramos esta página</h1><p>Puede que el link esté mal escrito o que la página ya no exista.</p>
<a href="javascript:history.back()"><span>Volver</span></a></main></body></html>
"""

PAGE_FILE = re.compile(r'((?:href|src)=")((?!https?:|//)[^"?#]+\.(?:css|js))"')
JS_IMPORT = re.compile(r'''((?:\bfrom|\bimport)\s*\(?\s*)(["'])(\.{1,2}/[^"'?]+\.js)\2''')
CSS_IMPORT = re.compile(r'''(@import url\(")([^"?]+\.css)"''')


def add_version(dist):
    """Agrega "?v=<publicación>" a cada estilo y programa de las tiendas.

    Cloudflare les dice a los celulares que guarden estos archivos 4 horas: sin esto,
    después de publicar un cambio la gente seguía viendo la tienda vieja. Con un
    número nuevo en cada publicación, el celular baja la versión nueva al toque.
    """
    version = str(int(time.time()))
    for path in dist.rglob("*"):
        if path.suffix not in {".html", ".js", ".css"} or not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        if path.suffix == ".html":
            new = PAGE_FILE.sub(rf'\1\2?v={version}"', text)
        elif path.suffix == ".js":
            new = JS_IMPORT.sub(rf"\1\2\3?v={version}\2", text)
        else:
            new = CSS_IMPORT.sub(rf'\1\2?v={version}"', text)
        if new != text:
            path.write_text(new, encoding="utf-8")


def build(dist, test=False):
    # La tienda de L.A IMP va en /laimp/ (entera: sus rutas son relativas). La raíz es una
    # portada neutra: quien corta el link de un cliente no llega a la tienda ni a los precios
    # de L.A IMP. /motor/ también va en la raíz, porque lo usan las tiendas de clientes.
    main_store = dist / MAIN_STORE
    main_store.mkdir()
    copy_tree(ROOT, main_store, SKIP_MAIN)
    shutil.copytree(ROOT / "motor", dist / "motor")
    shutil.copy2(ROOT / "herramientas" / "portada.html", dist / "index.html")
    # Catálogos para compartir: el stock sin precios ni nombre de tienda.
    # /catalogo/ es el stock de L.A IMP; /catalogo/fo/ el de la tienda de Fabri (sin stock de casa).
    page = (ROOT / "herramientas" / "catalogo.html").read_text(encoding="utf-8")
    for folder, stock in (("catalogo", "laimp"), ("catalogo/fo", "fo")):
        (dist / folder).mkdir(parents=True)
        (dist / folder / "index.html").write_text(page.replace('data-stock="laimp"', f'data-stock="{stock}"'), encoding="utf-8")
    # Sin 404.html, Cloudflare responde la portada (con "todo bien") a cualquier archivo que
    # no existe. Si un celular pedía un estilo nuevo justo mientras se publicaba, se quedaba
    # horas con esa portada en vez del estilo y la tienda se veía sin diseño.
    (dist / "404.html").write_text(NOT_FOUND_PAGE, encoding="utf-8")
    # Links de mitiendastock.com que se usaron antes de mover la tienda a /laimp/ (09/10).
    redirects = [line for page in MAIN_PAGES for line in (
        f"/{page} /{MAIN_STORE}/{page}/ 301", f"/{page}/* /{MAIN_STORE}/{page}/:splat 301")]
    if MAIN_STORE_PANEL:
        add_panel(main_store, MAIN_STORE, "L.A IMP")
    elif test:
        shutil.copytree(main_store, dist / MAIN_PANEL_TEST)
        add_panel(dist / MAIN_PANEL_TEST, MAIN_STORE, "L.A IMP")
    if ORDERS_APP.exists():
        (dist / "pedidos").mkdir()
        copy_tree(ORDERS_APP, dist / "pedidos", SKIP_ORDERS_APP)
    clients = client_repos(test)
    for name, folder in clients.items():
        if (dist / name).exists():
            raise RuntimeError(f"El cliente '{name}' choca con una carpeta ya usada.")
        (dist / name).mkdir()
        copy_tree(folder, dist / name, SKIP_CLIENT)
        text = (dist / name / "configuracion.js").read_text(encoding="utf-8")
        if CLIENT_PANELS and not re.search(r"^\s*manualStore:", text, re.M):
            title = re.search(r'^\s*name:\s*"([^"]+)"', text, re.M)
            add_panel(dist / name, name, title.group(1) if title else name)
    # Cada página sin la barra final ("/emma") pasa a "/emma/" con un 301. Cloudflare lo hace
    # solo con un 308, que la vista previa de WhatsApp a veces no sigue (link sin imagen).
    pages = sorted({html.parent.relative_to(dist).as_posix() for html in dist.rglob("index.html")} - {"."})
    redirects += [f"/{page} /{page}/ 301" for page in pages]
    # El panel de prueba de L.A IMP (/laimp-panel/) ya no existe: L.A IMP usa el panel real.
    # Quien lo tenga guardado en el celular va directo al de mitiendastock.com (siempre al día).
    if MAIN_STORE_PANEL and test:
        redirects.insert(0, f"/{MAIN_PANEL_TEST}/* {NEW_URL}{MAIN_STORE}/:splat 302")
        redirects.insert(0, f"/{MAIN_PANEL_TEST} {NEW_URL}{MAIN_STORE}/panel/ 302")
    (dist / "_redirects").write_text("\n".join(redirects) + "\n", encoding="utf-8")
    # El programa de fondo del panel (para instalarlo en el celular) vive en /motor/panel/ pero
    # atiende el panel de cada tienda (/<tienda>/panel/): Cloudflare tiene que permitirlo.
    (dist / "_headers").write_text(
        "/motor/panel/sw.js\n  Service-Worker-Allowed: /\n  Cache-Control: no-cache\n", encoding="utf-8")
    # El programa del panel (functions/) corre SOLO en /api/ y en la portada de las tiendas
    # con stock propio (para poner su nombre y logo al compartir). El resto se entrega directo.
    manual = [name for name in clients
              if re.search(r"^\s*manualStore:", (dist / name / "configuracion.js").read_text(encoding="utf-8"), re.M)]
    if MAIN_STORE_PANEL:
        manual.append(MAIN_STORE)
    elif test:
        manual.append(MAIN_PANEL_TEST)
    routes = {"version": 1, "include": ["/api/*"] + [f"/{name}/" for name in manual], "exclude": []}
    (dist / "_routes.json").write_text(json.dumps(routes, indent=2) + "\n", encoding="utf-8")
    add_version(dist)
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
    test = "--prueba" in sys.argv
    clients = build(dist, test)
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
    branch = TEST_BRANCH if test else "main"
    if test:
        print(f"PRUEBA: se sube a https://{TEST_BRANCH}.{PROJECT_NAME}.pages.dev (las tiendas reales no cambian).")
    result = subprocess.run(["npx", "wrangler", "pages", "deploy", str(dist), "--project-name", PROJECT_NAME,
                             "--branch", branch, "--commit-dirty=true"], shell=(sys.platform == "win32"), env=env)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
