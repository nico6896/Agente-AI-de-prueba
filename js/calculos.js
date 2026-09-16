/* Cálculo de metas nutricionales (Mifflin-St Jeor + ajuste por objetivo). */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.calculos = (function () {
  var FACTOR_ACTIVIDAD = {
    sedentario: 1.2,
    moderado: 1.55,
    activo: 1.725,
    muy_activo: 1.9
  };

  var AJUSTE_OBJETIVO_KCAL = {
    recomposicion: -100,
    volumen: 300,
    definicion: -500
  };

  var GRAMOS_PROTEINA_POR_KG = {
    recomposicion: 2.0,
    volumen: 2.0,
    definicion: 2.2
  };

  function calcularEdad(fechaNacimientoISO) {
    var hoy = new Date();
    var nacimiento = new Date(fechaNacimientoISO);
    var edad = hoy.getFullYear() - nacimiento.getFullYear();
    var mes = hoy.getMonth() - nacimiento.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
      edad--;
    }
    return edad;
  }

  function calcularTMB(params) {
    var base = 10 * params.peso_kg + 6.25 * params.altura_cm - 5 * params.edad;
    return params.sexo === "femenino" ? base - 161 : base + 5;
  }

  /* Devuelve { calorias, proteinas_g, carbos_g, grasas_g } según Mifflin-St Jeor + objetivo. */
  function calcularMetasMacros(usuario) {
    var edad = calcularEdad(usuario.fecha_nacimiento);
    var tmb = calcularTMB({
      sexo: usuario.sexo,
      peso_kg: usuario.peso_kg,
      altura_cm: usuario.altura_cm,
      edad: edad
    });
    var factorActividad = FACTOR_ACTIVIDAD[usuario.nivel_actividad] || 1.2;
    var tdee = tmb * factorActividad;
    var ajuste = AJUSTE_OBJETIVO_KCAL[usuario.objetivo] || 0;
    var calorias = Math.round(tdee + ajuste);

    var gPorKg = GRAMOS_PROTEINA_POR_KG[usuario.objetivo] || 2.0;
    var proteinas_g = Math.round(usuario.peso_kg * gPorKg);
    var grasas_g = Math.round((calorias * 0.25) / 9);
    var kcalRestantes = calorias - proteinas_g * 4 - grasas_g * 9;
    var carbos_g = Math.max(0, Math.round(kcalRestantes / 4));

    return {
      calorias: calorias,
      proteinas_g: proteinas_g,
      carbos_g: carbos_g,
      grasas_g: grasas_g
    };
  }

  return {
    calcularEdad: calcularEdad,
    calcularTMB: calcularTMB,
    calcularMetasMacros: calcularMetasMacros
  };
})();
