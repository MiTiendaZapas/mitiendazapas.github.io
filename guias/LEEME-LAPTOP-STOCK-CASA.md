# Para la laptop: el stock de casa ahora se maneja desde la app (07/10)

Instrucciones para la sesión de Claude de la laptop. Todo en español, como
siempre con este usuario.

## Qué cambió

El **stock de casa** (los pares propios que no vienen del proveedor) ya no se
edita en el Panel Admin: se maneja desde **AppPedidos → pestaña "📦 Stock de casa"**
(https://mitiendazapas.github.io/AppPedidos/). Lo usan el usuario y su socio, también
desde el celular: botones − / + por talle, fotos, historial. Al marcar 🟢 un par en el
"modo depósito" de la app, se descuenta solo.

La fuente de verdad es **Firebase** (el mismo proyecto de la app de pedidos).
`zapatillas_manual.js` e `indumentaria.js` pasaron a ser un **espejo generado**, con el
mismo formato de siempre, así que el piloto, las tiendas y el bot siguen leyéndolos igual.

## 1. Piloto automático: no hay que tocar nada

El piloto ya baja el código nuevo de GitHub en cada vuelta (`start_cycle_sync`). Dos
archivos nuevos/cambiados en `sincronizador/`:

- `stock_casa_sync.py` (nuevo): baja el stock de Firebase y reescribe los dos `.js` de
  `TiendaZapasOficial/` (y copia a `Fotos/` las fotos nuevas que suba el socio).
- `manual_stock.py`: antes de leer los archivos llama a lo anterior.

Es solo librería estándar de Python (no hay nada que instalar) y no necesita la carpeta
`AppPedidos` en esta PC (si no está, baja la configuración pública de Firebase).

Comprobar después de una vuelta, en la ventana del piloto:
- Aparece `[stock de casa] Sin cambios (N modelos con stock).` o `🏠 Actualizado: zapatillas_manual.js ...`.
- Prueba manual sin escribir nada: desde `plataforma-zapas/`,
  `python sincronizador/stock_casa_sync.py --simular`
- Lo normal es que `zapatillas_manual.js` quede con un comentario de encabezado nuevo y que
  el piloto lo publique con "Stock de casa actualizado" (ya lo hacía con `HOUSE_STOCK_FILES`).

Seguridad (para no perder stock por un error):
- Si no hay internet, si Firebase falla o si la app todavía no fue migrada, **no se toca nada**
  y el piloto sigue con los archivos que haya. Nunca corta una vuelta.
- Antes de pisar un `.js` que cambia, deja una copia en `TiendaZapasOficial/Automatizacion/backups_stock/`
  (esa carpeta la ignora git; queda solo en esta PC).
- Los modelos **agotados (0 pares) y los eliminados no se escriben**: desaparecen del catálogo de casa.
  Es a propósito: es lo que ve la tienda.

## 2. Los `.js` de stock de casa: no editarlos a mano

Se pisan en la siguiente vuelta. Todo cambio de cantidades, modelos o fotos se hace en la app.

Si en esta laptop también está el **Panel Admin** (`automatizacion/panel_admin/app.py`), que sus pestañas
de stock no se usen para guardar: lo que se guarde ahí se perdería sin aviso. En la otra PC se bloqueó con
`STOCK_EN_APP = True` (devuelve error 409 en `api_stock_save` y `api_stock_delete`). Esa carpeta no viaja por
git, así que si se usa acá, hay que aplicar lo mismo a mano (o simplemente no usar esas pestañas).
El resto del panel (fotos del catálogo) se puede seguir usando.

## 3. Bot de WhatsApp (`automatizacion/bot_whatsapp.py`)

Sigue leyendo `zapatillas_manual.js` como siempre: no hay que cambiar nada. Lo único distinto es lo
de arriba: un modelo sin stock ya no aparece en el archivo.

## Si algo no anda

- `[stock de casa] ⚠️ No se pudo traer el stock de la app (...)`: sin internet o Firebase caído.
  No es grave; reintenta solo en la próxima vuelta.
- El stock de la tienda no refleja un cambio del socio: esperar una vuelta del piloto
  (los cambios llegan en cada vuelta, no al instante).
- Para volver atrás un archivo: copiar el que corresponda desde `Automatizacion/backups_stock/`.
