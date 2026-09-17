/* Pestaña Dashboard: metas diarias, resumen semanal, próximo día sugerido, alertas y peso corporal. */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.dashboard = (function () {
  var esc = GYMAPP.util.escapeHtml;

  function render(container) {
    var data = GYMAPP.storage.getData();
    container.innerHTML = template(data);
    if (!container.dataset.dashboardBound) {
      bindEventos(container);
      container.dataset.dashboardBound = "1";
    }
    dibujarGraficoPeso(container, data);
  }

  /* --- Fechas --- */

  function fechaISO(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }

  function ultimosNDiasISO(n) {
    var dias = [];
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      dias.push(fechaISO(d));
    }
    return dias;
  }

  /* Lunes=0 ... Domingo=6, a diferencia de Date#getDay() que arranca en domingo. */
  function diaDeSemanaLunesPrimero(date) {
    return (date.getDay() + 6) % 7;
  }

  /* --- Cálculos --- */

  function construirMapaDiasEntrenados(sesiones) {
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

  function calcularResumenSemanal(data) {
    var dias7 = ultimosNDiasISO(7);
    var sesiones7 = data.sesiones_entrenamiento.filter(function (s) { return dias7.indexOf(GYMAPP.util.fechaLocalISO(s.fecha)) !== -1; });
    var registros7 = data.registros_nutricion.filter(function (r) { return dias7.indexOf(r.fecha) !== -1 && r.cumplimiento; });
    var enObjetivo = registros7.filter(function (r) { return r.cumplimiento === "en_objetivo"; }).length;

    return { sesiones: sesiones7.length, diasCerrados: registros7.length, diasEnObjetivo: enObjetivo };
  }

  function calcularProximoDia(data) {
    var dias = data.rutina.dias;
    if (!dias.length) return null;

    var sesionesGimnasio = data.sesiones_entrenamiento
      .filter(function (s) { return s.tipo === "gimnasio" && s.dia_rutina_id; })
      .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });

    if (!sesionesGimnasio.length) return dias[0];

    var indiceUltimo = dias.findIndex(function (d) { return d.id === sesionesGimnasio[0].dia_rutina_id; });
    if (indiceUltimo === -1) return dias[0];

    return dias[(indiceUltimo + 1) % dias.length];
  }

  function obtenerGruposDelDia(dias, diaId) {
    var dia = dias.filter(function (d) { return d.id === diaId; })[0];
    if (!dia) return [];
    var grupos = dia.ejercicios.map(function (e) { return (e.grupo_muscular || "").trim(); }).filter(Boolean);
    return grupos.filter(function (g, i) { return grupos.indexOf(g) === i; });
  }

  function calcularAlertaGrupoMuscular(data) {
    var sesionesGimnasio = data.sesiones_entrenamiento
      .filter(function (s) { return s.tipo === "gimnasio" && s.dia_rutina_id; })
      .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });

    if (sesionesGimnasio.length < 2) return null;

    var gruposA = obtenerGruposDelDia(data.rutina.dias, sesionesGimnasio[0].dia_rutina_id);
    var gruposB = obtenerGruposDelDia(data.rutina.dias, sesionesGimnasio[1].dia_rutina_id);
    var interseccion = gruposA.filter(function (g) { return gruposB.indexOf(g) !== -1; });

    return interseccion.length ? interseccion : null;
  }

  /* --- Templates --- */

  function template(data) {
    var metas = data.usuario.metas_macros;
    var resumen = calcularResumenSemanal(data);
    var proximoDia = calcularProximoDia(data);
    var gruposRepetidos = calcularAlertaGrupoMuscular(data);

    return (
      '<div class="pantalla pantalla-dashboard">' +
      '<h1 class="saludo-dashboard">¡Hola, ' + esc(data.usuario.nombre) + "!</h1>" +
      "<h2>Tus metas diarias</h2>" +
      '<div class="tarjetas-macros">' +
      tarjeta(metas.calorias + " kcal", "Calorías") +
      tarjeta(metas.proteinas_g + " g", "Proteínas") +
      tarjeta(metas.carbos_g + " g", "Carbohidratos") +
      tarjeta(metas.grasas_g + " g", "Grasas") +
      "</div>" +
      '<div id="dashboard-mensaje" class="mensaje oculto"></div>' +
      (gruposRepetidos
        ? '<div class="alerta-grupo-muscular">⚠️ Entrenaste ' + esc(gruposRepetidos.join(", ")) + " dos veces seguidas. Considerá variar el grupo muscular.</div>"
        : "") +
      "<h3>Esta semana</h3>" +
      renderTiraSemana(data.sesiones_entrenamiento) +
      '<div class="tarjetas-macros">' +
      tarjeta(resumen.sesiones, resumen.sesiones === 1 ? "Sesión (últimos 7 días)" : "Sesiones (últimos 7 días)") +
      tarjeta(resumen.diasCerrados ? resumen.diasEnObjetivo + "/" + resumen.diasCerrados : "—", "Días en objetivo (nutrición)") +
      "</div>" +
      "<h3>Próximo día sugerido</h3>" +
      (proximoDia
        ? '<p class="proximo-dia-sugerido">🏋️ ' + esc(proximoDia.nombre) + "</p>"
        : '<p class="nota">Todavía no tenés días en tu rutina.</p>') +
      "<h3>Peso corporal</h3>" +
      (data.medidas_corporales.length
        ? '<div class="grafico-contenedor"><canvas id="grafico-peso-corporal"></canvas></div>'
        : '<p class="nota">Todavía no cargaste medidas corporales.</p>') +
      '<div class="registro-peso-rapido">' +
      '<input type="number" id="input-peso-hoy" inputmode="decimal" step="0.1" min="20" placeholder="Peso de hoy (kg)" />' +
      '<input type="number" id="input-cintura-hoy" inputmode="decimal" step="0.5" min="30" placeholder="Cintura (cm, opcional)" />' +
      '<button type="button" data-accion="guardar-peso" class="btn btn-secundario btn-ancho">Guardar medida</button>' +
      "</div>" +
      "</div>"
    );
  }

  function renderTiraSemana(sesiones) {
    var etiquetas = ["L", "M", "M", "J", "V", "S", "D"];
    var mapaDias = construirMapaDiasEntrenados(sesiones);
    var hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    var hoyIso = fechaISO(hoy);

    var lunes = new Date(hoy);
    lunes.setDate(lunes.getDate() - diaDeSemanaLunesPrimero(hoy));

    var columnas = "";
    for (var i = 0; i < 7; i++) {
      var d = new Date(lunes);
      d.setDate(d.getDate() + i);
      var key = fechaISO(d);
      var estado = mapaDias[key] || null;
      var clase = "calendario-dia" + (estado ? " " + estado : "") + (key === hoyIso ? " hoy" : "");

      columnas += (
        '<div class="tira-semana-col">' +
        '<span class="tira-semana-letra">' + etiquetas[i] + "</span>" +
        '<span class="' + clase + '">' + d.getDate() + "</span>" +
        "</div>"
      );
    }

    return '<div class="tira-semana">' + columnas + "</div>";
  }

  function tarjeta(valor, etiqueta) {
    return (
      '<div class="tarjeta-macro">' +
      '<span class="tarjeta-macro-valor">' + valor + "</span>" +
      '<span class="tarjeta-macro-nombre">' + etiqueta + "</span>" +
      "</div>"
    );
  }

  /* --- Gráfico de peso corporal --- */

  function dibujarGraficoPeso(container, data) {
    var canvas = container.querySelector("#grafico-peso-corporal");
    if (!canvas || !data.medidas_corporales.length) return;

    var medidas = data.medidas_corporales.slice().sort(function (a, b) { return new Date(a.fecha) - new Date(b.fecha); });
    var labels = medidas.map(function (m) {
      var d = new Date(m.fecha);
      return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
    });
    var valores = medidas.map(function (m) { return m.peso_kg; });

    GYMAPP.graficos.graficoLinea(canvas, labels, valores, "Peso (kg)");
  }

  /* --- Acciones --- */

  function guardarPeso(container) {
    var pesoInput = container.querySelector("#input-peso-hoy");
    var cinturaInput = container.querySelector("#input-cintura-hoy");
    var peso = parseFloat(pesoInput.value);

    if (isNaN(peso) || peso <= 0) {
      mostrarMensaje(container, "Ingresá un peso válido.", "error");
      return;
    }

    var cintura = parseFloat(cinturaInput.value);
    var fecha = fechaISO(new Date());

    var resultado = GYMAPP.storage.updateData(function (data) {
      var existente = data.medidas_corporales.filter(function (m) { return m.fecha === fecha; })[0];
      if (existente) {
        existente.peso_kg = peso;
        if (!isNaN(cintura)) existente.cintura_cm = cintura;
      } else {
        data.medidas_corporales.push({ fecha: fecha, peso_kg: peso, cintura_cm: isNaN(cintura) ? null : cintura });
      }
    }, { alertaAutomatica: false });
    if (!resultado.guardado) {
      mostrarMensaje(container, "No se pudo guardar la medida. Revisá el espacio disponible en tu dispositivo e intentá de nuevo.", "error");
      return;
    }

    render(container);
    mostrarMensaje(container, "Medida guardada.", "exito");
  }

  function mostrarMensaje(container, texto, tipo) {
    var el = container.querySelector("#dashboard-mensaje");
    if (!el) return;
    el.textContent = texto;
    el.className = "mensaje " + (tipo || "info");
  }

  /* --- Eventos --- */

  function bindEventos(container) {
    container.addEventListener("click", function (ev) {
      var boton = ev.target.closest('[data-accion="guardar-peso"]');
      if (!boton) return;
      guardarPeso(container);
    });
  }

  return {
    render: render,
    /* Expuestas para pruebas unitarias de cálculo de fechas. */
    construirMapaDiasEntrenados: construirMapaDiasEntrenados,
    calcularResumenSemanal: calcularResumenSemanal
  };
})();
