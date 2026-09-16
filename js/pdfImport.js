/* Extracción de texto de un PDF (pdf.js) y parseo heurístico a días/ejercicios. */
var GYMAPP = window.GYMAPP || (window.GYMAPP = {});

GYMAPP.pdfImport = (function () {
  var WORKER_SRC = "vendor/pdfjs/pdf.worker.min.js";

  var REGEX_DIA = /^(d[ií]a\s*\d+[a-z]?\b.*|rutina\s*[a-z0-9]*\b.*|lunes.*|martes.*|mi[eé]rcoles.*|jueves.*|viernes.*|s[aá]bado.*|domingo.*)$/i;
  var REGEX_EJERCICIO = /^(.+?)[\s:.\-–]*\s(\d+)\s*[x×]\s*(\d+(?:\s*[-–a]\s*\d+)?)/i;

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

  /* Heurística: una línea "DÍA X ..." abre un día nuevo; una línea "Ejercicio NxM" agrega un ejercicio al día actual. */
  function parsearLineas(lineas) {
    var dias = [];
    var diaActual = null;

    lineas.forEach(function (linea) {
      var matchEjercicio = linea.match(REGEX_EJERCICIO);
      var matchDia = !matchEjercicio && linea.match(REGEX_DIA);

      if (matchDia) {
        diaActual = { id: GYMAPP.util.generarId(), nombre: linea.trim(), ejercicios: [] };
        dias.push(diaActual);
        return;
      }

      if (matchEjercicio) {
        if (!diaActual) {
          diaActual = { id: GYMAPP.util.generarId(), nombre: "Día importado 1", ejercicios: [] };
          dias.push(diaActual);
        }
        diaActual.ejercicios.push({
          id: GYMAPP.util.generarId(),
          nombre: matchEjercicio[1].trim().replace(/[-–:]+$/, ""),
          grupo_muscular: "",
          series_objetivo: parseInt(matchEjercicio[2], 10),
          reps_objetivo: matchEjercicio[3].trim()
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
