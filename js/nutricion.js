/* Pestaña Nutrición: registro diario de comidas contra registros_nutricion y base_alimentos. */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.nutricion = (function () {
  var esc = GYMAPP.util.escapeHtml;

  /* Estado efímero de UI (no persiste): texto buscado y formulario "alimento
     nuevo" abierto (por índice de comida, relativos al día que se está
     viendo), y la fecha actualmente seleccionada (NUT-01). Null hasta que
     el usuario elige otra: obtenerFechaSeleccionada() la resuelve a "hoy"
     por defecto sin necesidad de inicializarla al cargar el módulo. */
  var estado = { busquedas: {}, formularioNuevo: {}, fechaSeleccionada: null };

  function render(container) {
    var data = GYMAPP.storage.getData();
    var fecha = obtenerFechaSeleccionada();
    var registro = buscarRegistroPorFecha(data, fecha) || registroVacio(fecha);

    container.innerHTML = template(data, registro, fecha);
    if (!container.dataset.nutricionBound) {
      bindEventos(container);
      container.dataset.nutricionBound = "1";
    }
    dibujarGraficoSemana(container, data);
  }

  /* --- Fecha y registro del día (NUT-01: cualquier día, no solo hoy) ---
     Todas las funciones de esta pantalla operan sobre obtenerFechaSeleccionada(),
     nunca sobre "hoy" a secas: así se pueden cargar/corregir días anteriores
     sin duplicar registros ni pisar el registro de otro día. El Dashboard
     no se ve afectado por nada de esto: calcula "hoy" de forma totalmente
     independiente (ver dashboard.js), no lee este estado de UI. */

  function fechaHoyISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function obtenerFechaSeleccionada() {
    return estado.fechaSeleccionada || fechaHoyISO();
  }

  function registroVacio(fecha) {
    return { fecha: fecha, comidas: [], totales_calculados: { calorias: 0, proteinas_g: 0, carbos_g: 0, grasas_g: 0 }, cumplimiento: null };
  }

  function buscarRegistroPorFecha(data, fecha) {
    return data.registros_nutricion.filter(function (r) { return r.fecha === fecha; })[0] || null;
  }

  function calcularTotales(registro, baseAlimentos) {
    var totales = { calorias: 0, proteinas_g: 0, carbos_g: 0, grasas_g: 0 };
    registro.comidas.forEach(function (comida) {
      comida.alimentos.forEach(function (item) {
        var alimento = baseAlimentos.filter(function (a) { return a.id === item.alimento_id; })[0];
        if (!alimento) return;
        var factor = item.cantidad_g / 100;
        totales.calorias += alimento.macros_100g.calorias * factor;
        totales.proteinas_g += alimento.macros_100g.proteinas_g * factor;
        totales.carbos_g += alimento.macros_100g.carbos_g * factor;
        totales.grasas_g += alimento.macros_100g.grasas_g * factor;
      });
    });
    totales.calorias = Math.round(totales.calorias);
    totales.proteinas_g = Math.round(totales.proteinas_g);
    totales.carbos_g = Math.round(totales.carbos_g);
    totales.grasas_g = Math.round(totales.grasas_g);
    return totales;
  }

  var MENSAJE_ERROR_GUARDADO = "No se pudo guardar el cambio. Revisá el espacio disponible en tu dispositivo e intentá de nuevo.";

  /* Crea el registro del día SELECCIONADO si no existe (nunca uno de otro
     día), aplica `mutador(registro, data)` y recalcula los totales. Si ya
     existe un registro para esa fecha, se edita ese mismo (nunca duplica).
     Devuelve true si se guardó correctamente; si falla, avisa al usuario y
     devuelve false. */
  function mutarRegistroSeleccionado(container, mutador) {
    var fecha = obtenerFechaSeleccionada();
    var resultado = GYMAPP.storage.updateData(function (data) {
      var registro = data.registros_nutricion.filter(function (r) { return r.fecha === fecha; })[0];
      if (!registro) {
        registro = registroVacio(fecha);
        data.registros_nutricion.push(registro);
      }
      mutador(registro, data);
      registro.totales_calculados = calcularTotales(registro, data.base_alimentos);
    }, { alertaAutomatica: false });

    if (!resultado.guardado) {
      mostrarMensaje(container, MENSAJE_ERROR_GUARDADO, "error");
    }
    return resultado.guardado;
  }

  function calcularCumplimiento(caloriasReales, caloriasObjetivo) {
    if (!caloriasObjetivo) return "en_objetivo";
    var diferencia = (caloriasReales - caloriasObjetivo) / caloriasObjetivo;
    if (diferencia < -0.1) return "por_debajo";
    if (diferencia > 0.1) return "por_encima";
    return "en_objetivo";
  }

  /* --- Templates --- */

  function template(data, registro, fecha) {
    var metas = data.usuario.metas_macros;
    var totales = registro.totales_calculados;

    return (
      '<div class="pantalla pantalla-nutricion">' +
      "<h2>Nutrición</h2>" +
      '<div class="campo campo-fecha-nutricion">' +
      '<label for="input-fecha-nutricion">Día</label>' +
      '<input type="date" id="input-fecha-nutricion" value="' + fecha + '" max="' + fechaHoyISO() + '" />' +
      "</div>" +
      renderAvisoDiaAnterior(fecha) +
      '<div id="nutricion-mensaje" class="mensaje oculto"></div>' +
      '<div class="resumen-nutricion">' +
      filaMacro("Calorías", totales.calorias, metas.calorias, "kcal") +
      filaMacro("Proteínas", totales.proteinas_g, metas.proteinas_g, "g") +
      filaMacro("Carbohidratos", totales.carbos_g, metas.carbos_g, "g") +
      filaMacro("Grasas", totales.grasas_g, metas.grasas_g, "g") +
      renderEstadoCumplimiento(registro.cumplimiento) +
      "</div>" +
      '<div class="comidas-lista">' +
      (registro.comidas.length
        ? registro.comidas.map(function (c, i) { return renderComida(c, i, data.base_alimentos); }).join("")
        : '<p class="nota">Todavía no cargaste comidas para este día.</p>') +
      "</div>" +
      '<button type="button" data-accion="nueva-comida" class="btn btn-secundario btn-ancho">+ Agregar comida</button>' +
      '<button type="button" data-accion="cerrar-dia" class="btn btn-primario">Cerrar día</button>' +
      "<h3>Últimos 7 días</h3>" +
      '<div class="grafico-contenedor"><canvas id="grafico-nutricion-7dias"></canvas></div>' +
      "</div>"
    );
  }

  /* Aviso discreto de que se está editando un día pasado (mejora visual
     mínima pedida además de NUT-01). Sin new Date()/UTC: la fecha ya viene
     como string "YYYY-MM-DD", se reformatea con un simple split para no
     arriesgar un corrimiento de día por zona horaria. */
  function renderAvisoDiaAnterior(fecha) {
    if (fecha === fechaHoyISO()) return "";
    var partes = fecha.split("-");
    var fechaLegible = partes[2] + "/" + partes[1] + "/" + partes[0];
    return '<p class="nota nota-dia-anterior">Editando: ' + fechaLegible + "</p>";
  }

  function filaMacro(nombre, real, objetivo, unidad) {
    var pct = objetivo > 0 ? Math.min(100, Math.round((real / objetivo) * 100)) : 0;
    return (
      '<div class="fila-macro">' +
      '<div class="fila-macro-header"><span>' + nombre + "</span><span>" + real + " / " + objetivo + " " + unidad + "</span></div>" +
      '<div class="barra-macro-fondo"><div class="barra-macro-relleno" style="width:' + pct + '%"></div></div>' +
      "</div>"
    );
  }

  function renderEstadoCumplimiento(cumplimiento) {
    if (!cumplimiento) return '<p class="nota nota-cumplimiento">Todavía no cerraste el día.</p>';
    var etiquetas = {
      en_objetivo: "En objetivo ✅",
      por_debajo: "Por debajo del objetivo ⬇️",
      por_encima: "Por encima del objetivo ⬆️"
    };
    return '<p class="nota nota-cumplimiento cumplimiento-' + cumplimiento + '">' + etiquetas[cumplimiento] + "</p>";
  }

  function renderComida(comida, indice, baseAlimentos) {
    var alimentosHtml = comida.alimentos.length
      ? comida.alimentos.map(function (item, idx) { return renderAlimentoFila(indice, idx, item, baseAlimentos); }).join("")
      : '<p class="nota nota-dia">Sin alimentos todavía.</p>';

    var busquedaTexto = estado.busquedas[indice] || "";

    return (
      '<div class="comida-card" data-comida-index="' + indice + '">' +
      '<div class="comida-header">' +
      '<input type="text" class="input-nombre-comida" data-campo="nombre" value="' + esc(comida.nombre) + '" placeholder="Nombre de la comida" />' +
      '<button type="button" data-accion="borrar-comida" data-comida-index="' + indice + '" class="btn-icono btn-borrar" aria-label="Borrar comida">🗑️</button>' +
      "</div>" +
      '<div class="alimentos-comida-lista">' + alimentosHtml + "</div>" +
      '<div class="buscador-alimento">' +
      '<input type="text" class="input-buscar-alimento" data-comida-index="' + indice + '" placeholder="Buscar alimento..." value="' + esc(busquedaTexto) + '" />' +
      '<div class="resultados-alimento" data-comida-index="' + indice + '">' + renderResultadosBusqueda(indice, busquedaTexto, baseAlimentos) + "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function renderAlimentoFila(comidaIndex, alimentoIndex, item, baseAlimentos) {
    var alimento = baseAlimentos.filter(function (a) { return a.id === item.alimento_id; })[0];
    var nombre = alimento ? alimento.nombre : "Alimento eliminado";
    var kcal = alimento ? Math.round((alimento.macros_100g.calorias * item.cantidad_g) / 100) : 0;
    return (
      '<div class="alimento-fila" data-comida-index="' + comidaIndex + '" data-alimento-index="' + alimentoIndex + '">' +
      '<span class="alimento-nombre">' + esc(nombre) + "</span>" +
      '<input type="number" class="input-cantidad-alimento" data-campo="cantidad_g" value="' + item.cantidad_g + '" min="0" step="5" />' +
      '<span class="alimento-unidad">g</span>' +
      '<span class="alimento-kcal">' + kcal + " kcal</span>" +
      '<button type="button" data-accion="borrar-alimento" data-comida-index="' + comidaIndex + '" data-alimento-index="' + alimentoIndex + '" class="btn-icono btn-borrar" aria-label="Borrar alimento">✕</button>' +
      "</div>"
    );
  }

  function renderResultadosBusqueda(comidaIndex, texto, baseAlimentos) {
    if (estado.formularioNuevo[comidaIndex]) {
      return renderFormularioNuevoAlimento(comidaIndex, texto);
    }
    if (!texto || texto.trim().length < 2) return "";

    var textoNorm = texto.trim().toLowerCase();
    var coincidencias = baseAlimentos.filter(function (a) {
      return a.nombre.toLowerCase().indexOf(textoNorm) !== -1;
    }).slice(0, 6);

    var listaHtml = coincidencias.map(function (a) {
      return (
        '<button type="button" class="resultado-alimento" data-accion="agregar-alimento" data-comida-index="' + comidaIndex + '" data-alimento-id="' + a.id + '">' +
        esc(a.nombre) + ' <span class="resultado-alimento-kcal">' + Math.round(a.macros_100g.calorias) + " kcal/100g</span>" +
        "</button>"
      );
    }).join("");

    var sinResultados = coincidencias.length === 0
      ? '<p class="nota nota-busqueda">No se encontró "' + esc(texto) + '".</p>'
      : "";

    return (
      listaHtml + sinResultados +
      '<button type="button" class="btn-crear-alimento" data-accion="mostrar-form-nuevo-alimento" data-comida-index="' + comidaIndex + '">+ Crear alimento nuevo</button>'
    );
  }

  function renderFormularioNuevoAlimento(comidaIndex, nombreSugerido) {
    return (
      '<div class="form-nuevo-alimento" data-comida-index="' + comidaIndex + '">' +
      '<input type="text" class="input-nuevo-alimento-nombre" placeholder="Nombre del alimento" value="' + esc(nombreSugerido || "") + '" />' +
      '<div class="form-nuevo-alimento-macros">' +
      '<input type="number" class="input-nuevo-alimento-kcal" placeholder="Kcal /100g" min="0" />' +
      '<input type="number" class="input-nuevo-alimento-prot" placeholder="Proteínas /100g" min="0" />' +
      '<input type="number" class="input-nuevo-alimento-carbos" placeholder="Carbos /100g" min="0" />' +
      '<input type="number" class="input-nuevo-alimento-grasas" placeholder="Grasas /100g" min="0" />' +
      "</div>" +
      '<div class="form-nuevo-alimento-acciones">' +
      '<button type="button" class="btn btn-secundario" data-accion="cancelar-form-nuevo-alimento" data-comida-index="' + comidaIndex + '">Cancelar</button>' +
      '<button type="button" class="btn btn-primario" data-accion="guardar-alimento-nuevo" data-comida-index="' + comidaIndex + '">Guardar y agregar</button>' +
      "</div>" +
      "</div>"
    );
  }

  /* --- Gráfico de últimos 7 días --- */

  function dibujarGraficoSemana(container, data) {
    var canvas = container.querySelector("#grafico-nutricion-7dias");
    if (!canvas) return;

    var fechas = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      fechas.push(d);
    }

    var labels = fechas.map(function (d) {
      return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
    });
    var reales = fechas.map(function (d) {
      var key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      var registro = data.registros_nutricion.filter(function (r) { return r.fecha === key; })[0];
      return registro ? registro.totales_calculados.calorias : 0;
    });
    var objetivoValor = data.usuario.metas_macros.calorias;
    var objetivos = fechas.map(function () { return objetivoValor; });

    GYMAPP.graficos.graficoBarras(canvas, labels, [
      { label: "Real", data: reales, backgroundColor: "#2F6FED" },
      { label: "Objetivo", data: objetivos, backgroundColor: "rgba(255, 255, 255, 0.25)" }
    ]);
  }

  /* --- Acciones --- */

  function agregarComida(container) {
    var exito = mutarRegistroSeleccionado(container, function (registro) {
      registro.comidas.push({ nombre: "Comida " + (registro.comidas.length + 1), alimentos: [] });
    });
    if (!exito) return;
    render(container);
  }

  function borrarComida(container, indice) {
    if (!confirm("¿Borrar esta comida y sus alimentos?")) return;
    var exito = mutarRegistroSeleccionado(container, function (registro) {
      registro.comidas.splice(parseInt(indice, 10), 1);
    });
    if (!exito) return;
    render(container);
  }

  function agregarAlimentoAComida(container, comidaIndex, alimentoId) {
    return mutarRegistroSeleccionado(container, function (registro) {
      registro.comidas[parseInt(comidaIndex, 10)].alimentos.push({ alimento_id: alimentoId, cantidad_g: 100 });
    });
  }

  function borrarAlimentoDeComida(container, comidaIndex, alimentoIndex) {
    var exito = mutarRegistroSeleccionado(container, function (registro) {
      registro.comidas[parseInt(comidaIndex, 10)].alimentos.splice(parseInt(alimentoIndex, 10), 1);
    });
    if (!exito) return;
    render(container);
  }

  function guardarAlimentoNuevo(container, comidaIndex) {
    var form = container.querySelector('.form-nuevo-alimento[data-comida-index="' + comidaIndex + '"]');
    var nombre = form.querySelector(".input-nuevo-alimento-nombre").value.trim();
    var kcal = parseFloat(form.querySelector(".input-nuevo-alimento-kcal").value);
    var prot = parseFloat(form.querySelector(".input-nuevo-alimento-prot").value);
    var carbos = parseFloat(form.querySelector(".input-nuevo-alimento-carbos").value);
    var grasas = parseFloat(form.querySelector(".input-nuevo-alimento-grasas").value);

    if (!nombre || isNaN(kcal) || isNaN(prot) || isNaN(carbos) || isNaN(grasas)) {
      mostrarMensaje(container, "Completá el nombre y los 4 valores de macros por 100g.", "error");
      return;
    }

    var nuevoAlimento = {
      id: GYMAPP.util.generarId(),
      nombre: nombre,
      macros_100g: { calorias: kcal, proteinas_g: prot, carbos_g: carbos, grasas_g: grasas }
    };

    var resultado = GYMAPP.storage.updateData(function (data) {
      data.base_alimentos.push(nuevoAlimento);
    }, { alertaAutomatica: false });
    if (!resultado.guardado) {
      mostrarMensaje(container, MENSAJE_ERROR_GUARDADO, "error");
      return;
    }

    if (!agregarAlimentoAComida(container, comidaIndex, nuevoAlimento.id)) return;

    estado.formularioNuevo[comidaIndex] = false;
    estado.busquedas[comidaIndex] = "";
    render(container);
    mostrarMensaje(container, "Alimento creado y agregado.", "exito");
  }

  function cerrarDia(container) {
    var data = GYMAPP.storage.getData();
    var registro = buscarRegistroPorFecha(data, obtenerFechaSeleccionada());
    if (!registro || !registro.comidas.length) {
      mostrarMensaje(container, "Cargá al menos una comida antes de cerrar el día.", "error");
      return;
    }
    var exito = mutarRegistroSeleccionado(container, function (r, d) {
      r.cumplimiento = calcularCumplimiento(r.totales_calculados.calorias, d.usuario.metas_macros.calorias);
    });
    if (!exito) return;
    render(container);
    mostrarMensaje(container, "Día cerrado.", "exito");
  }

  function mostrarMensaje(container, texto, tipo) {
    var el = container.querySelector("#nutricion-mensaje");
    if (!el) return;
    el.textContent = texto;
    el.className = "mensaje " + (tipo || "info");
  }

  function actualizarResultados(container, comidaIndex) {
    var data = GYMAPP.storage.getData();
    var contenedor = container.querySelector('.resultados-alimento[data-comida-index="' + comidaIndex + '"]');
    if (!contenedor) return;
    contenedor.innerHTML = renderResultadosBusqueda(comidaIndex, estado.busquedas[comidaIndex] || "", data.base_alimentos);
  }

  /* Persiste la cantidad y refresca solo el kcal de la fila y el resumen de macros, sin re-renderizar todo. */
  function actualizarCantidadAlimento(container, comidaIndex, alimentoIndex, cantidad) {
    var exito = mutarRegistroSeleccionado(container, function (registro) {
      registro.comidas[parseInt(comidaIndex, 10)].alimentos[parseInt(alimentoIndex, 10)].cantidad_g = cantidad;
    });
    if (!exito) return;

    var data = GYMAPP.storage.getData();
    var registro = buscarRegistroPorFecha(data, obtenerFechaSeleccionada());
    if (!registro) return;

    var fila = container.querySelector('.alimento-fila[data-comida-index="' + comidaIndex + '"][data-alimento-index="' + alimentoIndex + '"]');
    if (fila) {
      var item = registro.comidas[parseInt(comidaIndex, 10)].alimentos[parseInt(alimentoIndex, 10)];
      var alimento = data.base_alimentos.filter(function (a) { return a.id === item.alimento_id; })[0];
      var kcal = alimento ? Math.round((alimento.macros_100g.calorias * item.cantidad_g) / 100) : 0;
      var kcalSpan = fila.querySelector(".alimento-kcal");
      if (kcalSpan) kcalSpan.textContent = kcal + " kcal";
    }

    var metas = data.usuario.metas_macros;
    var totales = registro.totales_calculados;
    var valoresPorFila = [
      [totales.calorias, metas.calorias],
      [totales.proteinas_g, metas.proteinas_g],
      [totales.carbos_g, metas.carbos_g],
      [totales.grasas_g, metas.grasas_g]
    ];

    container.querySelectorAll(".fila-macro").forEach(function (filaMacroEl, idx) {
      if (!valoresPorFila[idx]) return;
      var real = valoresPorFila[idx][0];
      var objetivo = valoresPorFila[idx][1];

      var textoSpan = filaMacroEl.querySelector(".fila-macro-header span:last-child");
      if (textoSpan) {
        var unidad = textoSpan.textContent.trim().split(" ").pop();
        textoSpan.textContent = real + " / " + objetivo + " " + unidad;
      }

      var relleno = filaMacroEl.querySelector(".barra-macro-relleno");
      if (relleno) {
        var pct = objetivo > 0 ? Math.min(100, Math.round((real / objetivo) * 100)) : 0;
        relleno.style.width = pct + "%";
      }
    });
  }

  /* --- Eventos --- */

  function bindEventos(container) {
    container.addEventListener("click", function (ev) {
      var boton = ev.target.closest("[data-accion]");
      if (!boton) return;
      var accion = boton.dataset.accion;

      if (accion === "nueva-comida") {
        agregarComida(container);
      } else if (accion === "borrar-comida") {
        borrarComida(container, boton.dataset.comidaIndex);
      } else if (accion === "borrar-alimento") {
        borrarAlimentoDeComida(container, boton.dataset.comidaIndex, boton.dataset.alimentoIndex);
      } else if (accion === "agregar-alimento") {
        if (!agregarAlimentoAComida(container, boton.dataset.comidaIndex, boton.dataset.alimentoId)) return;
        estado.busquedas[boton.dataset.comidaIndex] = "";
        render(container);
      } else if (accion === "mostrar-form-nuevo-alimento") {
        estado.formularioNuevo[boton.dataset.comidaIndex] = true;
        render(container);
      } else if (accion === "cancelar-form-nuevo-alimento") {
        estado.formularioNuevo[boton.dataset.comidaIndex] = false;
        render(container);
      } else if (accion === "guardar-alimento-nuevo") {
        guardarAlimentoNuevo(container, boton.dataset.comidaIndex);
      } else if (accion === "cerrar-dia") {
        cerrarDia(container);
      }
    });

    /* Estos tres campos actualizan el estado en vivo (evento "input") sin re-renderizar
       toda la pantalla, para no robarle el foco a lo que el usuario está tipeando. */
    container.addEventListener("input", function (ev) {
      var target = ev.target;

      if (target.classList.contains("input-buscar-alimento")) {
        var comidaIndex = target.dataset.comidaIndex;
        estado.busquedas[comidaIndex] = target.value;
        actualizarResultados(container, comidaIndex);
        return;
      }

      if (target.classList.contains("input-nombre-comida")) {
        var tarjetaComida = target.closest("[data-comida-index]");
        var idxComida = tarjetaComida.dataset.comidaIndex;
        mutarRegistroSeleccionado(container, function (registro) {
          registro.comidas[parseInt(idxComida, 10)].nombre = target.value;
        });
        return;
      }

      if (target.dataset.campo === "cantidad_g") {
        var fila = target.closest("[data-alimento-index]");
        actualizarCantidadAlimento(container, fila.dataset.comidaIndex, fila.dataset.alimentoIndex, parseFloat(target.value) || 0);
      }
    });

    /* Selector de día (NUT-01): "change", no "input", para no re-renderizar
       en cada tecleo manual de la fecha, solo al confirmar un valor. Nunca
       permite una fecha futura (además del atributo max, defensivo por si
       el navegador dejara tipear una a mano). Cambiar de día limpia el
       estado efímero de búsqueda/formulario nuevo: esos índices son
       relativos a las comidas del día que se estaba viendo, y dejan de
       tener sentido al cambiar de registro. */
    container.addEventListener("change", function (ev) {
      if (ev.target.id !== "input-fecha-nutricion") return;
      var hoy = fechaHoyISO();
      var valor = ev.target.value;
      if (!valor || valor > hoy) valor = hoy;
      estado.fechaSeleccionada = valor;
      estado.busquedas = {};
      estado.formularioNuevo = {};
      render(container);
    });
  }

  return { render: render };
})();
