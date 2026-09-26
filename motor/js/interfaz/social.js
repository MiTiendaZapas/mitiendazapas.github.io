/* Links a las redes de la tienda (franja de arriba, portada, pedido enviado, menú y footer). */
import { escapeHtml } from "../utils.js";
import { icon } from "./icons.js";

/**
 * Lista de redes. Con "handles: true" muestra también el usuario (@...),
 * que es lo que la gente busca después en la app.
 */
export function socialLinksHtml(config, { handles = false, className = "" } = {}) {
  const social = config.social ?? [];
  if (!social.length) return "";
  return `
    <ul class="social-list${className ? ` ${className}` : ""}">
      ${social.map((s) => `
        <li><a class="social-link${handles ? " social-link--handle" : ""}" href="${escapeHtml(s.url)}" target="_blank" rel="noopener"
          aria-label="${escapeHtml(s.label)} de ${escapeHtml(config.name)}${s.handle ? ` (${escapeHtml(s.handle)})` : ""}">
          ${icon(s.network)}${handles && s.handle ? `<span>${escapeHtml(s.handle)}</span>` : ""}</a></li>`).join("")}
    </ul>`;
}
