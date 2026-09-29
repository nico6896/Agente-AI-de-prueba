/* SYNC-01/SYNC-02: subida manual y descarga/restauración manual y segura de
   gymNutritionTracker contra Supabase. Encapsula TODA la lógica de
   sincronización en la nube (auth.js sigue sin saber nada de datos_usuario,
   storage.js sigue sin saber nada de Supabase).

   SYNC-01 (ya publicado): solo subir por primera vez (crear la fila remota
   si no existe). Si ya existe una fila remota, NUNCA se sobrescribe desde la
   subida: se avisa y listo.

   SYNC-02 (este alcance): permitir que un usuario en OTRO dispositivo
   recupere manualmente sus datos guardados en la nube. Es una acción
   explícita del usuario (nunca automática al iniciar sesión), con
   confirmación previa y backup local antes de tocar gymNutritionTracker.

   A propósito acotado: nada de auto-restore al login, auto-sync, merge,
   resolución automática de conflictos, upload después de restaurar,
   incremento de revision, realtime ni listeners automáticos. Eso queda para
   SYNC-03/04, según corresponda. */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.sync = (function () {
  var NOMBRE_RPC = "crear_datos_usuario_iniciales";
  var NOMBRE_TABLA = "datos_usuario";

  /* Clave de localStorage separada de "gymNutritionTracker": copia de
     seguridad temporal de los datos locales, creada justo antes de
     restaurar, para poder recuperarlos manualmente si algo sale mal. Es la
     ÚNICA clave de localStorage que este módulo escribe directamente; todo
     lo demás pasa siempre por la API pública de GYMAPP.storage. */
  var CLAVE_BACKUP_PRE_RESTORE = "gymNutritionTracker_preRestoreBackup";

  /* Estado efímero de la UI (no se persiste en ningún lado). Mismo mecanismo
     que usa auth.js para evitar doble click/doble submit; ahora cubre las
     dos acciones (subir/recuperar) para que no se puedan disparar juntas. */
  var estadoSync = { subiendo: false, restaurando: false };

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

  /* Consulta (SELECT, permitido por RLS) la fila remota del usuario
     autenticado. Nunca manda ni pide un user_id: RLS ya restringe la
     consulta a la fila del usuario logueado (auth.uid()). Solo lee las
     cuatro columnas que necesita; nunca toca contraseña, tokens ni sesión.
     Devuelve una Promise que resuelve a:
       { estado: "sin_datos_remotos" }               si no hay fila remota
       { estado: "ok", fila: { data, schema_version, revision, updated_at } }
     o rechaza si no hay sesión, o ante un error de red/consulta. */
  function obtenerDatosRemotos() {
    var cliente = GYMAPP.auth && GYMAPP.auth.obtenerCliente ? GYMAPP.auth.obtenerCliente() : null;
    if (!cliente || !haySesionActiva()) {
      return Promise.reject(new Error("Iniciá sesión antes de recuperar datos de la nube."));
    }

    return cliente
      .from(NOMBRE_TABLA)
      .select("data, schema_version, revision, updated_at")
      .maybeSingle()
      .then(function (resultado) {
        if (resultado && resultado.error) throw resultado.error;
        if (!resultado || !resultado.data) return { estado: "sin_datos_remotos" };
        return { estado: "ok", fila: resultado.data };
      });
  }

  /* Valida que `fila.data` (el payload remoto) sea algo que storage.js pueda
     interpretar con seguridad, y lo migra al esquema actual reutilizando
     exactamente la misma lógica que usa storage.js para datos locales
     (GYMAPP.storage.migrarDatos + el mismo merge contra getDefaultData()
     que hace storage.load()). Nunca asume que cualquier JSON remoto es
     válido: cualquier problema tira una excepción con un mensaje claro, sin
     tocar nada de storage.
     - No es un objeto / es null / es un array -> inválido.
     - No tiene las claves principales que la app espera (usuario, rutina)
       -> inválido.
     - schema_version remoto más nuevo que el que esta versión de la app
       soporta -> incompatible, se bloquea (igual que storage.js bloquea
       datos locales de una versión futura). */
  function validarYMigrarPayloadRemoto(fila) {
    var data = fila ? fila.data : null;

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Los datos guardados en la nube no tienen un formato válido.");
    }
    if (!("usuario" in data) || !data.rutina || typeof data.rutina !== "object") {
      throw new Error("Los datos guardados en la nube no tienen la estructura esperada por la app.");
    }

    var schemaVersionRemota = typeof data.schema_version === "number" ? data.schema_version : 0;
    var versionSoportada = GYMAPP.storage.getDefaultData().schema_version;
    if (schemaVersionRemota > versionSoportada) {
      throw new Error(
        "Los datos guardados en la nube fueron creados por una versión más nueva de esta app (versión " +
        schemaVersionRemota + ") que la que tenés instalada ahora (versión " + versionSoportada +
        "). Actualizá la app antes de recuperar estos datos."
      );
    }

    var dataMigrada;
    try {
      dataMigrada = GYMAPP.storage.migrarDatos(data);
    } catch (e) {
      throw new Error("No se pudo procesar el formato de los datos guardados en la nube.");
    }

    /* Mismo merge que hace storage.load() tras migrar: completa cualquier
       colección que falte (sesiones_entrenamiento, registros_nutricion,
       etc.) sin pisar nada de lo que sí vino en el payload remoto. */
    return Object.assign(GYMAPP.storage.getDefaultData(), dataMigrada);
  }

  /* Backup local temporal, exclusivamente como protección ante una
     restauración fallida: guarda los datos locales actuales tal cual
     estaban, antes de reemplazarlos. No es parte del modelo de datos de la
     app (no toca schema_version ni gymNutritionTracker) y no se usa para
     nada más que esto. */
  function crearBackupLocalPreRestore(datosLocalesActuales, revisionRemota) {
    try {
      window.localStorage.setItem(CLAVE_BACKUP_PRE_RESTORE, JSON.stringify({
        data: datosLocalesActuales,
        fecha: new Date().toISOString(),
        revision_remota_a_restaurar: revisionRemota != null ? revisionRemota : null
      }));
      return true;
    } catch (e) {
      console.error("No se pudo crear la copia de seguridad local previa a restaurar", e);
      return false;
    }
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
    var ocupado = estadoSync.subiendo || estadoSync.restaurando;

    return (
      '<div class="seccion-sincronizacion">' +
      "<h3>Sincronización</h3>" +
      '<div id="sync-mensaje" class="mensaje oculto"></div>' +
      '<p class="nota">Conectado como ' + GYMAPP.util.escapeHtml(email || "") + "</p>" +
      '<p class="nota">Guardá tus datos en la nube o recuperalos desde otro dispositivo.</p>' +
      '<button type="button" data-accion="subir-a-la-nube" class="btn btn-primario btn-ancho"' +
      (ocupado ? " disabled" : "") + ">" +
      (estadoSync.subiendo ? "Guardando..." : "☁️ Guardar en la nube") +
      "</button>" +
      '<button type="button" data-accion="recuperar-de-la-nube" class="btn btn-secundario btn-ancho"' +
      (ocupado ? " disabled" : "") + ">" +
      (estadoSync.restaurando ? "Restaurando..." : "☁️ Recuperar desde la nube") +
      "</button>" +
      "</div>"
    );
  }

  /* Se debe llamar una única vez por contenedor: el módulo que embebe esta
     sección (rutina.js) ya garantiza esto con su propio guard de
     bindEventos, igual que hace con GYMAPP.auth.bindEventosCuenta. */
  function bindEventosSincronizacion(container) {
    container.addEventListener("click", function (ev) {
      var botonSubir = ev.target.closest('[data-accion="subir-a-la-nube"]');
      if (botonSubir) {
        manejarSubirALaNube(container, botonSubir);
        return;
      }
      var botonRecuperar = ev.target.closest('[data-accion="recuperar-de-la-nube"]');
      if (botonRecuperar) {
        manejarRecuperarDeLaNube(container, botonRecuperar);
      }
    });
  }

  function actualizarBotones(container) {
    var ocupado = estadoSync.subiendo || estadoSync.restaurando;

    var botonSubir = container.querySelector('[data-accion="subir-a-la-nube"]');
    if (botonSubir) {
      botonSubir.disabled = ocupado;
      botonSubir.textContent = estadoSync.subiendo ? "Guardando..." : "☁️ Guardar en la nube";
    }

    var botonRecuperar = container.querySelector('[data-accion="recuperar-de-la-nube"]');
    if (botonRecuperar) {
      botonRecuperar.disabled = ocupado;
      botonRecuperar.textContent = estadoSync.restaurando ? "Restaurando..." : "☁️ Recuperar desde la nube";
    }
  }

  function mostrarMensajeSync(container, texto, tipo) {
    var el = container.querySelector("#sync-mensaje");
    if (!el) return;
    el.textContent = texto;
    el.className = "mensaje " + (tipo || "info");
  }

  function manejarSubirALaNube(container, boton) {
    /* Guard sincrónico contra doble click/doble submit (y contra disparar
       una subida mientras hay una restauración en curso): se pone en true
       acá mismo, antes de que exista ninguna promesa en curso. */
    if (estadoSync.subiendo || estadoSync.restaurando) return;

    estadoSync.subiendo = true;
    actualizarBotones(container);
    mostrarMensajeSync(container, "Guardando...", "info");

    subirPrimeraVez()
      .then(function (estado) {
        estadoSync.subiendo = false;
        actualizarBotones(container);

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
        actualizarBotones(container);
        console.error("Error al guardar en la nube (crear_datos_usuario_iniciales)", error);
        var detalle = (error && error.message) || "error desconocido";
        mostrarMensajeSync(container, "No se pudo guardar en la nube: " + detalle + ". Tus datos locales no se modificaron.", "error");
      });
  }

  /* Flujo completo de "Recuperar desde la nube" (SYNC-02):
       1. Consultar la fila remota (nunca automática, solo al tocar el botón).
       2. Si no hay fila remota, avisar y terminar sin tocar nada local.
       3. Si hay fila remota, pedir confirmación EXPLÍCITA mostrando
          revisión / fecha de actualización / schema_version, antes de
          tocar cualquier dato local.
       4. Si cancela, no se toca nada: gymNutritionTracker queda intacto.
       5. Si confirma, validar y migrar el payload remoto. Si es inválido o
          incompatible, avisar y no tocar nada local.
       6. Crear un backup local temporal de los datos actuales.
       7. Recién ahí, guardar los datos remotos ya migrados mediante la API
          pública de GYMAPP.storage (nunca localStorage directo, salvo el
          backup del paso anterior).
       8. Si el guardado falla, los datos locales anteriores nunca se
          tocaron (localStorage.setItem no escribe parcialmente) y el
          backup ya creado queda disponible igual.
     Ninguna de estas operaciones escribe nada en Supabase: es solo lectura
     (revision remota nunca cambia, la nube nunca se modifica acá). */
  function manejarRecuperarDeLaNube(container, boton) {
    if (estadoSync.subiendo || estadoSync.restaurando) return;

    estadoSync.restaurando = true;
    actualizarBotones(container);
    mostrarMensajeSync(container, "Consultando datos en la nube...", "info");

    obtenerDatosRemotos()
      .then(function (resultado) {
        if (resultado.estado === "sin_datos_remotos") {
          estadoSync.restaurando = false;
          actualizarBotones(container);
          mostrarMensajeSync(container, "No hay datos guardados en la nube.", "info");
          return;
        }

        var fila = resultado.fila;
        var fechaLegible = fila.updated_at ? new Date(fila.updated_at).toLocaleString("es-AR") : "sin fecha disponible";
        var confirmado = window.confirm(
          "Esto reemplazará los datos actuales de este dispositivo por la copia guardada en la nube.\n\n" +
          "Revisión remota: " + (fila.revision != null ? fila.revision : "desconocida") + "\n" +
          "Última actualización: " + fechaLegible + "\n" +
          "Versión de esquema: " + (fila.schema_version != null ? fila.schema_version : "desconocida") + "\n\n" +
          "¿Confirmás que querés reemplazar tus datos locales?"
        );

        if (!confirmado) {
          estadoSync.restaurando = false;
          actualizarBotones(container);
          mostrarMensajeSync(container, "Restauración cancelada. Tus datos locales no se modificaron.", "info");
          return;
        }

        var dataValidada;
        try {
          dataValidada = validarYMigrarPayloadRemoto(fila);
        } catch (errorValidacion) {
          estadoSync.restaurando = false;
          actualizarBotones(container);
          mostrarMensajeSync(container, errorValidacion.message, "error");
          return;
        }

        var datosLocalesActuales = GYMAPP.storage.getData();
        var backupCreado = crearBackupLocalPreRestore(datosLocalesActuales, fila.revision);
        if (!backupCreado) {
          estadoSync.restaurando = false;
          actualizarBotones(container);
          mostrarMensajeSync(container, "No se pudo crear una copia de seguridad local antes de restaurar. No se modificaron tus datos.", "error");
          return;
        }

        var guardadoExitoso = GYMAPP.storage.save(dataValidada, { alertaAutomatica: false });
        estadoSync.restaurando = false;
        actualizarBotones(container);

        if (!guardadoExitoso) {
          mostrarMensajeSync(container, "No se pudo restaurar: falló el guardado local. Tus datos anteriores se conservan intactos.", "error");
          return;
        }

        mostrarMensajeSync(container, "Datos restaurados correctamente. Recargando la app...", "exito");
        setTimeout(function () { window.location.reload(); }, 1200);
      })
      .catch(function (error) {
        estadoSync.restaurando = false;
        actualizarBotones(container);
        console.error("Error al recuperar datos de la nube", error);
        var detalle = (error && error.message) || "error desconocido";
        mostrarMensajeSync(container, "No se pudo consultar la nube: " + detalle + ".", "error");
      });
  }

  return {
    renderSeccionSincronizacion: renderSeccionSincronizacion,
    bindEventosSincronizacion: bindEventosSincronizacion,
    /* Expuestas para pruebas y para las futuras etapas (SYNC-03+). */
    subirPrimeraVez: subirPrimeraVez,
    obtenerDatosRemotos: obtenerDatosRemotos,
    validarYMigrarPayloadRemoto: validarYMigrarPayloadRemoto
  };
})();
