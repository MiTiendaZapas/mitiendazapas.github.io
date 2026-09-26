# Plan de integración de la tienda nueva

> **No se ejecuta nada de esto hasta que digas "OK, podemos pasarla".**
> Mientras tanto, la tienda actual y el piloto de la laptop siguen como están.

## Idea general

La tienda nueva entra en el **mismo repositorio de GitHub** que la actual
(`MiTiendaZapas/tienda-zapatillas`). Así los links que ya mandaste siguen
funcionando: `index.html` (revendedores) y `minorista.html` (público) pasan a
ser las páginas nuevas.

El cambio se hace en **tres fases**. En las dos primeras, los clientes no ven
ninguna diferencia y todo se puede deshacer en minutos.

---

## Fase 0 · Preparación (sin impacto)

1. Crear una "foto" del estado actual en GitHub (un *tag* llamado
   `antes-de-la-tienda-nueva`) para poder volver exactamente a este punto.
2. En la laptop, instalar lo único nuevo que necesita el piloto:
   `pip install pillow` (ya no hace falta Playwright ni el navegador).
3. Confirmar la dirección pública de GitHub Pages (probablemente
   `https://mitiendazapas.github.io/tienda-zapatillas/`) para las vistas
   previas al compartir links por WhatsApp.

## Fase 1 · Prueba real en una carpeta aparte (sin impacto)

1. Subir la tienda nueva dentro de una carpeta `nueva/` del repositorio.
   Queda publicada en `.../tienda-zapatillas/nueva/`, pero ningún cliente
   tiene ese link.
2. Probar desde celulares reales (vos y tu socio): catálogo, filtros, foto
   ampliada, pedidos de prueba a tu propio WhatsApp, páginas de información,
   y la tienda de ClienteA en `.../nueva/clientes/cliente-a/`.
3. La tienda actual y el piloto viejo siguen funcionando normalmente.
4. Foto al compartir el link: las etiquetas og:image/og:url de los HTML ya
   apuntan a la dirección final (.../tienda-zapatillas/). En la copia de
   `nueva/` se cambian por .../tienda-zapatillas/nueva/ para poder probarla;
   al mudar a la raíz se usan tal cual están en plataforma-zapas.

## Fase 2 · El cambio (en horario de descanso, por ejemplo 00:30)

A esa hora el piloto viejo está durmiendo y no hay clientes armando pedidos.

1. **Detener el piloto viejo** en la laptop (`detener_piloto.bat`) y no usar
   "Publicar" en el Panel Admin durante el cambio.
2. Mover el contenido de `nueva/` a la raíz del repositorio:
   - `index.html` y `minorista.html` se reemplazan por los nuevos
     (**los links de siempre ahora abren la tienda nueva**).
   - Se agregan `motor/`, `catalogo/`, `paginas/`, `clientes/`, `marca/`,
     `sincronizador/`, `pruebas/`, `guias/`, `configuracion.js` y los precios.
3. **ClienteA**: sus páginas viejas (`revendedores/clienteA/mayorista.html` y
   `minorista.html`) se reemplazan por páginas que redirigen solas a
   `clientes/cliente-a/`. Tiene que cambiar al mismo tiempo que L.A IMP:
   cuando se apague el piloto viejo, su tienda vieja dejaría de actualizar el stock.
   Sus precios ya están verificados (0 diferencias).
4. En `sincronizador/settings.py`: `LEGACY_REPO = ROOT` (el stock de casa pasa
   a leerse del mismo repositorio).
5. Subir el cambio y esperar 1–2 minutos a que GitHub Pages lo publique.
6. **Verificar en vivo**: las dos tiendas, una vista de producto, un pedido de
   prueba, una página de información y el link viejo de ClienteA.
7. En la laptop: `git pull` y arrancar el piloto nuevo con
   `sincronizador/iniciar_piloto.bat`. Si el piloto viejo arranca solo al
   prender la laptop, reemplazar ese acceso por el nuevo.

## Fase 3 · Limpieza (1–2 semanas después, con tu OK)

Solo cuando todo funcione bien un tiempo, se borran los archivos que ya no usa
nadie (quedan igual en el historial de GitHub):

- `tienda.js`, `minorista.js`, `style.css`, `mezclar_stock.js`, `catalogo.js`
- `revendedores/clienteA/tienda.js` y `minorista.js`
- `Automatizacion/piloto_automatico.py` y sus `.bat`
- la carpeta `sesion_wsp/` vieja de la raíz (sesión de WhatsApp duplicada)

**Se conservan**: `zapatillas_manual.js`, `indumentaria.js` y `Fotos/` (los usa
el Panel Admin para tu stock de casa), el Panel Admin y el bot de WhatsApp.

---

## Si algo sale mal (volver atrás)

Como en la Fase 2 no se borra nada de lo viejo, volver atrás lleva unos minutos:

1. Detener el piloto nuevo (`sincronizador/detener_piloto.bat`).
2. Deshacer el commit del cambio en GitHub (`git revert`), o volver al tag
   `antes-de-la-tienda-nueva`.
3. Arrancar el piloto viejo como siempre.

## Cosas a tener en cuenta

- **Panel Admin**: sigue funcionando para el stock de casa. Su pantalla de
  "modelos sin foto" lee `catalogo.js`, que deja de actualizarse; con la tienda
  nueva las fotos salen del proveedor, así que esa pantalla ya no hace falta.
- **Bot de WhatsApp**: no depende de la tienda y sigue igual. Tiene los precios
  escritos a mano en su texto; más adelante se puede hacer que los lea de los
  archivos de precios.
- **Tamaño del repositorio**: las fotos suman unos 58 MB.
- **Carritos en curso**: quien tenga un pedido armado en la tienda vieja al
  momento del cambio lo va a tener que volver a armar (conviene hacerlo de noche).

## Migración futura al proveedor nuevo (vestite-piola.vercel.app)

Ya probado contra su API real: el adaptador lee productos, talles, stock,
marcas y fotos. El día que se mude:

1. Confirmar con el proveedor que se puede usar su API.
2. En `sincronizador/settings.py`: `ACTIVE_PROVIDER = "vestite_api"`.
3. Correr una sincronización **a mano y de noche**: la primera vez baja todas las
   fotos nuevas (los modelos cambian de código) y **tarda unos 45 minutos**.
   Hay que correrla con `--force`, porque el catálogo cambia mucho de golpe.
   Las siguientes actualizaciones vuelven a tardar ~1 minuto.
4. Revisar los precios: las reglas por nombre siguen funcionando; los precios
   fijos por modelo (`overrides`, hoy vacíos) habría que actualizarlos.

**Fotos durante la mudanza** (simulado el 24/09/2026 con la tienda nueva real):
- Modelos con fotos en el proveedor nuevo: se usan esas (hasta 6 por modelo).
- Modelos que el proveedor nuevo todavía no fotografió: se reutilizan las que ya
  teníamos de ese modelo, o la foto con el mismo nombre en `Fotos/`.
  Apenas el proveedor cargue las suyas, se reemplazan solas.
- En la simulación: 69 modelos con fotos propias, 13 con fotos reutilizadas,
  3 con foto de `Fotos/` y 1 sin foto (un modelo que hoy no existe en ningún lado).
