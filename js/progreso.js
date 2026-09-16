/* Pestaña Progreso: gráfico por ejercicio, heatmap de entrenamientos y rachas. */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.progreso = (function () {
  var SEMANAS_HEATMAP = 14;

  var estado = { ejercicioId: "", metrica: "peso_maximo" };

  function render(container) {
    var data = GYMAPP.storage.getData();
    var opcionesEjercicio = construirOpcionesEjercicio(data);
    if ((!estado.ejercicioId || !opcionesEjercicio.some(function (o) { return o.id === estado.ejercicioId; })) && opcionesEjercicio.length) {
      estado.ejercicioId = opcionesEjercicio[0].id;
    }

    var rachas = calcularRachas(obtenerFechasEntrenadas(data.sesiones_entrenamiento));

    container.innerHTML = template(data, opcionesEjercicio, rachas);
    if (!container.dataset.progresoBound) {
      bindEventos(container);
      container.dataset.progresoBound = "1";
    }
    dibujarGrafico(container, data);
  }

  /* --- Datos para el selector de ejercicio --- */

  function construirOpcionesEjercicio(data) {
    var mapa = {};
    data.rutina.dias.forEach(function (dia) {
      dia.ejercicios.forEach(function (ej) {
        mapa[ej.id] = ej.nombre || "(sin nombre)";
      });
    });
    data.sesiones_entrenamiento.forEach(function (s) {
      (s.ejercicios_realizados || []).forEach(function (er) {
        if (!mapa[er.ejercicio_id]) mapa[er.ejercicio_id] = "Ejercicio eliminado de la rutina";
      });
    });
    return Object.keys(mapa).map(function (id) { return { id: id, nombre: mapa[id] }; });
  }

  /* --- Templates --- */

  function template(data, opciones, rachas) {
    var selectorEjercicio = opciones.length
      ? '<div class="campo"><label for="select-progreso-ejercicio">Ejercicio</label>' +
        '<select id="select-progreso-ejercicio">' +
        opciones.map(function (o) {
          return '<option value="' + o.id + '"' + (o.id === estado.ejercicioId ? " selected" : "") + ">" +
            GYMAPP.util.escapeHtml(o.nombre) + "</option>";
        }).join("") +
        "</select></div>"
      : '<p class="nota">Todavía no hay ejercicios en tu rutina ni en tu historial.</p>';

    var seccionGrafico = opciones.length
      ? '<div class="selector-tipo metrica-selector">' +
        botonMetrica("peso_maximo", "Peso máximo") +
        botonMetrica("volumen_total", "Volumen total") +
        "</div>" +
        '<div class="grafico-contenedor"><canvas id="grafico-progreso"></canvas></div>' +
        '<p id="progreso-grafico-nota" class="nota oculto"></p>'
      : "";

    return (
      '<div class="pantalla pantalla-progreso">' +
      "<h2>Progreso</h2>" +
      selectorEjercicio +
      seccionGrafico +
      "<h3>Racha de entrenamientos</h3>" +
      '<div class="tarjetas-macros">' +
      tarjetaRacha("Racha actual", rachas.actual) +
      tarjetaRacha("Racha más larga", rachas.maxima) +
      "</div>" +
      "<h3>Calendario</h3>" +
      renderHeatmap(data.sesiones_entrenamiento) +
      "</div>"
    );
  }

  function botonMetrica(valor, etiqueta) {
    return (
      '<button type="button" data-accion="set-metrica" data-metrica="' + valor + '" class="btn-tipo' +
      (estado.metrica === valor ? " activo" : "") + '">' + etiqueta + "</button>"
    );
  }

  function tarjetaRacha(nombre, valor) {
    return (
      '<div class="tarjeta-macro">' +
      '<span class="tarjeta-macro-valor">' + valor + (valor === 1 ? " día" : " días") + "</span>" +
      '<span class="tarjeta-macro-nombre">' + nombre + "</span>" +
      "</div>"
    );
  }

  /* --- Heatmap --- */

  function renderHeatmap(sesiones) {
    var mapaDias = construirMapaDias(sesiones);
    var hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    var totalDias = SEMANAS_HEATMAP * 7;
    var primerDia = new Date(hoy);
    primerDia.setDate(primerDia.getDate() - (totalDias - 1));
    while (primerDia.getDay() !== 0) {
      primerDia.setDate(primerDia.getDate() - 1);
    }

    var celdas = [];
    var cursor = new Date(primerDia);
    while (cursor <= hoy) {
      var key = formatearFechaISO(cursor);
      celdas.push({ fecha: new Date(cursor), estado: mapaDias[key] || null });
      cursor.setDate(cursor.getDate() + 1);
    }

    return (
      '<div class="heatmap-scroll"><div class="heatmap-grid">' +
      celdas.map(renderCeldaHeatmap).join("") +
      "</div></div>" +
      '<div class="heatmap-leyenda">' +
      leyendaItem("", "Sin entrenar") +
      leyendaItem("gimnasio", "Gimnasio") +
      leyendaItem("futbol", "Fútbol") +
      leyendaItem("ambos", "Ambos") +
      "</div>"
    );
  }

  function construirMapaDias(sesiones) {
    var acumulado = {};
    sesiones.forEach(function (s) {
      var key = s.fecha.slice(0, 10);
      if (!acumulado[key]) acumulado[key] = { gimnasio: false, futbol: false };
      if (s.tipo === "gimnasio") acumulado[key].gimnasio = true;
      if (s.tipo === "futbol") acumulado[key].futbol = true;
    });
    var resultado = {};
    Object.keys(acumulado).forEach(function (key) {
      var d = acumulado[key];
      resultado[key] = d.gimnasio && d.futbol ? "ambos" : (d.gimnasio ? "gimnasio" : "futbol");
    });
    return resultado;
  }

  function renderCeldaHeatmap(celda) {
    var clase = celda.estado ? " " + celda.estado : "";
    var etiqueta = celda.estado ? etiquetaEstado(celda.estado) : "sin entrenamiento";
    var titulo = formatearFechaLegible(celda.fecha) + " · " + etiqueta;
    return '<span class="heatmap-celda' + clase + '" title="' + GYMAPP.util.escapeHtml(titulo) + '"></span>';
  }

  function leyendaItem(tipo, etiqueta) {
    var clase = tipo ? " " + tipo : "";
    return (
      '<span class="heatmap-leyenda-item"><span class="heatmap-leyenda-swatch heatmap-celda' + clase + '"></span>' +
      etiqueta + "</span>"
    );
  }

  function etiquetaEstado(tipo) {
    if (tipo === "ambos") return "Gimnasio y fútbol";
    if (tipo === "gimnasio") return "Gimnasio";
    return "Fútbol";
  }

  function formatearFechaISO(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function formatearFechaLegible(date) {
    return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  /* --- Rachas --- */

  function obtenerFechasEntrenadas(sesiones) {
    var set = {};
    sesiones.forEach(function (s) { set[s.fecha.slice(0, 10)] = true; });
    return Object.keys(set).sort();
  }

  function calcularRachas(fechasOrdenadas) {
    if (!fechasOrdenadas.length) return { actual: 0, maxima: 0 };

    var maxima = 1;
    var rachaEnCurso = 1;

    for (var i = 1; i < fechasOrdenadas.length; i++) {
      var anterior = new Date(fechasOrdenadas[i - 1] + "T00:00:00");
      var actual = new Date(fechasOrdenadas[i] + "T00:00:00");
      var diffDias = Math.round((actual - anterior) / 86400000);
      rachaEnCurso = diffDias === 1 ? rachaEnCurso + 1 : 1;
      if (rachaEnCurso > maxima) maxima = rachaEnCurso;
    }

    var hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    var ultimaFecha = new Date(fechasOrdenadas[fechasOrdenadas.length - 1] + "T00:00:00");
    var diasDesdeUltimaSesion = Math.round((hoy - ultimaFecha) / 86400000);
    var rachaActual = diasDesdeUltimaSesion <= 1 ? rachaEnCurso : 0;

    return { actual: rachaActual, maxima: maxima };
  }

  /* --- Gráfico por ejercicio --- */

  function obtenerSerieEjercicio(sesiones, ejercicioId, metrica) {
    var relevantes = sesiones
      .filter(function (s) {
        return s.tipo === "gimnasio" && s.ejercicios_realizados && s.ejercicios_realizados.some(function (e) {
          return e.ejercicio_id === ejercicioId;
        });
      })
      .sort(function (a, b) { return new Date(a.fecha) - new Date(b.fecha); });

    return relevantes.map(function (s) {
      var registro = s.ejercicios_realizados.filter(function (e) { return e.ejercicio_id === ejercicioId; })[0];
      var valor;
      if (metrica === "peso_maximo") {
        valor = registro.series.reduce(function (max, serie) { return Math.max(max, serie.peso_kg); }, 0);
      } else {
        valor = registro.series.reduce(function (acc, serie) { return acc + serie.peso_kg * serie.reps; }, 0);
      }
      return { fecha: s.fecha, valor: valor };
    });
  }

  function formatearFechaCorta(fechaISO) {
    var d = new Date(fechaISO);
    return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function dibujarGrafico(container, data) {
    var canvas = container.querySelector("#grafico-progreso");
    if (!canvas) return;
    var notaEl = container.querySelector("#progreso-grafico-nota");

    var puntos = obtenerSerieEjercicio(data.sesiones_entrenamiento, estado.ejercicioId, estado.metrica);

    if (!puntos.length) {
      canvas.style.display = "none";
      if (notaEl) {
        notaEl.textContent = "Todavía no hay sesiones registradas para este ejercicio.";
        notaEl.classList.remove("oculto");
      }
      return;
    }

    canvas.style.display = "";
    if (notaEl) notaEl.classList.add("oculto");

    var labels = puntos.map(function (p) { return formatearFechaCorta(p.fecha); });
    var valores = puntos.map(function (p) { return p.valor; });
    var etiqueta = estado.metrica === "peso_maximo" ? "Peso máximo (kg)" : "Volumen total (kg)";

    GYMAPP.graficos.graficoLinea(canvas, labels, valores, etiqueta);
  }

  /* --- Eventos --- */

  function bindEventos(container) {
    container.addEventListener("change", function (ev) {
      if (ev.target.id === "select-progreso-ejercicio") {
        estado.ejercicioId = ev.target.value;
        render(container);
      }
    });

    container.addEventListener("click", function (ev) {
      var boton = ev.target.closest('[data-accion="set-metrica"]');
      if (!boton) return;
      estado.metrica = boton.dataset.metrica;
      render(container);
    });
  }

  return { render: render };
})();
