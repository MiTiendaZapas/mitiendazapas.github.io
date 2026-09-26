/*
 * Páginas de información (Cómo comprar, Talles, Envíos, Cambios, Preguntas,
 * Nosotros, Quiero revender) y footer, armados desde configuracion.js.
 * Cada tienda (o cliente) cambia los textos sin tocar este archivo.
 */
import { escapeHtml, fromRoot, whatsappLink } from "../utils.js";
import { icon } from "./icons.js";
import { socialLinksHtml } from "./social.js";

const esc = escapeHtml;

// --- contenido de cada página ------------------------------------------------

/** Tabla de talles (también la usa la vista de cada modelo). */
export function sizeTableHtml(chart) {
  return `
    <div class="size-table" role="table" aria-label="${esc(chart.title)}">
      <div class="size-table__row size-table__row--head" role="row">
        ${chart.columns.map((c) => `<span role="columnheader">${esc(c)}</span>`).join("")}
      </div>
      ${chart.rows.map((row) => `
        <div class="size-table__row" role="row">${row.map((cell) => `<span role="cell">${esc(cell)}</span>`).join("")}</div>`).join("")}
    </div>
    ${chart.hint ? `<p class="size-table__hint">${icon("ruler")} ${esc(chart.hint)}</p>` : ""}`;
}

function sizesBody(config) {
  return `<div class="size-page">${sizeTableHtml(config.sizeChart)}</div>`;
}

function howToBuyBody(config) {
  return `
    <ol class="steps-grid">
      ${config.howToBuy.steps.map((s, i) => `
        <li class="step-card">
          <span class="step-card__number" aria-hidden="true">${i + 1}</span>
          <h2 class="step-card__title">${esc(s.title)}</h2>
          <p class="step-card__text">${esc(s.text)}</p>
        </li>`).join("")}
    </ol>`;
}

function shippingBody(config) {
  const cards = Object.values(config.shipping.methods).map((m) => {
    const consult = m.consultMessage
      ? `<a class="btn btn--outline" href="${whatsappLink(config.contact.whatsappQueries, `Hola! ${m.consultMessage}`)}" target="_blank" rel="noopener">${icon("whatsapp")} ${esc(m.consultLabel ?? "Consultar")}</a>`
      : "";
    return `
      <article class="info-card">
        <header class="info-card__head">
          <span class="info-card__icon">${icon(m.icon ?? "truck")}</span>
          <div>
            <h2 class="info-card__title">${esc(m.label)}</h2>
            <p class="info-card__text">${esc(m.summary)}</p>
          </div>
        </header>
        ${m.points?.length ? `<ul class="check-list">${m.points.map((pt) => `<li>${icon("check")}<span>${esc(pt)}</span></li>`).join("")}</ul>` : ""}
        ${consult}
      </article>`;
  });
  return `<div class="shipping-grid">${cards.join("")}</div>`;
}

function exchangesBody(config, channel) {
  const modes = channel.purchaseModes;
  const card = (mode, highlight) => `
    <article class="info-card${highlight ? " info-card--accent" : ""}">
      <h2 class="info-card__title">${esc(modes[mode].title)}</h2>
      <p class="info-card__big">${esc(modes[mode].note)}</p>
      ${modes[mode].when ? `<p class="info-card__text">${esc(modes[mode].when)}</p>` : ""}
    </article>`;
  return `
    <div class="exchange-grid">
      ${card("unidad", true)}
      ${card("mayor", false)}
      <article class="info-card">
        <h2 class="info-card__title">Falla de fábrica</h2>
        <p class="info-card__big">${esc(config.exchanges.faultTitle ?? "Se cambia")}</p>
        <p class="info-card__text">${esc(config.exchanges.faultNote)}</p>
      </article>
    </div>`;
}

function faqBody(config, channelKey) {
  const items = (config.faq ?? []).filter((item) => !item.channels || item.channels.includes(channelKey));
  return `
    <div class="faq-list">
      ${items.map((item) => `
        <details class="faq-item">
          <summary>${esc(item.q)} ${icon("chevronDown")}</summary>
          <p>${esc(item.a)}</p>
        </details>`).join("")}
    </div>`;
}

