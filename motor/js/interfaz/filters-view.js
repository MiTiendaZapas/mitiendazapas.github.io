/*
 * Filtros y buscador.
 *   Celular/tablet: barra con buscador + botón "Filtros" (abre un panel desde
 *                   abajo) y una fila de marcas para filtrar con un toque.
 *   Computadora:    buscador arriba y panel de filtros fijo a la izquierda.
 */
import { escapeHtml, plural } from "../utils.js";
import { icon } from "./icons.js";

const SEARCH_DELAY_MS = 150;

export function createFiltersView({ config, filters, catalogView, overlays }) {
  const toolbar = catalogView.toolbar;
  const sidebar = catalogView.filtersPanel;
  const categoryNames = config.categories ?? {};

  toolbar.innerHTML = `
    <div class="catalog-toolbar">
      <div class="search">
        ${icon("search")}
        <input class="search__input" type="search" placeholder="Buscar modelo" aria-label="Buscar modelo o marca"
          autocomplete="off" enterkeyhint="search" maxlength="60" data-search>
        <button class="search__clear" type="button" data-search-clear aria-label="Borrar búsqueda" hidden>${icon("close")}</button>
      </div>
      <button class="btn btn--outline filters-toggle" type="button" data-open-filters>
        ${icon("filter")} Filtros <span class="filters-toggle__count" data-filters-count hidden></span>
      </button>
    </div>
    <div class="brand-strip" role="group" aria-label="Filtrar por marca" data-brand-strip></div>
    <div class="active-filters" data-active hidden></div>`;

  const search = toolbar.querySelector("[data-search]");
  const searchClear = toolbar.querySelector("[data-search-clear]");
  const brandStrip = toolbar.querySelector("[data-brand-strip]");
  const activeBox = toolbar.querySelector("[data-active]");
  const toggleCount = toolbar.querySelector("[data-filters-count]");

  // --- panel de filtros de celular ------------------------------------------
  const sheet = document.createElement("dialog");
  sheet.className = "filters-sheet";
  sheet.setAttribute("aria-labelledby", "filters-title");
  sheet.innerHTML = `
    <div class="filters-sheet__panel">
      <header class="filters-sheet__header">
        <h2 class="filters-sheet__title" id="filters-title">Filtros</h2>
        <button class="icon-btn" type="button" data-close-sheet aria-label="Cerrar filtros">${icon("close")}</button>
      </header>
      <div class="filters-sheet__body" data-sheet-body></div>
      <footer class="filters-sheet__footer">
        <button class="btn btn--outline" type="button" data-clear-all>Limpiar</button>
        <button class="btn btn--primary" type="button" data-close-sheet data-sheet-results>Ver modelos</button>
      </footer>
    </div>`;
  overlays.append(sheet);
  const sheetBody = sheet.querySelector("[data-sheet-body]");

  toolbar.querySelector("[data-open-filters]").addEventListener("click", () => {
    sheet.showModal();
    document.body.classList.add("is-locked");
  });
  sheet.addEventListener("close", () => document.body.classList.remove("is-locked"));
  sheet.addEventListener("click", (event) => {
    if (event.target === sheet || event.target.closest("[data-close-sheet]")) sheet.close();
    if (event.target.closest("[data-clear-all]")) filters.clear({ keepQuery: true });
  });

  // --- secciones (se usan igual en el panel lateral y en el de celular) --------
  function sectionsHtml(options) {
    const categories = options.categories.length > 1 ? `
      <fieldset class="filter-group">
        <legend class="filter-group__title">Categoría</legend>
        <div class="filter-pills">
          ${options.categories.map((c) => `
            <button class="filter-pill" type="button" data-filter-category="${escapeHtml(c.value)}" aria-pressed="${c.selected}">
              ${escapeHtml(categoryNames[c.value] ?? c.value)} <span class="filter-count">${c.count}</span>
            </button>`).join("")}
        </div>
      </fieldset>` : "";

    return `
      ${categories}
      <fieldset class="filter-group">
        <legend class="filter-group__title">Marca</legend>
        <div class="filter-checks">
          ${options.brands.map((b) => `
            <label class="filter-check${b.count === 0 && !b.selected ? " is-empty" : ""}">
              <input type="checkbox" data-filter-brand="${escapeHtml(b.value)}" ${b.selected ? "checked" : ""}
                ${b.count === 0 && !b.selected ? "disabled" : ""}>
              <span>${escapeHtml(b.value || "Otras")}</span>
              <span class="filter-count">${b.count}</span>
            </label>`).join("")}
        </div>
      </fieldset>
      <fieldset class="filter-group">
        <legend class="filter-group__title">Talle <span class="filter-group__hint">con stock</span></legend>
        <div class="filter-sizes">
          ${options.sizes.map((s) => `
            <button class="size-chip" type="button" data-filter-size="${escapeHtml(s.value)}" aria-pressed="${s.selected}"
              ${s.count === 0 && !s.selected ? "disabled" : ""}
              aria-label="Talle ${escapeHtml(s.value)}, ${plural(s.count, "modelo")}">${escapeHtml(s.value)}</button>`).join("")}
        </div>
      </fieldset>`;
  }

  function brandStripHtml(options) {
    const selected = filters.state.brands;
    const all = `<button class="brand-chip" type="button" data-strip-brand="" aria-pressed="${selected.size === 0}">Todas</button>`;
    return all + options.brands.filter((b) => b.value).map((b) => `
      <button class="brand-chip" type="button" data-strip-brand="${escapeHtml(b.value)}"
        aria-pressed="${selected.size === 1 && b.selected}">${escapeHtml(b.value)}</button>`).join("");
  }

  function activeHtml() {
    const { state } = filters;
    const chips = [
      ...(state.category ? [{ label: categoryNames[state.category] ?? state.category, attr: `data-remove-category` }] : []),
      ...[...state.brands].map((b) => ({ label: b || "Otras", attr: `data-remove-brand="${escapeHtml(b)}"` })),
      ...[...state.sizes].map((s) => ({ label: `Talle ${s}`, attr: `data-remove-size="${escapeHtml(s)}"` })),
    ];
    if (!chips.length) return "";
    return `
      ${chips.map((c) => `<button class="active-chip" type="button" ${c.attr} aria-label="Quitar filtro ${escapeHtml(c.label)}">${escapeHtml(c.label)} ${icon("close")}</button>`).join("")}
      <button class="active-clear" type="button" data-clear-all>Limpiar todo</button>`;
  }

  // --- aplicar ------------------------------------------------------------------
  /** Al redibujar los filtros, el foco del teclado vuelve al mismo control. */
  function focusKey() {
    const el = document.activeElement;
    const attr = ["data-filter-brand", "data-filter-size", "data-filter-category", "data-strip-brand"].find((a) => el?.hasAttribute?.(a));
    return attr ? { attr, value: el.getAttribute(attr), inSheet: sheet.contains(el), inStrip: brandStrip.contains(el) } : null;
  }

  function restoreFocus(key) {
    if (!key) return;
    const scope = key.inSheet ? sheetBody : key.inStrip ? brandStrip : sidebar;
    [...scope.querySelectorAll(`[${key.attr}]`)].find((el) => el.getAttribute(key.attr) === key.value)?.focus({ preventScroll: true });
  }

  function update() {
    const options = filters.options();
    const results = filters.results();
    const html = sectionsHtml(options);
    const focused = focusKey();
    sidebar.innerHTML = `<h2 class="visually-hidden">Filtros</h2>${html}`;
    sheetBody.innerHTML = html;
    brandStrip.innerHTML = brandStripHtml(options);
    restoreFocus(focused);

    const active = activeHtml();
    activeBox.innerHTML = active;
    activeBox.hidden = !active;
    const count = filters.activeCount();
    toggleCount.hidden = count === 0;
    toggleCount.textContent = String(count);
    searchClear.hidden = !filters.state.q;
    if (search.value !== filters.state.q && document.activeElement !== search) search.value = filters.state.q;

    const shown = catalogView.showOnly(new Set(results.map((p) => p.id)));
    catalogView.preselectSize(filters.state.sizes.size === 1 ? [...filters.state.sizes][0] : null);
    // La fila de marcas se desplaza hasta la marca elegida.
    const pressed = brandStrip.querySelector('[aria-pressed="true"]');
    if (pressed) brandStrip.scrollLeft = pressed.offsetLeft - brandStrip.offsetLeft - 16;
    catalogView.setCount(countText(shown, catalogView.totalCount(), filters.hasAny(), config.catalogHeader));
    sheet.querySelector("[data-sheet-results]").textContent = shown ? `Ver ${plural(shown, "modelo", "modelos")}` : "Sin resultados";

    if (shown > 0) {
      catalogView.showEmpty(null);
    } else if (filters.state.q && filters.activeCount() === 0) {
      catalogView.showEmpty({
        title: "Sin resultados",
        text: `No encontramos modelos para “${filters.state.q}”. Probá con otra palabra, por ejemplo la marca o el modelo (dunk, forum, 530).`,
        actionLabel: "Borrar búsqueda",
        onAction: () => { search.value = ""; filters.setQuery(""); },
      });
    } else {
      catalogView.showEmpty({
        title: "No hay modelos con esos filtros",
        text: "Probá sacando algún filtro o eligiendo otro talle. También podés consultarnos por WhatsApp.",
        actionLabel: "Limpiar filtros",
        onAction: () => filters.clear(),
      });
    }
  }

  // --- eventos ------------------------------------------------------------------
  let searchTimer = 0;
  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchClear.hidden = !search.value;
    searchTimer = setTimeout(() => filters.setQuery(search.value), SEARCH_DELAY_MS);
  });
  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") search.blur();   // en celular cierra el teclado
  });
  searchClear.addEventListener("click", () => {
    search.value = "";
    filters.setQuery("");
    search.focus();
  });

  function handleFilterClick(event) {
    const t = event.target;
    const brand = t.closest("[data-filter-brand]");
    if (brand) return filters.toggleBrand(brand.dataset.filterBrand);
    const size = t.closest("[data-filter-size]");
    if (size) return filters.toggleSize(size.dataset.filterSize);
    const category = t.closest("[data-filter-category]");
    if (category) return filters.setCategory(category.dataset.filterCategory);
    const strip = t.closest("[data-strip-brand]");
    if (strip) return filters.setOnlyBrand(strip.dataset.stripBrand);
    const removeBrand = t.closest("[data-remove-brand]");
    if (removeBrand) return filters.toggleBrand(removeBrand.dataset.removeBrand);
    const removeSize = t.closest("[data-remove-size]");
    if (removeSize) return filters.toggleSize(removeSize.dataset.removeSize);
    if (t.closest("[data-remove-category]")) return filters.setCategory(filters.state.category);
    if (t.closest("[data-clear-all]") && !sheet.contains(t)) return filters.clear({ keepQuery: true });
    return undefined;
  }
  // Las casillas de marca usan "change"; lo demás, "click".
  for (const container of [sidebar, sheetBody]) {
    container.addEventListener("change", (event) => {
      if (event.target.matches("[data-filter-brand]")) filters.toggleBrand(event.target.dataset.filterBrand);
    });
    container.addEventListener("click", (event) => {
      if (!event.target.matches("[data-filter-brand]")) handleFilterClick(event);
    });
  }
  toolbar.addEventListener("click", handleFilterClick);

  filters.subscribe(() => {
    update();
    // Si el cliente estaba más abajo en la lista, se vuelve al principio de los resultados.
    const header = document.querySelector(".site-header")?.offsetHeight ?? 0;
    const bar = toolbar.querySelector(".catalog-toolbar").offsetHeight;
    const top = catalogView.layoutTop() - header - bar - 12;
    if (top < 0) window.scrollBy({ top });
  });

  filters.readUrl();
  search.value = filters.state.q;
  update();
}

/** "179 modelos" / "12 de 179 modelos" (compacto) o "179 modelos disponibles" / "12 modelos de 179" (clásico). */
export function countText(shown, total, filtered, headStyle) {
  if (headStyle === "clasico") {
    return filtered ? `${plural(shown, "modelo", "modelos")} de ${total}` : plural(shown, "modelo disponible", "modelos disponibles");
  }
  return filtered ? `${shown} de ${plural(total, "modelo", "modelos")}` : plural(shown, "modelo", "modelos");
}
