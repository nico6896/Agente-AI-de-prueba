/* Autenticación opcional con Supabase Auth mediante código OTP por email
   (sin magic link ni redirecciones: en la PWA instalada en iPhone, el
   enlace del magic link abre Safari y la sesión queda ahí, nunca vuelve a
   la app instalada). Este módulo es completamente independiente de
   storage.js: nunca lee ni escribe la clave "gymNutritionTracker" ni la
   tabla datos_usuario. Solo maneja la sesión de Supabase, guardada bajo su
   propia clave separada. */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.auth = (function () {
  /* Completá estos dos valores con los de tu proyecto Supabase
     (Settings -> API). SUPABASE_ANON_KEY es la clave pública "anon",
     nunca la "service_role". Si los dejás sin completar, la sección de
     cuenta se muestra deshabilitada y el resto de la app sigue
     funcionando con normalidad. */
  var SUPABASE_URL = "https://gegzdzpqzbmjldapsesg.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_G-Foy8Nommnzr0GZlBVMFQ_ewyL_Cev";

  /* Clave de localStorage separada de "gymNutritionTracker": la sesión de
     Supabase (tokens de acceso/refresco) se guarda acá, nunca junto a los
     datos de la app. El código OTP en sí NUNCA se guarda en ningún lado:
     vive solo en el input del formulario hasta que se verifica. */
  var STORAGE_KEY_AUTH = "gymNutritionTracker_supabaseAuth";

  /* Tiempo mínimo entre pedidos de código a un mismo email, para no
     ametrallar a Supabase (que además tiene su propio límite de servidor:
     si igual se pide antes de tiempo, Supabase devuelve un error que se
     muestra tal cual). */
  var COOLDOWN_REENVIO_MS = 60000;

  var cliente = null;
  var clienteFalló = false;
  var sesionActual = null;
  var listeners = [];

  /* Estado efímero de la UI de login (no se persiste en ningún lado).
     paso: "pedir-email" | "pedir-codigo". */
  var estadoCuenta = { paso: "pedir-email", email: "", cooldownHasta: 0 };

  function configurado() {
    return (
      SUPABASE_URL.indexOf("TU_SUPABASE_URL_AQUI") === -1 &&
      SUPABASE_ANON_KEY.indexOf("TU_SUPABASE_ANON_KEY_AQUI") === -1 &&
      SUPABASE_URL.length > 0 &&
      SUPABASE_ANON_KEY.length > 0
    );
  }

  function obtenerCliente() {
    if (cliente || clienteFalló) return cliente;
    if (!configurado() || !window.supabase || typeof window.supabase.createClient !== "function") {
      clienteFalló = true;
      return null;
    }
    try {
      cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          storageKey: STORAGE_KEY_AUTH,
          persistSession: true,
          autoRefreshToken: true,
          /* Ya no dependemos de un enlace en la URL: el login es por
             código OTP, tipeado a mano. */
          detectSessionInUrl: false
        }
      });
      cliente.auth.onAuthStateChange(function (_evento, sesion) {
        sesionActual = sesion;
        notificarCambio();
      });
    } catch (e) {
      console.error("No se pudo inicializar el cliente de Supabase", e);
      clienteFalló = true;
      cliente = null;
    }
    return cliente;
  }

  /* Se llama al arrancar la app. Nunca bloquea ni retrasa el render
     principal: si Supabase no está configurado o falla la red, la sesión
     simplemente queda en null y la app sigue funcionando sin login. Como
     persistSession guarda la sesión bajo STORAGE_KEY_AUTH, esto es lo que
     recupera el login al cerrar y volver a abrir la PWA. */
  function inicializar() {
    var c = obtenerCliente();
    if (!c) return;
    c.auth
      .getSession()
      .then(function (resultado) {
        sesionActual = resultado && resultado.data ? resultado.data.session : null;
        notificarCambio();
      })
      .catch(function (e) {
        console.error("No se pudo recuperar la sesión de Supabase", e);
      });
  }

  function obtenerSesion() {
    return sesionActual;
  }

  function suscribirCambiosSesion(fn) {
    listeners.push(fn);
  }

  function notificarCambio() {
    listeners.forEach(function (fn) {
      try {
        fn(sesionActual);
      } catch (e) {
        console.error("Error en listener de cambio de sesión", e);
      }
    });
  }

  /* Pide un código de 6 dígitos por email. El mismo signInWithOtp de
     siempre: si envía un enlace o un código lo decide la plantilla de
     email configurada en Supabase (Authentication -> Email Templates ->
     Magic Link), no el código del cliente. */
  function enviarCodigo(email) {
    var c = obtenerCliente();
    if (!c) return Promise.reject(new Error("Supabase no está configurado."));
    return c.auth.signInWithOtp({ email: email });
  }

  function verificarCodigo(email, codigo) {
    var c = obtenerCliente();
    if (!c) return Promise.reject(new Error("Supabase no está configurado."));
    return c.auth.verifyOtp({ email: email, token: codigo, type: "email" });
  }

  function cerrarSesion() {
    var c = obtenerCliente();
    if (!c) return Promise.resolve();
    return c.auth.signOut();
  }

  function puedeReenviar() {
    return Date.now() >= estadoCuenta.cooldownHasta;
  }

  /* --- UI: sección discreta de cuenta, embebida en la pantalla de Rutina --- */

  var REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var REGEX_CODIGO = /^\d{6}$/;

  function renderSeccionCuenta() {
    if (!configurado()) {
      return (
        '<div class="seccion-cuenta">' +
        "<h3>Cuenta</h3>" +
        '<p class="nota">La sincronización en la nube todavía no está configurada en esta app.</p>' +
        "</div>"
      );
    }

    var email = sesionActual && sesionActual.user ? sesionActual.user.email : null;
    if (email) return renderSeccionConectado(email);
    if (estadoCuenta.paso === "pedir-codigo") return renderSeccionPedirCodigo();
    return renderSeccionPedirEmail();
  }

  function renderSeccionConectado(email) {
    return (
      '<div class="seccion-cuenta">' +
      "<h3>Cuenta</h3>" +
      '<div id="cuenta-mensaje" class="mensaje oculto"></div>' +
      '<p class="nota">Conectado como ' + GYMAPP.util.escapeHtml(email) + "</p>" +
      '<button type="button" data-accion="cerrar-sesion-cuenta" class="btn btn-secundario btn-ancho">Cerrar sesión</button>' +
      "</div>"
    );
  }

  function renderSeccionPedirEmail() {
    return (
      '<div class="seccion-cuenta">' +
      "<h3>Cuenta</h3>" +
      '<div id="cuenta-mensaje" class="mensaje oculto"></div>' +
      '<p class="nota">Ingresá tu email para recibir un código de acceso de 6 dígitos. Esto no modifica ni sincroniza tus datos guardados en este dispositivo.</p>' +
      '<div class="campo">' +
      '<label for="input-email-cuenta">Email</label>' +
      '<input type="email" id="input-email-cuenta" placeholder="tu@email.com" value="' + GYMAPP.util.escapeHtml(estadoCuenta.email) + '" />' +
      "</div>" +
      '<button type="button" data-accion="enviar-codigo" class="btn btn-secundario btn-ancho">Enviar código</button>' +
      "</div>"
    );
  }

  function renderSeccionPedirCodigo() {
    return (
      '<div class="seccion-cuenta">' +
      "<h3>Cuenta</h3>" +
      '<div id="cuenta-mensaje" class="mensaje oculto"></div>' +
      '<p class="nota">Te enviamos un código de 6 dígitos a ' + GYMAPP.util.escapeHtml(estadoCuenta.email) + ". Ingresalo acá abajo (vence a los pocos minutos).</p>" +
      '<div class="campo">' +
      '<label for="input-codigo-cuenta">Código</label>' +
      '<input type="text" id="input-codigo-cuenta" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" />' +
      "</div>" +
      '<button type="button" data-accion="verificar-codigo" class="btn btn-primario btn-ancho">Verificar código</button>' +
      '<button type="button" data-accion="reenviar-codigo" class="btn btn-secundario btn-ancho"' + (puedeReenviar() ? "" : " disabled") + ">Reenviar código</button>" +
      '<button type="button" data-accion="cambiar-email-cuenta" class="btn btn-secundario btn-ancho">Usar otro email</button>' +
      "</div>"
    );
  }

  function mostrarMensajeCuenta(container, texto, tipo) {
    var el = container.querySelector("#cuenta-mensaje");
    if (!el) return;
    el.textContent = texto;
    el.className = "mensaje " + (tipo || "info");
  }

  /* Registra los eventos de click de la sección de cuenta. Se debe llamar
     una única vez por contenedor (el módulo que embebe esta sección ya
     garantiza esto con su propio guard de bindEventos). `alCambiarEstado`
     se invoca cada vez que cambia el paso del login (email -> código ->
     conectado) o la sesión, para que el módulo que embebe la sección
     vuelva a renderizarla. */
  function bindEventosCuenta(container, alCambiarEstado) {
    container.addEventListener("click", function (ev) {
      var boton = ev.target.closest(
        '[data-accion="enviar-codigo"], [data-accion="verificar-codigo"], ' +
        '[data-accion="reenviar-codigo"], [data-accion="cambiar-email-cuenta"], ' +
        '[data-accion="cerrar-sesion-cuenta"]'
      );
      if (!boton) return;
      var accion = boton.dataset.accion;

      if (accion === "enviar-codigo") {
        manejarEnviarCodigo(container, boton, alCambiarEstado, false);
      } else if (accion === "reenviar-codigo") {
        manejarEnviarCodigo(container, boton, alCambiarEstado, true);
      } else if (accion === "verificar-codigo") {
        manejarVerificarCodigo(container, boton, alCambiarEstado);
      } else if (accion === "cambiar-email-cuenta") {
        estadoCuenta.paso = "pedir-email";
        if (alCambiarEstado) alCambiarEstado();
      } else if (accion === "cerrar-sesion-cuenta") {
        manejarCerrarSesion(container, boton, alCambiarEstado);
      }
    });
  }

  function manejarEnviarCodigo(container, boton, alCambiarEstado, esReenvio) {
    var email;
    if (esReenvio) {
      if (!puedeReenviar()) {
        mostrarMensajeCuenta(container, "Esperá unos segundos antes de pedir otro código.", "info");
        return;
      }
      email = estadoCuenta.email;
    } else {
      var input = container.querySelector("#input-email-cuenta");
      email = input ? input.value.trim() : "";
      if (!REGEX_EMAIL.test(email)) {
        mostrarMensajeCuenta(container, "Ingresá un email válido.", "error");
        return;
      }
    }

    boton.disabled = true;
    mostrarMensajeCuenta(container, "Enviando código...", "info");

    enviarCodigo(email)
      .then(function (resultado) {
        if (resultado && resultado.error) {
          boton.disabled = false;
          mostrarMensajeCuenta(container, "No se pudo enviar el código: " + resultado.error.message, "error");
          return;
        }
        estadoCuenta.email = email;
        estadoCuenta.paso = "pedir-codigo";
        estadoCuenta.cooldownHasta = Date.now() + COOLDOWN_REENVIO_MS;
        if (alCambiarEstado) alCambiarEstado();
        mostrarMensajeCuenta(container, "Te enviamos un código a " + email + ". Revisá tu correo.", "exito");
        setTimeout(function () {
          if (alCambiarEstado) alCambiarEstado();
        }, COOLDOWN_REENVIO_MS);
      })
      .catch(function (e) {
        boton.disabled = false;
        console.error("Error al enviar el código OTP", e);
        mostrarMensajeCuenta(container, "Ocurrió un error de red al enviar el código. Probá de nuevo.", "error");
      });
  }

  function manejarVerificarCodigo(container, boton, alCambiarEstado) {
    var input = container.querySelector("#input-codigo-cuenta");
    var codigo = input ? input.value.trim() : "";
    if (!REGEX_CODIGO.test(codigo)) {
      mostrarMensajeCuenta(container, "Ingresá el código de 6 dígitos que recibiste por email.", "error");
      return;
    }

    boton.disabled = true;
    mostrarMensajeCuenta(container, "Verificando código...", "info");

    verificarCodigo(estadoCuenta.email, codigo)
      .then(function (resultado) {
        boton.disabled = false;
        if (resultado && resultado.error) {
          mostrarMensajeCuenta(
            container,
            "Código inválido o vencido" + (resultado.error.message ? ": " + resultado.error.message : "") + ". Pedí uno nuevo e intentá de nuevo.",
            "error"
          );
          return;
        }
        estadoCuenta.paso = "pedir-email";
        estadoCuenta.email = "";
        if (alCambiarEstado) alCambiarEstado();
      })
      .catch(function (e) {
        boton.disabled = false;
        console.error("Error al verificar el código OTP", e);
        mostrarMensajeCuenta(container, "Ocurrió un error de red al verificar el código. Probá de nuevo.", "error");
      });
  }

  function manejarCerrarSesion(container, boton, alCambiarEstado) {
    boton.disabled = true;
    cerrarSesion()
      .then(function () {
        estadoCuenta.paso = "pedir-email";
        estadoCuenta.email = "";
        if (alCambiarEstado) alCambiarEstado();
      })
      .catch(function (e) {
        boton.disabled = false;
        console.error("Error al cerrar sesión", e);
        mostrarMensajeCuenta(container, "Ocurrió un error de red al cerrar sesión. Probá de nuevo.", "error");
      });
  }

  return {
    inicializar: inicializar,
    obtenerSesion: obtenerSesion,
    suscribirCambiosSesion: suscribirCambiosSesion,
    enviarCodigo: enviarCodigo,
    verificarCodigo: verificarCodigo,
    cerrarSesion: cerrarSesion,
    renderSeccionCuenta: renderSeccionCuenta,
    bindEventosCuenta: bindEventosCuenta
  };
})();
