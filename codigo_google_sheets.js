/**
 * CÓDIGO PARA GOOGLE APPS SCRIPT
 * 
 * INSTRUCCIONES (Toma 2 minutos):
 * 1. Ve a Google Drive (https://drive.google.com) y crea una nueva "Hoja de cálculo de Google" (Google Sheet).
 * 2. Ponle de nombre: "Respuestas Líneas de Investigación - Mecánica".
 * 3. En el menú superior de la hoja, haz clic en: Extensiones > Apps Script.
 * 4. Borra el código que aparezca allí y pega TODO este código.
 * 5. Haz clic en "Guardar" (icono de disquete).
 * 6. Haz clic en el botón azul superior: "Implementar" (Deploy) > "Nueva implementación" (New deployment).
 * 7. En el icono de engranaje (⚙️), selecciona tipo: "Aplicación web" (Web app).
 * 8. Configura:
 *    - Descripción: API Respuestas Líneas
 *    - Ejecutar como: "Yo" (tu cuenta)
 *    - Quién tiene acceso: "Cualquiera" (Anyone) -> ¡IMPORTANTE para que los profes puedan enviar!
 * 9. Haz clic en "Implementar" y autoriza los permisos.
 * 10. Copia la "URL de la aplicación web" (termina en /exec) y pégala en el archivo Formulario_Docente_Mecanica.html
 */

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Si la hoja está vacía, agregar encabezados automáticos
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Fecha / Hora",
        "Docente / Investigador",
        "Subárea",
        "Subárea (Otro)",
        "Línea de Investigación Propuesta",
        "Definición Breve (máx 50 palabras)",
        "N° Palabras",
        "Pertinencia (25%)",
        "Infraestructura (10%)",
        "Talento Humano (10%)",
        "Productividad (20%)",
        "Formación (20%)",
        "Sostenibilidad (15%)",
        "PUNTAJE PONDERADO TOTAL",
        "Nivel de Prioridad",
        "Acción de Consolidación (Fusión sugerida)",
        "Requerimiento Infraestructura 1",
        "Requerimiento Infraestructura 2",
        "Comentarios Adicionales / Argumentación",
        "ID Registro"
      ]);
      // Formato encabezados
      var headerRange = sheet.getRange(1, 1, 1, 20);
      headerRange.setBackground("#1e3a8a");
      headerRange.setFontColor("#ffffff");
      headerRange.setFontWeight("bold");
    }
    
    var data = JSON.parse(e.postData.contents);
    var criterios = data.criterios || {};
    var puntajes = data.puntajesPonderados || {};
    var infra = data.infraestructuraCritica || {};
    
    sheet.appendRow([
      new Date().toLocaleString("es-CO"),
      data.docente || "",
      data.subarea || "",
      data.subareaOtro || "",
      data.nombreLinea || "",
      data.definicion || "",
      data.palabrasDefinicion || 0,
      criterios.pertinencia || 0,
      criterios.infraestructura || 0,
      criterios.talento || 0,
      criterios.productividad || 0,
      criterios.formacion || 0,
      criterios.sostenibilidad || 0,
      puntajes.total || 0,
      data.prioridad || "",
      data.accionConsolidacion || "",
      infra.item1 || "",
      infra.item2 || "",
      data.comentariosAdicionales || "",
      data.id || ("resp-" + Date.now())
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Respuesta guardada con éxito en Google Sheets"
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Endpoint GET para que el Tablero pueda leer todas las respuestas en vivo
function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var rows = sheet.getDataRange().getValues();
    
    if (rows.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Detectar si el esquema tiene 6 criterios (con Talento)
    var headerRow = rows[0] || [];
    var hasTalentoColumn = false;
    for (var h = 0; h < headerRow.length; h++) {
      if (String(headerRow[h]).toLowerCase().indexOf("talento") !== -1) {
        hasTalentoColumn = true;
        break;
      }
    }
    
    var result = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r || r.length < 5) continue;
      
      var isSixCriteria = hasTalentoColumn || r.length >= 20;
      
      if (isSixCriteria) {
        var cPert = Number(r[7]) || 0;
        var cInfra = Number(r[8]) || 0;
        var cTal = Number(r[9]) || 0;
        var cProd = Number(r[10]) || 0;
        var cForm = Number(r[11]) || 0;
        var cSost = Number(r[12]) || 0;
        var totalScore = Number(r[13]) || 0;
        
        result.push({
          id: r[19] || r[18] || ("resp-" + i),
          fecha: r[0],
          docente: r[1],
          subarea: r[2],
          subareaOtro: r[3],
          nombreLinea: r[4],
          definicion: r[5],
          palabrasDefinicion: r[6],
          criterios: {
            pertinencia: cPert,
            infraestructura: cInfra,
            talento: cTal,
            productividad: cProd,
            formacion: cForm,
            sostenibilidad: cSost
          },
          puntajesPonderados: {
            pertinencia: Number((cPert * 0.25).toFixed(2)),
            infraestructura: Number((cInfra * 0.10).toFixed(2)),
            talento: Number((cTal * 0.10).toFixed(2)),
            productividad: Number((cProd * 0.20).toFixed(2)),
            formacion: Number((cForm * 0.20).toFixed(2)),
            sostenibilidad: Number((cSost * 0.15).toFixed(2)),
            total: totalScore
          },
          prioridad: r[14],
          accionConsolidacion: r[15],
          infraestructuraCritica: {
            item1: r[16],
            item2: r[17]
          },
          comentariosAdicionales: r[18] || ""
        });
      } else {
        // Esquema anterior (5 criterios)
        var cPert = Number(r[7]) || 0;
        var cInfraOld = Number(r[8]) || 0;
        var cProd = Number(r[9]) || 0;
        var cForm = Number(r[10]) || 0;
        var cSost = Number(r[11]) || 0;
        var totalScore = Number(r[12]) || 0;
        var hasComentarios = r.length >= 19;
        
        result.push({
          id: hasComentarios ? (r[18] || r[17]) : (r[17] || ("resp-" + i)),
          fecha: r[0],
          docente: r[1],
          subarea: r[2],
          subareaOtro: r[3],
          nombreLinea: r[4],
          definicion: r[5],
          palabrasDefinicion: r[6],
          criterios: {
            pertinencia: cPert,
            infraestructura: cInfraOld,
            talento: cInfraOld, // aproximación razonable si era conjunto
            productividad: cProd,
            formacion: cForm,
            sostenibilidad: cSost
          },
          puntajesPonderados: {
            pertinencia: Number((cPert * 0.25).toFixed(2)),
            infraestructura: Number((cInfraOld * 0.10).toFixed(2)),
            talento: Number((cInfraOld * 0.10).toFixed(2)),
            productividad: Number((cProd * 0.20).toFixed(2)),
            formacion: Number((cForm * 0.20).toFixed(2)),
            sostenibilidad: Number((cSost * 0.15).toFixed(2)),
            total: totalScore
          },
          prioridad: r[13],
          accionConsolidacion: r[14],
          infraestructuraCritica: {
            item1: r[15],
            item2: r[16]
          },
          comentariosAdicionales: hasComentarios ? (r[17] || "") : ""
        });
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
