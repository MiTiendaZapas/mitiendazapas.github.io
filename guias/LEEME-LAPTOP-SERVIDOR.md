# La laptop servidor: qué corre, dónde, y qué se corrigió (07/10)

Para la otra sesión de Claude (la de la PC principal). Todo en español, como siempre con este usuario.

La sesión de la laptop **maneja todo lo que corre en la laptop**: el piloto y el bot de WhatsApp.
Si necesitás algo de ahí, pedíselo al usuario o dejalo escrito en `guias/`; no hace falta que lo toques vos.

## 1. Qué es la laptop

Windows, siempre prendida y enchufada, con la tapa cerrada = "no hacer nada". Con sesión iniciada (puede
estar bloqueada). Corre dos programas, que arrancan solos al iniciar sesión (accesos directos en la carpeta
Inicio de Windows):

| Programa | Qué hace | Dónde |
|---|---|---|
| **Piloto** `sincronizador/piloto.py --publicar` | Vuelta cada 10-15 min (antes 15-20; se bajó el 07/10): baja de GitHub, corre `sync_catalog.py`, publica `catalogo/` y el stock de casa. Descansa de 00:00 a 05:15. | `Desktop/mitiendazapas.github.io` |
| **Bot de WhatsApp** `automatizacion/bot_whatsapp.py` | Todos los días (menos domingos), a una hora al azar entre 05:45 y 06:10, manda el stock al grupo real. | `Desktop/tienda-zapatillas/automatizacion` |

Carpetas en el Escritorio de la laptop:
- `mitiendazapas.github.io` — este repo. **No renombrar**: el bot lee de ahí las fotos (`catalogo/fotos/...`).
- `tienda-zapatillas` — es el repo `TiendaZapasOficial` (stock de casa: `zapatillas_manual.js`, `indumentaria.js`,
  `Fotos/`) **y** el del bot. La carpeta se llama distinto que en la PC principal.
- `AppPedidos` — copia suelta de la app (no es un repo git). Solo se usa para leer `firebase-config.js`.

## 2. Qué se corrigió hoy

**Problema:** `stock_casa_sync.py` tenía escrito a mano `.../TiendaZapasOficial`. En la laptop esa carpeta no existe
(se llama `tienda-zapatillas`), así que al intentar escribir fallaba con `FileNotFoundError`, el sincronizador lo
atrapaba ("No se pudo traer el stock de la app… se usan los archivos que hay") y **el stock de la app nunca llegaba
a esta laptop**: `zapatillas_manual.js` seguía con el encabezado viejo del 28/09. El piloto no se rompía, pero el bot
y las tiendas habrían seguido con el stock de casa viejo.

**Cambios (commit de esta guía):**
1. `sincronizador/settings.py`: `LEGACY_REPO` ahora usa la primera carpeta que exista de
   `TiendaZapasOficial` / `tienda-zapatillas`. En la PC principal da lo mismo que antes. Esto reemplaza un
   cambio local suelto que tenía la laptop, que ya no hace falta.
2. `sincronizador/stock_casa_sync.py`: la carpeta sale de `settings.LEGACY_REPO` (se puede forzar con la variable
   `STOCK_CASA_REPO`, como antes). Si no se puede importar `settings`, vuelve al nombre de siempre.
3. Se corrió la sincronización una vez a mano: los dos `.js` quedaron "GENERADO desde AppPedidos" (10 modelos de
   zapatillas, 0 de indumentaria) y se guardó la copia de seguridad en `tienda-zapatillas/automatizacion/backups_stock/`.
   El piloto los publica en su próxima vuelta como "Stock de casa actualizado".

**Regla para cambios futuros:** nunca escribir `TiendaZapasOficial` a mano en el código; usar `settings.LEGACY_REPO`.

Cómo comprobarlo: en la ventana del piloto debe aparecer `[stock de casa] Sin cambios (N modelos con stock).` o
`🏠 Actualizado: ...`, y nunca `⚠️ No se pudo traer el stock de la app (FileNotFoundError ...)`.

Nota: en `zapatillas_manual.js` el modelo «Adidas forum Preto blanco» no tiene foto propia (`Fotos/...jpg` no existe).
No es problema porque también viene del proveedor y se usa la foto del proveedor.

