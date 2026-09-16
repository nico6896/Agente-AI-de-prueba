/* Pestaña Entrenar: registra sesiones de gimnasio o fútbol contra sesiones_entrenamiento. */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.entrenamiento = (function () {
  var RPE_VALORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  /* Estado del borrador de sesión en curso. No se persiste hasta "Guardar sesión". */
  var estado = null;

  function estadoInicial() {
    return {
      fecha: fechaHoyISO(),
      tipo: "gimnasio",
      diaRutinaId: "",
      seriesPorEjercicio: {},
      duracion_min: "",
      rpe: null,
      notas: "",
      futbol: { tipo: "entrenamiento", posicion: "", minutos_jugados: "" }
    };
  }

  function fechaHoyISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function render(container) {
    if (!estado) estado = estadoInicial();
    var data = GYMAPP.storage.getData();

    if (estado.tipo === "gimnasio" && estado.diaRutinaId) {
      var dia = buscarDia(data.rutina.dias, estado.diaRutinaId);
      if (dia) asegurarSeriesInicializadas(dia);
    }

    container.innerHTML = template(data, estado);
    if (!container.dataset.entrenarBound) {
      bindEventos(container);
      container.dataset.entrenarBound = "1";
    }
  }

  function buscarDia(dias, diaId) {
    return dias.filter(function (d) { return d.id === diaId; })[0] || null;
  }

  function asegurarSeriesInicializadas(dia) {
    dia.ejercicios.forEach(function (ej) {
      if (estado.seriesPorEjercicio[ej.id]) return;
      var cantidad = ej.series_objetivo > 0 ? ej.series_objetivo : 1;
      var series = [];
      for (var i = 0; i < cantidad; i++) series.push({ peso_kg: "", reps: "" });
      estado.seriesPorEjercicio[ej.id] = series;
    });
  }

  /* --- Templates --- */

  function template(data, estado) {
    return (
      '<div class="pantalla pantalla-entrenar">' +
      "<h2>Entrenar</h2>" +
      renderFecha(estado) +
      renderSelectorTipo(estado) +
      '<div id="entrenar-mensaje" class="mensaje oculto"></div>' +
      (estado.tipo === "gimnasio" ? renderGimnasio(data, estado) : renderFutbol(estado)) +
      renderComun(estado) +
      '<button type="button" data-accion="guardar-sesion" class="btn btn-primario">Guardar sesión</button>' +
      "</div>"
    );
  }

  function renderFecha(estado) {
    return (
      '<div class="campo">' +
      '<label for="input-fecha-sesion">Fecha</label>' +
      '<input type="date" id="input-fecha-sesion" value="' + estado.fecha + '" max="' + fechaHoyISO() + '" />' +
      "</div>"
    );
  }

  function renderSelectorTipo(estado) {
    return (
      '<div class="selector-tipo">' +
      botonTipo("gimnasio", "🏋️ Gimnasio", estado.tipo) +
      botonTipo("futbol", "⚽ Fútbol", estado.tipo) +
      "</div>"
    );
  }

  function botonTipo(valor, etiqueta, tipoActual) {
    return (
      '<button type="button" data-accion="set-tipo" data-tipo="' + valor + '" class="btn-tipo' +
      (tipoActual === valor ? " activo" : "") + '">' + etiqueta + "</button>"
    );
  }

  function renderGimnasio(data, estado) {
    var dias = data.rutina.dias;
    if (!dias.length) {
      return '<p class="nota">Todavía no tenés días en tu rutina. Cargá uno desde el ícono de ajustes (Rutina).</p>';
    }

    var opciones = '<option value="">Elegí un día</option>' +
      dias.map(function (d) {
        return '<option value="' + d.id + '"' + (d.id === estado.diaRutinaId ? " selected" : "") + ">" +
          GYMAPP.util.escapeHtml(d.nombre) + "</option>";
      }).join("");

    var html = '<div class="campo"><label for="select-dia-rutina">Día de rutina</label>' +
      '<select id="select-dia-rutina">' + opciones + "</select></div>";

    if (!estado.diaRutinaId) return html;

    var dia = buscarDia(dias, estado.diaRutinaId);
    if (!dia) return html;

    if (!dia.ejercicios.length) {
      return html + '<p class="nota">Este día no tiene ejercicios cargados todavía.</p>';
    }

    html += '<div class="ejercicios-entrenar">' +
      dia.ejercicios.map(function (ej) { return renderEjercicioEntrenar(data.sesiones_entrenamiento, ej); }).join("") +
      "</div>";

    return html;
  }

  function renderEjercicioEntrenar(sesiones, ejercicio) {
    var ultimo = obtenerUltimoRegistro(sesiones, ejercicio.id);
    var series = estado.seriesPorEjercicio[ejercicio.id] || [];

    return (
      '<div class="ejercicio-entrenar-card" data-ejercicio-id="' + ejercicio.id + '">' +
      '<div class="ejercicio-entrenar-header">' +
      "<strong>" + GYMAPP.util.escapeHtml(ejercicio.nombre || "(sin nombre)") + "</strong>" +
      '<span class="ejercicio-objetivo">' + ejercicio.series_objetivo + " × " + GYMAPP.util.escapeHtml(ejercicio.reps_objetivo) + "</span>" +
      "</div>" +
      '<div class="ejercicio-ultimo-registro">' +
      (ultimo ? "Última vez: " + GYMAPP.util.escapeHtml(formatearSeries(ultimo.series)) : "Sin registros previos") +
      "</div>" +
      '<div class="series-lista">' +
      series.map(function (s, i) { return renderSerieInput(ejercicio.id, i, s); }).join("") +
      "</div>" +
      '<button type="button" data-accion="agregar-serie" data-ejercicio-id="' + ejercicio.id + '" class="btn-agregar-serie">+ Serie</button>' +
      "</div>"
    );
  }

  function renderSerieInput(ejercicioId, indice, serie) {
    return (
      '<div class="serie-input-row" data-ejercicio-id="' + ejercicioId + '" data-serie-indice="' + indice + '">' +
      '<span class="serie-numero">' + (indice + 1) + "</span>" +
      '<input type="number" inputmode="decimal" class="input-serie-peso" data-campo="peso_kg" placeholder="kg" min="0" step="0.5" value="' + serie.peso_kg + '" />' +
      '<span class="serie-x">×</span>' +
      '<input type="number" inputmode="numeric" class="input-serie-reps" data-campo="reps" placeholder="reps" min="0" step="1" value="' + serie.reps + '" />' +
      '<button type="button" data-accion="borrar-serie" data-ejercicio-id="' + ejercicioId + '" data-serie-indice="' + indice + '" class="btn-icono btn-borrar" aria-label="Borrar serie">✕</button>' +
      "</div>"
    );
  }

  function renderFutbol(estado) {
    var f = estado.futbol;
    return (
      '<div class="futbol-form">' +
      '<div class="campo"><label for="select-futbol-tipo">Tipo</label>' +
      '<select id="select-futbol-tipo">' +
      '<option value="entrenamiento"' + (f.tipo === "entrenamiento" ? " selected" : "") + ">Entrenamiento</option>" +
      '<option value="partido"' + (f.tipo === "partido" ? " selected" : "") + ">Partido</option>" +
      "</select></div>" +
      '<div class="campo"><label for="input-futbol-posicion">Posición</label>' +
      '<input type="text" id="input-futbol-posicion" placeholder="Ej: Mediocampista" value="' + GYMAPP.util.escapeHtml(f.posicion) + '" /></div>' +
      '<div class="campo"><label for="input-futbol-minutos">Minutos jugados</label>' +
      '<input type="number" id="input-futbol-minutos" inputmode="numeric" min="0" placeholder="Minutos" value="' + GYMAPP.util.escapeHtml(f.minutos_jugados) + '" /></div>' +
      "</div>"
    );
  }

  function renderComun(estado) {
    return (
      '<div class="campo"><label for="input-duracion">Duración total (min)</label>' +
      '<input type="number" id="input-duracion" inputmode="numeric" min="0" placeholder="Minutos" value="' + GYMAPP.util.escapeHtml(estado.duracion_min) + '" /></div>' +
      '<div class="campo"><label>RPE (esfuerzo percibido)</label>' +
      '<div class="rpe-selector">' +
      RPE_VALORES.map(function (v) {
        return '<button type="button" data-accion="set-rpe" data-valor="' + v + '" class="btn-rpe' +
          (estado.rpe === v ? " activo" : "") + '">' + v + "</button>";
      }).join("") +
      "</div></div>" +
      '<div class="campo"><label for="input-notas">Notas</label>' +
      '<textarea id="input-notas" rows="3" placeholder="Sensaciones, dolores, lo que quieras anotar">' + GYMAPP.util.escapeHtml(estado.notas) + "</textarea></div>"
    );
  }

  /* --- Helpers de datos --- */

  function obtenerUltimoRegistro(sesiones, ejercicioId) {
    var candidatas = sesiones.filter(function (s) {
      return s.tipo === "gimnasio" && s.ejercicios_realizados && s.ejercicios_realizados.some(function (e) {
        return e.ejercicio_id === ejercicioId;
      });
    });
    if (!candidatas.length) return null;
    candidatas.sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });
    var registro = candidatas[0].ejercicios_realizados.filter(function (e) { return e.ejercicio_id === ejercicioId; })[0];
    return { fecha: candidatas[0].fecha, series: registro.series };
  }

  function formatearSeries(series) {
    return series.map(function (s) { return s.peso_kg + "kg x" + s.reps; }).join(" · ");
  }

  /* --- Eventos --- */

  function bindEventos(container) {
    container.addEventListener("click", function (ev) {
      var boton = ev.target.closest("[data-accion]");
      if (!boton) return;
      var accion = boton.dataset.accion;

      if (accion === "set-tipo") {
        estado.tipo = boton.dataset.tipo;
        render(container);
      } else if (accion === "set-rpe") {
        estado.rpe = parseInt(boton.dataset.valor, 10);
        render(container);
      } else if (accion === "agregar-serie") {
        var lista = estado.seriesPorEjercicio[boton.dataset.ejercicioId] || [];
        lista.push({ peso_kg: "", reps: "" });
        estado.seriesPorEjercicio[boton.dataset.ejercicioId] = lista;
        render(container);
      } else if (accion === "borrar-serie") {
        var arr = estado.seriesPorEjercicio[boton.dataset.ejercicioId] || [];
        arr.splice(parseInt(boton.dataset.serieIndice, 10), 1);
        render(container);
      } else if (accion === "guardar-sesion") {
        guardarSesion(container);
      }
    });

    container.addEventListener("change", function (ev) {
      if (ev.target.id === "select-dia-rutina") {
        estado.diaRutinaId = ev.target.value;
        render(container);
      } else if (ev.target.id === "select-futbol-tipo") {
        estado.futbol.tipo = ev.target.value;
      } else if (ev.target.id === "input-fecha-sesion") {
        estado.fecha = ev.target.value;
      }
    });

    container.addEventListener("input", function (ev) {
      var target = ev.target;
      if (target.id === "input-duracion") {
        estado.duracion_min = target.value;
      } else if (target.id === "input-notas") {
        estado.notas = target.value;
      } else if (target.id === "input-futbol-posicion") {
        estado.futbol.posicion = target.value;
      } else if (target.id === "input-futbol-minutos") {
        estado.futbol.minutos_jugados = target.value;
      } else if (target.dataset.campo === "peso_kg" || target.dataset.campo === "reps") {
        var fila = target.closest("[data-serie-indice]");
        var ejercicioId = fila.dataset.ejercicioId;
        var indice = parseInt(fila.dataset.serieIndice, 10);
        var lista = estado.seriesPorEjercicio[ejercicioId];
        if (lista && lista[indice]) lista[indice][target.dataset.campo] = target.value;
      }
    });
  }

  function mostrarMensaje(container, texto, tipo) {
    var el = container.querySelector("#entrenar-mensaje");
    if (!el) return;
    el.textContent = texto;
    el.className = "mensaje " + (tipo || "info");
  }

  function construirEjerciciosRealizados(dia) {
    var resultado = [];
    dia.ejercicios.forEach(function (ej) {
      var seriesValidas = (estado.seriesPorEjercicio[ej.id] || [])
        .filter(function (s) { return s.peso_kg !== "" || s.reps !== ""; })
        .map(function (s) {
          return { peso_kg: parseFloat(s.peso_kg) || 0, reps: parseInt(s.reps, 10) || 0 };
        });
      if (seriesValidas.length) {
        resultado.push({ ejercicio_id: ej.id, series: seriesValidas });
      }
    });
    return resultado;
  }

  function construirFechaSesion(fechaSeleccionada) {
    if (fechaSeleccionada === fechaHoyISO()) {
      return new Date().toISOString();
    }
    return new Date(fechaSeleccionada + "T12:00:00").toISOString();
  }

  function guardarSesion(container) {
    if (!estado.fecha) {
      mostrarMensaje(container, "Elegí la fecha de la sesión.", "error");
      return;
    }

    if (estado.fecha > fechaHoyISO()) {
      mostrarMensaje(container, "No podés cargar una sesión con fecha futura.", "error");
      return;
    }

    if (!estado.rpe) {
      mostrarMensaje(container, "Seleccioná el RPE de la sesión antes de guardar.", "error");
      return;
    }

    var duracion = parseInt(estado.duracion_min, 10);
    if (isNaN(duracion) || duracion <= 0) {
      mostrarMensaje(container, "Ingresá la duración de la sesión en minutos.", "error");
      return;
    }

    var sesion = {
      id: GYMAPP.util.generarId(),
      fecha: construirFechaSesion(estado.fecha),
      tipo: estado.tipo,
      dia_rutina_id: null,
      duracion_min: duracion,
      rpe: estado.rpe,
      notas: estado.notas,
      ejercicios_realizados: [],
      futbol_detalle: null
    };

    if (estado.tipo === "gimnasio") {
      if (!estado.diaRutinaId) {
        mostrarMensaje(container, "Elegí un día de rutina antes de guardar.", "error");
        return;
      }
      var data = GYMAPP.storage.getData();
      var dia = buscarDia(data.rutina.dias, estado.diaRutinaId);
      if (!dia) {
        mostrarMensaje(container, "El día seleccionado ya no existe en tu rutina.", "error");
        return;
      }
      var ejerciciosRealizados = construirEjerciciosRealizados(dia);
      if (!ejerciciosRealizados.length) {
        mostrarMensaje(container, "Cargá al menos una serie antes de guardar.", "error");
        return;
      }
      sesion.dia_rutina_id = estado.diaRutinaId;
      sesion.ejercicios_realizados = ejerciciosRealizados;
    } else {
      var minutos = parseInt(estado.futbol.minutos_jugados, 10) || 0;
      sesion.futbol_detalle = {
        tipo: estado.futbol.tipo,
        posicion: estado.futbol.posicion,
        minutos_jugados: minutos
      };
    }

    GYMAPP.storage.updateData(function (data) {
      data.sesiones_entrenamiento.push(sesion);
    });

    estado = estadoInicial();
    render(container);
    mostrarMensaje(container, "Sesión guardada. ¡Buen trabajo!", "exito");
  }

  return { render: render };
})();
