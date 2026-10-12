// POST /api/panel/logo  (formulario con "grande" 512px y "chico" 160px, ya achicados en el celular)
// DELETE /api/panel/logo  ->  saca el logo
import { LIMITS, fail, imageType, json, readSettings, saveSettings } from "../../../servidor/panel.js";

async function removeOld(env, store, logo) {
  if (logo) await env.CATALOGO.delete([`tiendas/${store}/${logo.large}`, `tiendas/${store}/${logo.small}`]);
}

export async function onRequestPost({ request, env, data }) {
  const store = data.session.tienda;
  let form;
  try { form = await request.formData(); } catch { return fail("Logo inválido."); }
  const large = form.get("grande");
  const small = form.get("chico");
  if (!(large instanceof File) || !(small instanceof File)) return fail("Falta el logo.");
  if (large.size > LIMITS.smallBytes || small.size > LIMITS.smallBytes) return fail("El logo es demasiado pesado.");
  const [largeBytes, smallBytes] = await Promise.all([large.arrayBuffer(), small.arrayBuffer()]);
  const type = imageType(largeBytes);
  if (!type || imageType(smallBytes) !== type) return fail("Solo se aceptan imágenes (JPG o WEBP).");

  const code = crypto.randomUUID();
  const logo = { large: `marca/${code}-512.${type}`, small: `marca/${code}-160.${type}` };
  const httpMetadata = { contentType: type === "jpg" ? "image/jpeg" : "image/webp", cacheControl: "public, max-age=31536000, immutable" };
  await Promise.all([
    env.CATALOGO.put(`tiendas/${store}/${logo.large}`, largeBytes, { httpMetadata }),
    env.CATALOGO.put(`tiendas/${store}/${logo.small}`, smallBytes, { httpMetadata }),
  ]);
  const settings = await readSettings(env, store);
  await removeOld(env, store, settings.logo);
  await saveSettings(env, store, { ...settings, logo });
  return json({ ok: true, logo });
}

export async function onRequestDelete({ env, data }) {
  const store = data.session.tienda;
  const settings = await readSettings(env, store);
  await removeOld(env, store, settings.logo);
  await saveSettings(env, store, { ...settings, logo: null });
  return json({ ok: true });
}