**Intervalo del piloto:** `WAIT_MIN_MINUTES = 10` / `WAIT_MAX_MINUTES = 15` en `piloto.py`. Se bajó a pedido del usuario (antes 15-20) porque cada vuelta sin novedades dura ~7 s y el proveedor aguanta bien ese ritmo. No lo bajes de 10 sin hablarlo con el usuario: más pedidos aumentan la chance de que el proveedor limite o bloquee. El 07/10 el proveedor devolvió 503 de 11:08 a 12:39; el piloto conservó el catálogo y reintentó cada 30 min (`WAIT_AFTER_FAILURE_MINUTES`).

## 3. Cuándo hay que reiniciar el piloto

- Cambios en `sync_catalog.py`, `settings.py`, `stock_casa_sync.py`, `manual_stock.py`, `proveedores/*`:
  **no** (`sync_catalog.py` es un programa aparte que arranca de cero en cada vuelta y toma el código nuevo).
  Ojo: `piloto.py` guarda en memoria lo que importó de `settings` al arrancar (`ROOT`, `LEGACY_REPO`).
- Cambios en `piloto.py`: **sí**, hay que cerrar y abrir el piloto (el usuario lo hace). Avisalo en la guía.

## 4. Lo que el bot de WhatsApp espera del catálogo (para no romperlo)

Desde el 09/10 el bot lee el catálogo de **Cloudflare** (`https://catalogo.mitiendastock.com/productos.json` y `productos-g5.json`) y también de GitHub (`https://mitiendazapas.github.io/catalogo/...`): mira las dos y usa la que tenga el `generatedAt` más reciente (si empatan, Cloudflare). Las fotos las baja de Cloudflare y, si falla, de GitHub; si las dos fallan usa la copia local del piloto. Mientras el piloto siga publicando en los dos lados, cualquiera de las dos que se atrase no afecta al bot. **Si algún día se deja de publicar en GitHub**, el bot ya está preparado (usa Cloudflare). De cada producto usa **solo**:
`id`, `name`, `sizes[{size, stock}]`, `images[0].lg`; y del archivo, `generatedAt` y `products`.

- Si cambia ese formato, avisalo en una guía antes de publicarlo: el bot tiene que adaptarse a la vez.
- El bot envía a las ~06:00 y pide un catálogo con `generatedAt` de hoy desde las 05:15: espera hasta 10 min a que el piloto
  publique y, si no llega, manda con el último que haya (el de la noche anterior).
- Los ids de las G5 empiezan con `g5-` (el bot guarda lo ya enviado por id para no repetir si retoma).
- Un modelo sin stock o sin foto no se manda.

El bot abre WhatsApp Web **12 minutos antes** de la hora sorteada (tarda ~5 min en cargar y otro rato en asentarse) y lo deja esperando, así el primer mensaje sale a la hora. Lee el catálogo recién a la hora de enviar. Si no logra abrirlo de antemano, espera la hora y lo abre entonces.

Orden de lo que manda por día: saludo («Buen día gente / Les dejo el stock de hoy 👇👇👇») → fotos BR → mensaje de precios BR → separador G5 → fotos G5 (con "⭐ CALIDAD G5" y
"Talles europeos") → mensaje de precios G5. → separador de indumentaria → prendas de indumentaria → precios de indumentaria. → **mensaje final de la tienda** (oferta: "si quieren tener una tienda como la nuestra... $25.000 por mes... escribanme al 11 5377-3771"; el texto está en `MENSAJE_PROMO_TIENDA` de `bot_whatsapp.py`). Domingos no manda. Si falta `productos-g5.json`, manda solo BR y, si falla la lectura de indumentaria, sigue sin ella.

La **indumentaria** no pasa por el piloto ni por `catalogo/`: el bot la lee directo de la API pública de la tienda de Beto (`https://app-beto-seven.vercel.app/api/catalogo`, `categoria: Indumentaria`; las fotos son URLs públicas de Supabase). El texto de precios de indumentaria es fijo en `bot_whatsapp.py` (`MENSAJE_PRECIOS_INDUMENTARIA`). Si algún día la indumentaria se agrega al catalogo del piloto, avisalo en una guía para pasar el bot a leerla de ahí.

## 5. Lo que NO hay que hacer

