/* Capa de persistencia: única puerta de entrada a localStorage. */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.storage = (function () {
  var STORAGE_KEY = "gymNutritionTracker";

  function getDefaultData() {
    return {
      usuario: null,
      rutina: { dias: [] },
      sesiones_entrenamiento: [],
      registros_nutricion: [],
      base_alimentos: [],
      medidas_corporales: []
    };
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
    try {
      var data = JSON.parse(raw);
      return Object.assign(getDefaultData(), data);
    } catch (e) {
      console.error("Datos guardados corruptos, se reinicia el estado", e);
      return getDefaultData();
    }
  }

  function save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error("No se pudo guardar en localStorage", e);
    }
  }

  function getData() {
    return load();
  }

  /* Aplica `updater` sobre el estado actual y lo persiste. Devuelve el estado actualizado. */
  function updateData(updater) {
    var data = load();
    updater(data);
    save(data);
    return data;
  }

  return {
    getDefaultData: getDefaultData,
    load: load,
    save: save,
    getData: getData,
    updateData: updateData
  };
})();
