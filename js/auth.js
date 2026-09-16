/* Autenticación opcional con Supabase Auth (magic link por email).
   Este módulo es completamente independiente de storage.js: nunca lee ni
   escribe la clave "gymNutritionTracker" ni la tabla datos_usuario. Solo
   maneja la sesión de Supabase, guardada bajo su propia clave separada. */
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
     datos de la app. */
  var STORAGE_KEY_AUTH = "gymNutritionTracker_supabaseAuth";

  var cliente = null;
  var clienteFalló = false;
  var sesionActual = null;
  var listeners = [];

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
          detectSessionInUrl: true
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
     simplemente queda en null y la app sigue funcionando sin login. */
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

  function enviarMagicLink(email) {
    var c = obtenerCliente();
    if (!c) return Promise.reject(new Error("Supabase no está configurado."));
    return c.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
  }

  function cerrarSesion() {
    var c = obtenerCliente();
    if (!c) return Promise.resolve();
    return c.auth.signOut();
  }

  /* --- UI: sección discreta de cuenta, embebida en la pantalla de Rutina --- */

  var REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    return (
      '<div class="seccion-cuenta">' +
      "<h3>Cuenta</h3>" +
      '<div id="cuenta-mensaje" class="mensaje oculto"></div>' +
      (email
        ? '<p class="nota">Conectado como ' + GYMAPP.util.escapeHtml(email) + "</p>" +
          '<button type="button" data-accion="cerrar-sesion-cuenta" class="btn btn-secundario btn-ancho">Cerrar sesión</button>'
        : '<p class="nota">Ingresá tu email para recibir un enlace de acceso. Esto no modifica ni sincroniza tus datos guardados en este dispositivo.</p>' +
          '<div class="campo">' +
          '<label for="input-email-cuenta">Email</label>' +
          '<input type="email" id="input-email-cuenta" placeholder="tu@email.com" />' +
          "</div>" +
          '<button type="button" data-accion="enviar-magic-link" class="btn btn-secundario btn-ancho">Enviar enlace de acceso</button>') +
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
     se invoca tras un login/logout exitoso para que el módulo que embebe
     la sección pueda volver a renderizarse. */
  function bindEventosCuenta(container, alCambiarEstado) {
    container.addEventListener("click", function (ev) {
      var boton = ev.target.closest('[data-accion="enviar-magic-link"], [data-accion="cerrar-sesion-cuenta"]');
      if (!boton) return;
      var accion = boton.dataset.accion;

      if (accion === "enviar-magic-link") {
        var input = container.querySelector("#input-email-cuenta");
        var email = input ? input.value.trim() : "";
        if (!REGEX_EMAIL.test(email)) {
          mostrarMensajeCuenta(container, "Ingresá un email válido.", "error");
          return;
        }
        boton.disabled = true;
        enviarMagicLink(email)
          .then(function (resultado) {
            boton.disabled = false;
            if (resultado && resultado.error) {
              mostrarMensajeCuenta(container, "No se pudo enviar el enlace: " + resultado.error.message, "error");
              return;
            }
            mostrarMensajeCuenta(container, "Te enviamos un enlace de acceso a " + email + ". Revisá tu correo.", "exito");
          })
          .catch(function (e) {
            boton.disabled = false;
            console.error("Error al enviar magic link", e);
            mostrarMensajeCuenta(container, "Ocurrió un error de red al enviar el enlace. Probá de nuevo.", "error");
          });
      } else if (accion === "cerrar-sesion-cuenta") {
        boton.disabled = true;
        cerrarSesion()
          .then(function () {
            if (alCambiarEstado) alCambiarEstado();
          })
          .catch(function (e) {
            boton.disabled = false;
            console.error("Error al cerrar sesión", e);
            mostrarMensajeCuenta(container, "Ocurrió un error de red al cerrar sesión. Probá de nuevo.", "error");
          });
      }
    });
  }

  return {
    inicializar: inicializar,
    obtenerSesion: obtenerSesion,
    suscribirCambiosSesion: suscribirCambiosSesion,
    enviarMagicLink: enviarMagicLink,
    cerrarSesion: cerrarSesion,
    renderSeccionCuenta: renderSeccionCuenta,
    bindEventosCuenta: bindEventosCuenta
  };
})();
