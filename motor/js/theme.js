/*
 * Aplica colores y tipografías de la tienda ANTES de que se dibuje la página
 * (se carga en el <head> sin defer), así nunca se ve un "parpadeo" con los
 * colores por defecto.
 */
(function applyStoreTheme() {
  var config = window.STORE_CONFIG;
  if (!config || !config.theme) return;
  var root = document.documentElement;
  var theme = config.theme;

  Object.keys(theme.colors || {}).forEach(function (name) {
    root.style.setProperty("--color-" + name, theme.colors[name]);
  });
  if (theme.fonts) {
    if (theme.fonts.display) root.style.setProperty("--font-display", theme.fonts.display);
    if (theme.fonts.body) root.style.setProperty("--font-body", theme.fonts.body);
    if (theme.fonts.stylesheet) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      // Las páginas dentro de "paginas/" indican con STORE_ROOT dónde está la raíz.
      link.href = /^https?:/.test(theme.fonts.stylesheet) ? theme.fonts.stylesheet : (window.STORE_ROOT || "") + theme.fonts.stylesheet;
      document.head.append(link);
    }
  }
  if (theme.colorScheme) root.style.colorScheme = theme.colorScheme;
})();
