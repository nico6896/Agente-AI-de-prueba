/* Pantalla de onboarding: se muestra solo si no existe `usuario` en el estado. */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.onboarding = (function () {
  /* ONB-01: misma lógica y mismos nombres de campo que antes (ver
     manejarSubmit), solo reagrupados visualmente en 3 secciones dentro de
     una card, con la identidad de marca del resto de la app. */
  function render(root) {
    root.innerHTML =
      '<div class="pantalla pantalla-onboarding">' +
      '<div class="onboarding-header">' +
      '<span class="onboarding-eyebrow">Bienvenido</span>' +
      "<h1>Armemos tu perfil</h1>" +
      '<p class="subtitulo">Con estos datos calculamos tus metas de calorías y macros.</p>' +
      "</div>" +
      '<form id="form-onboarding" novalidate class="onboarding-card">' +
      seccionOnboarding(
        "Datos personales",
        campoTexto("nombre", "Nombre", "text", true) +
          campoSelect("sexo", "Sexo", [
            ["masculino", "Masculino"],
            ["femenino", "Femenino"]
          ]) +
          campoTexto("fecha_nacimiento", "Fecha de nacimiento", "date", true)
      ) +
      seccionOnboarding(
        "Medidas",
        campoTexto("peso_kg", "Peso (kg)", "number", true, { step: "0.1", min: "20", max: "300", inputmode: "decimal" }) +
          campoTexto("altura_cm", "Altura (cm)", "number", true, { step: "1", min: "100", max: "250", inputmode: "numeric" })
      ) +
      seccionOnboarding(
        "Objetivo y actividad",
        campoSelect("objetivo", "Objetivo", [
          ["recomposicion", "Recomposición"],
          ["volumen", "Volumen"],
          ["definicion", "Definición"]
        ]) +
          campoSelect("nivel_actividad", "Nivel de actividad", [
            ["sedentario", "Sedentario"],
            ["moderado", "Moderado"],
            ["activo", "Activo"],
            ["muy_activo", "Muy activo"]
          ])
      ) +
      '<button type="submit" class="btn btn-primario onboarding-btn-principal">Comenzar</button>' +
      "</form>" +
      "</div>";

    document.getElementById("form-onboarding").addEventListener("submit", function (ev) {
      ev.preventDefault();
      manejarSubmit(ev.target);
    });
  }

  function seccionOnboarding(titulo, camposHtml) {
    return (
      '<section class="onboarding-seccion">' +
      '<h2 class="onboarding-seccion-titulo">' + titulo + "</h2>" +
      camposHtml +
      "</section>"
    );
  }

  function campoTexto(id, label, type, requerido, extraAttrs) {
    var attrs = "";
    if (extraAttrs) {
      Object.keys(extraAttrs).forEach(function (k) {
        attrs += " " + k + '="' + extraAttrs[k] + '"';
      });
    }
    return (
      '<div class="campo">' +
      '<label for="' + id + '">' + label + "</label>" +
      '<input id="' + id + '" name="' + id + '" type="' + type + '"' +
      (requerido ? " required" : "") +
      attrs +
      "></div>"
    );
  }

  function campoSelect(id, label, opciones) {
    var optionsHtml = opciones
      .map(function (o) {
        return '<option value="' + o[0] + '">' + o[1] + "</option>";
      })
      .join("");
    return (
      '<div class="campo">' +
      '<label for="' + id + '">' + label + "</label>" +
      '<select id="' + id + '" name="' + id + '" required>' + optionsHtml + "</select></div>"
    );
  }

  function manejarSubmit(form) {
    var fd = new FormData(form);
    var usuario = {
      nombre: (fd.get("nombre") || "").trim(),
      sexo: fd.get("sexo"),
      objetivo: fd.get("objetivo"),
      peso_kg: parseFloat(fd.get("peso_kg")),
      altura_cm: parseFloat(fd.get("altura_cm")),
      fecha_nacimiento: fd.get("fecha_nacimiento"),
      nivel_actividad: fd.get("nivel_actividad")
    };

    if (!usuario.nombre || !usuario.fecha_nacimiento || isNaN(usuario.peso_kg) || isNaN(usuario.altura_cm)) {
      alert("Completá todos los campos antes de continuar.");
      return;
    }

    usuario.metas_macros = GYMAPP.calculos.calcularMetasMacros(usuario);

    var resultado = GYMAPP.storage.updateData(function (data) {
      data.usuario = usuario;
    }, { alertaAutomatica: false });

    if (!resultado.guardado) {
      alert("No se pudo guardar tu perfil. Es posible que no haya espacio disponible en el dispositivo. Volvé a intentarlo.");
      return;
    }

    GYMAPP.app.iniciar();
  }

  return { render: render };
})();