function aboutBody(config) {
  const c = config.about;
  return `
    <div class="about">
      ${config.logo ? `<img class="about__logo" src="${esc(fromRoot(config.logo.large))}" alt="${esc(config.logo.alt)}" width="220" height="220">` : ""}
      <div class="about__copy">
        ${c.text.map((t) => `<p class="about__text">${esc(t)}</p>`).join("")}
        <ul class="about__values">
          ${c.values.map((v) => `<li><strong>${esc(v.title)}</strong><span>${esc(v.text)}</span></li>`).join("")}
        </ul>
      </div>
    </div>`;
}

function resellersBody(config) {
  const c = config.resellers;
  return `
    <ul class="feature-list feature-list--row">
      ${c.points.map((p) => `
        <li class="feature">
          <span class="feature__icon">${icon(p.icon)}</span>
          <div><h2 class="feature__title">${esc(p.title)}</h2><p class="feature__text">${esc(p.text)}</p></div>
        </li>`).join("")}
    </ul>`;
}

/**
 * Datos de cada página: encabezado + contenido. Cada una se arma solo cuando
 * se visita, así una tienda sin, por ejemplo, "about" en la configuración no falla.
 */
function pageDefinitions(config, channel, channelKey) {
  return {
    "como-comprar": () => ({ eyebrow: "Paso a paso", title: config.howToBuy.title, lead: config.howToBuy.lead, body: () => howToBuyBody(config) }),
    talles: () => ({ eyebrow: "Elegí bien", title: config.sizeChart.title, lead: "Buscá tu talle según el largo de tu pie.", body: () => sizesBody(config) }),
    envios: () => ({ eyebrow: "Recibí tu pedido", title: config.shippingSection.title, lead: config.shippingSection.lead, body: () => shippingBody(config) }),
    cambios: () => ({ eyebrow: "Tu compra, clara", title: config.exchanges.title, lead: config.exchanges.lead, body: () => exchangesBody(config, channel) }),
    preguntas: () => ({ eyebrow: "Ayuda", title: "Preguntas frecuentes", lead: "Las dudas más comunes sobre pedidos, envíos y cambios.", body: () => faqBody(config, channelKey) }),
    nosotros: () => ({ eyebrow: "La marca", title: config.about.title, lead: "", body: () => aboutBody(config) }),
    revender: () => ({
      eyebrow: "Reventa",
      title: config.resellers.title,
      lead: config.resellers.lead,
      cta: { href: whatsappLink(config.resellers.whatsapp, config.resellers.message), label: config.resellers.ctaLabel },
      highlight: true,
      body: () => resellersBody(config),
    }),
  };
}

// --- armado de la página -------------------------------------------------------

export function renderInfoPage(root, { config, channel, channelKey, links }) {
  const build = pageDefinitions(config, channel, channelKey)[links.currentPage];
  const page = build && links.pages.some((p) => p.id === links.currentPage) ? build() : null;
  if (!page) {
    root.innerHTML = `
      <div class="container page-missing">
        <h1 class="page-hero__title">Página no encontrada</h1>
        <a class="btn btn--primary" href="${esc(links.store())}">Ir al catálogo</a>
      </div>`;
    return;
  }
  const consult = whatsappLink(config.contact.whatsappQueries, `Hola! Tengo una consulta.`);

  root.innerHTML = `
    <section class="page-hero${page.highlight ? " page-hero--highlight" : ""}" aria-labelledby="page-title">
      <div class="container page-hero__inner">
        <nav class="breadcrumb" aria-label="Estás en">
          <a href="${esc(links.store())}">Inicio</a> <span aria-hidden="true">/</span> <span aria-current="page">${esc(links.pages.find((p) => p.id === links.currentPage).label)}</span>
        </nav>
        <p class="eyebrow">${esc(page.eyebrow)}</p>
        <h1 class="page-hero__title" id="page-title">${esc(page.title)}</h1>
        ${page.lead ? `<p class="page-hero__lead">${esc(page.lead)}</p>` : ""}
        ${page.cta ? `<a class="btn btn--primary btn--lg" href="${page.cta.href}" target="_blank" rel="noopener">${icon("whatsapp")} ${esc(page.cta.label)}</a>` : ""}
      </div>
    </section>
    <div class="container page-body">${page.body()}</div>
    <section class="page-cta" aria-label="Seguir comprando">
      <div class="container page-cta__inner">
        <div>
          <h2 class="page-cta__title">¿Listo para armar tu pedido?</h2>
          <p class="page-cta__text">Elegí tus modelos y talles, y envianos el pedido por WhatsApp.</p>
        </div>
        <div class="page-cta__actions">
          <a class="btn btn--primary btn--lg" href="${esc(links.store("#catalogo"))}">Ver catálogo ${icon("arrowRight")}</a>
          <a class="btn btn--outline btn--lg" href="${consult}" target="_blank" rel="noopener">${icon("whatsapp")} Consultar</a>
        </div>
      </div>
    </section>`;
}

