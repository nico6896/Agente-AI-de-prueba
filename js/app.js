/* Punto de entrada: decide entre onboarding y la app principal, y arma el shell con bottom nav. */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.app = (function () {
  var TABS = [
    { id: "dashboard", label: "Dashboard", icono: "🏠" },
    { id: "entrenar", label: "Entrenar", icono: "🏋️" },
    { id: "progreso", label: "Progreso", icono: "📈" },
    { id: "nutricion", label: "Nutrición", icono: "🍽️" }
  ];

  var tabActual = "dashboard";

  function root() {
    return document.getElementById("app-root");
  }

  function iniciar() {
    var data = GYMAPP.storage.getData();
    if (!data.usuario) {
      GYMAPP.onboarding.render(root());
      return;
    }
    renderShell(data);
  }

  function renderShell(data) {
    root().innerHTML =
      '<div class="app-shell">' +
      '<header class="app-header">' +
      "<span>Hola, " + GYMAPP.util.escapeHtml(data.usuario.nombre) + "</span>" +
      '<button id="btn-rutina" class="btn-icono" title="Rutina" aria-label="Rutina">⚙️</button>' +
      "</header>" +
      '<main id="tab-content" class="tab-content"></main>' +
      '<nav class="bottom-nav">' +
      TABS.map(renderBotonNav).join("") +
      "</nav>" +
      "</div>";

    document.getElementById("btn-rutina").addEventListener("click", function () {
      renderTab("rutina", data);
    });

    TABS.forEach(function (tab) {
      document.getElementById("nav-" + tab.id).addEventListener("click", function () {
        renderTab(tab.id, data);
      });
    });

    renderTab(tabActual, data);
  }

  function renderBotonNav(tab) {
    return (
      '<button id="nav-' + tab.id + '" class="nav-item" data-tab="' + tab.id + '">' +
      '<span class="nav-icono">' + tab.icono + "</span>" +
      '<span class="nav-label">' + tab.label + "</span>" +
      "</button>"
    );
  }

  function renderTab(tabId, data) {
    tabActual = tabId;
    var contenido = document.getElementById("tab-content");

    document.querySelectorAll(".nav-item").forEach(function (btn) {
      btn.classList.toggle("activo", btn.dataset.tab === tabId);
    });

    if (tabId === "dashboard") {
      contenido.innerHTML = renderDashboard(data);
      return;
    }

    if (tabId === "rutina") {
      GYMAPP.rutina.render(contenido);
      return;
    }

    var titulos = {
      entrenar: "Entrenar",
      progreso: "Progreso",
      nutricion: "Nutrición"
    };
    contenido.innerHTML =
      '<div class="pantalla placeholder">' +
      "<h2>" + titulos[tabId] + "</h2>" +
      "<p>Próximamente.</p>" +
      "</div>";
  }

  function renderDashboard(data) {
    var m = data.usuario.metas_macros;
    return (
      '<div class="pantalla">' +
      "<h2>Tus metas diarias</h2>" +
      '<div class="tarjetas-macros">' +
      tarjetaMacro("Calorías", m.calorias, "kcal") +
      tarjetaMacro("Proteínas", m.proteinas_g, "g") +
      tarjetaMacro("Carbohidratos", m.carbos_g, "g") +
      tarjetaMacro("Grasas", m.grasas_g, "g") +
      "</div>" +
      '<p class="nota">Todavía no hay sesiones ni registros cargados.</p>' +
      "</div>"
    );
  }

  function tarjetaMacro(nombre, valor, unidad) {
    return (
      '<div class="tarjeta-macro">' +
      '<span class="tarjeta-macro-valor">' + valor + " " + unidad + "</span>" +
      '<span class="tarjeta-macro-nombre">' + nombre + "</span>" +
      "</div>"
    );
  }

  return { iniciar: iniciar };
})();

document.addEventListener("DOMContentLoaded", function () {
  GYMAPP.app.iniciar();
});
