/* Catálogo de actividades y helpers compartidos (ACT-01).

   Base técnica para que cada usuario elija qué deportes practica y su meta
   semanal por deporte, sin estar limitado a Gimnasio + Fútbol. Este módulo
   SOLO expone el catálogo y funciones de consulta: todavía no lo usa
   ninguna pantalla (onboarding, Entrenar, Dashboard, Progreso siguen
   exactamente como están). Agregar un deporte nuevo en el futuro es agregar
   una entrada al catálogo de acá, sin tocar el resto de la app.

   Es completamente independiente de storage.js: no lee ni escribe
   localStorage, solo opera sobre los objetos (usuario/sesión) que le pasan. */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.actividades = (function () {
  /* Orden de visualización sugerido para una futura UI (selector de
     actividades, tira de anillos, etc.). No se persiste en ningún lado. */
  var ORDEN = ["gimnasio", "futbol", "basquet", "natacion", "padel", "tenis"];

  /* Catálogo estático. Cada entrada:
     - id: estable, es el mismo valor que usa/usará sesion.tipo.
     - nombre, icono: para mostrar en cualquier pantalla futura.
     - modoRutina: true únicamente para gimnasio, que sigue su sistema actual
       (rutina.dias + ejercicios_realizados), no sesion.detalle.
     - campos: metadata de qué campos arma el formulario de sesion.detalle
       para ese deporte (todavía no se usa: es la base para un formulario
       genérico futuro en Entrenar, sin necesidad de una función renderX
       nueva por cada deporte con la misma forma de campos). */
  var CATALOGO = {
    gimnasio: { id: "gimnasio", nombre: "Gimnasio", icono: "🏋️", modoRutina: true, campos: [] },
    futbol: { id: "futbol", nombre: "Fútbol", icono: "⚽", modoRutina: false, campos: ["tipoSesion", "duracion", "rpe", "notas"] },
    basquet: { id: "basquet", nombre: "Básquet", icono: "🏀", modoRutina: false, campos: ["tipoSesion", "duracion", "rpe", "notas"] },
    natacion: { id: "natacion", nombre: "Natación", icono: "🏊", modoRutina: false, campos: ["duracion", "distancia", "estilo", "rpe"] },
    padel: { id: "padel", nombre: "Pádel", icono: "🎾", modoRutina: false, campos: ["tipoSesion", "duracion", "rpe", "notas"] },
    tenis: { id: "tenis", nombre: "Tenis", icono: "🎾", modoRutina: false, campos: ["tipoSesion", "duracion", "rpe", "notas"] }
  };

  /* Catálogo completo, en el orden sugerido. */
  function obtenerCatalogo() {
    return ORDEN.map(function (id) { return CATALOGO[id]; });
  }

  /* Una actividad del catálogo por id, o null si no existe (nunca revienta
     ante un id desconocido, ej. un dato viejo o corrupto). */
  function obtenerActividadPorId(id) {
    return (id && CATALOGO[id]) || null;
  }

  /* Actividades configuradas por el usuario (usuario.actividades), tal cual
     están guardadas: [{ tipo, meta_semanal }, ...]. Devuelve [] si el
     usuario todavía no tiene el campo, para que cualquier consumidor futuro
     pueda iterar sin chequear null/undefined primero. */
  function obtenerActividadesUsuario(usuario) {
    return (usuario && Array.isArray(usuario.actividades)) ? usuario.actividades : [];
  }

  /* Detalle de una sesión, con compatibilidad hacia atrás:
     - Las sesiones de fútbol históricas guardaron su detalle bajo
       "futbol_detalle" y NUNCA se migran ni se renombran.
     - Toda sesión nueva (fútbol incluido, a partir de ahora) usa el campo
       genérico "detalle".
     Si por algún motivo una sesión tuviera ambos (no debería pasar), gana
     "detalle" por ser el más nuevo. */
  function obtenerDetalleSesion(sesion) {
    if (!sesion) return null;
    if (sesion.detalle) return sesion.detalle;
    if (sesion.tipo === "futbol" && sesion.futbol_detalle) return sesion.futbol_detalle;
    return null;
  }

  /* ACT-02: helpers de UI/validación compartidos entre onboarding y la
     sección "Actividades y metas" de Rutina, para no duplicar en cada
     pantalla el markup de una fila ni las reglas de validación.

     Una "fila de actividad" es: checkbox de selección + nombre/ícono del
     catálogo + input numérico de meta semanal, visible solo si está
     seleccionada. Ambas pantallas renderizan las filas con
     renderListaActividades, delegan el toggle de visibilidad a
     alternarVisibilidadMeta, leen el estado actual del DOM con
     leerSeleccionDesdeDom y arman/validan el arreglo final con
     construirActividades antes de guardar. */

  function renderFilaActividad(actividad, seleccionada, metaSemanal, idPrefix) {
    var prefix = idPrefix || "act";
    var idCheck = prefix + "-check-" + actividad.id;
    var idMeta = prefix + "-meta-" + actividad.id;
    return (
      '<div class="fila-actividad' + (seleccionada ? " fila-actividad-activa" : "") + '" data-actividad-tipo="' + actividad.id + '">' +
      '<label class="fila-actividad-toggle" for="' + idCheck + '">' +
      '<input type="checkbox" class="fila-actividad-checkbox" id="' + idCheck + '" data-tipo="' + actividad.id + '"' + (seleccionada ? " checked" : "") + ">" +
      '<span class="fila-actividad-icono" aria-hidden="true">' + actividad.icono + "</span>" +
      '<span class="fila-actividad-nombre">' + actividad.nombre + "</span>" +
      "</label>" +
      '<div class="fila-actividad-meta' + (seleccionada ? "" : " oculto") + '">' +
      '<label for="' + idMeta + '">Días/sem.</label>' +
      '<input type="number" class="fila-actividad-meta-input" id="' + idMeta + '" data-tipo="' + actividad.id + '" min="1" max="7" step="1" inputmode="numeric" value="' + metaSemanal + '">' +
      "</div>" +
      "</div>"
    );
  }

  /* Renderiza el catálogo completo (en su orden fijo), marcando como
     seleccionadas las actividades presentes en `actividadesUsuario`
     ([{tipo, meta_semanal}]) con su meta guardada. Las no presentes se
     muestran sin marcar, con una meta sugerida de 3 por si el usuario las
     tilda (no se persiste hasta que efectivamente las seleccione). */
  function renderListaActividades(actividadesUsuario, idPrefix) {
    var mapa = {};
    (actividadesUsuario || []).forEach(function (a) { mapa[a.tipo] = a.meta_semanal; });
    return obtenerCatalogo().map(function (actividad) {
      var seleccionada = Object.prototype.hasOwnProperty.call(mapa, actividad.id);
      var meta = seleccionada ? mapa[actividad.id] : 3;
      return renderFilaActividad(actividad, seleccionada, meta, idPrefix);
    }).join("");
  }

  /* Muestra/oculta el input de meta semanal de una fila según el estado del
     checkbox que la controla. Puramente visual: no lee ni escribe datos. */
  function alternarVisibilidadMeta(checkbox) {
    var fila = checkbox.closest(".fila-actividad");
    if (!fila) return;
    var contenedorMeta = fila.querySelector(".fila-actividad-meta");
    if (contenedorMeta) contenedorMeta.classList.toggle("oculto", !checkbox.checked);
    fila.classList.toggle("fila-actividad-activa", checkbox.checked);
  }

  /* Lee del DOM, dentro de `scope`, el estado actual de cada fila de
     actividad ya renderizada: [{tipo, activo, meta}], donde `meta` es el
     valor numérico del input (NaN si está vacío o no es un número). No
     valida nada, solo traduce el DOM a datos: la validación la hace
     construirActividades. */
  function leerSeleccionDesdeDom(scope) {
    var seleccion = [];
    if (!scope) return seleccion;
    var checkboxes = scope.querySelectorAll(".fila-actividad-checkbox");
    for (var i = 0; i < checkboxes.length; i++) {
      var checkbox = checkboxes[i];
      var fila = checkbox.closest(".fila-actividad");
      var metaInput = fila ? fila.querySelector(".fila-actividad-meta-input") : null;
      var raw = metaInput ? String(metaInput.value).trim() : "";
      var meta = raw === "" ? NaN : Number(raw);
      seleccion.push({ tipo: checkbox.dataset.tipo, activo: checkbox.checked, meta: meta });
    }
    return seleccion;
  }

  /* Arma el usuario.actividades final a partir de una selección cruda
     ([{tipo, activo, meta}], en cualquier orden), aplicando las reglas de
     ACT-02: al menos 1 actividad activa; meta entera entre 1 y 7; sin
     duplicados (garantizado por catálogo, un id por vuelta); resultado en
     el orden del catálogo, no en el orden en que el usuario clickeó.
     Devuelve { ok:true, actividades } o { ok:false, error }. */
  function construirActividades(seleccion) {
    var porTipo = {};
    (seleccion || []).forEach(function (s) { porTipo[s.tipo] = s; });

    var resultado = [];
    var catalogo = obtenerCatalogo();
    for (var i = 0; i < catalogo.length; i++) {
      var actividad = catalogo[i];
      var item = porTipo[actividad.id];
      if (!item || !item.activo) continue;

      var meta = item.meta;
      if (typeof meta !== "number" || !Number.isInteger(meta)) {
        return { ok: false, error: "La meta semanal de " + actividad.nombre + " debe ser un número entero." };
      }
      if (meta < 1 || meta > 7) {
        return { ok: false, error: "La meta semanal de " + actividad.nombre + " debe estar entre 1 y 7 días." };
      }
      resultado.push({ tipo: actividad.id, meta_semanal: meta });
    }

    if (resultado.length === 0) {
      return { ok: false, error: "Elegí al menos una actividad." };
    }

    return { ok: true, actividades: resultado };
  }

  return {
    obtenerCatalogo: obtenerCatalogo,
    obtenerActividadPorId: obtenerActividadPorId,
    obtenerActividadesUsuario: obtenerActividadesUsuario,
    obtenerDetalleSesion: obtenerDetalleSesion,
    renderListaActividades: renderListaActividades,
    alternarVisibilidadMeta: alternarVisibilidadMeta,
    leerSeleccionDesdeDom: leerSeleccionDesdeDom,
    construirActividades: construirActividades
  };
})();
