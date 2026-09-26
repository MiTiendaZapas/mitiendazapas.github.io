# Cómo crear la tienda de un cliente nuevo

Todas las tiendas usan el **mismo catálogo** (`catalogo/`) y el **mismo motor**
(`motor/`). Lo único propio de cada cliente es su carpeta dentro de `clientes/`:

```
clientes/cliente-a/
├── index.html              ← tienda para revendedores (precios por mayor)
├── minorista.html          ← tienda para el público (opcional)
├── configuracion.js        ← nombre, colores, WhatsApp, redes, textos, envíos
├── precios-mayorista.json  ← precios de index.html
├── precios-minorista.json  ← precios de minorista.html
├── marca/                  ← logo y favicon del cliente
└── paginas/                ← páginas de información (cómo comprar, envíos, etc.)
```

Para cambiar algo de un cliente **nunca hace falta tocar `motor/`**.

---

## 1. Copiar la carpeta base

Copiá `clientes/cliente-a` con el nombre del cliente nuevo, en minúsculas y con
guiones (por ejemplo `clientes/zapas-del-sur`).

## 2. Editar `configuracion.js`

Lo mínimo:

| Dato | Qué poner |
|---|---|
| `id` | Un nombre único, sin espacios (ej. `"zapas-del-sur"`). Separa el pedido guardado de cada tienda. |
| `name` | El nombre que se ve en la tienda. |
| `contact.whatsappQueries` / `whatsappOrders` | Número con formato `5491100000000` (sin +, sin espacios). |
| `social` | Sus redes. Si queda vacío, no se muestran. |
| `theme.colors` | Sus colores. `accent` es el color de botones y precios por mayor. |
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

No importan tildes ni mayúsculas. **Para subir todos los precios alcanza con editar este archivo**:
el diseño no se toca.

## 4. Ajustar los títulos de las páginas

En `index.html`, `minorista.html` y los archivos de `paginas/`, cambiá el `<title>` y la
`description` (es lo que muestran Google y WhatsApp al compartir el link).

- ¿El cliente tiene **una sola versión**? Borrá la página que no usa (por ejemplo `minorista.html`)
  y su entrada en `channels`.
- ¿Querés **agregar una página** (ej. "Envíos")? Copiá un archivo de `paginas/`, cambiá
  `data-page="..."` y el título, y sumala a `pages` en `configuracion.js` con sus textos.

## 5. Probar en tu PC

Desde la carpeta `plataforma-zapas`:

```bash
python -m http.server 8765
```

Entrá a `http://localhost:8765/clientes/<nombre-del-cliente>/` y revisá:

- [ ] Nombre, colores y logo correctos, sin datos de otra tienda.
- [ ] Precios de varios modelos (por unidad y por mayor).
- [ ] Un pedido de prueba: el mensaje llega al WhatsApp del cliente.
- [ ] Links de redes y de "Consultar".
- [ ] Se ve bien en el celular.
