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
| **Piloto** `sincronizador/piloto.py --publicar` | Vuelta cada ~17 min: baja de GitHub, corre `sync_catalog.py`, publica `catalogo/` y el stock de casa. Descansa de 00:00 a 07:30. | `Desktop/mitiendazapas.github.io` |
| **Bot de WhatsApp** `automatizacion/bot_whatsapp.py` | Todos los días (menos domingos), a una hora al azar entre 07:45 y 08:10, manda el stock al grupo real. | `Desktop/tienda-zapatillas/automatizacion` |

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

## 3. Cuándo hay que reiniciar el piloto

- Cambios en `sync_catalog.py`, `settings.py`, `stock_casa_sync.py`, `manual_stock.py`, `proveedores/*`:
  **no** (`sync_catalog.py` es un programa aparte que arranca de cero en cada vuelta y toma el código nuevo).
  Ojo: `piloto.py` guarda en memoria lo que importó de `settings` al arrancar (`ROOT`, `LEGACY_REPO`).
- Cambios en `piloto.py`: **sí**, hay que cerrar y abrir el piloto (el usuario lo hace). Avisalo en la guía.

## 4. Lo que el bot de WhatsApp espera del catálogo (para no romperlo)

El bot lee `https://mitiendazapas.github.io/catalogo/productos.json` (BR) y `.../productos-g5.json` (G5); si la web
falla, usa la copia local del piloto. De cada producto usa **solo**:
`id`, `name`, `sizes[{size, stock}]`, `images[0].lg`; y del archivo, `generatedAt` y `products`.

- Si cambia ese formato, avisalo en una guía antes de publicarlo: el bot tiene que adaptarse a la vez.
- `generatedAt` tiene que ser de hoy a partir de las 07:30: el bot espera hasta 30 min a que el piloto publique su primera
  vuelta del día. Si el piloto no corre, manda con el stock que haya.
- Los ids de las G5 empiezan con `g5-` (el bot guarda lo ya enviado por id para no repetir si retoma).
- Un modelo sin stock o sin foto no se manda.

Orden de lo que manda por día: saludo («Buen día gente / Les dejo el stock de hoy 👇👇👇») → fotos BR → mensaje de precios BR → separador G5 → fotos G5 (con "⭐ CALIDAD G5" y
"Talles europeos") → mensaje de precios G5. → separador de indumentaria → prendas de indumentaria → precios de indumentaria. Domingos no manda. Si falta `productos-g5.json`, manda solo BR y, si falla la lectura de indumentaria, sigue sin ella.

La **indumentaria** no pasa por el piloto ni por `catalogo/`: el bot la lee directo de la API pública de la tienda de Beto (`https://app-beto-seven.vercel.app/api/catalogo`, `categoria: Indumentaria`; las fotos son URLs públicas de Supabase). El texto de precios de indumentaria es fijo en `bot_whatsapp.py` (`MENSAJE_PRECIOS_INDUMENTARIA`). Si algún día la indumentaria se agrega al catalogo del piloto, avisalo en una guía para pasar el bot a leerla de ahí.

## 5. Lo que NO hay que hacer

- No abrir ni correr el bot de WhatsApp desde otra PC: dos bots mandarían todo duplicado al mismo grupo.
- No tocar `automatizacion/sesion_wsp` (la sesión de WhatsApp de la laptop) ni `bot_config.json` (nombres de los grupos).
- Los `.js` de stock de casa no se editan a mano: se pisan en cada vuelta. Todo se hace desde la app.

## 6. Pendientes / ideas para vos

- `sync_catalog.py` reescribe `version` y `generatedAt` en cada corrida, aunque los productos sean idénticos. Si los
  conservara cuando nada cambió, el piloto sí se saltaría el commit "sin cambios". Hoy casi todas las vueltas traen cambios
  reales de stock, así que no urge, pero es lo que haría que "sin cambios = sin commit" funcione de verdad.
- El mensaje de precios BR del bot dice "calidad Brasil" y no tiene los modelos de $42.000. El usuario todavía no dijo
  qué texto quiere: no lo cambies sin preguntarle.
