/* Utilidades compartidas entre módulos. */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.util = (function () {
  function generarId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  return { generarId: generarId, escapeHtml: escapeHtml };
})();
