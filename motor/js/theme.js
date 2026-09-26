/*
 * Aplica colores, tipografías y tamaño de la tienda ANTES de que se dibuje la
 * página (se carga en el <head> sin defer), así nunca se ve un "parpadeo" con
 * los colores por defecto.
 *
 * Modo oscuro (si la tienda define theme.darkColors):
 *   - por defecto sigue la configuración del celular o la computadora;
 *   - el botón del header lo cambia a mano y la elección queda guardada.
 */
(function applyStoreTheme() {
  var config = window.STORE_CONFIG;
  if (!config || !config.theme) return;
  var root = document.documentElement;
  var theme = config.theme;
  var STORAGE_KEY = (config.id || "tienda") + ":tema";

  function saved() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function modeToUse() {
    if (!theme.darkColors) return "light";
    var choice = saved();
    if (choice === "dark" || choice === "light") return choice;
    return systemPrefersDark() ? "dark" : "light";
  }

  function apply(mode) {
    var colors = mode === "dark" ? theme.darkColors : theme.colors;
    Object.keys(colors || {}).forEach(function (name) {
      root.style.setProperty("--color-" + name, colors[name]);
    });
    root.dataset.theme = mode;
    root.style.colorScheme = mode === "dark" ? "dark" : (theme.colorScheme || "light");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && colors && colors.bg) meta.setAttribute("content", colors.bg);
  }

  apply(modeToUse());
  if (theme.density) root.dataset.density = theme.density;

  if (theme.fonts) {
    if (theme.fonts.display) root.style.setProperty("--font-display", theme.fonts.display);
    if (theme.fonts.body) root.style.setProperty("--font-body", theme.fonts.body);
    if (theme.fonts.stylesheet) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      // Las páginas dentro de "paginas/" indican con STORE_ROOT dónde está la raíz.
      // Las direcciones completas o que empiezan con "/" (tiendas de clientes) se usan tal cual.
      link.href = /^(https?:|\/)/.test(theme.fonts.stylesheet) ? theme.fonts.stylesheet : (window.STORE_ROOT || "") + theme.fonts.stylesheet;
      document.head.append(link);
    }
  }

  // Si el cliente no eligió a mano, acompaña los cambios del sistema (por ejemplo, de noche).
  if (theme.darkColors && window.matchMedia) {
    var query = window.matchMedia("(prefers-color-scheme: dark)");
    var follow = function () { if (!saved()) apply(modeToUse()); };
    if (query.addEventListener) query.addEventListener("change", follow);
  }

  // Para el botón del header (motor/js/interfaz/layout.js).
  window.storeTheme = {
    available: Boolean(theme.darkColors),
    current: function () { return root.dataset.theme; },
    toggle: function () {
      var next = root.dataset.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* sin guardado: igual cambia */ }
      apply(next);
      return next;
    },
  };
})();
