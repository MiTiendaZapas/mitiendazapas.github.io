"""Visitas de las tiendas en mitiendastock.com (datos de Cloudflare, plan gratis).

Cuenta solo personas: aperturas de páginas desde un navegador, sin robots ni las
visitas de esta PC. Aparte cuenta las "vistas previas" de WhatsApp/Instagram/Facebook
(cada vez que alguien pega el link en un chat, ese servicio abre la página una vez).

Uso:  bash herramientas/estadisticas.sh [días]   (por defecto 7; Cloudflare guarda pocos días)
"""
import json
import os
import re
import sys
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

ZONE = "3de529833a67d99ace55e8a889916f19"
ARGENTINA = timezone(timedelta(hours=-3))
BOTS = re.compile(r"bot|crawl|spider|slurp|curl|python|wget|headless|lighthouse|preview|scan|http", re.I)
PREVIEWS = {"WhatsApp": "WhatsApp", "facebookexternalhit": "Facebook/Instagram", "Instagram": "Facebook/Instagram",
            "TelegramBot": "Telegram", "Twitterbot": "X"}
STORES = {"portada", "laimp", "laimp/mayorista", "fo", "fo/mayorista", "importalestore", "emma",
          "erii-importados", "importados-more", "deuna-imp", "importados-flor"}
DAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def query(token, since, until):
    gql = """{ viewer { zones(filter:{zoneTag:"%s"}) { httpRequestsAdaptiveGroups(limit:10000,
      filter:{datetime_geq:"%s", datetime_lt:"%s", edgeResponseContentTypeName:"html", edgeResponseStatus:200}) {
      count dimensions { clientRequestPath clientIP userAgent clientCountryName datetimeHour } } } } }""" % (ZONE, since, until)
    request = urllib.request.Request("https://api.cloudflare.com/client/v4/graphql", json.dumps({"query": gql}).encode(),
                                     {"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    data = json.load(urllib.request.urlopen(request, timeout=60))
    if data.get("errors"):
        raise RuntimeError(data["errors"])
    return data["data"]["viewer"]["zones"][0]["httpRequestsAdaptiveGroups"]


def store_of(path):
    parts = [p for p in path.split("/") if p]
    if not parts:
        return "portada"
    if parts[0] == "laimp" or parts[0] == "fo":
        return "/".join(parts[:2]) if len(parts) > 1 and parts[1] == "mayorista" else parts[0]
    return parts[0]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    token = os.environ["CLOUDFLARE_API_TOKEN"]
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 7
    mine = set(filter(None, os.environ.get("IPS_PROPIAS", "").split()))
    now = datetime.now(timezone.utc)
    rows = []
    for day in range(days, 0, -1):   # de a un día, para no pasar el límite de filas
        start = (now - timedelta(days=day)).strftime("%Y-%m-%dT%H:%M:%SZ")
        end = (now - timedelta(days=day - 1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        try:
            rows += query(token, start, end)
        except RuntimeError:
            pass   # días más viejos que lo que guarda Cloudflare

    visits, people, phone, hours, weekdays = Counter(), defaultdict(set), Counter(), Counter(), Counter()
    shares = defaultdict(Counter)
    first = None
    for row in rows:
        d, n = row["dimensions"], row["count"]
        ua, path = d["userAgent"] or "", d["clientRequestPath"]
        if not (path.endswith("/") or path.endswith(".html")):
            continue
        store = store_of(path)
        if store not in STORES:
            continue   # robots que buscan puntos débiles (wp-admin, .php...)
        preview = next((name for key, name in PREVIEWS.items() if key in ua), None)
        if preview:
            shares[store][preview] += n
            continue
        # Los clientes son de Argentina: lo de otros países son casi siempre robots disfrazados.
        if (d["clientIP"] in mine or not ua.startswith("Mozilla/") or BOTS.search(ua)
                or d["clientCountryName"] != "AR"):
            continue
        when = datetime.fromisoformat(d["datetimeHour"].replace("Z", "+00:00")).astimezone(ARGENTINA)
        first = min(first or when, when)
        visits[store] += n
        people[store].add(d["clientIP"])
        phone["celular" if re.search(r"Mobile|Android|iPhone", ua) else "computadora"] += n
        hours[when.hour] += n
        weekdays[DAYS[when.weekday()]] += n

    report = {
        "desde": first.strftime("%d/%m %H:%M") if first else None,
        "tiendas": [{"tienda": s, "aperturas": visits[s], "personas": len(people[s]), "compartido": dict(shares[s])}
                    for s in sorted(set(visits) | set(shares), key=lambda s: -visits[s])],
        "personas_total": len(set().union(*people.values())) if people else 0,
        "equipo": dict(phone),
        "horas": dict(sorted(hours.items())), "dias": dict(weekdays),
    }
    print(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
