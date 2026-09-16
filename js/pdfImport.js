/* Extracción de texto de un PDF (pdf.js) y parseo heurístico a días/ejercicios. */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.pdfImport = (function () {
  var WORKER_SRC = "vendor/pdfjs/pdf.worker.min.js";

  var REGEX_DIA = /^(d[ií]a\s*\d+[a-z]?\b.*|rutina\s*[a-z0-9]*\b.*|lunes.*|martes.*|mi[eé]rcoles.*|jueves.*|viernes.*|s[aá]bado.*|domingo.*)$/i;

  /* Formato "Ejercicio 4x10" (rutinas en texto libre). */
  var REGEX_EJERCICIO_NXM = /^(.+?)[\s:.\-–]*\s(\d+)\s*[x×]\s*(\d+(?:\s*[-–a]\s*\d+)?)/i;

  /* Formato tabla "Ord. Ejercicio Series Rep. ..." (apps de gimnasio tipo planilla).
     Cada fila trae series y reps como columnas separadas, no como "NxM". */
  var REGEX_ORD_PREFIJO = /^(?:\d{1,2}|MA|AC|ABD|WU|CD)\s+/i;
  var REGEX_EJERCICIO_TABLA = /^(.+?)\s+(\d{1,2})\s+(\d{1,2}(?:\s*[-\/]\s*\d{1,2})?|al fallo)\b/i;

  /* Nombres de día/grupo muscular habituales en plantillas de rutina (además de "Día N", "Rutina X" y los días de la semana). */
  var PALABRAS_CLAVE_DIA = [
    "EMPUJE", "TRACCION", "PIERNAS", "PIERNA", "TREN SUPERIOR", "TREN INFERIOR",
    "FULL BODY", "PECHO", "ESPALDA", "HOMBRO", "HOMBROS", "BRAZOS",
    "GLUTEO", "GLUTEOS", "CORE", "CARDIO", "PUSH", "PULL", "LEGS", "UPPER", "LOWER"
  ];

  function quitarAcentos(texto) {
    return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function esEncabezadoDia(linea) {
    if (REGEX_DIA.test(linea)) return true;
    var normalizada = quitarAcentos(linea.trim()).toUpperCase();
    return PALABRAS_CLAVE_DIA.some(function (palabra) {
      return normalizada.indexOf(palabra) === 0;
    });
  }

  /* Intenta reconocer una fila de ejercicio con cualquiera de los dos formatos soportados. */
  function extraerEjercicio(linea) {
    var matchNxM = linea.match(REGEX_EJERCICIO_NXM);
    if (matchNxM) {
      return { nombre: matchNxM[1], series: matchNxM[2], reps: matchNxM[3] };
    }

    var sinOrd = linea.replace(REGEX_ORD_PREFIJO, "");
    var matchTabla = sinOrd.match(REGEX_EJERCICIO_TABLA);
    if (matchTabla) {
      return { nombre: matchTabla[1], series: matchTabla[2], reps: matchTabla[3] };
    }

    return null;
  }

  function configurarWorker() {
    if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC;
    }
  }

  /* Devuelve las líneas de texto del PDF, reconstruidas a partir de la posición vertical de cada fragmento. */
  function extraerLineas(file) {
    configurarWorker();
    return file.arrayBuffer().then(function (arrayBuffer) {
      return window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    }).then(function (pdf) {
      var promesasPaginas = [];
      for (var i = 1; i <= pdf.numPages; i++) {
        promesasPaginas.push(extraerLineasDePagina(pdf, i));
      }
      return Promise.all(promesasPaginas).then(function (lineasPorPagina) {
        return lineasPorPagina.reduce(function (acc, lineas) {
          return acc.concat(lineas);
        }, []);
      });
    });
  }

  function extraerLineasDePagina(pdf, numeroPagina) {
    return pdf.getPage(numeroPagina).then(function (page) {
      return page.getTextContent();
    }).then(function (contenido) {
      var lineas = [];
      var lineaActual = "";
      var yAnterior = null;
      contenido.items.forEach(function (item) {
        var y = item.transform[5];
        if (yAnterior !== null && Math.abs(y - yAnterior) > 2) {
          lineas.push(lineaActual.trim());
          lineaActual = "";
        }
        lineaActual += item.str + " ";
        yAnterior = y;
      });
      if (lineaActual.trim()) lineas.push(lineaActual.trim());
      return lineas.filter(function (l) { return l.length > 0; });
    });
  }

  /* Heurística: una línea de encabezado (día/grupo muscular) abre un día nuevo; una fila de ejercicio
     reconocida en cualquiera de los dos formatos agrega un ejercicio al día actual. */
  function parsearLineas(lineas) {
    var dias = [];
    var diaActual = null;

    lineas.forEach(function (linea) {
      var textoLinea = linea.trim();
      if (!textoLinea) return;

      var ejercicio = extraerEjercicio(textoLinea);

      if (!ejercicio && esEncabezadoDia(textoLinea)) {
        diaActual = { id: GYMAPP.util.generarId(), nombre: textoLinea, ejercicios: [] };
        dias.push(diaActual);
        return;
      }

      if (ejercicio) {
        if (!diaActual) {
          diaActual = { id: GYMAPP.util.generarId(), nombre: "Día importado 1", ejercicios: [] };
          dias.push(diaActual);
        }
        diaActual.ejercicios.push({
          id: GYMAPP.util.generarId(),
          nombre: ejercicio.nombre.trim().replace(/\s+/g, " ").replace(/[-–:]+$/, ""),
          grupo_muscular: "",
          series_objetivo: parseInt(ejercicio.series, 10),
          reps_objetivo: ejercicio.reps.trim()
        });
      }
    });

    return dias.filter(function (d) { return d.ejercicios.length > 0; });
  }

  function importarDesdeArchivo(file) {
    return extraerLineas(file).then(parsearLineas);
  }

  return { importarDesdeArchivo: importarDesdeArchivo, parsearLineas: parsearLineas };
})();
