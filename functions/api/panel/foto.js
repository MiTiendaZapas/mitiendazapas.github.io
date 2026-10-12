// POST /api/panel/foto  (formulario con "grande" y "chica", ya achicadas en el celular)
// ->  { lg, sm, w, h } para agregar al producto. Se revisa el tipo real y el peso.
import { LIMITS, fail, imageType, json } from "../../../servidor/panel.js";

export async function onRequestPost({ request, env, data }) {
  const store = data.session.tienda;
  let form;
  try { form = await request.formData(); } catch { return fail("Foto inválida."); }
  const large = form.get("grande");
  const small = form.get("chica");
  if (!(large instanceof File) || !(small instanceof File)) return fail("Falta la foto.");
  if (large.size > LIMITS.largeBytes || small.size > LIMITS.smallBytes) return fail("La foto es demasiado pesada.");
  const [largeBytes, smallBytes] = await Promise.all([large.arrayBuffer(), small.arrayBuffer()]);
  const type = imageType(largeBytes);
  if (!type || imageType(smallBytes) !== type) return fail("Solo se aceptan fotos (JPG o WEBP).");

  const code = crypto.randomUUID();
  const files = { lg: `fotos/${code}-lg.${type}`, sm: `fotos/${code}-sm.${type}` };
  const httpMetadata = { contentType: type === "jpg" ? "image/jpeg" : "image/webp", cacheControl: "public, max-age=31536000, immutable" };
  await Promise.all([
    env.CATALOGO.put(`tiendas/${store}/${files.lg}`, largeBytes, { httpMetadata }),
    env.CATALOGO.put(`tiendas/${store}/${files.sm}`, smallBytes, { httpMetadata }),
  ]);
  const w = Math.round(Number(form.get("w"))) || 900;
  const h = Math.round(Number(form.get("h"))) || 1200;
  return json({ ok: true, ...files, w, h });
}
