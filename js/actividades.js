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

  return {
    obtenerCatalogo: obtenerCatalogo,
    obtenerActividadPorId: obtenerActividadPorId,
    obtenerActividadesUsuario: obtenerActividadesUsuario,
    obtenerDetalleSesion: obtenerDetalleSesion
  };
})();
