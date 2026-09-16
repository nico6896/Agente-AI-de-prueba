/* Wrapper fino sobre Chart.js para no repetir configuración en cada pantalla. */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.graficos = (function () {
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
          borderColor: "#4ade80",
          backgroundColor: "rgba(74, 222, 128, 0.15)",
          tension: 0.25,
          fill: true,
          pointRadius: 3,
          pointBackgroundColor: "#4ade80"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: "#9ca3af" }, grid: { color: "#2a2e37" } },
          y: { ticks: { color: "#9ca3af" }, grid: { color: "#2a2e37" } }
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
          x: { ticks: { color: "#9ca3af" }, grid: { display: false } },
          y: { ticks: { color: "#9ca3af" }, grid: { color: "#2a2e37" } }
        },
        plugins: {
          legend: { labels: { color: "#9ca3af" } }
        }
      }
    });
  }

  return { graficoLinea: graficoLinea, graficoBarras: graficoBarras };
})();
