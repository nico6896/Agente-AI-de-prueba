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

  /* Convierte un timestamp completo (Date, o string ISO con hora como los que
     guarda sesion.fecha) al día calendario LOCAL "YYYY-MM-DD". Nunca hagas
     fecha.slice(0, 10) sobre un timestamp con hora: eso toma el día en UTC,
     que cerca de la medianoche puede ser un día distinto al local (ej.
     entrenar a las 22:00 en Argentina, UTC-3, ya cae en el día siguiente
     en UTC). Esta función es la única fuente de verdad para agrupar
     sesiones por día calendario. */
  function fechaLocalISO(fechaOTimestamp) {
    var d = fechaOTimestamp instanceof Date ? fechaOTimestamp : new Date(fechaOTimestamp);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  return { generarId: generarId, escapeHtml: escapeHtml, fechaLocalISO: fechaLocalISO };
})();
