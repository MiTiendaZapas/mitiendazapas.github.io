# Para la laptop: el piloto también sube el catálogo a Cloudflare (09/10)

Instrucciones para la sesión de Claude de la laptop. Todo en español, como
siempre con este usuario.

## Qué está pasando

Las tiendas se están mudando de GitHub a Cloudflare, al dominio **mitiendastock.com**.

- **Tiendas:** las 9 ya están publicadas en Cloudflare Pages: la principal, la de
  revendedores y las 7 de clientes. Se publican desde la PC principal con
  `herramientas/publicar_cloudflare.py`.
- **Stock y fotos:** van en un depósito R2 de Cloudflare, que se ve en
  `https://catalogo.mitiendastock.com/`. Las tiendas en mitiendastock.com leen de ahí.
- **Durante la mudanza el piloto publica en los dos lados:** en GitHub, como siempre
  (los links viejos siguen andando), y en R2.

Desde el 09/10, `sync_catalog.py` termina cada vuelta llamando a `upload_to_r2()`, que
usa `sincronizador/r2.py`. **Si la PC no tiene el token, no sube nada y no falla.** Por
eso la laptop necesita el token.

## Qué hacer

1. El usuario te va a pasar un **token de Cloudflare**. Lo creó él, con permiso
   "Workers R2 Storage: Edit". Guardalo **solo** en el archivo
   `sincronizador/estado/cloudflare_token.txt`: una sola línea, sin espacios.
   - La carpeta `estado/` está en `.gitignore`. **Nunca** subas el token a GitHub,
     ni lo pongas en otro archivo, ni lo repitas en el chat.
   - Comprobá que git lo ignora: `git check-ignore sincronizador/estado/cloudflare_token.txt`.
2. Probá sin subir nada: `python sincronizador/r2.py --revisar`.
   - La primera vez va a decir que subiría muchos archivos (unos 900), porque esta PC
     todavía no tiene su lista de "ya subidos".
3. Hacé la primera subida a mano, que tarda unos 9 minutos: `python sincronizador/r2.py`.
   Si se corta, volvé a correrlo: sigue desde donde quedó.
4. Comprobá que `python sincronizador/r2.py --revisar` diga `Subiría: 0 archivos`.
5. **No hace falta reiniciar el piloto:** `sync_catalog.py` se corre de nuevo en cada
   vuelta. En la ventana del piloto, al final de cada vuelta, tiene que aparecer
   `☁️ Cloudflare: N archivos subidos...`.
6. Para verificar desde afuera:
   `https://catalogo.mitiendastock.com/productos.json` tiene que tener en
   `generatedAt` la hora de la última vuelta.

## Lo que todavía NO cambia

- El piloto sigue publicando en GitHub como siempre.
- **El bot de WhatsApp no se toca todavía:** sigue leyendo de
  `mitiendazapas.github.io`. Cuando se haga el cambio final se le pasa la dirección
  nueva (`https://catalogo.mitiendastock.com/productos.json` y `productos-g5.json`).

## Si algo falla

- `⚠️ Cloudflare: no se pudo subir...` con HTTP 401 o 403: el token está mal copiado
  o no tiene el permiso de R2. Pedile al usuario que lo cree de nuevo.
- Sin internet: se reintenta solo en la vuelta siguiente.
