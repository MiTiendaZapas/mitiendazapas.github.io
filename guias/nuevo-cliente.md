# Cómo crear la tienda de un cliente nuevo

Cada cliente tiene **su propio repositorio de GitHub**, dentro de la cuenta
MiTiendaZapas. Ese repositorio tiene solo lo propio del cliente; el **motor**,
el **catálogo** y las **fotos** se toman del repositorio principal
(`mitiendazapas.github.io`), así que su stock se actualiza solo cuando el
piloto sube el catálogo. El piloto no toca los repositorios de los clientes.

```
repositorio "zapas-del-sur"            → mitiendazapas.github.io/zapas-del-sur
├── index.html              ← tienda al público (el link corto del cliente)
├── mayorista/index.html    ← tienda para revendedores  → /zapas-del-sur/mayorista
├── configuracion.js        ← nombre, colores, WhatsApp, redes, textos, envíos
├── precios-mayorista.json  ← precios de revendedores
├── precios-minorista.json  ← precios al público
├── marca/                  ← logo y favicon del cliente
└── como-comprar/index.html ← páginas de información (una carpeta por página)
```

El modelo a copiar es el repositorio de ClienteA (`fo`), que en la PC está en
`proyectos/repositorio-fo`. Para cambiar algo de un cliente **nunca hace falta
tocar el motor**.

---

## 1. Crear el repositorio y copiar la base

1. En GitHub (cuenta MiTiendaZapas): **github.com/new** → nombre corto del cliente,
   en minúsculas y con guiones (ej. `zapas-del-sur`) → **Public** → sin README → Create.
   Ese nombre es su link: `mitiendazapas.github.io/zapas-del-sur`.
2. Copiá la carpeta `proyectos/repositorio-fo` como `proyectos/repositorio-zapas-del-sur`,
   borrá su carpeta `.git` y hacé `git init` + primer commit + `git remote add origin
   https://github.com/MiTiendaZapas/zapas-del-sur.git`.
3. No cambies las rutas que empiezan con `/` (`/motor/...`, `catalogBase: "/catalogo/"`):
   son las que leen el motor y el catálogo del repositorio principal.

## 2. Editar `configuracion.js`

Lo mínimo:

| Dato | Qué poner |
|---|---|
| `id` | Un nombre único, sin espacios (ej. `"zapas-del-sur"`). Separa el pedido guardado de cada tienda. |
| `name` | El nombre que se ve en la tienda. |
| `contact.whatsappQueries` / `whatsappOrders` | Número con formato `5491100000000` (sin +, sin espacios). |
| `social` | Sus redes. Si queda vacío, no se muestran. |
| `theme` | **No se cambia**: todas las tiendas de clientes usan los colores neutros de ClienteA (aunque el logo tenga otros colores). |
| `logo` | `null` si no tiene. Si tiene, poné los archivos en `marca/` y completá `{ small, large, alt }`. |
| `includeHouseStock` | `false` para que vea solo el stock del proveedor (sin el stock de casa de L.A IMP). |
| `platformCredit` | La pregunta "¿Querés una tienda así?" al pie. `enabled: false` si el cliente prefiere que no aparezca. |

Además:
- **`channels`**: las versiones de la tienda (revendedores y/o público) y los textos del encabezado.
  - Si el cliente quiere que su comprador **elija** entre "por mayor" y "por unidad" (como L.A IMP),
    agregá `purchaseModes` copiándolo de la configuración de L.A IMP.
  - Sin `purchaseModes`, el precio por mayor se aplica solo al llegar a la cantidad mínima.
- **`shipping.methods`**: los métodos de envío que se informan en la tienda. En el
  pedido no se piden datos: nombre y envío se coordinan por WhatsApp.
- **`social`** y **`sizeChart`**: redes (franja de arriba, footer) y tabla de talles (opcionales).
- **`pages`**: qué páginas de información tiene. Cada página necesita sus textos
  (ver la configuración de L.A IMP como ejemplo: `howToBuy`, `exchanges`, `faq`, `about`...).

## 3. Cargar los precios

Los archivos `precios-*.json` tienen reglas que se leen **de arriba hacia abajo**;
gana la primera que coincide con el nombre del modelo:

```json
{ "price": 55000, "contains": ["jordan 11", "retro 11 panda"] }
```

- `contains`: alguna de esas palabras aparece en el nombre.
- `startsWith`: el nombre empieza así.
- `containsAll`: aparecen todas.
- `default`: el precio si ninguna regla coincide.
- `overrides`: precio fijo para un modelo puntual (por su código de producto).
- `"wholesale": false`: la tienda **no vende por mayor** (no aparece nada de precio por mayor).
  Ejemplo: `repositorio-importalestore/precios-minorista.json`.

No importan tildes ni mayúsculas. **Para subir todos los precios alcanza con editar este archivo**:
el diseño no se toca.

## 4. Ajustar los títulos de las páginas

En `index.html`, `mayorista/index.html` y las carpetas de páginas, cambiá el
`<title>` y la `description` (es lo que muestran Google y WhatsApp al compartir el link).

- ¿El cliente tiene **una sola versión**? Borrá la que no usa y su entrada en `channels`.
  La primera versión de `channels` es la del link corto.
- ¿Querés **agregar una página** (ej. "Envíos")? Copiá una carpeta de página, cambiá
  `data-page="..."` y el título, y sumala a `pages` en `configuracion.js` con sus textos.

## 5. Probar en tu PC

Como el cliente toma el motor y el catálogo del repositorio principal con rutas
que empiezan con `/`, para probarlo hace falta un servidor que imite GitHub (el
principal en `/` y el cliente en `/<nombre>/`). Lo más simple: publicarlo y
revisarlo directamente en GitHub, porque no lo ve nadie hasta que le pases el link.

- [ ] Nombre, colores y logo correctos, sin datos de otra tienda.
- [ ] Precios de varios modelos (por unidad y por mayor).
- [ ] Un pedido de prueba: el mensaje llega al WhatsApp del cliente.
- [ ] Links de redes y de "Consultar".
- [ ] Se ve bien en el celular.

## 6. Publicar

1. `git push -u origin main` desde la carpeta del cliente.
2. En GitHub: **Settings → Pages → Branch: `main` y `/ (root)` → Save**.
3. En 1-2 minutos queda en `mitiendazapas.github.io/<nombre>` y `.../<nombre>/mayorista`.