// --- footer (incluye, discreta, la promo de tiendas a medida) --------------------

function platformPromo(config) {
  const c = config.platformPromo;
  if (!c || c.enabled === false) return "";
  return `
    <aside class="platform-promo" aria-labelledby="tu-tienda-title" id="tu-tienda">
      <div class="container platform-promo__inner">
        <span class="platform-promo__icon">${icon("store")}</span>
        <div class="platform-promo__copy">
          <h2 class="platform-promo__title" id="tu-tienda-title">${esc(c.title)}</h2>
          <p class="platform-promo__text">${esc(c.text)}</p>
        </div>
        <a class="btn btn--outline" href="${whatsappLink(c.whatsapp, c.message)}" target="_blank" rel="noopener">${esc(c.ctaLabel)} ${icon("arrowRight")}</a>
      </div>
    </aside>`;
}

/** Pregunta chiquita al pie (tiendas de clientes): "¿Querés una tienda así?" con link a WhatsApp. */
function platformCredit(config) {
  const c = config.platformCredit;
  if (!c || c.enabled === false) return "";
  const message = (c.message ?? "").replace("{tienda}", config.name);
  return `<p class="platform-credit"><a href="${whatsappLink(c.whatsapp, message)}" target="_blank" rel="noopener">${esc(c.text)}</a></p>`;
}

export function renderFooter(root, { config, links }) {
  const infoPages = links.pages.map((p) => `<li><a href="${esc(links.page(p))}">${esc(p.label)}</a></li>`).join("");
  const year = new Date().getFullYear();

  root.innerHTML = `
    ${platformPromo(config)}
    <div class="container site-footer__main">
      <div class="site-footer__grid">
        <div class="site-footer__brand">
          ${config.logo ? `<img class="site-footer__logo" src="${esc(fromRoot(config.logo.large))}" alt="${esc(config.logo.alt)}" width="88" height="88" loading="lazy">` : ""}
          <p class="site-footer__name">${esc(config.name)}</p>
          <p class="site-footer__text">${esc(config.footer?.description ?? config.tagline)}</p>
        </div>
        <nav aria-label="Tienda">
          <h2 class="site-footer__heading">Tienda</h2>
          <ul class="site-footer__list">
            <li><a href="${esc(links.store("#catalogo"))}">Catálogo</a></li>
            ${infoPages}
          </ul>
        </nav>
        <div>
          <h2 class="site-footer__heading">Contacto</h2>
          <a class="footer-whatsapp" href="${whatsappLink(config.contact.whatsappQueries)}" target="_blank" rel="noopener">
            ${icon("whatsapp")} <span><small>WhatsApp</small>Escribinos</span>
          </a>
          ${config.social?.length ? `<h2 class="site-footer__heading site-footer__heading--social">Seguinos</h2>` : ""}
          ${socialLinksHtml(config, { handles: true, className: "social-list--stack" })}
        </div>
      </div>
      <div class="site-footer__bottom">
        <p>© ${year} ${esc(config.name)}. Todos los derechos reservados.</p>
        <p>${esc(config.footer?.legal ?? "")}</p>
        ${platformCredit(config)}
      </div>
    </div>`;
}
