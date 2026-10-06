# Para la laptop: zapatillas calidad G5 (06/10)

Instrucciones para la sesión de Claude de la laptop. Todo en español, como
siempre con este usuario.

## Qué cambió

Desde el 06/10 las tiendas suman las **zapatillas calidad G5** de otro proveedor:
la tienda de Beto (https://catalogo-app-beto.vercel.app). El piloto lee su
catálogo público, sin precios:
`https://app-beto-seven.vercel.app/api/catalogo` (solo `linea: "G5"` y
`categoria: "Calzado"`).

- `catalogo/productos.json` **no cambia**: sigue teniendo solo las zapatillas de
  siempre (calidad BR). Por eso el bot, que lee ese archivo, no manda G5 hasta
  que se lo adapte (punto 2).
- Las G5 van en un archivo aparte, **`catalogo/productos-g5.json`**. Tiene el
  mismo formato; todas llevan `"category": "g5"`, ids `g5-...` y una sola foto.
- En las tiendas se ven con dos botones, "Calidad BR" y "Calidad G5". El pedido
  también sale separado por calidad. Hoy las tienen la tienda de L.A IMP y la de
  ClienteA (Fabri).

## 1. Piloto automático: no hay que tocar nada

`piloto.py` no cambió. Cada vuelta corre `sync_catalog.py` con el código nuevo
que baja de GitHub, así que las G5 empiezan a subirse solas.

Comprobar después de una vuelta:
- En la ventana del piloto aparece `Proveedor extra beto_g5: NN modelos con stock (categoría g5)`.
- La primera vuelta tarda un poco más, porque baja unas 80 fotos nuevas.
- Existe `catalogo/productos-g5.json` y el commit "Catálogo actualizado" incluye `catalogo/fotos/g5-*`.
- Si la tienda de Beto no responde, el piloto deja las G5 del catálogo anterior y sigue con lo demás.

## 2. Bot de WhatsApp (`automatizacion/bot_whatsapp.py`): adaptarlo

En las tiendas, los talles G5 se ven como "40 EU" y tienen su propia tabla de
talles (europeo, argentino y cm). En WhatsApp también hay que aclarar que son
europeos.

El usuario quiere que el bot también mande las G5, **separadas** de las BR.

1. **Leer también las G5.** Agregar
   `URL_CATALOGO_G5 = "https://mitiendazapas.github.io/catalogo/productos-g5.json"`
   y armar sus productos con la misma `armar_productos`.
   - Si ese archivo no existe o falla, se manda solo lo de BR, como hasta ahora.
   - Que nunca se corte la tanda por las G5.
2. **Orden de la tanda diaria:**
   1. Las fotos BR, como hoy.
   2. El mensaje de precios BR (`MENSAJE_FINAL_PRECIOS`), como hoy.
   3. Un texto separador bien visible. Antes de mandarlo, esperar un poco más que
      entre fotos, para que quede separado:
      ```
      ━━━━━━━━━━━━━━
      ⬇️ ZAPATILLAS CALIDAD G5 ⬇️
      (talles europeos)
      ━━━━━━━━━━━━━━
      ```
   4. Las fotos G5. Cada foto tiene que entenderse sola, aunque alguien pase
      rápido y no vea el separador. Su texto lleva arriba la calidad, y los
      talles aclaran que son europeos:
      ```
      ⭐ CALIDAD G5
      Adidas Superstar Blanca Full
      Talles europeos: 36, 39, 40, 42 al 44
      ```
      Los talles se arman con la misma `formatear_talles` de las BR.
   5. El mensaje de precios G5, exactamente este texto, que pasó el usuario:
      ```
      Zapas g5
      💰Adulto $83.000c/u💰

      🚨 A partir de 5 las de adulto $78.000c/u🚨
      ```
3. **Estado del día** (`estado_bot.json`): los ids de las G5 empiezan con `g5-`,
   así que entran en `enviados` como los demás. Agregar marcas aparte para el
   separador y para el precio G5, por ejemplo `separador_g5_enviado` y
   `precios_g5_enviados`. Así, si la tanda se corta y se retoma, no se repiten.
4. **Fotos:** `obtener_foto()` ya sirve, porque las G5 están en
   `catalogo/fotos/g5-.../` dentro de la copia local del piloto.
5. **Probar antes del envío real:**
   - `--dry-run`: tiene que listar primero las BR, después el separador, las G5 y los dos mensajes de precios.
   - Después, el modo de prueba en un grupo de prueba.
6. Subir los cambios del bot a GitHub como los anteriores (repositorio `tienda-zapatillas`).

**Aparte:** `MENSAJE_FINAL_PRECIOS` (BR) dice "calidad Brasil" y no tiene los
modelos de $42.000. **No lo cambies sin preguntarle al usuario** qué texto quiere.

## Si algo no está claro

Preguntale al usuario antes de mandar nada al grupo real.
