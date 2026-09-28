/* SYNC-01: primera subida manual y segura de gymNutritionTracker a Supabase.
   Encapsula TODA la lógica de sincronización en la nube (auth.js sigue sin
   saber nada de datos_usuario, storage.js sigue sin saber nada de Supabase).

   Alcance de esta tarea, a propósito acotado:
   - Solo subir por primera vez (crear la fila remota si no existe).
   - Si ya existe una fila remota, NUNCA se sobrescribe: se avisa y listo.
   - Nada de descarga, restauración, comparación local/remoto, merge,
     revision, auto-sync ni listeners de storage. Eso es SYNC-02/03/04.

   Responsabilidades futuras (no implementadas todavía, solo el diseño lo
   deja preparado): leer estado remoto, restaurar, resolver conflictos por
   revision, sincronización automática. */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.sync = (function () {
  var NOMBRE_RPC = "crear_datos_usuario_iniciales";

  /* Estado efímero de la UI (no se persiste en ningún lado). Es el mismo
     mecanismo que usa auth.js para evitar doble click/doble submit. */
  var estadoSync = { subiendo: false };

  function haySesionActiva() {
    var sesion = GYMAPP.auth && GYMAPP.auth.obtenerSesion ? GYMAPP.auth.obtenerSesion() : null;
    return !!(sesion && sesion.user);
  }

  function obtenerEmailSesion() {
    var sesion = GYMAPP.auth && GYMAPP.auth.obtenerSesion ? GYMAPP.auth.obtenerSesion() : null;
    return sesion && sesion.user ? sesion.user.email : null;
  }

  /* Llama a la RPC controlada crear_datos_usuario_iniciales (ver el SQL que
     el usuario ejecuta manualmente en Supabase). Envía EXACTAMENTE el
     objeto completo que devuelve GYMAPP.storage.getData(), sin tocarlo: sin
     agregar metadata de Supabase, sin quitar ni transformar nada. El
     user_id nunca se manda desde acá: la función lo obtiene solo con
     auth.uid() del lado del servidor.
     Devuelve una Promise que resuelve a "created" | "already_exists", o
     rechaza con el error (de red o de la RPC) para que el llamador decida
     cómo mostrarlo. Nunca modifica localStorage. */
  function subirPrimeraVez() {
    var cliente = GYMAPP.auth && GYMAPP.auth.obtenerCliente ? GYMAPP.auth.obtenerCliente() : null;
    if (!cliente || !haySesionActiva()) {
      return Promise.reject(new Error("Iniciá sesión antes de guardar en la nube."));
    }

    var datos = GYMAPP.storage.getData();

    return cliente.rpc(NOMBRE_RPC, {
      p_data: datos,
      p_schema_version: datos.schema_version
    }).then(function (resultado) {
      if (resultado && resultado.error) throw resultado.error;
      return resultado ? resultado.data : null;
    });
  }

  /* --- UI: sección "Sincronización", embebida en la pantalla de Rutina,
     entre "Cuenta" y "Copia de seguridad" --- */

  function renderSeccionSincronizacion() {
    if (!haySesionActiva()) {
      return (
        '<div class="seccion-sincronizacion">' +
        "<h3>Sincronización</h3>" +
        '<p class="nota">Iniciá sesión para guardar tus datos en la nube y usarlos en otros dispositivos.</p>' +
        "</div>"
      );
    }

    var email = obtenerEmailSesion();

    return (
      '<div class="seccion-sincronizacion">' +
      "<h3>Sincronización</h3>" +
      '<div id="sync-mensaje" class="mensaje oculto"></div>' +
      '<p class="nota">Conectado como ' + GYMAPP.util.escapeHtml(email || "") + "</p>" +
      '<p class="nota">Guardá tus datos en la nube para poder usarlos desde otros dispositivos.</p>' +
      '<button type="button" data-accion="subir-a-la-nube" class="btn btn-primario btn-ancho"' +
      (estadoSync.subiendo ? " disabled" : "") + ">" +
      (estadoSync.subiendo ? "Guardando..." : "☁️ Guardar en la nube") +
      "</button>" +
      "</div>"
    );
  }

  /* Se debe llamar una única vez por contenedor: el módulo que embebe esta
     sección (rutina.js) ya garantiza esto con su propio guard de
     bindEventos, igual que hace con GYMAPP.auth.bindEventosCuenta. */
  function bindEventosSincronizacion(container) {
    container.addEventListener("click", function (ev) {
      var boton = ev.target.closest('[data-accion="subir-a-la-nube"]');
      if (!boton) return;
      manejarSubirALaNube(container, boton);
    });
  }

  function actualizarBoton(container) {
    var boton = container.querySelector('[data-accion="subir-a-la-nube"]');
    if (!boton) return;
    boton.disabled = estadoSync.subiendo;
    boton.textContent = estadoSync.subiendo ? "Guardando..." : "☁️ Guardar en la nube";
  }

  function mostrarMensajeSync(container, texto, tipo) {
    var el = container.querySelector("#sync-mensaje");
    if (!el) return;
    el.textContent = texto;
    el.className = "mensaje " + (tipo || "info");
  }

  function manejarSubirALaNube(container, boton) {
    /* Guard sincrónico contra doble click/doble submit: se pone en true acá
       mismo, antes de que exista ninguna promesa en curso, así un segundo
       click (aunque llegue antes de que se re-pinte el botón) nunca dispara
       una segunda llamada a la RPC. */
    if (estadoSync.subiendo) return;

    estadoSync.subiendo = true;
    actualizarBoton(container);
    mostrarMensajeSync(container, "Guardando...", "info");

    subirPrimeraVez()
      .then(function (estado) {
        estadoSync.subiendo = false;
        actualizarBoton(container);

        if (estado === "created") {
          mostrarMensajeSync(container, "Datos guardados en la nube. Revisión: 1", "exito");
        } else if (estado === "already_exists") {
          mostrarMensajeSync(container, "No se sobrescribió nada. Ya existen datos guardados en la nube.", "info");
        } else {
          mostrarMensajeSync(container, "Respuesta inesperada del servidor. No se pudo confirmar el guardado.", "error");
        }
      })
      .catch(function (error) {
        estadoSync.subiendo = false;
        actualizarBoton(container);
        console.error("Error al guardar en la nube (crear_datos_usuario_iniciales)", error);
        var detalle = (error && error.message) || "error desconocido";
        mostrarMensajeSync(container, "No se pudo guardar en la nube: " + detalle + ". Tus datos locales no se modificaron.", "error");
      });
  }

  return {
    renderSeccionSincronizacion: renderSeccionSincronizacion,
    bindEventosSincronizacion: bindEventosSincronizacion,
    /* Expuesta para pruebas y para las futuras etapas (SYNC-02+). */
    subirPrimeraVez: subirPrimeraVez
  };
})();
