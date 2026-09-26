"""Descargas HTTP con reintentos y pausa entre pedidos (solo librería estándar)."""
import time
import urllib.request

import settings

_last_request = 0.0


def _throttle():
    global _last_request
    wait = settings.REQUEST_DELAY_SEC - (time.monotonic() - _last_request)
    if wait > 0:
        time.sleep(wait)
    _last_request = time.monotonic()


def fetch_bytes(url, retries=3):
    if url.startswith("//"):
        url = "https:" + url
    request = urllib.request.Request(url, headers={"User-Agent": settings.USER_AGENT})
    for attempt in range(1, retries + 1):
        _throttle()
        try:
            with urllib.request.urlopen(request, timeout=settings.REQUEST_TIMEOUT_SEC) as response:
                return response.read()
        except Exception:
            if attempt == retries:
                raise
            time.sleep(5 * attempt)


def fetch_text(url):
    return fetch_bytes(url).decode("utf-8", errors="replace")
