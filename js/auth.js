/* Autenticación opcional con Supabase Auth mediante email + contraseña
   (supabase.auth.signUp / signInWithPassword). Objetivo a futuro: que la
   misma cuenta se use en celular, tablet y computadora para sincronizar
   datos propios; esta versión implementa exclusivamente la autenticación,
   sin ninguna sincronización todavía. Este módulo es completamente
   independiente de storage.js: nunca lee ni escribe la clave
   "gymNutritionTracker" ni la tabla datos_usuario. Solo maneja la sesión
   de Supabase, guardada bajo su propia clave separada. */
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
     datos de la app. La contraseña en sí NUNCA se guarda en ningún lado:
     vive solo en el input del formulario mientras se envía la request. */
  var STORAGE_KEY_AUTH = "gymNutritionTracker_supabaseAuth";

  var LARGO_MINIMO_PASSWORD = 6;

  var cliente = null;
  var clienteFalló = false;
  var sesionActual = null;
  var listeners = [];

  /* Estado efímero de la UI de login (no se persiste en ningún lado, y
     nunca incluye la contraseña). modo: "iniciar-sesion" | "crear-cuenta". */
  var estadoCuenta = { modo: "iniciar-sesion", email: "", cargando: false };

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
          /* No hay ningún flujo basado en enlaces de email (ni magic link
             ni OTP): el login es por email + contraseña, así que no hace
             falta que el cliente inspeccione la URL de retorno. */
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

  /* Crea la cuenta con email + contraseña. Con "Confirm Email" apagado en
     Supabase, esto ya deja la sesión iniciada (onAuthStateChange dispara
     solo). Si el email ya tenía una cuenta, Supabase puede responder sin
     error y sin sesión nueva (para no revelar si el email existe): eso se
     maneja en manejarCrearCuenta, no acá. */
  function crearCuenta(email, password) {
    var c = obtenerCliente();
    if (!c) return Promise.reject(new Error("Supabase no está configurado."));
    return c.auth.signUp({ email: email, password: password });
  }

  function iniciarSesion(email, password) {
    var c = obtenerCliente();
    if (!c) return Promise.reject(new Error("Supabase no está configurado."));
    return c.auth.signInWithPassword({ email: email, password: password });
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
    if (email) return renderSeccionConectado(email);
    return renderSeccionFormulario();
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

  function renderSeccionFormulario() {
    var esCrearCuenta = estadoCuenta.modo === "crear-cuenta";
    return (
      '<div class="seccion-cuenta">' +
      "<h3>Cuenta</h3>" +
      '<div id="cuenta-mensaje" class="mensaje oculto"></div>' +
      '<div class="selector-tipo cuenta-modo-selector">' +
      '<button type="button" data-accion="modo-iniciar-sesion" class="btn-tipo' + (!esCrearCuenta ? " activo" : "") + '">Iniciar sesión</button>' +
      '<button type="button" data-accion="modo-crear-cuenta" class="btn-tipo' + (esCrearCuenta ? " activo" : "") + '">Crear cuenta</button>' +
      "</div>" +
      '<p class="nota">' +
      (esCrearCuenta
        ? "Creá una cuenta con email y contraseña. Más adelante esto va a permitir sincronizar tus datos entre dispositivos."
        : "Iniciá sesión con tu email y contraseña.") +
      "</p>" +
      '<div class="campo">' +
      '<label for="input-email-cuenta">Email</label>' +
      '<input type="email" id="input-email-cuenta" placeholder="tu@email.com" value="' +
      GYMAPP.util.escapeHtml(estadoCuenta.email) +
      '" autocomplete="email" />' +
      "</div>" +
      '<div class="campo">' +
      '<label for="input-password-cuenta">Contraseña</label>' +
      '<input type="password" id="input-password-cuenta" placeholder="••••••••" autocomplete="' +
      (esCrearCuenta ? "new-password" : "current-password") +
      '" />' +
      "</div>" +
      (esCrearCuenta
        ? '<div class="campo">' +
          '<label for="input-password-confirmar-cuenta">Repetir contraseña</label>' +
          '<input type="password" id="input-password-confirmar-cuenta" placeholder="••••••••" autocomplete="new-password" />' +
          "</div>"
        : "") +
      '<button type="button" data-accion="' +
      (esCrearCuenta ? "crear-cuenta" : "iniciar-sesion") +
      '" class="btn btn-primario btn-ancho">' +
      (esCrearCuenta ? "Crear cuenta" : "Iniciar sesión") +
      "</button>" +
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
     se invoca al cambiar entre "Iniciar sesión"/"Crear cuenta" (estado
     puramente local, no dispara onAuthStateChange); los cambios de sesión
     en sí (login/logout exitosos) ya llegan por suscribirCambiosSesion. */
  function bindEventosCuenta(container, alCambiarEstado) {
    container.addEventListener("click", function (ev) {
      var boton = ev.target.closest(
        '[data-accion="modo-iniciar-sesion"], [data-accion="modo-crear-cuenta"], ' +
        '[data-accion="iniciar-sesion"], [data-accion="crear-cuenta"], ' +
        '[data-accion="cerrar-sesion-cuenta"]'
      );
      if (!boton) return;
      var accion = boton.dataset.accion;

      if (accion === "modo-iniciar-sesion") {
        estadoCuenta.modo = "iniciar-sesion";
        if (alCambiarEstado) alCambiarEstado();
      } else if (accion === "modo-crear-cuenta") {
        estadoCuenta.modo = "crear-cuenta";
        if (alCambiarEstado) alCambiarEstado();
      } else if (accion === "iniciar-sesion") {
        manejarIniciarSesion(container, boton);
      } else if (accion === "crear-cuenta") {
        manejarCrearCuenta(container, boton);
      } else if (accion === "cerrar-sesion-cuenta") {
        manejarCerrarSesion(container, boton, alCambiarEstado);
      }
    });
  }

  function leerEmailPassword(container) {
    var inputEmail = container.querySelector("#input-email-cuenta");
    var inputPassword = container.querySelector("#input-password-cuenta");
    return {
      email: inputEmail ? inputEmail.value.trim() : "",
      password: inputPassword ? inputPassword.value : ""
    };
  }

  function manejarIniciarSesion(container, boton) {
    if (estadoCuenta.cargando) return;
    var datos = leerEmailPassword(container);

    if (!REGEX_EMAIL.test(datos.email)) {
      mostrarMensajeCuenta(container, "Ingresá un email válido.", "error");
      return;
    }
    if (!datos.password) {
      mostrarMensajeCuenta(container, "Ingresá tu contraseña.", "error");
      return;
    }

    estadoCuenta.email = datos.email;
    estadoCuenta.cargando = true;
    boton.disabled = true;
    mostrarMensajeCuenta(container, "Iniciando sesión...", "info");

    iniciarSesion(datos.email, datos.password)
      .then(function (resultado) {
        estadoCuenta.cargando = false;
        boton.disabled = false;
        if (resultado && resultado.error) {
          mostrarMensajeCuenta(container, "No se pudo iniciar sesión: " + resultado.error.message, "error");
          return;
        }
        /* Éxito: onAuthStateChange dispara solo y el módulo que embebe
           esta sección (suscribirCambiosSesion) ya vuelve a renderizar
           mostrando "Conectado como...". */
      })
      .catch(function (e) {
        estadoCuenta.cargando = false;
        boton.disabled = false;
        console.error("Error de red al iniciar sesión", e);
        mostrarMensajeCuenta(container, "Ocurrió un error de red al iniciar sesión. Probá de nuevo.", "error");
      });
  }

  function manejarCrearCuenta(container, boton) {
    if (estadoCuenta.cargando) return;
    var datos = leerEmailPassword(container);
    var inputConfirmar = container.querySelector("#input-password-confirmar-cuenta");
    var passwordConfirmar = inputConfirmar ? inputConfirmar.value : "";

    if (!REGEX_EMAIL.test(datos.email)) {
      mostrarMensajeCuenta(container, "Ingresá un email válido.", "error");
      return;
    }
    if (datos.password.length < LARGO_MINIMO_PASSWORD) {
      mostrarMensajeCuenta(container, "La contraseña debe tener al menos " + LARGO_MINIMO_PASSWORD + " caracteres.", "error");
      return;
    }
    if (datos.password !== passwordConfirmar) {
      mostrarMensajeCuenta(container, "Las contraseñas no coinciden.", "error");
      return;
    }

    estadoCuenta.email = datos.email;
    estadoCuenta.cargando = true;
    boton.disabled = true;
    mostrarMensajeCuenta(container, "Creando tu cuenta...", "info");

    crearCuenta(datos.email, datos.password)
      .then(function (resultado) {
        estadoCuenta.cargando = false;
        boton.disabled = false;
        if (resultado && resultado.error) {
          mostrarMensajeCuenta(container, "No se pudo crear la cuenta: " + resultado.error.message, "error");
          return;
        }
        var haySesion = resultado && resultado.data && resultado.data.session;
        if (haySesion) {
          /* onAuthStateChange dispara solo y muestra "Conectado como...". */
          return;
        }
        /* Con "Confirm Email" apagado esto no debería pasar salvo que el
           email ya tuviera una cuenta (Supabase responde sin error y sin
           sesión nueva, para no revelar si el email existe). */
        mostrarMensajeCuenta(container, "Revisá el email ingresado: si ya tenías una cuenta, iniciá sesión en su lugar.", "info");
      })
      .catch(function (e) {
        estadoCuenta.cargando = false;
        boton.disabled = false;
        console.error("Error de red al crear la cuenta", e);
        mostrarMensajeCuenta(container, "Ocurrió un error de red al crear la cuenta. Probá de nuevo.", "error");
      });
  }

  function manejarCerrarSesion(container, boton, alCambiarEstado) {
    boton.disabled = true;
    cerrarSesion()
      .then(function () {
        estadoCuenta.modo = "iniciar-sesion";
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
    crearCuenta: crearCuenta,
    iniciarSesion: iniciarSesion,
    cerrarSesion: cerrarSesion,
    renderSeccionCuenta: renderSeccionCuenta,
    bindEventosCuenta: bindEventosCuenta
  };
})();
