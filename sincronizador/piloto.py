"""Piloto automático: actualiza el catálogo cada 15-20 minutos y lo publica.

Reemplaza a Automatizacion/piloto_automatico.py de la tienda anterior, con el
mismo comportamiento de fondo:
  - descansa de 00:00 a 07:30 (no consulta al proveedor de noche),
  - si el proveedor falla, espera más antes de reintentar,
  - reintenta git si se corta internet un momento.

Todo lo que muestra queda también en sincronizador/informes/piloto.log, para
poder copiar texto (la ventana no permite seleccionar: un clic la pausaría).

Uso:
    python sincronizador/piloto.py                 actualiza en la PC, SIN publicar (para probar)
    python sincronizador/piloto.py --publicar      actualiza y sube a GitHub (uso normal en la laptop)
    python sincronizador/piloto.py --una-vez       hace un solo ciclo y termina

Qué sube y adónde:
  - el catálogo (catalogo/) a ESTE repositorio (mitiendazapas.github.io), del que
    leen todas las tiendas, también las de los clientes;
  - el stock de casa del Panel Admin (zapatillas_manual.js, indumentaria.js y
    Fotos/) al repositorio de la tienda anterior (TiendaZapasOficial), donde lo
    guarda el Panel Admin, por si se editó y no se tocó "Publicar".
Antes de cada vuelta trae lo último de los dos repositorios.
"""
import argparse
import os
import random
import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

SYNC_DIR = Path(__file__).resolve().parent
ROOT = SYNC_DIR.parent
sys.path.insert(0, str(SYNC_DIR))
from settings import LEGACY_REPO  # noqa: E402  (repositorio donde el Panel Admin guarda el stock de casa)
PID_FILE = SYNC_DIR / "estado" / "piloto.pid"
LOG_FILE = SYNC_DIR / "informes" / "piloto.log"
LOG_MAX_BYTES = 2_000_000

WAIT_MIN_MINUTES = 15
WAIT_MAX_MINUTES = 20
WAIT_AFTER_FAILURE_MINUTES = 30
# Descanso nocturno (igual que el piloto de la laptop): de 00:00 a 07:30.
# Termina 7:30 para que a las 8, cuando se usa el bot de WhatsApp, ya estén
# las novedades del día.
REST_START_MINUTE = 0          # 00:00
REST_END_MINUTE = 7 * 60 + 30  # 07:30

# Qué se sube a GitHub en cada ciclo (lo que no exista se saltea).
FILES_TO_PUBLISH = ["catalogo"]                                          # a este repositorio
HOUSE_STOCK_FILES = ["zapatillas_manual.js", "indumentaria.js", "Fotos"]  # a TiendaZapasOficial


def disable_quick_edit():
    """En Windows, un clic en la consola pausa el proceso ("QuickEdit"). Se desactiva
    porque el piloto corre solo durante horas; para copiar texto está el archivo piloto.log."""
    if os.name != "nt":
        return
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetStdHandle(-10)
        mode = ctypes.c_uint32()
        if kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
            kernel32.SetConsoleMode(handle, (mode.value & ~0x0040) | 0x0080)
    except Exception:
        pass


def write_log_file(line):
    """Copia cada línea (con fecha) a piloto.log. Si crece mucho, se guarda el anterior como .old."""
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        if LOG_FILE.exists() and LOG_FILE.stat().st_size > LOG_MAX_BYTES:
            LOG_FILE.replace(LOG_FILE.with_suffix(".log.old"))
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {line}\n")
    except OSError:
        pass   # si el archivo está tomado un instante, no se frena el piloto


def log(message):
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)
    write_log_file(message)


def seconds_until_rest_ends():
    now = time.localtime()
    minute_of_day = now.tm_hour * 60 + now.tm_min
    if not (REST_START_MINUTE <= minute_of_day < REST_END_MINUTE):
        return 0
    return REST_END_MINUTE * 60 - (minute_of_day * 60 + now.tm_sec)


def git(*args, retries=3, check=True, repo=ROOT):
    """Corre un comando de git en un repositorio, con reintentos por cortes de internet."""
    for attempt in range(1, retries + 1):
        result = subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True, encoding="utf-8")
        if result.returncode == 0 or not check:
            return result
        if attempt == retries:
            raise RuntimeError(f"git {' '.join(args)} falló: {result.stderr.strip() or result.stdout.strip()}")
        log(f"⚠️ git {args[0]} falló (intento {attempt}/{retries}), reintento en 15 s...")
        time.sleep(15)


def bring_latest(repo):
    """Trae lo que haya llegado a GitHub y deja los commits propios encima.
    --autostash guarda un momento cualquier otro cambio sin subir (sin eso, git se
    niega a combinar si hay algún archivo modificado en la carpeta)."""
    result = git("pull", "--rebase", "--autostash", "origin", "HEAD", check=False, repo=repo)
    if result.returncode != 0:
        git("rebase", "--abort", check=False, repo=repo)
        raise RuntimeError("No se pudo combinar con lo último de GitHub; se reintenta en el próximo ciclo.")