- No abrir ni correr el bot de WhatsApp desde otra PC: dos bots mandarían todo duplicado al mismo grupo.
- No tocar `automatizacion/sesion_wsp` (la sesión de WhatsApp de la laptop) ni `bot_config.json` (nombres de los grupos).
- No lanzar el piloto ni el bot desde una sesión de Claude (`Start-Process`, `start`, etc.): quedan colgando del proceso de la app y mueren cuando la app se reinicia (pasó el 08/10 ~20:46: se cerraron los dos sin que el usuario tocara nada). Se abren con los accesos directos de la carpeta Inicio de Windows (`Piloto Catalogo Nuevo.lnk` y `Bot WhatsApp Tienda.lnk`), por ejemplo con `explorer.exe "<ruta del .lnk>"`.
- Los `.js` de stock de casa no se editan a mano: se pisan en cada vuelta. Todo se hace desde la app.

## 6. Pendientes / ideas para vos

- `sync_catalog.py` reescribe `version` y `generatedAt` en cada corrida, aunque los productos sean idénticos. Si los
  conservara cuando nada cambió, el piloto sí se saltaría el commit "sin cambios". Hoy casi todas las vueltas traen cambios
  reales de stock, así que no urge, pero es lo que haría que "sin cambios = sin commit" funcione de verdad.
- El mensaje de precios BR del bot dice "calidad Brasil" y no tiene los modelos de $42.000. El usuario todavía no dijo
  qué texto quiere: no lo cambies sin preguntarle.

## Cambio de número de WhatsApp del bot (11/10)

El usuario quiere que el bot mande desde **otro número**. En la laptop se hace con `automatizacion/Cambiar_Numero_WhatsApp.bat`: vincula el número nuevo en una carpeta aparte (`sesion_wsp_nueva`), comprueba que encuentre los grupos y recién ahí reemplaza `sesion_wsp` (la vieja queda en `sesion_wsp_anterior`). El número nuevo tiene que estar agregado a los grupos del bot. No toques esas carpetas.

## Cambio de horario (12/10)

A pedido del usuario, desde el 13/10 el bot envía entre **05:45 y 06:10** (antes 07:45-08:10). Para que a esa hora tenga el stock más actualizado posible, el piloto ahora descansa de **00:00 a 05:15** (antes hasta 07:30): `REST_END_MINUTE` en `piloto.py`. Por qué 05:15: el bot lee el catálogo al enviar, y con esa hora quedan 2 o 3 vueltas antes, lo que absorbe una falla del proveedor (503, ~1,6 % de las vueltas; reintenta a los 30 min). De noche el stock casi no cambia (~3 modelos de ~110 por noche), así que el beneficio es chico pero el costo también. Si se vuelve a mover el horario del bot, mover juntos `HORA_DESDE`, `HORA_HASTA` y `CATALOGO_FRESCO_DESDE`, y el descanso del piloto ~30 min antes de la ventana.

## Textos del bot (24/10)

A pedido del usuario: (1) el proveedor subió $1.000 el stock brasilero, así que todos los precios de `MENSAJE_FINAL_PRECIOS` en `bot_whatsapp.py` subieron $1.000 (adulto $44.000; desde 5 unidades $38.000/$40.000/$42.000; niño $36.000 y por mayor $31.000; ojotas $36.000/$32.000; ojotas Mind $38.000/$36.000; Jordan 11 y Retro 11 Panda $56.000/$51.000). Los precios de G5 e indumentaria no cambiaron. (2) `MENSAJE_PROMO_TIENDA` ahora usa el título "Beneficios:", dice "El mismo stock de zapatillas BR y G5" y suma "Pueden agregar sus propios productos". Esos textos son fijos en el código: si cambian los precios, hay que editarlos ahí.

**Actualización 11/11:** el usuario subió el precio por unidad de adulto y no los demás, así que se sumó otros $1.000 a todo `MENSAJE_FINAL_PRECIOS` menos al adulto por unidad (sigue $44.000): desde 5 unidades $39.000/$41.000/$43.000; niño $37.000 y por mayor $32.000; ojotas $37.000/$33.000; ojotas Mind $39.000/$37.000; Jordan 11 y Retro 11 Panda $57.000/$52.000. Está pendiente agregar el precio de las ojotas nuevas (Nike/Adidas «calidad» y «homolográfica»): hace falta que el usuario dé los precios.

