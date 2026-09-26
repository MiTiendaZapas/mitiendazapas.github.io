/* Franja de redes, header (con menú de celular) y portada, armados desde la configuración. */
import { escapeHtml, fromRoot, whatsappLink } from "../utils.js";
import { icon } from "./icons.js";
import { socialLinksHtml } from "./social.js";

/** Lista de links del menú: el catálogo primero y después las páginas de información. */
function menuItems(links, { onlyMenu }) {
  const catalog = { label: "Catálogo", href: links.isStorePage ? "#catalogo" : links.store("#catalogo"), current: false };
  const pages = links.pages
    .filter((p) => !onlyMenu || p.menu)
    .map((p) => ({ label: p.label, href: links.page(p), current: p.id === links.currentPage }));
  return [catalog, ...pages];
}

function linkHtml(item, className) {
  return `<a class="${className}" href="${escapeHtml(item.href)}"${item.current ? ' aria-current="page"' : ""}>${escapeHtml(item.label)}</a>`;
}

/**
 * Franja finita arriba de todo con las redes, en todas las páginas: es lo
 * primero que se ve y lleva a la gente a seguir la cuenta.
 */
function renderTopbar(header, config) {
  const social = config.social ?? [];
  if (!social.length) return;
  const bar = document.createElement("div");
  bar.className = "topbar";
  bar.innerHTML = `
    <div class="container topbar__inner">
      <span class="topbar__text">${escapeHtml(config.socialInvite ?? "Seguinos")}</span>
      <ul class="topbar__links">
        ${social.map((s) => `
          <li><a class="topbar__link" href="${escapeHtml(s.url)}" target="_blank" rel="noopener" aria-label="${escapeHtml(s.label)} de ${escapeHtml(config.name)}">
            ${icon(s.network)}<span class="topbar__name">${escapeHtml(s.label)}</span><span class="topbar__handle">${escapeHtml(s.handle ?? s.label)}</span></a></li>`).join("")}
      </ul>
    </div>`;
  header.before(bar);
}

export function renderHeader(root, { config, channel, links }) {
  const consult = whatsappLink(config.contact.whatsappQueries, `Hola ${config.name}! Tengo una consulta.`);
  renderTopbar(root, config);
  const nav = menuItems(links, { onlyMenu: true }).map((item) => `<li>${linkHtml(item, "site-nav__link")}</li>`).join("");

  root.innerHTML = `
    <div class="container site-header__inner">
      <button class="icon-btn site-header__menu" type="button" data-open-menu aria-label="Abrir menú" aria-haspopup="dialog">
        ${icon("menu")}
      </button>
      <a class="brand" href="${escapeHtml(links.store())}" aria-label="${escapeHtml(config.name)}, ir al catálogo">
        ${config.logo ? `<img class="brand__logo" src="${escapeHtml(fromRoot(config.logo.small))}" alt="" width="44" height="44">` : ""}
        <span class="brand__text">
          <span class="brand__name">${escapeHtml(config.name)}</span>
          <span class="brand__channel">${escapeHtml(channel.label)}</span>
        </span>
      </a>
      <nav class="site-nav" aria-label="Secciones">
        <ul class="site-nav__list">${nav}</ul>
      </nav>
      <div class="site-header__actions">
        <button class="cart-button" type="button" data-open-cart aria-label="Ver tu pedido, vacío">
          ${icon("bag")}
          <span class="cart-button__label">Tu pedido</span>
          <span class="cart-button__count" data-cart-count aria-hidden="true">0</span>
        </button>
      </div>
    </div>`;
  createMobileMenu(root, config, links, consult);
}

/** Menú de celular: catálogo, páginas de información, WhatsApp y redes. */
function createMobileMenu(header, config, links, consultLink) {
  const menu = document.createElement("dialog");
  menu.className = "menu-sheet";
  menu.setAttribute("aria-label", "Menú");
  menu.innerHTML = `
    <div class="menu-sheet__panel">
      <header class="menu-sheet__header">
        ${config.logo ? `<img src="${escapeHtml(fromRoot(config.logo.small))}" alt="" width="40" height="40">` : ""}
        <span class="brand__name">${escapeHtml(config.name)}</span>
        <button class="icon-btn" type="button" data-close-menu aria-label="Cerrar menú">${icon("close")}</button>
      </header>
      <nav aria-label="Secciones">
        <ul class="menu-sheet__list">
          ${menuItems(links, { onlyMenu: false }).map((item) => `
            <li><a href="${escapeHtml(item.href)}" data-close-menu${item.current ? ' aria-current="page"' : ""}>
              ${escapeHtml(item.label)} ${icon("chevronRight")}</a></li>`).join("")}
        </ul>
      </nav>
      <div class="menu-sheet__footer">
        <a class="btn btn--whatsapp btn--block" href="${consultLink}" target="_blank" rel="noopener">${icon("whatsapp")} Consultar por WhatsApp</a>
        ${socialLinksHtml(config, { handles: true, className: "social-list--stack" })}
      </div>
    </div>`;
  document.body.append(menu);

  header.querySelector("[data-open-menu]").addEventListener("click", () => {
    menu.showModal();
    document.body.classList.add("is-locked");
  });
  menu.addEventListener("close", () => document.body.classList.remove("is-locked"));
  menu.addEventListener("click", (event) => {
    if (event.target === menu || event.target.closest("[data-close-menu]")) menu.close();
  });
}

export function renderHero(root, { config, channel, links }) {
  const hero = channel.hero;
  if (!hero) {
    root.hidden = true;
    return;
  }
  const points = (hero.points ?? [])
    .map((p) => `<li class="hero__point">${icon(p.icon)}${escapeHtml(p.text)}</li>`)
    .join("");

  // Portada compacta (revendedores): solo una franja con lo necesario para comprar.
  if (hero.compact) {
    root.classList.add("hero--compact");
    root.setAttribute("aria-label", "Condiciones de compra");
    root.innerHTML = `<div class="container hero__inner"><ul class="hero__points">${points}</ul></div>`;
    return;
  }

  const howToBuy = links.pages.find((p) => p.id === "como-comprar");
  const social = hero.showSocial ? socialLinksHtml(config, { handles: true }) : "";
  root.setAttribute("aria-labelledby", "hero-title");
  root.innerHTML = `
    <div class="container hero__inner">
      <p class="eyebrow">${escapeHtml(hero.eyebrow)}</p>
      <h1 class="hero__title" id="hero-title">
        ${escapeHtml(hero.title)} <em>${escapeHtml(hero.highlight ?? "")}</em>
      </h1>
      <p class="hero__text">${escapeHtml(hero.text)}</p>
      <ul class="hero__points">${points}</ul>
      <div class="hero__actions">
        <a class="btn btn--primary btn--lg" href="#catalogo">Ver catálogo ${icon("arrowRight")}</a>
        ${howToBuy ? `<a class="btn btn--outline btn--lg" href="${escapeHtml(links.page(howToBuy))}">Cómo comprar</a>` : ""}
      </div>
      ${social ? `<div class="hero__social"><span class="hero__social-title">Seguinos</span>${social}</div>` : ""}
    </div>`;
}