def has_unpushed_commits(repo):
    """True si hay commits guardados acá que todavía no están en GitHub (por ejemplo,
    de una vuelta anterior que no pudo subir)."""
    git("fetch", "origin", check=False, repo=repo)
    ahead = git("rev-list", "--count", "@{upstream}..HEAD", check=False, repo=repo)
    return ahead.returncode == 0 and ahead.stdout.strip() not in ("", "0")


def publish(repo=ROOT, files=FILES_TO_PUBLISH, message="Catálogo actualizado"):
    """Sube esos archivos si cambiaron (o si quedó algo sin subir de una vuelta
    anterior). Devuelve True si se subió algo."""
    existing = [name for name in files if (repo / name).exists()]
    if existing:
        git("add", "--all", "--", *existing, repo=repo)
    changed = bool(existing) and git("diff", "--cached", "--quiet", check=False, repo=repo).returncode != 0
    if changed:
        git("commit", "-m", f"{message} a las {time.strftime('%H:%M')}", retries=1, repo=repo)
    elif not has_unpushed_commits(repo):
        return False   # sin cambios y nada pendiente

    # El escaneo puede tardar hasta ~45 minutos: justo antes de subir se trae lo que
    # haya llegado mientras tanto (Panel Admin, cambios de la tienda, la otra PC).
    bring_latest(repo)
    push = git("push", "origin", "HEAD", check=False, repo=repo)
    if push.returncode != 0:
        # Alguien subió algo en estos segundos: se trae otra vez y se reintenta.
        bring_latest(repo)
        git("push", "origin", "HEAD", repo=repo)
    return True


def update_house_stock_repo():
    """Trae el stock de casa publicado desde otra PC. Si falla, se usa el que ya está en esta PC."""
    if not (LEGACY_REPO / ".git").exists():
        log(f"⚠️ No encontré {LEGACY_REPO}: se usa el stock de casa que haya en esta PC.")
        return
    result = git("pull", "--rebase", "--autostash", "origin", "HEAD", check=False, repo=LEGACY_REPO)
    if result.returncode != 0:
        git("rebase", "--abort", check=False, repo=LEGACY_REPO)
        log("⚠️ No se pudo traer el stock de casa de GitHub; se usa el que hay en esta PC.")


def run_cycle(publish_enabled):
    """Un ciclo: (traer lo último) -> sincronizar -> (publicar). Devuelve True si salió bien."""
    if publish_enabled:
        # Trae lo último de GitHub de los dos repositorios (por ejemplo, stock de casa
        # publicado desde otra PC). --autostash guarda un momento los cambios sin publicar.
        git("pull", "--rebase", "--autostash", "origin", "HEAD")
        update_house_stock_repo()
    # Se muestra lo que va haciendo el sincronizador y se copia también a piloto.log.
    process = subprocess.Popen([sys.executable, str(SYNC_DIR / "sync_catalog.py")], cwd=ROOT,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
    for line in process.stdout:
        print(line, end="", flush=True)
        write_log_file(line.rstrip())
    if process.wait() != 0:
        log("⚠️ La sincronización no se completó; el catálogo publicado queda como estaba.")
        return False
    if publish_enabled:
        log("🔄 Catálogo publicado en GitHub." if publish() else "⏸️ Sin cambios de stock.")
        if (LEGACY_REPO / ".git").exists() and publish(LEGACY_REPO, HOUSE_STOCK_FILES, "Stock de casa actualizado"):
            log("🏠 Stock de casa (Panel Admin) publicado.")
    else:
        log("✅ Catálogo actualizado en esta PC (sin publicar: falta --publicar).")
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--publicar", action="store_true", help="subir el catálogo a GitHub")
    parser.add_argument("--una-vez", action="store_true", help="hacer un solo ciclo y terminar")
    args = parser.parse_args()

    disable_quick_edit()
    PID_FILE.parent.mkdir(parents=True, exist_ok=True)
    PID_FILE.write_text(str(os.getpid()), encoding="utf-8")
    log(f"🤖 Piloto automático ({'publica en GitHub' if args.publicar else 'SIN publicar'}) en {ROOT}")

    try:
        while True:
            rest = seconds_until_rest_ends()
            if rest and not args.una_vez:
                log(f"😴 Horario de descanso (00:00-07:30). Durmiendo {rest / 3600:.1f} h.")
                time.sleep(rest)
                continue

            try:
                ok = run_cycle(args.publicar)
            except Exception as error:
                log(f"❌ Error: {error}")
                ok = False

            if args.una_vez:
                return 0 if ok else 1
            minutes = random.uniform(WAIT_MIN_MINUTES, WAIT_MAX_MINUTES) if ok else WAIT_AFTER_FAILURE_MINUTES
            log(f"Próxima actualización en {minutes:.0f} minutos.")
            time.sleep(minutes * 60)
    finally:
        PID_FILE.unlink(missing_ok=True)


if __name__ == "__main__":
    sys.exit(main())