**Actualización 18/11 (reemplaza los precios de arriba):** el usuario pidió que el mensaje coincida con los precios de la **tienda de revendedores**. OJO: el precio que muestra la tienda NO es solo `precios-mayorista.json`: el panel tiene «Cambiar precios» y su ajuste está en `https://mitiendastock.com/api/tienda/laimp/ajustes.json` (hoy `brAmount` y `resaleAmount` = **+$1.000** en Brasil; G5 sin ajuste), y `motor/js/pricing.js` lo suma a TODA la lista (unidad y por mayor; no a los productos con precio propio). Una primera versión de este día igualó el mensaje a la lista sin el ajuste y quedó $1.000 por debajo; se corrigió. Para comparar de nuevo: lista + ajuste. `MENSAJE_FINAL_PRECIOS` quedó con lo que muestra la tienda hoy en las BR con stock: adulto **$44.000** por unidad; desde 5 unidades **$38.000/$40.000/$43.000** (57, 45 y 29 modelos respectivamente; el escalón de $42.000 de la lista —Exclusivas white, medias— hoy no tiene modelos con stock, si vuelven hay que sumarlo); ojotas **$36.000** (mayor $32.000); Mind **$38.000** (mayor $36.000); línea nueva **OJOTAS JORDAN $25.500** (mayor $23.500, precio propio del panel de L.A IMP). Se **sacaron** las líneas de talle niño y de Jordan 11 / Retro 11 Panda. El mensaje de **indumentaria** pasó a ser el que el usuario dejó en «Notas Whassap» (suma Remera algodón $20.000, x mayor de 5 $18.000, y Chomba arg línea $39.000, con los renglones separados por línea en blanco). Y después de todas las fotos del **neceser** se manda `MENSAJE_PRECIOS_NECESER` ($15.000, mayor $12.000; uno de los 10 neceser figura a $15.500 en el panel, el mensaje no lo distingue). Los textos se revisaron mandándolos a «Notas Whassap» con `python bot_whatsapp.py --textos-prueba` (solo grupo de prueba).

## Mandar solo las zapatillas BR de la segunda tienda (12/11)

La «segunda tienda» es **Brasil 2**: la línea BR de la tienda de Beto, que el piloto guarda en `catalogo/productos-br2.json` (ids `br2-...`; no la lee ninguna tienda, solo el catálogo de Fabri). El 12/11 el usuario pidió mandar al grupo **solo** ese stock, aclarando que son talles BR. Se agregó a `bot_whatsapp.py`:

- `python bot_whatsapp.py --solo-br2` → manda al grupo real un separador («ZAPATILLAS BR - SEGUNDA TIENDA (talles BR)») y una foto por modelo con «Talles BR: ...». Sin saludo, sin precios, sin mensaje final. Las chinelas no entran (ya van, sumadas, en las ojotas de la tanda diaria). Con `--prueba` va a «Notas Whassap».
- `--ver-br2` muestra cómo saldría, sin abrir WhatsApp.
- Lleva su propio estado del día (`estado_bot_br2.json`): si se corta y se vuelve a correr el mismo día, no repite lo ya enviado.
- `Enviar_BR2_WhatsApp.bat` lo corre y después **vuelve solo al modo programado** en la misma ventana. Hay que **cerrar antes el bot programado** (dos bots a la vez no se pueden: candado único). Abrirlo con el Explorador, no desde Claude.
- `enviar_tanda` ganó parámetros opcionales (`texto_separador_ind`, `texto_precios_ind`, `etiqueta_ind`); con los valores por defecto la tanda diaria es idéntica.

Resultado del 12/11 (09:20–09:52): 56 modelos enviados, 0 fallidos; WhatsApp Web estaba lento (el separador tardó ~4,5 min en confirmarse y 2 fotos necesitaron la comprobación antes del reintento, sin repetirse). Después el bot quedó en modo programado: próximo envío 13/11 06:02:45.

## Neceser (carteras) en el envío diario (17/11)

A pedido del usuario el envío diario suma al final las fotos de **neceser/carteras**. Salen del **panel de L.A IMP** (`https://mitiendastock.com/api/tienda/laimp/productos.json`), categoría **`nesecer`** (así está escrita en el panel; si se corrige la ortografía allá, cambiar `CATEGORIA_NECESER` en `bot_whatsapp.py`). El 17/11 son 10 productos «NESECER CALIDAD PREMIUN», talle único, 1 a 3 unidades cada uno.

