/* Aplica el tema y el tamaño de letra guardados antes de pintar la página (evita el destello claro). */
(function () {
  try {
    var mode = localStorage.getItem('nexo.theme') || 'system';
    var size = localStorage.getItem('nexo.textSize') || 'normal';
    var dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-text-size', size);
  } catch (e) { /* almacenamiento bloqueado: se queda el tema claro */ }
})();
