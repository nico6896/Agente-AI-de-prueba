/* Pestaña Progreso: gráfico por ejercicio, heatmap de entrenamientos y rachas. */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.progreso = (function () {
  var DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];

  /* seleccionTipo: "ejercicio" | "dia". Ante selección inválida/vacía, se
     prioriza "ejercicio" como valor por defecto (PRO-04, sin cambios) aunque
     el selector (PRO-05) liste primero los días de rutina. */
  var estado = { seleccionTipo: "ejercicio", seleccionId: "", metrica: "peso_maximo", mesActual: inicioDeMes(new Date()) };

  function render(container) {
    var data = GYMAPP.storage.getData();
    var opcionesEjercicio = construirOpcionesEjercicio(data);
    var opcionesDias = construirOpcionesDias(data);

    var seleccionValida =
      estado.seleccionId &&
      ((estado.seleccionTipo === "dia" && opcionesDias.some(function (o) { return o.id === estado.seleccionId; })) ||
        (estado.seleccionTipo === "ejercicio" && opcionesEjercicio.some(function (o) { return o.id === estado.seleccionId; })));

    if (!seleccionValida) {
      if (opcionesEjercicio.length) {
        estado.seleccionTipo = "ejercicio";
        estado.seleccionId = opcionesEjercicio[0].id;
      } else if (opcionesDias.length) {
        estado.seleccionTipo = "dia";
        estado.seleccionId = opcionesDias[0].id;
      } else {
        estado.seleccionTipo = "ejercicio";
        estado.seleccionId = "";
      }
    }

    var rachas = calcularRachas(obtenerDiasActivosOrdenados(data.sesiones_entrenamiento));

    container.innerHTML = template(data, opcionesDias, opcionesEjercicio, rachas);
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

  /* --- Datos para el selector de día de rutina (PRO-05) ---
     Solo días vigentes en la rutina actual: a diferencia de los ejercicios,
     no se reconstruyen días eliminados a partir del historial, porque el
     pedido no lo exige y evita inventar un concepto ("día eliminado") que
     no existía en el esquema. */

  function construirOpcionesDias(data) {
    return data.rutina.dias.map(function (dia) { return { id: dia.id, nombre: dia.nombre || "(sin nombre)" }; });
  }

  /* --- Templates ---
     Layout: resumen general -> evolución por ejercicio (con protagonismo) ->
     calendario -> historial accesible. En pantallas angostas todo se apila
     en ese orden; en tablet/desktop, evolución queda en una columna ancha y
     calendario+historial en una columna lateral (ver .progreso-layout en
     styles.css). */

  function template(data, opcionesDias, opcionesEjercicio, rachas) {
    var sesiones = data.sesiones_entrenamiento;

    return (
      '<div class="pantalla pantalla-progreso">' +
      "<h2>Progreso</h2>" +
      renderResumenGeneral(sesiones, rachas) +
      '<div class="progreso-layout">' +
      '<div class="progreso-columna-principal">' +
      renderSeccionEvolucion(opcionesDias, opcionesEjercicio) +
      "</div>" +
      '<div class="progreso-columna-lateral">' +
      renderSeccionCalendario(data) +
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

  function renderSeccionEvolucion(opcionesDias, opcionesEjercicio) {
    if (!opcionesDias.length && !opcionesEjercicio.length) {
      return (
        '<div class="progreso-panel">' +
        "<h3>Evolución</h3>" +
        '<p class="nota">Todavía no hay ejercicios en tu rutina ni en tu historial.</p>' +
        "</div>"
      );
    }

    var selectorPrincipal = renderSelectorPrincipal(opcionesDias, opcionesEjercicio);
    var cuerpo = estado.seleccionTipo === "dia" ? renderVistaDia() : renderVistaEjercicio();

    return (
      '<div class="progreso-panel progreso-evolucion">' +
      "<h3>Evolución</h3>" +
      selectorPrincipal +
      cuerpo +
      "</div>"
    );
  }

  /* Selector unificado (PRO-05): un solo <select>, con los días de rutina
     agrupados primero y los ejercicios debajo. Los valores de ejercicio se
     mantienen SIN prefijo (igual que antes de PRO-05) para no romper
     integraciones existentes que seleccionan por id de ejercicio; los
     valores de día llevan el prefijo "dia:" para distinguirse en el
     handler de "change" sin ambigüedad posible con un id de ejercicio. */
  function renderSelectorPrincipal(opcionesDias, opcionesEjercicio) {
    var gruposDias = opcionesDias.length
      ? '<optgroup label="Días de rutina">' +
        opcionesDias.map(function (o) {
          var seleccionado = estado.seleccionTipo === "dia" && estado.seleccionId === o.id;
          return '<option value="dia:' + o.id + '"' + (seleccionado ? " selected" : "") + ">" +
            GYMAPP.util.escapeHtml(o.nombre) + "</option>";
        }).join("") +
        "</optgroup>"
      : "";

    var gruposEjercicios = opcionesEjercicio.length
      ? '<optgroup label="Ejercicios">' +
        opcionesEjercicio.map(function (o) {
          var seleccionado = estado.seleccionTipo === "ejercicio" && estado.seleccionId === o.id;
          return '<option value="' + o.id + '"' + (seleccionado ? " selected" : "") + ">" +
            GYMAPP.util.escapeHtml(o.nombre) + "</option>";
        }).join("") +
        "</optgroup>"
      : "";

    return (
      '<div class="campo"><label for="select-progreso-ejercicio">Ver progreso de</label>' +
      '<select id="select-progreso-ejercicio">' + gruposDias + gruposEjercicios + "</select></div>"
    );
  }

  function renderVistaEjercicio() {
    return (
      '<div class="selector-tipo metrica-selector">' +
      botonMetrica("peso_maximo", "Peso máximo") +
      botonMetrica("repeticiones", "Repeticiones") +
      botonMetrica("volumen_total", "Volumen total") +
      "</div>" +
      '<div class="grafico-contenedor grafico-contenedor-grande"><canvas id="grafico-progreso"></canvas></div>' +
      renderEstadoVacioGrafico()
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

  /* --- Evolución por día de rutina (PRO-05) ---
     Reutiliza exactamente las mismas 3 métricas (peso máximo, repeticiones,
     volumen total) que la vista por ejercicio, agregadas sobre TODAS las
     series de TODOS los ejercicios realizados en cada sesión de ese día.
     No se agregan datos nuevos: todo sale de sesiones_entrenamiento. */

  function renderVistaDia() {
    return (
      '<div class="selector-tipo metrica-selector">' +
      botonMetrica("peso_maximo", "Peso máximo") +
      botonMetrica("repeticiones", "Repeticiones") +
      botonMetrica("volumen_total", "Volumen total") +
      "</div>" +
      '<p id="progreso-dia-info" class="nota oculto"></p>' +
      '<div class="grafico-contenedor grafico-contenedor-grande"><canvas id="grafico-progreso"></canvas></div>' +
      renderEstadoVacioDia()
    );
  }

  function renderEstadoVacioDia() {
    return (
      '<div id="progreso-grafico-vacio" class="progreso-estado-vacio oculto">' +
      '<span class="progreso-estado-vacio-icono" aria-hidden="true">📉</span>' +
      '<p class="progreso-estado-vacio-titulo">Todavía no hay sesiones registradas para este día</p>' +
      '<p class="nota">Cargá una sesión de gimnasio para este día en la pestaña Entrenar para ver su evolución acá.</p>' +
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

  function renderSeccionCalendario(data) {
    return '<div class="progreso-panel"><h3>Calendario</h3>' + renderCalendario(data) + "</div>";
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

  /* ACT-04: usa el catálogo dinámico (icono + nombre real de sesion.tipo) en
     vez de asumir gimnasio/fútbol. Un tipo histórico que ya no está en el
     catálogo (dato viejo/corrupto) cae en un fallback legible en vez de
     romper el render. */
  function renderItemHistorialCompacto(sesion) {
    var fechaLegible = formatearFechaLegible(new Date(GYMAPP.util.fechaLocalISO(sesion.fecha) + "T00:00:00"));
    var actividad = GYMAPP.actividades.obtenerActividadPorId(sesion.tipo);
    var resumen = actividad ? actividad.icono + " " + actividad.nombre : "🏃 " + GYMAPP.util.escapeHtml(sesion.tipo || "Actividad");

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

  /* ACT-04: reemplaza el modelo cerrado gimnasio/fútbol/ambos por un mapa
     genérico de N actividades por día (compartido con dashboard.js, ver
     GYMAPP.actividades.obtenerActividadesPorDia). Cada celda muestra un
     badge de color por actividad realizada ese día (nunca uno por sesión:
     el mapa ya dedupe por tipo). La leyenda es dinámica: actividades
     actualmente configuradas + cualquier tipo que aparezca en el historial
     mostrado, así que una actividad desactivada con partidos viejos sigue
     apareciendo tanto en el calendario como en la leyenda. */
  function renderCalendario(data) {
    var sesiones = data.sesiones_entrenamiento;
    var mapaDias = GYMAPP.actividades.obtenerActividadesPorDia(sesiones);
    var hoyIso = formatearFechaISO(new Date());
    var celdas = construirGrillaMes(estado.mesActual);
    var actividadesUsuario = GYMAPP.actividades.obtenerActividadesUsuario(data.usuario);
    var actividadesLeyenda = construirActividadesParaLeyenda(sesiones, actividadesUsuario);

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
      renderLeyendaCalendario(actividadesLeyenda)
    );
  }

  function renderCeldaCalendario(fecha, mapaDias, hoyIso) {
    if (!fecha) return '<span class="calendario-dia vacio"></span>';

    var key = formatearFechaISO(fecha);
    var tipos = mapaDias[key] || [];
    var clase = tipos.length ? " con-actividad" : "";
    if (key === hoyIso) clase += " hoy";

    var etiqueta = tipos.length ? etiquetaEstado(tipos) : "sin entrenamiento";
    var titulo = formatearFechaLegible(fecha) + " · " + etiqueta;

    return (
      '<span class="calendario-dia' + clase + '" title="' + GYMAPP.util.escapeHtml(titulo) + '">' +
      '<span class="calendario-dia-numero">' + fecha.getDate() + "</span>" +
      GYMAPP.actividades.renderBadgesActividad(tipos) +
      "</span>"
    );
  }

  /* Actividades a listar en la leyenda: las configuradas actualmente, más
     cualquier tipo que aparezca en las sesiones mostradas (para no ocultar
     una actividad ya desactivada que tiene historial). Se devuelven en
     orden de catálogo; un tipo que ya no exista en el catálogo no genera
     entrada de leyenda (pero sigue viéndose como badge en el calendario). */
  function construirActividadesParaLeyenda(sesiones, actividadesUsuario) {
    var tipos = {};
    actividadesUsuario.forEach(function (a) { tipos[a.tipo] = true; });
    sesiones.forEach(function (s) { if (s && s.tipo) tipos[s.tipo] = true; });
    return GYMAPP.actividades.obtenerCatalogo().filter(function (a) { return tipos[a.id]; });
  }

  function renderLeyendaCalendario(actividadesLeyenda) {
    return (
      '<div class="heatmap-leyenda">' +
      leyendaItem(null, "Sin entrenar") +
      actividadesLeyenda.map(function (a) { return leyendaItem(a, a.icono + " " + a.nombre); }).join("") +
      "</div>"
    );
  }

  function leyendaItem(actividad, etiqueta) {
    var color = actividad ? actividad.color : "var(--color-borde)";
    return (
      '<span class="heatmap-leyenda-item"><span class="heatmap-leyenda-swatch" style="background-color:' + color + '"></span>' +
      etiqueta + "</span>"
    );
  }

  /* Título legible del día para el tooltip (title=), generalizado a N
     actividades: 1 sola devuelve su nombre, 2+ las concatena con comas y un
     "y" final (ej. "Gimnasio, Pádel y Natación"), igual criterio que ya
     usaba esta pantalla para "Gimnasio y fútbol". */
  function etiquetaEstado(tipos) {
    var nombres = tipos.map(function (t) {
      var a = GYMAPP.actividades.obtenerActividadPorId(t);
      return a ? a.nombre : t;
    });
    if (nombres.length === 1) return nombres[0];
    return nombres.slice(0, -1).join(", ") + " y " + nombres[nombres.length - 1];
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
    return Object.keys(GYMAPP.actividades.obtenerActividadesPorDia(sesiones)).sort();
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

  /* Igual criterio que obtenerSerieEjercicio, pero agregando TODAS las
     series de TODOS los ejercicios realizados en la sesión (no solo uno),
     ya que la vista por día busca la evolución global de ese día. */
  function obtenerSerieDia(sesiones, diaId, metrica) {
    var relevantes = sesiones
      .filter(function (s) { return s.tipo === "gimnasio" && s.dia_rutina_id === diaId; })
      .sort(function (a, b) { return new Date(a.fecha) - new Date(b.fecha); });

    return relevantes.map(function (s) {
      var series = (s.ejercicios_realizados || []).reduce(function (acc, er) {
        return acc.concat(er.series || []);
      }, []);
      var valor;
      if (metrica === "peso_maximo") {
        valor = series.reduce(function (max, serie) { return Math.max(max, serie.peso_kg); }, 0);
      } else if (metrica === "repeticiones") {
        valor = series.reduce(function (acc, serie) { return acc + serie.reps; }, 0);
      } else {
        valor = series.reduce(function (acc, serie) { return acc + serie.peso_kg * serie.reps; }, 0);
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
    var infoEl = container.querySelector("#progreso-dia-info");

    var puntos = estado.seleccionTipo === "dia"
      ? obtenerSerieDia(data.sesiones_entrenamiento, estado.seleccionId, estado.metrica)
      : obtenerSerieEjercicio(data.sesiones_entrenamiento, estado.seleccionId, estado.metrica);

    if (!puntos.length) {
      canvas.style.display = "none";
      if (vacioEl) vacioEl.classList.remove("oculto");
      if (infoEl) infoEl.classList.add("oculto");
      return;
    }

    canvas.style.display = "";
    if (vacioEl) vacioEl.classList.add("oculto");
    if (infoEl) {
      infoEl.textContent = puntos.length === 1
        ? "1 sesión registrada para este día."
        : puntos.length + " sesiones registradas para este día.";
      infoEl.classList.remove("oculto");
    }

    var labels = puntos.map(function (p) { return formatearFechaCorta(p.fecha); });
    var valores = puntos.map(function (p) { return p.valor; });
    var etiqueta = ETIQUETAS_METRICA[estado.metrica] || ETIQUETAS_METRICA.peso_maximo;

    GYMAPP.graficos.graficoLinea(canvas, labels, valores, etiqueta);
  }

  /* --- Eventos --- */

  function bindEventos(container) {
    container.addEventListener("change", function (ev) {
      if (ev.target.id === "select-progreso-ejercicio") {
        var valor = ev.target.value;
        if (valor.indexOf("dia:") === 0) {
          estado.seleccionTipo = "dia";
          estado.seleccionId = valor.slice(4);
        } else {
          estado.seleccionTipo = "ejercicio";
          estado.seleccionId = valor;
        }
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