- Orden: … indumentaria y sus precios → **separador «⬇️ NECESER ⬇️» → una foto por producto** → mensaje final de la tienda. Cada foto lleva «Neceser calidad premium - modelo N» y «Stock: n» (el bot corrige la errata del nombre y numera los modelos porque todos se llaman igual). Usa la primera foto de cada producto. **No manda mensaje de precios** (no se pidió; el panel tiene $15.000 / mayor $12.000).
- Es una sección tolerante, igual que G5 e indumentaria: si falla, no corta lo ya enviado; si no hay stock, no se manda nada. Lleva su marca/estado del día (`separador_neceser_enviado`, ids `nec-...`), así que una reanudación no repite.
- `python bot_whatsapp.py --ver-neceser` muestra cómo sale (sin WhatsApp); `--solo-neceser` lo manda solo al grupo real (`--prueba` → «Notas Whassap», se puede sumar `--limite 3`).
- Probado el 17/11 en «Notas Whassap» (separador + 3 fotos, 0 fallidos). Primer envío real: el martes 17/11 a las 05:57:27.

## Sesión de WhatsApp vencida: pidió el QR (16/11) y cómo se resolvió

El lunes 16/11 a las 05:51 el bot abrió WhatsApp Web y pidió el código QR (la sesión vinculada venció). El bot no puede resolverlo solo: avisó, anotó `ERROR ... sesión venció` en `estado_bot.json` y no mandó el stock de ese día.

**Qué se hizo (07:36–08:56):**
1. Se cerró el bot (estaba inactivo) y se abrió `automatizacion/Vincular_WhatsApp_QR.bat` con el Explorador. Corre `vincular_whatsapp_nuevo.py`: abre una sesión NUEVA (`sesion_wsp_nueva`) con el QR, el usuario lo escaneó con el celular del bot (mismo número), el script comprobó **sin mandar nada** que el grupo real aparece, guardó la sesión vieja como `sesion_wsp_anterior_20261116_073945` y dejó la nueva como `sesion_wsp`. Después el `.bat` vuelve solo al modo programado.
2. A pedido del usuario se mandó el stock completo de ese día: se respaldó `estado_bot.json` como `estado_bot.json.bak1611`, se puso el estado de hoy en limpio **conservando `proxima`** (17/11 05:57:27) y se corrió `bot_whatsapp.py --ahora` seguido del bot programado. Resultado: 239 enviados (141 BR + 76 G5 + 22 indumentaria), 0 fallidos, todos los mensajes de precios y el final enviados; terminó 08:56.

**Si vuelve a pasar:** cerrar el bot programado y abrir `Vincular_WhatsApp_QR.bat` con el Explorador (no desde Claude); el usuario tiene que escanear el QR en la pantalla de la laptop. Para recuperar el envío del día, poner el estado del día en limpio como arriba y correr `--ahora`. Las carpetas `sesion_wsp_anterior*` ocupan espacio: se pueden borrar las viejas cuando todo ande bien.

## Ojotas de casa en el bot (31/10) — DESACTIVADO el 09/11

**Actualización 09/11:** la regla de abajo ya no rige. El 02/11 las tiendas volvieron a sumar proveedor + casa en las ojotas («solo casa» quedó solo para Fabri) y el bot no se enteró: seguía mandando solo los pares de casa, y con casa en 0 no salían las Louis Vuitton (123 pares) ni otras ojotas. Ahora `OJOTAS_SOLO_CASA = False` en `bot_whatsapp.py` y el bot manda el stock completo (8 ojotas hoy). Con `True` vuelve la regla vieja. **Si las tiendas vuelven a cambiar una regla de stock, hay que avisar en esta guía: el bot las lee del catálogo pero aplica sus propias reglas.**

Siguiendo la regla de las tiendas del 26/10 (las ojotas de casa se venden SOLO con los pares de casa), el bot ahora manda, para una ojota con pares de casa, solo los talles de la columna `casa` de `productos.json` y no el stock total con el del proveedor. Recuerda en `automatizacion/ojotas_de_casa.json` qué ojotas alguna vez tuvieron pares de casa: si llegan a 0, quedan agotadas y no vuelven al proveedor (igual que en las tiendas). Si cambia esa regla en el panel, avisarlo en una guía para adaptar el bot. Nota: el mensaje de precios del bot tiene un solo precio de ojotas; las ojotas de casa tienen su propio precio en el panel.

## Corte del envío del 04/11 y cómo se arregló

