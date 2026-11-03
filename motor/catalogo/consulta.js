/*
 * "Mi consulta": el carrito del catálogo para compartir. La persona elige talles de varios modelos y
 * manda la lista por WhatsApp para consultar disponibilidad. Sin precios, sin total en pesos.
 * Solo lo usan los catálogos de una tienda con panel (catalogo.js, <body data-stock="tienda:<tienda>">).
 */
import { icon } from "../js/interfaz/icons.js";
import { whatsappLink } from "../js/utils.js";

const esc = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * store: código de la tienda (guarda la lista en el celular, aparte de otras tiendas).
 * products: () => modelos del catálogo (con "available": talles con stock).
 * settings: ajustes de la tienda (WhatsApp, saludo y texto final del mensaje).
 */
export function createConsulta({ store, products, settings, toast }) {
  const key = `catalogo:${store}:consulta`;
  let items = [];   // [{ id, size, qty }]
  try { items = JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { items = []; }
  if (!Array.isArray(items)) items = [];
  const save = () => { try { localStorage.setItem(key, JSON.stringify(items)); } catch { /* sin guardar: igual funciona */ } };

  const model = (id) => products().find((p) => p.id === id);
  const stockOf = (id, size) => model(id)?.available.find((s) => s.size === size)?.stock ?? 0;
  const count = () => items.reduce((sum, item) => sum + item.qty, 0);

  /** Saca lo que ya no está (modelo sacado, talle agotado) y baja lo que supera el stock. */
  function clean() {
    items = items
      .map((item) => ({ id: String(item?.id), size: String(item?.size), qty: Math.min(Math.trunc(Number(item?.qty)) || 0, stockOf(String(item?.id), String(item?.size))) }))
      .filter((item) => item.qty > 0);
    save();
  }

  // --- botón del encabezado, barra de abajo y ventana ----------------------------------
  const headerButton = document.createElement("button");
  headerButton.type = "button";
  headerButton.className = "c-icon-btn c-cart-btn";
  headerButton.setAttribute("aria-label", "Ver mi consulta");
  headerButton.innerHTML = `${icon("bag")}<span class="c-cart-btn__count" data-count>0</span>`;
  document.querySelector(".c-header__actions").prepend(headerButton);

  const bar = document.createElement("button");
  bar.type = "button";
  bar.className = "c-cartbar";
  bar.hidden = true;
  bar.innerHTML = `<span class="c-cartbar__count" data-count>0</span><span class="c-cartbar__text">Ver mi consulta</span>${icon("chevronRight")}`;
  document.body.append(bar);

  const dialog = document.createElement("dialog");
  dialog.className = "c-sheet c-consulta";
  dialog.setAttribute("aria-labelledby", "consulta-titulo");
  document.body.append(dialog);

  const message = () => {
    const lines = [settings.orderGreeting || "¡Hola! Quiero consultar por estos productos del catálogo:", ""];
    for (const item of items) lines.push(`${model(item.id)?.name ?? "Producto"} (${item.size})${item.qty > 1 ? ` x${item.qty}` : ""}`);
    lines.push("", `Total: ${count() === 1 ? "1 producto" : `${count()} productos`}`);
    if (settings.orderFooter) lines.push("", settings.orderFooter);
    return lines.join("\n");
  };

  function paintDialog() {
    if (!items.length) {
      dialog.innerHTML = `
        <div class="c-sheet__head"><button class="c-icon-btn" type="button" data-close aria-label="Cerrar">${icon("close")}</button></div>
        <div class="c-consulta__body">
          <h2 id="consulta-titulo">Mi consulta</h2>
          <p class="c-muted">Todavía no agregaste nada. Entrá a un modelo, elegí tu talle y tocá “Agregar a mi consulta”.</p>
          <button class="c-btn c-btn--ghost" type="button" data-close>Seguir mirando</button>
        </div>`;
      return;
    }
    dialog.innerHTML = `
      <div class="c-sheet__head"><button class="c-icon-btn" type="button" data-close aria-label="Cerrar">${icon("close")}</button></div>
      <div class="c-consulta__body">
        <h2 id="consulta-titulo">Mi consulta</h2>
        <ul class="c-consulta__list">${items.map((item, i) => {
          const p = model(item.id);
          const photo = p?.images[0] ? p.images[0].sm || p.images[0].lg : "";
          return `<li class="c-line">
            ${photo ? `<img class="c-line__img" src="${esc(photo)}" alt="" width="56" height="56" loading="lazy">` : `<span class="c-line__img"></span>`}
            <div class="c-line__info">
              <strong>${esc(p?.name)}</strong>
              <span class="c-muted">Talle ${esc(item.size)}</span>
              <div class="c-step" role="group" aria-label="Cantidad">
                <button type="button" data-step="-1" data-i="${i}" aria-label="Restar uno" ${item.qty <= 1 ? "disabled" : ""}>${icon("minus")}</button>
                <output>${item.qty}</output>
                <button type="button" data-step="1" data-i="${i}" aria-label="Sumar uno" ${item.qty >= stockOf(item.id, item.size) ? "disabled" : ""}>${icon("plus")}</button>
              </div>
            </div>
            <button class="c-line__remove" type="button" data-remove="${i}" aria-label="Quitar ${esc(p?.name)} talle ${esc(item.size)}">${icon("trash")}</button>
          </li>`;
        }).join("")}</ul>
        <p class="c-muted c-consulta__total">${count() === 1 ? "1 producto" : `${count()} productos`}. Mandás la lista por WhatsApp y te responden con la disponibilidad.</p>
        <a class="c-btn c-btn--wa" href="${whatsappLink(settings.whatsapp, message())}" target="_blank" rel="noopener">${icon("whatsapp")} Enviar consulta por WhatsApp</a>
        <button class="c-btn c-btn--ghost" type="button" data-clear>Vaciar la lista</button>
      </div>`;
  }

  function refresh() {
    clean();
    for (const el of [headerButton, bar]) el.querySelector("[data-count]").textContent = String(count());
    headerButton.classList.toggle("has-items", count() > 0);
    bar.hidden = count() === 0;
    if (dialog.open) paintDialog();
  }

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog || event.target.closest("[data-close]")) return dialog.close();
    const step = event.target.closest("[data-step]");
    if (step) {
      const item = items[Number(step.dataset.i)];
      if (item) item.qty = Math.min(Math.max(item.qty + Number(step.dataset.step), 1), stockOf(item.id, item.size));
      return refresh();
    }
    const remove = event.target.closest("[data-remove]");
    if (remove) { items.splice(Number(remove.dataset.remove), 1); return refresh(); }
    if (event.target.closest("[data-clear]")) { items = []; refresh(); }
  });
  const open = () => { paintDialog(); if (!dialog.open) dialog.showModal(); };
  headerButton.addEventListener("click", open);
  bar.addEventListener("click", open);

  /** Suma 1 par de ese talle (sin pasar el stock). */
  function add(p, size) {
    const have = items.find((item) => item.id === p.id && item.size === size);
    if (have && have.qty >= stockOf(p.id, size)) return toast("Ya sumaste todo el stock de ese talle");
    if (have) have.qty += 1; else items.push({ id: p.id, size, qty: 1 });
    refresh();
    toast(`${p.name} (talle ${size}) agregado a tu consulta`);
  }

  /** En la ficha de un modelo: los talles se eligen y aparece "Agregar a mi consulta". */
  function decorate(sheet, p) {
    const list = sheet.querySelector(".c-sheet__sizes");
    if (!list || !p.available.length) return;
    let chosen = p.available.length === 1 ? p.available[0].size : "";
    list.classList.add("c-sheet__sizes--pick");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "c-btn c-btn--wa";
    const paint = () => {
      for (const li of list.children) li.firstElementChild.setAttribute("aria-pressed", String(li.firstElementChild.dataset.size === chosen));
      button.disabled = !chosen;
      button.innerHTML = chosen ? `${icon("bag")} Agregar talle ${esc(chosen)} a mi consulta` : "Elegí un talle para consultar";
    };
    list.innerHTML = p.available.map((s) => `<li><button type="button" data-size="${esc(s.size)}" aria-label="Talle ${esc(s.size)}">${esc(s.size)}</button></li>`).join("");
    list.addEventListener("click", (event) => {
      const size = event.target.closest("[data-size]")?.dataset.size;
      if (size) { chosen = chosen === size ? "" : size; paint(); }
    });
    button.addEventListener("click", () => { if (chosen) add(p, chosen); });
    (sheet.querySelector("[data-photo]") ?? list).before(button);
    paint();
  }

  refresh();
  return { decorate, refresh, open };
}
