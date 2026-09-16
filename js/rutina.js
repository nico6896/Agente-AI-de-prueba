/* Pestaña Rutina: plantilla editable de días/ejercicios. Nunca toca sesiones_entrenamiento. */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.rutina = (function () {
  var GRUPOS_MUSCULARES = ["Pecho", "Espalda", "Pierna", "Hombro", "Bíceps", "Tríceps", "Glúteo", "Core", "Cardio"];

  function render(container) {
    var data = GYMAPP.storage.getData();
    container.innerHTML = template(data.rutina.dias);
    if (!container.dataset.rutinaBound) {
      bindEventos(container);
      container.dataset.rutinaBound = "1";
    }
  }

  function template(dias) {
    var listaDias = dias.length
      ? dias.map(renderDia).join("")
      : '<p class="nota">Todavía no tenés días cargados. Agregá uno manualmente o importá el PDF de tu rutina.</p>';

    return (
      '<div class="pantalla pantalla-rutina">' +
      '<div class="rutina-header">' +
      "<h2>Rutina</h2>" +
      '<div class="rutina-acciones">' +
      '<button type="button" data-accion="importar-pdf" class="btn btn-secundario">📄 Importar PDF</button>' +
      '<input type="file" id="input-pdf-rutina" accept="application/pdf" style="display:none" />' +
      '<button type="button" data-accion="nuevo-dia" class="btn btn-secundario">+ Nuevo día</button>' +
      "</div>" +
      "</div>" +
      '<div id="rutina-mensaje" class="mensaje oculto"></div>' +
      '<div class="rutina-dias">' + listaDias + "</div>" +
      '<datalist id="grupos-musculares">' +
      GRUPOS_MUSCULARES.map(function (g) { return '<option value="' + g + '"></option>'; }).join("") +
      "</datalist>" +
      "</div>"
    );
  }

  function renderDia(dia) {
    var listaEjercicios = dia.ejercicios.length
      ? dia.ejercicios.map(function (ej) { return renderEjercicio(dia.id, ej); }).join("")
      : '<p class="nota nota-dia">Sin ejercicios todavía.</p>';

    return (
      '<div class="dia-card" data-dia-id="' + dia.id + '">' +
      '<div class="dia-card-header">' +
      '<input type="text" class="input-nombre-dia" data-campo="nombre" value="' + GYMAPP.util.escapeHtml(dia.nombre) + '" placeholder="Nombre del día" />' +
      '<button type="button" data-accion="borrar-dia" data-dia-id="' + dia.id + '" class="btn-icono btn-borrar" aria-label="Borrar día">🗑️</button>' +
      "</div>" +
      '<div class="ejercicios-lista">' + listaEjercicios + "</div>" +
      '<button type="button" data-accion="nuevo-ejercicio" data-dia-id="' + dia.id + '" class="btn btn-agregar-ejercicio">+ Agregar ejercicio</button>' +
      "</div>"
    );
  }

  function renderEjercicio(diaId, ej) {
    return (
      '<div class="ejercicio-row" data-dia-id="' + diaId + '" data-ejercicio-id="' + ej.id + '">' +
      '<input type="text" class="input-ejercicio-nombre" data-campo="nombre" value="' + GYMAPP.util.escapeHtml(ej.nombre) + '" placeholder="Ejercicio" />' +
      '<input type="text" class="input-ejercicio-grupo" data-campo="grupo_muscular" value="' + GYMAPP.util.escapeHtml(ej.grupo_muscular || "") + '" placeholder="Grupo muscular" list="grupos-musculares" />' +
      '<input type="number" class="input-ejercicio-series" data-campo="series_objetivo" value="' + ej.series_objetivo + '" min="1" max="20" placeholder="Series" />' +
      '<input type="text" class="input-ejercicio-reps" data-campo="reps_objetivo" value="' + GYMAPP.util.escapeHtml(ej.reps_objetivo) + '" placeholder="Reps" />' +
      '<button type="button" data-accion="borrar-ejercicio" data-dia-id="' + diaId + '" data-ejercicio-id="' + ej.id + '" class="btn-icono btn-borrar" aria-label="Borrar ejercicio">✕</button>' +
      "</div>"
    );
  }

  function bindEventos(container) {
    container.addEventListener("click", function (ev) {
      var boton = ev.target.closest("[data-accion]");
      if (!boton) return;
      var accion = boton.dataset.accion;

      if (accion === "nuevo-dia") {
        agregarDia(container);
      } else if (accion === "borrar-dia") {
        borrarDia(container, boton.dataset.diaId);
      } else if (accion === "nuevo-ejercicio") {
        agregarEjercicio(container, boton.dataset.diaId);
      } else if (accion === "borrar-ejercicio") {
        borrarEjercicio(container, boton.dataset.diaId, boton.dataset.ejercicioId);
      } else if (accion === "importar-pdf") {
        container.querySelector("#input-pdf-rutina").click();
      }
    });

    container.addEventListener("change", function (ev) {
      if (ev.target.id === "input-pdf-rutina") {
        var file = ev.target.files[0];
        ev.target.value = "";
        if (file) manejarImportacionPdf(container, file);
        return;
      }
      actualizarCampo(ev.target);
    });
  }

  function actualizarCampo(input) {
    var campo = input.dataset.campo;
    if (!campo) return;
    var filaEjercicio = input.closest("[data-ejercicio-id]");
    var tarjetaDia = input.closest("[data-dia-id]");
    if (!tarjetaDia) return;
    var diaId = tarjetaDia.dataset.diaId;
    var ejercicioId = filaEjercicio ? filaEjercicio.dataset.ejercicioId : null;

    GYMAPP.storage.updateData(function (data) {
      var dia = data.rutina.dias.find(function (d) { return d.id === diaId; });
      if (!dia) return;
      if (ejercicioId) {
        var ejercicio = dia.ejercicios.find(function (e) { return e.id === ejercicioId; });
        if (!ejercicio) return;
        ejercicio[campo] = campo === "series_objetivo" ? (parseInt(input.value, 10) || 0) : input.value;
      } else {
        dia[campo] = input.value;
      }
    });
  }

  function agregarDia(container) {
    GYMAPP.storage.updateData(function (data) {
      data.rutina.dias.push({
        id: GYMAPP.util.generarId(),
        nombre: "Día " + (data.rutina.dias.length + 1),
        ejercicios: []
      });
    });
    render(container);
  }

  function borrarDia(container, diaId) {
    if (!confirm("¿Borrar este día de la rutina? El historial de sesiones ya guardadas no se ve afectado.")) return;
    GYMAPP.storage.updateData(function (data) {
      data.rutina.dias = data.rutina.dias.filter(function (d) { return d.id !== diaId; });
    });
    render(container);
  }

  function agregarEjercicio(container, diaId) {
    GYMAPP.storage.updateData(function (data) {
      var dia = data.rutina.dias.find(function (d) { return d.id === diaId; });
      if (!dia) return;
      dia.ejercicios.push({
        id: GYMAPP.util.generarId(),
        nombre: "",
        grupo_muscular: "",
        series_objetivo: 3,
        reps_objetivo: "10"
      });
    });
    render(container);
  }

  function borrarEjercicio(container, diaId, ejercicioId) {
    GYMAPP.storage.updateData(function (data) {
      var dia = data.rutina.dias.find(function (d) { return d.id === diaId; });
      if (!dia) return;
      dia.ejercicios = dia.ejercicios.filter(function (e) { return e.id !== ejercicioId; });
    });
    render(container);
  }

  function mostrarMensaje(container, texto, tipo) {
    var el = container.querySelector("#rutina-mensaje");
    if (!el) return;
    el.textContent = texto;
    el.className = "mensaje " + (tipo || "info");
  }

  function manejarImportacionPdf(container, file) {
    mostrarMensaje(container, "Leyendo PDF...", "info");
    GYMAPP.pdfImport.importarDesdeArchivo(file).then(function (diasImportados) {
      if (!diasImportados.length) {
        mostrarMensaje(container, "No se pudo reconocer ningún ejercicio en el PDF. Cargá los días manualmente.", "error");
        return;
      }
      GYMAPP.storage.updateData(function (data) {
        data.rutina.dias = data.rutina.dias.concat(diasImportados);
      });
      var totalEjercicios = diasImportados.reduce(function (acc, d) { return acc + d.ejercicios.length; }, 0);
      render(container);
      mostrarMensaje(
        container,
        "Se importaron " + diasImportados.length + " día(s) y " + totalEjercicios + " ejercicio(s). Revisá y corregí lo que haga falta, el parseo puede no ser exacto.",
        "exito"
      );
    }).catch(function (err) {
      console.error("Error al importar PDF", err);
      mostrarMensaje(container, "Ocurrió un error al leer el PDF. Probá con otro archivo o cargá la rutina manualmente.", "error");
    });
  }

  return { render: render };
})();
