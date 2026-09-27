# Plataforma de tiendas de zapatillas

Base reutilizable para L.A IMP y futuras tiendas de clientes: **un catálogo
compartido**, un **motor común** y una **configuración por tienda** (marca,
colores, contactos, textos y precios).

Publicada en **https://mitiendazapas.github.io** (repositorio
`MiTiendaZapas/mitiendazapas.github.io`). Del repositorio de la tienda anterior
(`../TiendaZapasOficial`) solo se usa el stock de casa que guarda el Panel Admin.

## Estructura y links

```
mitiendazapas.github.io/
├── index.html                ← L.A IMP al público: mitiendazapas.github.io
├── mayorista/                ← L.A IMP para revendedores: /mayorista
├── como-comprar/ talles/ envios/ cambios/ preguntas/ nosotros/ revender/
│                             ← páginas de información (una carpeta cada una)
├── configuracion.js          ← nombre, colores, WhatsApp, redes, textos de L.A IMP
├── precios-mayorista.json    ← precios de revendedores
├── precios-minorista.json    ← precios al público
├── marca/                    ← logo, favicon e imagen para compartir
├── catalogo/                 ← productos.json + fotos/ (lo genera el sincronizador; lo leen TODAS las tiendas)
├── motor/                    ← CSS, JavaScript y fuentes comunes a todas las tiendas
├── guias/                    ← instrucciones (cómo crear un cliente nuevo, integración)
└── sincronizador/            ← actualiza el catálogo (corre en la laptop con iniciar_piloto.bat)
```

Las tiendas de clientes están en **su propio repositorio** (por ejemplo `fo` →
`mitiendazapas.github.io/fo`) y leen el motor y el catálogo de acá. Guía en
`guias/nuevo-cliente.md`.

Para cambiar algo de L.A IMP casi siempre alcanza con `configuracion.js` o
los archivos de precios. `motor/` no se toca para personalizar una tienda.

## Ver la tienda en tu PC

Las páginas usan módulos de JavaScript, así que hay que abrirlas desde un
servidor local (abrir el HTML con doble clic no funciona):

```bash
python -m http.server 8765
```

y entrar a `http://localhost:8765/` (público) o `http://localhost:8765/mayorista/` (revendedores).

## Pruebas automáticas

Antes de publicar un cambio, estos dos comandos confirman que nada se rompió
(precios, carrito, filtros, mensaje de WhatsApp y sincronizador):

```bash
node --test "pruebas/*.test.mjs"
python -m unittest discover pruebas
```

`pruebas/precios-vs-tienda-actual.test.mjs` compara los precios con la tienda
actual: sirve mientras convivan las dos (si después cambiás precios a propósito,
va a marcar la diferencia).

## Sincronizar el catálogo

Requiere Python 3 y Pillow (`pip install pillow`).

```bash
python sincronizador/sync_catalog.py --dry-run     # revisa sin escribir nada
python sincronizador/sync_catalog.py               # escaneo completo
python sincronizador/sync_catalog.py --only "Panda sb dunk; Mind beige"   # prueba con pocos modelos
python sincronizador/sync_catalog.py --force       # escribe aunque el catálogo se achique mucho
```

Para que se actualice solo cada 15-20 minutos (en la laptop):
`sincronizador/iniciar_piloto.bat` (publica en GitHub) y `sincronizador/detener_piloto.bat`.
Sin publicar, para probar: `python sincronizador/piloto.py --una-vez`.
El plan para reemplazar al piloto actual está en `guias/plan-de-integracion.md`.

- Proveedor activo, URLs y rutas: `sincronizador/settings.py` (único lugar con URLs del proveedor).
- Marcas y categorías: `sincronizador/brand_rules.json`. Los modelos sin marca clara se listan en
  `sincronizador/informes/brand-review.json`.
- Stock de casa: se lee de `zapatillas_manual.js` e `indumentaria.js` de la tienda actual
  y se suma al del proveedor cuando el nombre coincide (sin importar tildes ni mayúsculas).
