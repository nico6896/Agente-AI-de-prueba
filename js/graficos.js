/* Wrapper fino sobre Chart.js para no repetir configuración en cada pantalla. */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.graficos = (function () {
  var COLOR_PRIMARIO = "#e31b23";
  var COLOR_PRIMARIO_FONDO = "rgba(227, 27, 35, 0.15)";
  var COLOR_TEXTO_SECUNDARIO = "#a3a3a3";
  var COLOR_BORDE = "#2b2b2b";

  function destruirSiExiste(canvas) {
    var existente = window.Chart.getChart(canvas);
    if (existente) existente.destroy();
  }

  function graficoLinea(canvas, labels, valores, etiqueta) {
    destruirSiExiste(canvas);
    return new window.Chart(canvas, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: etiqueta,
          data: valores,
          borderColor: COLOR_PRIMARIO,
          backgroundColor: COLOR_PRIMARIO_FONDO,
          tension: 0.25,
          fill: true,
          pointRadius: 3,
          pointBackgroundColor: COLOR_PRIMARIO
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: COLOR_TEXTO_SECUNDARIO }, grid: { color: COLOR_BORDE } },
          y: { ticks: { color: COLOR_TEXTO_SECUNDARIO }, grid: { color: COLOR_BORDE } }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  function graficoBarras(canvas, labels, datasets) {
    destruirSiExiste(canvas);
    return new window.Chart(canvas, {
      type: "bar",
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: COLOR_TEXTO_SECUNDARIO }, grid: { display: false } },
          y: { ticks: { color: COLOR_TEXTO_SECUNDARIO }, grid: { color: COLOR_BORDE } }
        },
        plugins: {
          legend: { labels: { color: COLOR_TEXTO_SECUNDARIO } }
        }
      }
    });
  }

  return { graficoLinea: graficoLinea, graficoBarras: graficoBarras };
})();
