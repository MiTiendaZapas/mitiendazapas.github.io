"""Piloto automático: actualiza el catálogo cada 15-20 minutos y lo publica.

Reemplaza a Automatizacion/piloto_automatico.py de la tienda actual, con el
mismo comportamiento de fondo:
  - descansa de 00:00 a 08:00 (no consulta al proveedor de noche),
  - si el proveedor falla, espera más antes de reintentar,
  - reintenta git si se corta internet un momento.

Todo lo que muestra queda también en sincronizador/informes/piloto.log, para
poder copiar texto (la ventana no permite seleccionar: un clic la pausaría).

Uso:
    python sincronizador/piloto.py                 actualiza en la PC, SIN publicar (para probar)
    python sincronizador/piloto.py --publicar      actualiza y sube a GitHub (uso normal en la laptop)
    python sincronizador/piloto.py --una-vez       hace un solo ciclo y termina

Sube lo mismo que el piloto de siempre: el catálogo y, si hay cambios, el
stock de casa del Panel Admin (zapatillas_manual.js, indumentaria.js y Fotos/),
por si se editó y no se tocó "Publicar".
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
FILES_TO_PUBLISH = ["catalogo", "zapatillas_manual.js", "indumentaria.js", "Fotos"]


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


def git(*args, retries=3, check=True):
    """Corre un comando de git en la carpeta de la tienda, con reintentos por cortes de internet."""
    for attempt in range(1, retries + 1):
        result = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
        if result.returncode == 0 or not check:
            return result
        if attempt == retries:
            raise RuntimeError(f"git {' '.join(args)} falló: {result.stderr.strip() or result.stdout.strip()}")
        log(f"⚠️ git {args[0]} falló (intento {attempt}/{retries}), reintento en 15 s...")
        time.sleep(15)


def publish():
    """Sube el catálogo (y el stock de casa) si cambió. Devuelve True si hubo algo nuevo."""
    existing = [name for name in FILES_TO_PUBLISH if (ROOT / name).exists()]
    git("add", "--all", "--", *existing)
    if not git("diff", "--cached", "--quiet", check=False).returncode:
        return False   # sin cambios
    git("commit", "-m", f"Catálogo actualizado a las {time.strftime('%H:%M')}", retries=1)
    push = git("push", "origin", "HEAD", check=False)
    if push.returncode != 0:
        # Alguien más subió algo (por ejemplo, el Panel Admin): se trae y se reintenta.
        rebase = git("pull", "--rebase", "origin", "HEAD", check=False)
        if rebase.returncode != 0:
            git("rebase", "--abort", check=False)
            raise RuntimeError("No se pudo combinar con lo último de GitHub; se reintenta en el próximo ciclo.")
        git("push", "origin", "HEAD")
    return True


def run_cycle(publish_enabled):
    """Un ciclo: (traer lo último) -> sincronizar -> (publicar). Devuelve True si salió bien."""
    if publish_enabled:
        # Trae lo último de GitHub (por ejemplo, stock de casa publicado desde otra PC).
        # --autostash guarda un momento los cambios sin publicar del Panel Admin.
        git("pull", "--rebase", "--autostash", "origin", "HEAD")
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
