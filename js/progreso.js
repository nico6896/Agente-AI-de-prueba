/* Pestaña Progreso: gráfico por ejercicio, heatmap de entrenamientos y rachas. */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.progreso = (function () {
  var DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];

  var estado = { ejercicioId: "", metrica: "peso_maximo", mesActual: inicioDeMes(new Date()) };

  function render(container) {
    var data = GYMAPP.storage.getData();
    var opcionesEjercicio = construirOpcionesEjercicio(data);
    if ((!estado.ejercicioId || !opcionesEjercicio.some(function (o) { return o.id === estado.ejercicioId; })) && opcionesEjercicio.length) {
      estado.ejercicioId = opcionesEjercicio[0].id;
    }

    var rachas = calcularRachas(obtenerDiasActivosOrdenados(data.sesiones_entrenamiento));

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

  /* --- Templates ---
     Layout: resumen general -> evolución por ejercicio (con protagonismo) ->
     calendario -> historial accesible. En pantallas angostas todo se apila
     en ese orden; en tablet/desktop, evolución queda en una columna ancha y
     calendario+historial en una columna lateral (ver .progreso-layout en
     styles.css). */

  function template(data, opciones, rachas) {
    var sesiones = data.sesiones_entrenamiento;

    return (
      '<div class="pantalla pantalla-progreso">' +
      "<h2>Progreso</h2>" +
      renderResumenGeneral(sesiones, rachas) +
      '<div class="progreso-layout">' +
      '<div class="progreso-columna-principal">' +
      renderSeccionEvolucion(opciones) +
      "</div>" +
      '<div class="progreso-columna-lateral">' +
      renderSeccionCalendario(sesiones) +
      renderSeccionHistorialAccesible(sesiones) +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  /* --- Resumen general ---
     Cuatro cifras separadas a propósito (ver comentario de "Rachas" más
     abajo): días activos y sesiones totales son conteos distintos, nunca se
     mezclan entre sí ni con las rachas. */
  function renderResumenGeneral(sesiones, rachas) {
    var diasActivos = obtenerDiasActivosOrdenados(sesiones).length;

    return (
      '<div class="tarjetas-macros progreso-resumen">' +
      tarjetaResumen(diasActivos, diasActivos === 1 ? "Día activo" : "Días activos") +
      tarjetaResumen(sesiones.length, sesiones.length === 1 ? "Sesión total" : "Sesiones totales") +
      tarjetaResumen(rachas.actual, "Racha actual (días)") +
      tarjetaResumen(rachas.maxima, "Racha máxima (días)") +
      "</div>"
    );
  }

  function tarjetaResumen(valor, etiqueta) {
    return (
      '<div class="tarjeta-macro">' +
      '<span class="tarjeta-macro-valor">' + valor + "</span>" +
      '<span class="tarjeta-macro-nombre">' + etiqueta + "</span>" +
      "</div>"
    );
  }

  /* --- Evolución por ejercicio --- */

  function renderSeccionEvolucion(opciones) {
    if (!opciones.length) {
      return (
        '<div class="progreso-panel">' +
        "<h3>Evolución por ejercicio</h3>" +
        '<p class="nota">Todavía no hay ejercicios en tu rutina ni en tu historial.</p>' +
        "</div>"
      );
    }

    var selectorEjercicio =
      '<div class="campo"><label for="select-progreso-ejercicio">Ejercicio</label>' +
      '<select id="select-progreso-ejercicio">' +
      opciones.map(function (o) {
        return '<option value="' + o.id + '"' + (o.id === estado.ejercicioId ? " selected" : "") + ">" +
          GYMAPP.util.escapeHtml(o.nombre) + "</option>";
      }).join("") +
      "</select></div>";

    return (
      '<div class="progreso-panel progreso-evolucion">' +
      "<h3>Evolución por ejercicio</h3>" +
      selectorEjercicio +
      '<div class="selector-tipo metrica-selector">' +
      botonMetrica("peso_maximo", "Peso máximo") +
      botonMetrica("repeticiones", "Repeticiones") +
      botonMetrica("volumen_total", "Volumen total") +
      "</div>" +
      '<div class="grafico-contenedor grafico-contenedor-grande"><canvas id="grafico-progreso"></canvas></div>' +
      renderEstadoVacioGrafico() +
      "</div>"
    );
  }

  function renderEstadoVacioGrafico() {
    return (
      '<div id="progreso-grafico-vacio" class="progreso-estado-vacio oculto">' +
      '<span class="progreso-estado-vacio-icono" aria-hidden="true">📉</span>' +
      '<p class="progreso-estado-vacio-titulo">Todavía no hay registros para este ejercicio</p>' +
      '<p class="nota">Cargá una sesión de gimnasio con este ejercicio en la pestaña Entrenar para ver su evolución acá.</p>' +
      "</div>"
    );
  }

  function botonMetrica(valor, etiqueta) {
    return (
      '<button type="button" data-accion="set-metrica" data-metrica="' + valor + '" class="btn-tipo' +
      (estado.metrica === valor ? " activo" : "") + '">' + etiqueta + "</button>"
    );
  }

  /* --- Calendario (sección) --- */

  function renderSeccionCalendario(sesiones) {
    return '<div class="progreso-panel"><h3>Calendario</h3>' + renderCalendario(sesiones) + "</div>";
  }

  /* --- Historial accesible ---
     Vista compacta de solo lectura de las últimas sesiones. Editar y
     eliminar sigue viviendo exclusivamente en Entrenar (PRO-03): acá solo
     se muestra un resumen y un acceso directo, para no duplicar esa lógica. */

  function renderSeccionHistorialAccesible(sesiones) {
    var recientes = sesiones
      .slice()
      .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); })
      .slice(0, 3);

    var lista = recientes.length
      ? '<div class="progreso-historial-lista">' + recientes.map(renderItemHistorialCompacto).join("") + "</div>"
      : '<p class="nota">Todavía no registraste ninguna sesión.</p>';

    return (
      '<div class="progreso-panel">' +
      "<h3>Historial</h3>" +
      lista +
      '<button type="button" data-accion="ver-historial-completo" class="btn btn-secundario btn-ancho">Ver y editar historial completo</button>' +
      "</div>"
    );
  }

  function renderItemHistorialCompacto(sesion) {
    var fechaLegible = formatearFechaLegible(new Date(GYMAPP.util.fechaLocalISO(sesion.fecha) + "T00:00:00"));
    var resumen = sesion.tipo === "gimnasio" ? "🏋️ Gimnasio" : "⚽ Fútbol";

    return (
      '<div class="progreso-historial-item">' +
      '<span class="historial-item-fecha">' + fechaLegible + "</span>" +
      '<span class="historial-item-resumen">' + resumen + "</span>" +
      "</div>"
    );
  }

  /* --- Calendario mensual --- */

  function inicioDeMes(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  /* Lunes=0 ... Domingo=6, a diferencia de Date#getDay() que arranca en domingo. */
  function diaDeSemanaLunesPrimero(date) {
    return (date.getDay() + 6) % 7;
  }

  function formatearMesLabel(date) {
    var texto = date.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  function construirGrillaMes(mes) {
    var primerDiaMes = new Date(mes.getFullYear(), mes.getMonth(), 1);
    var ultimoDiaMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
    var offsetInicio = diaDeSemanaLunesPrimero(primerDiaMes);
    var offsetFin = (7 - (diaDeSemanaLunesPrimero(ultimoDiaMes) + 1)) % 7;

    var celdas = [];
    for (var i = 0; i < offsetInicio; i++) celdas.push(null);
    for (var d = 1; d <= ultimoDiaMes.getDate(); d++) celdas.push(new Date(mes.getFullYear(), mes.getMonth(), d));
    for (var j = 0; j < offsetFin; j++) celdas.push(null);
    return celdas;
  }

  function renderCalendario(sesiones) {
    var mapaDias = construirMapaDias(sesiones);
    var hoyIso = formatearFechaISO(new Date());
    var celdas = construirGrillaMes(estado.mesActual);

    return (
      '<div class="calendario-header">' +
      '<button type="button" data-accion="mes-anterior" class="btn-icono" aria-label="Mes anterior">‹</button>' +
      '<span class="calendario-mes-label">' + formatearMesLabel(estado.mesActual) + "</span>" +
      '<button type="button" data-accion="mes-siguiente" class="btn-icono" aria-label="Mes siguiente">›</button>' +
      "</div>" +
      '<div class="calendario-grid">' +
      DIAS_SEMANA.map(function (d) { return '<span class="calendario-dia-semana">' + d + "</span>"; }).join("") +
      celdas.map(function (fecha) { return renderCeldaCalendario(fecha, mapaDias, hoyIso); }).join("") +
      "</div>" +
      '<div class="heatmap-leyenda">' +
      leyendaItem("", "Sin entrenar") +
      leyendaItem("gimnasio", "Gimnasio") +
      leyendaItem("futbol", "Fútbol") +
      leyendaItem("ambos", "Ambos") +
      "</div>"
    );
  }

  function renderCeldaCalendario(fecha, mapaDias, hoyIso) {
    if (!fecha) return '<span class="calendario-dia vacio"></span>';

    var key = formatearFechaISO(fecha);
    var estadoDia = mapaDias[key] || null;
    var clase = estadoDia ? " " + estadoDia : "";
    if (key === hoyIso) clase += " hoy";

    var etiqueta = estadoDia ? etiquetaEstado(estadoDia) : "sin entrenamiento";
    var titulo = formatearFechaLegible(fecha) + " · " + etiqueta;

    return (
      '<span class="calendario-dia' + clase + '" title="' + GYMAPP.util.escapeHtml(titulo) + '">' +
      fecha.getDate() +
      "</span>"
    );
  }

  function construirMapaDias(sesiones) {
    var acumulado = {};
    sesiones.forEach(function (s) {
      var key = GYMAPP.util.fechaLocalISO(s.fecha);
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

  function leyendaItem(tipo, etiqueta) {
    var clase = tipo ? " " + tipo : "";
    return (
      '<span class="heatmap-leyenda-item"><span class="heatmap-leyenda-swatch calendario-dia' + clase + '"></span>' +
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

  /* --- Rachas ---
     Tres cálculos distintos, que no deben mezclarse:
     - días activos: fechas calendario únicas con al menos una sesión (gimnasio
       y fútbol el mismo día cuentan como un solo día activo).
     - cantidad de sesiones: total de registros en sesiones_entrenamiento (se
       calcula aparte, ver dashboard.js calcularResumenSemanal).
     - racha consecutiva: se deriva de los días activos, nunca de la cantidad
       de sesiones. */

  function obtenerDiasActivosOrdenados(sesiones) {
    var diasActivos = {};
    sesiones.forEach(function (s) { diasActivos[GYMAPP.util.fechaLocalISO(s.fecha)] = true; });
    return Object.keys(diasActivos).sort();
  }

  /* Recibe días activos ÚNICOS ya ordenados (ver obtenerDiasActivosOrdenados).
     racha máxima: mayor cantidad de días activos consecutivos en todo el
     historial. racha actual: la racha vigente hoy, contemplando que si el
     último día activo fue ayer, la racha sigue viva (todavía no venció el
     día de hoy); si el último día activo fue antes de ayer, se cortó. */
  function calcularRachas(diasActivosOrdenados) {
    if (!diasActivosOrdenados.length) return { actual: 0, maxima: 0 };

    var maxima = 1;
    var rachaEnCurso = 1;

    for (var i = 1; i < diasActivosOrdenados.length; i++) {
      var anterior = new Date(diasActivosOrdenados[i - 1] + "T00:00:00");
      var actual = new Date(diasActivosOrdenados[i] + "T00:00:00");
      var diffDias = Math.round((actual - anterior) / 86400000);
      rachaEnCurso = diffDias === 1 ? rachaEnCurso + 1 : 1;
      if (rachaEnCurso > maxima) maxima = rachaEnCurso;
    }

    var hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    var ultimoDiaActivo = new Date(diasActivosOrdenados[diasActivosOrdenados.length - 1] + "T00:00:00");
    var diasDesdeUltimoDiaActivo = Math.round((hoy - ultimoDiaActivo) / 86400000);
    var rachaActual = diasDesdeUltimoDiaActivo <= 1 ? rachaEnCurso : 0;

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
      } else if (metrica === "repeticiones") {
        valor = registro.series.reduce(function (acc, serie) { return acc + serie.reps; }, 0);
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

  var ETIQUETAS_METRICA = {
    peso_maximo: "Peso máximo (kg)",
    repeticiones: "Repeticiones totales",
    volumen_total: "Volumen total (kg)"
  };

  function dibujarGrafico(container, data) {
    var canvas = container.querySelector("#grafico-progreso");
    if (!canvas) return;
    var vacioEl = container.querySelector("#progreso-grafico-vacio");

    var puntos = obtenerSerieEjercicio(data.sesiones_entrenamiento, estado.ejercicioId, estado.metrica);

    if (!puntos.length) {
      canvas.style.display = "none";
      if (vacioEl) vacioEl.classList.remove("oculto");
      return;
    }

    canvas.style.display = "";
    if (vacioEl) vacioEl.classList.add("oculto");

    var labels = puntos.map(function (p) { return formatearFechaCorta(p.fecha); });
    var valores = puntos.map(function (p) { return p.valor; });
    var etiqueta = ETIQUETAS_METRICA[estado.metrica] || ETIQUETAS_METRICA.peso_maximo;

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
      var boton = ev.target.closest("[data-accion]");
      if (!boton) return;
      var accion = boton.dataset.accion;

      if (accion === "set-metrica") {
        estado.metrica = boton.dataset.metrica;
      } else if (accion === "mes-anterior") {
        estado.mesActual = new Date(estado.mesActual.getFullYear(), estado.mesActual.getMonth() - 1, 1);
      } else if (accion === "mes-siguiente") {
        estado.mesActual = new Date(estado.mesActual.getFullYear(), estado.mesActual.getMonth() + 1, 1);
      } else if (accion === "ver-historial-completo") {
        /* El historial editable vive en Entrenar (PRO-03); acá solo
           enlazamos a esa pestaña en vez de duplicar esa lógica. */
        var navEntrenar = document.getElementById("nav-entrenar");
        if (navEntrenar) navEntrenar.click();
        return;
      } else {
        return;
      }
      render(container);
    });
  }

  return {
    render: render,
    /* Expuestas para pruebas unitarias de cálculo de días activos y racha. */
    obtenerDiasActivosOrdenados: obtenerDiasActivosOrdenados,
    calcularRachas: calcularRachas
  };
})();
