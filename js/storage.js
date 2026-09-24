/* Capa de persistencia: única puerta de entrada a localStorage. */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.storage = (function () {
  var STORAGE_KEY = "gymNutritionTracker";

  /* Versión actual del esquema de datos. Subir este número junto con un paso
     nuevo en migrarDatos() cada vez que la forma de los datos cambie. */
  var VERSION_ESQUEMA_ACTUAL = 2;

  var MENSAJE_ERROR_GUARDADO = (
    "No se pudieron guardar los cambios. Es posible que no haya espacio disponible en el dispositivo, " +
    "o que el almacenamiento esté bloqueado (por ejemplo, en modo privado del navegador). " +
    "Los últimos cambios NO se guardaron: liberá espacio o salí del modo privado y volvé a intentarlo."
  );

  var MENSAJE_VERSION_FUTURA = (
    "Tus datos guardados fueron creados por una versión más nueva de esta app que la que tenés cargada ahora. " +
    "Para no arriesgar tu información, esta sesión NO va a guardar ningún cambio nuevo. " +
    "Recargá la página (o volvé a entrar más tarde) para obtener la versión más reciente antes de seguir usándola."
  );

  /* Se activa si detectamos datos de una versión de esquema más nueva que la que
     entendemos. Mientras esté activo, save() rechaza cualquier escritura para
     nunca pisar datos que esta versión del código no sabe interpretar. */
  var bloqueadoPorVersionFutura = false;

  function getDefaultData() {
    return {
      schema_version: VERSION_ESQUEMA_ACTUAL,
      usuario: null,
      rutina: { dias: [] },
      sesiones_entrenamiento: [],
      registros_nutricion: [],
      base_alimentos: [],
      medidas_corporales: []
    };
  }

  /*
   * Migra `dataCruda` (tal cual se leyó de localStorage o se importó de un backup)
   * a la versión de esquema actual, en pasos secuenciales e idempotentes: cada
   * paso primero revisa la versión antes de aplicarse, así que correr esta
   * función varias veces sobre el mismo objeto nunca duplica ni pisa datos.
   * Nunca borra campos existentes, solo agrega/ajusta lo necesario.
   */
  function migrarDatos(dataCruda) {
    var version = typeof dataCruda.schema_version === "number" ? dataCruda.schema_version : 0;

    if (version < 1) {
      /* Migración 0 -> 1: solo declara la versión de esquema. Los datos de usuarios
         que ya venían usando la app (rutina, historial, nutrición, medidas) quedan
         exactamente como estaban. */
      dataCruda.schema_version = 1;
      version = 1;
    }

    if (version < 2) {
      /* Migración 1 -> 2 (ACT-01, base técnica de actividades configurables):
         agrega usuario.actividades si todavía no existe, con EXACTAMENTE la
         configuración que era la única disponible en la versión anterior
         (Gimnasio meta 5, Fútbol meta 2) — a propósito no se infiere de
         sesiones_entrenamiento, porque esa era la config funcional para
         TODOS los usuarios, hayan cargado o no sesiones todavía.
         No toca sesiones_entrenamiento, rutina, nutrición, medidas ni
         futbol_detalle histórico: es puramente aditiva sobre `usuario`, y
         solo si `usuario` ya existe (si es null, no hay nada que completar
         todavía; lo arma el onboarding). Idempotente: si usuario.actividades
         ya está seteado, no se toca. */
      if (dataCruda.usuario && !dataCruda.usuario.actividades) {
        dataCruda.usuario.actividades = [
          { tipo: "gimnasio", meta_semanal: 5 },
          { tipo: "futbol", meta_semanal: 2 }
        ];
      }
      dataCruda.schema_version = 2;
      version = 2;
    }

    /* Las próximas migraciones se agregan acá abajo, siguiendo el mismo patrón:
       if (version < N) { ...ajustar dataCruda...; dataCruda.schema_version = N; version = N; } */

    return dataCruda;
  }

  function load() {
    var raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      console.error("No se pudo acceder a localStorage", e);
      return getDefaultData();
    }
    if (!raw) return getDefaultData();

    var dataCruda;
    try {
      dataCruda = JSON.parse(raw);
    } catch (e) {
      console.error("Datos guardados corruptos, se reinicia el estado", e);
      return getDefaultData();
    }

    var versionOriginal = typeof dataCruda.schema_version === "number" ? dataCruda.schema_version : 0;

    /* Datos de una versión futura: no los tocamos ni los interpretamos, y
       bloqueamos cualquier escritura por el resto de la sesión para no
       arriesgarnos a corromperlos con una lógica que no los entiende.
       Avisamos una sola vez (no en cada load(), que se llama constantemente
       desde updateData()); los intentos de guardado posteriores ya avisan
       a través de save(). */
    if (versionOriginal > VERSION_ESQUEMA_ACTUAL) {
      if (!bloqueadoPorVersionFutura) {
        bloqueadoPorVersionFutura = true;
        console.error(
          "schema_version de los datos guardados (" + versionOriginal + ") es más nueva que la soportada (" +
          VERSION_ESQUEMA_ACTUAL + "). Bloqueando guardado por el resto de la sesión."
        );
        window.alert(MENSAJE_VERSION_FUTURA);
      }
      return Object.assign(getDefaultData(), dataCruda);
    }

    var dataMigrada;
    try {
      dataMigrada = migrarDatos(dataCruda);
    } catch (e) {
      /* Si la migración falla, NUNCA devolvemos ni guardamos un estado vacío:
         devolvemos los datos tal cual estaban (completados solo con los campos
         que falten), preservando su schema_version original para que una
         futura carga pueda reintentar la migración. */
      console.error("Error al migrar los datos guardados; se conservan sin modificar.", e);
      window.alert(
        "Hubo un problema al actualizar el formato de tus datos guardados. " +
        "Tus datos NO se perdieron ni se sobrescribieron; seguís viendo la versión anterior tal cual estaba."
      );
      var dataSinMigrar = Object.assign(getDefaultData(), dataCruda);
      dataSinMigrar.schema_version = versionOriginal;
      return dataSinMigrar;
    }

    var dataCompleta = Object.assign(getDefaultData(), dataMigrada);

    /* Si la migración cambió algo, lo persistimos ahora para no tener que
       repetirla en cada carga. Si esto falla (ej. sin espacio), igual devolvemos
       los datos migrados en memoria; la próxima carga exitosa los va a guardar.
       No pasamos alertaAutomatica:false: si este guardado de fondo falla, nadie
       más va a avisar, así que queremos que save() muestre su aviso genérico. */
    if (dataMigrada.schema_version !== versionOriginal) {
      save(dataCompleta);
    }

    return dataCompleta;
  }

  /*
   * Devuelve true si se pudo guardar. Si falla, avisa al usuario de forma
   * explícita para que nunca crea que algo se guardó cuando en realidad no.
   *
   * `opciones.alertaAutomatica` (default true): pasar `false` cuando el módulo
   * que llama ya le muestra su propio mensaje de error al usuario, para no
   * duplicar el aviso. Dejarlo en true (el default) actúa como red de
   * seguridad para cualquier llamador que no maneje el error explícitamente.
   */
  function save(data, opciones) {
    var alertaAutomatica = !opciones || opciones.alertaAutomatica !== false;

    if (bloqueadoPorVersionFutura) {
      console.error("Guardado bloqueado: los datos locales son de una versión de esquema más nueva que la soportada.");
      if (alertaAutomatica) window.alert(MENSAJE_VERSION_FUTURA);
      return false;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error("No se pudo guardar en localStorage", e);
      if (alertaAutomatica) window.alert(MENSAJE_ERROR_GUARDADO);
      return false;
    }
  }

  function getData() {
    return load();
  }

  /* Aplica `updater` sobre el estado actual y lo persiste.
     Devuelve { data, guardado }: `data` es el estado (mutado en memoria) y
     `guardado` indica si el guardado en localStorage realmente se completó.
     Todo módulo que llame a esto debe chequear `guardado` antes de asumir que
     el cambio quedó persistido. Ver `save()` para el significado de `opciones`. */
  function updateData(updater, opciones) {
    var data = load();
    updater(data);
    var exito = save(data, opciones);
    return { data: data, guardado: exito };
  }

  return {
    getDefaultData: getDefaultData,
    migrarDatos: migrarDatos,
    load: load,
    save: save,
    getData: getData,
    updateData: updateData
  };
})();