**Qué pasó:** a las 06:24 el envío se cortó en el modelo 28 de 136. WhatsApp Web (lento en esta laptop) se colgó: la caja de texto no respondió (`Locator.click: Timeout 30000ms`) y, al pasar al modelo siguiente, el buscador del grupo no mostró resultados en 4 s. El bot lo tomó como "grupo inexistente" (`GrupoNoEncontrado`), que era un error **fatal sin reintento**: el día quedó en ERROR y el resto del stock no salió. Se retomó a mano editando `estado_bot.json` (`terminado=false`) y reiniciando el bot; la reanudación no repite lo ya enviado.

**Arreglo (commit `42ee66e`, `bot_whatsapp.py`):**
- La búsqueda del grupo espera `BUSQUEDA_VACIA_SEG = 15` s antes de dar por perdido un resultado vacío (antes 4 s).
- `abrir_grupo_robusto()` (usada durante todo el envío): si falla, recarga WhatsApp Web y reintenta una vez. Si sigue mal levanta `NavegadorColgado`, que **sí se reintenta**: espera `ESPERA_TRAS_COLGARSE_MIN = 3` min y abre una sesión nueva (antes 15 min para cualquier error). `MAX_INTENTOS_DIA` pasó de 3 a 4.
- "Fallaron 3 envíos seguidos" después de haber enviado algo ahora es `NavegadorColgado` (reintentable), no `EnvioBloqueado`. Siguen siendo fatales: sesión vencida (QR), varios grupos con el mismo nombre (`GrupoAmbiguo`) y que WhatsApp no acepte ni el primer envío.
- Contra repetidos al reanudar: `estado_bot.json` guarda `dudosos` (modelos que fallaron). Si después sale otro modelo, se vacía (un fallo seguido de éxitos casi siempre es un mensaje que llegó tarde). Si el corte ocurre justo tras un fallo, al reanudar se mira el final del chat: si el modelo ya está, se da por enviado.

**Incidente del 05/11: se mandó a otro grupo (corregido).** Tras un cuelgue, el bot recargó WhatsApp Web y, con la lista de chats a medio cargar, abrió «Equipo de trabajo 🤝🏽» en vez de «⚡️Equipo de trabajo ⚡️» (el bot comparaba nombres sin emojis y ambos se llaman igual sin ellos). Los modelos 23 al 76 se mandaron a ese otro grupo y hubo que pedir que los borren. Arreglo: `abrir_grupo` solo acepta el chat cuyo nombre coincide **exacto, con emojis**, y verifica con `_chat_abierto_exacto` (lee la cabecera con los emojis desde el `alt` de las imágenes) antes de cada envío. Si el exacto no aparece, espera y falla; nunca elige uno parecido. Desde el 05/11 el grupo del equipo se llama **«⚡️equipo de trabajo ⚡️» (todo en minúsculas)** y la comparación **distingue mayúsculas de minúsculas** (el otro grupo es «Equipo de trabajo 🤝🏽», con mayúscula). Si algún día se cambia el nombre del grupo, hay que actualizar `grupo_real` en `automatizacion/bot_config.json` con el nombre completo y sus emojis.

**Repetidos y fotos sin texto (06/11, corregido).** Con WhatsApp Web lento, un mensaje aparecía después de la ventana de espera y el reintento lo duplicaba: salieron dos veces el saludo y dos modelos, y una foto sola seguida de la misma con texto. Cambios en `bot_whatsapp.py` (commit `424d163`): se espera hasta 45 s a que la vista previa de la foto esté abierta antes de escribir el pie de foto; `_esperar_rastro_del_envio` espera 120 s sin rastro (total 300 s) antes de reintentar; tras el 2.º intento fallido hay una última mirada de 120 s por si llegó tarde; `_ultima_fila` tolera 6 s. Es más lento cuando WhatsApp va mal, pero repite menos. La causa de fondo sigue siendo la poca RAM (0,5 GB libres de 3,8 GB tras el envío): la app de Claude y Windows Defender consumen unos 700 MB. Ese día hubo ~20 avisos «no se confirmó». Esto reduce los repetidos pero no los garantiza en cero.

**Si vuelve a pasar:** mirar `automatizacion/logs/bot_whatsapp.log` (líneas con "Recargo WhatsApp Web" / "Reintento en 3 min") y `logs/ATENCION_bot.txt`. La causa de fondo es WhatsApp Web lento por poca RAM (3,8 GB; la app de Claude usa 1–1,8 GB): conviene tener cerrada la app de Claude entre las 05:30 y las 08:00.
