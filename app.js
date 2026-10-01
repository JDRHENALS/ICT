/**
 * Lógica de la aplicación: Selección y Priorización de Líneas de Investigación
 * Departamento de Ingeniería Mecánica - Universidad de Córdoba
 */

// Estado global de la aplicación
const AppState = {
  activeTab: 'formulario',
  serverAvailable: false,
  responses: [],
  currentRatings: {
    pertinencia: 0,
    infraestructura: 0,
    talento: 0,
    productividad: 0,
    formacion: 0,
    sostenibilidad: 0
  },
  weights: {
    pertinencia: 0.25,
    infraestructura: 0.10,
    talento: 0.10,
    productividad: 0.20,
    formacion: 0.20,
    sostenibilidad: 0.15
  },
  radarChartInstance: null,
  barChartInstance: null
};

// ==========================================
// URL del Webhook de Google Apps Script configurado para el departamento
const GOOGLE_SHEETS_URL = "https://script.google.com/macros/s/AKfycbwKb0LEM8T0sVUY5fCca1uXb2kDgTRaMkA7b_ChK_lKQnXCyALZRMTclYAMmX1IqUrETg/exec";

// ==========================================
// 1. INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  await checkServerAndLoadData();
  updateWordCount();
  updateScoreCalculation();

  if (document.getElementById('cloudSyncUrl')) {
    document.getElementById('cloudSyncUrl').value = GOOGLE_SHEETS_URL;
  }
});

async function checkServerAndLoadData() {
  // 1. Intentar cargar primero los datos en vivo desde Google Sheets
  try {
    const cloudRes = await fetch(GOOGLE_SHEETS_URL);
    if (cloudRes.ok) {
      const cloudData = await cloudRes.json();
      if (Array.isArray(cloudData) && cloudData.length > 0) {
        AppState.responses = cloudData;
        localStorage.setItem('respuestas_lineas_backup', JSON.stringify(cloudData));
        console.log('[*] Conectado en vivo a Google Sheets. Respuestas:', cloudData.length);
        updateUI();
        return;
      }
    }
  } catch (cloudErr) {
    console.warn('[!] No se pudo conectar a Google Sheets de inmediato:', cloudErr);
  }

  // 2. Si no hay datos en Google Sheets aún, intentar servidor local Python si existe
  try {
    const res = await fetch('/api/respuestas', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      AppState.serverAvailable = true;
      AppState.responses = Array.isArray(data) ? data : [];
      localStorage.setItem('respuestas_lineas_backup', JSON.stringify(AppState.responses));
      console.log('[*] Conectado al servidor local. Respuestas cargadas:', AppState.responses.length);
      updateUI();
      return;
    }
  } catch (err) {
    AppState.serverAvailable = false;
  }

  // 3. Respaldo local o ejemplos iniciales
  const local = localStorage.getItem('respuestas_lineas_backup');
  if (local) {
    try {
      AppState.responses = JSON.parse(local);
    } catch (e) {
      AppState.responses = [];
    }
  } else {
    try {
      const sampleRes = await fetch('ejemplo_respuestas.json');
      if (sampleRes.ok) {
        AppState.responses = await sampleRes.json();
        localStorage.setItem('respuestas_lineas_backup', JSON.stringify(AppState.responses));
      }
    } catch (e) {
      AppState.responses = [];
    }
  }
  updateUI();
}

// ==========================================
// 2. GESTIÓN DE PESTAÑAS (TABS)
// ==========================================
function switchTab(tabId) {
  AppState.activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

  const btnIndex = tabId === 'formulario' ? 0 : tabId === 'dashboard' ? 1 : 2;
  const buttons = document.querySelectorAll('.tab-btn');
  if (buttons[btnIndex]) buttons[btnIndex].classList.add('active');

  const panel = document.getElementById(`tab-${tabId}`);
  if (panel) panel.classList.add('active');

  if (tabId === 'dashboard') {
    // Consultar datos actualizados de Google Sheets de fondo
    syncWithGoogleSheets(true);
    renderTableAndCharts();
  }
}

// ==========================================
// 3. FORMULARIO Y CALIFICACIÓN DE CRITERIOS
// ==========================================
function toggleSubareaOtro() {
  const select = document.getElementById('subareaSelect');
  const group = document.getElementById('subareaOtroGroup');
  const input = document.getElementById('subareaOtro');
  if (select.value === 'Otra') {
    group.style.display = 'flex';
    input.required = true;
  } else {
    group.style.display = 'none';
    input.required = false;
    input.value = '';
  }
}

function updateWordCount() {
  const textarea = document.getElementById('definicionLinea');
  const badge = document.getElementById('wordCounter');
  const alert = document.getElementById('wordCountAlert');
  const text = textarea ? textarea.value.trim() : '';

  const wordCount = text.length === 0 ? 0 : text.split(/\s+/).filter(w => w.length > 0).length;
  badge.textContent = `${wordCount} / 50 palabras`;

  if (wordCount > 50) {
    badge.className = 'word-count-badge word-count-limit';
    alert.style.display = 'block';
  } else {
    badge.className = 'word-count-badge word-count-ok';
    alert.style.display = 'none';
  }
  return wordCount;
}

function setRating(criterion, value) {
  AppState.currentRatings[criterion] = value;

  // Actualizar botones visualmente
  const group = document.querySelector(`.rating-scale-group[data-criterion="${criterion}"]`);
  if (group) {
    group.querySelectorAll('.rating-btn').forEach((btn, idx) => {
      if (idx + 1 === value) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // Quitar borde de advertencia si existía
  const card = document.getElementById(`card-criterio-${getCriterionIndex(criterion)}`);
  if (card) {
    card.style.borderColor = 'var(--border)';
  }

  updateScoreCalculation();
}

function getCriterionIndex(criterion) {
  const map = { pertinencia: 1, infraestructura: 2, talento: 3, productividad: 4, formacion: 5, sostenibilidad: 6 };
  return map[criterion] || 1;
}

function updateScoreCalculation() {
  const r = AppState.currentRatings;
  const w = AppState.weights;

  // Cálculo ponderado
  const total = (r.pertinencia * w.pertinencia) +
                (r.infraestructura * w.infraestructura) +
                (r.talento * w.talento) +
                (r.productividad * w.productividad) +
                (r.formacion * w.formacion) +
                (r.sostenibilidad * w.sostenibilidad);

  const totalScoreElem = document.getElementById('calculatedTotalScore');
  const priorityBadge = document.getElementById('calculatedPriorityBadge');
  const summaryBox = document.getElementById('scoreSummaryBox');

  const rounded = total.toFixed(2);
  totalScoreElem.textContent = rounded;

  const allRated = Object.values(r).every(v => v > 0);

  if (!allRated && total === 0) {
    priorityBadge.textContent = 'Sin calificar';
    priorityBadge.className = 'priority-badge-big priority-media';
    summaryBox.className = 'score-summary-box';
    return;
  }

  if (total >= 4.0) {
    priorityBadge.textContent = 'Prioridad Alta';
    priorityBadge.className = 'priority-badge-big priority-alta';
    summaryBox.className = 'score-summary-box';
  } else if (total >= 3.0) {
    priorityBadge.textContent = 'Prioridad Media';
    priorityBadge.className = 'priority-badge-big priority-media';
    summaryBox.className = 'score-summary-box score-warning';
  } else {
    priorityBadge.textContent = 'Prioridad Baja';
    priorityBadge.className = 'priority-badge-big priority-baja';
    summaryBox.className = 'score-summary-box score-danger';
  }
}

// Envío del formulario
async function handleFormSubmit(e) {
  e.preventDefault();

  // Validar que todos los 6 criterios hayan sido calificados
  const missing = [];
  for (const [key, val] of Object.entries(AppState.currentRatings)) {
    if (val === 0) missing.push(key);
  }

  if (missing.length > 0) {
    missing.forEach(key => {
      const idx = getCriterionIndex(key);
      const card = document.getElementById(`card-criterio-${idx}`);
      if (card) {
        card.style.borderColor = 'var(--danger)';
      }
    });
    showToast('⚠️ Por favor califique todos los 6 criterios (1 a 5).', 'warning');
    const firstMissing = document.getElementById(`card-criterio-${getCriterionIndex(missing[0])}`);
    if (firstMissing) firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const r = AppState.currentRatings;
  const w = AppState.weights;
  const totalScore = Number(((r.pertinencia * w.pertinencia) +
                             (r.infraestructura * w.infraestructura) +
                             (r.talento * w.talento) +
                             (r.productividad * w.productividad) +
                             (r.formacion * w.formacion) +
                             (r.sostenibilidad * w.sostenibilidad)).toFixed(2));

  let prioridad = 'Media';
  if (totalScore >= 4.0) prioridad = 'Alta';
  else if (totalScore < 3.0) prioridad = 'Baja';

  const subarea = document.getElementById('subareaSelect').value;
  const subareaOtro = document.getElementById('subareaOtro').value.trim();

  const newResponse = {
    id: 'resp-' + Date.now(),
    fecha: new Date().toISOString(),
    docente: document.getElementById('docenteNombre').value.trim(),
    subarea: subarea,
    subareaOtro: subareaOtro,
    nombreLinea: document.getElementById('nombreLinea').value.trim(),
    definicion: document.getElementById('definicionLinea').value.trim(),
    palabrasDefinicion: updateWordCount(),
    criterios: { ...r },
    puntajesPonderados: {
      pertinencia: Number((r.pertinencia * w.pertinencia).toFixed(2)),
      infraestructura: Number((r.infraestructura * w.infraestructura).toFixed(2)),
      talento: Number((r.talento * w.talento).toFixed(2)),
      productividad: Number((r.productividad * w.productividad).toFixed(2)),
      formacion: Number((r.formacion * w.formacion).toFixed(2)),
      sostenibilidad: Number((r.sostenibilidad * w.sostenibilidad).toFixed(2)),
      total: totalScore
    },
    prioridad: prioridad,
    accionConsolidacion: document.getElementById('accionConsolidacion').value.trim(),
    infraestructuraCritica: {
      item1: document.getElementById('infraItem1').value.trim(),
      item2: document.getElementById('infraItem2').value.trim()
    },
    comentariosAdicionales: document.getElementById('comentariosAdicionales') ? document.getElementById('comentariosAdicionales').value.trim() : ''
  };

  // Guardar en estado local
  AppState.responses.push(newResponse);
  localStorage.setItem('respuestas_lineas_backup', JSON.stringify(AppState.responses));

  // Enviar a Google Sheets en la nube
  if (GOOGLE_SHEETS_URL) {
    try {
      await fetch(GOOGLE_SHEETS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newResponse)
      });
    } catch (gErr) {
      console.warn('Error enviando a Google Sheets:', gErr);
    }
  }

  // Si hay servidor local Python, guardar en backend
  if (AppState.serverAvailable) {
    try {
      await fetch('/api/guardar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newResponse)
      });
    } catch (err) {
      console.warn('No se pudo guardar en backend local:', err);
    }
  }

  showToast('✅ ¡Propuesta registrada con éxito!', 'success');
  updateUI();

  // Preguntar o dar opción de limpiar para registrar otra línea
  const keepTeacher = confirm('¿Desea registrar otra propuesta de línea para el mismo docente?');
  if (keepTeacher) {
    resetLineOnly();
  } else {
    resetEvaluationForm();
    switchTab('dashboard');
  }
}

function resetLineOnly() {
  document.getElementById('nombreLinea').value = '';
  document.getElementById('definicionLinea').value = '';
  document.getElementById('accionConsolidacion').value = '';
  document.getElementById('infraItem1').value = '';
  document.getElementById('infraItem2').value = '';
  if (document.getElementById('comentariosAdicionales')) document.getElementById('comentariosAdicionales').value = '';
  AppState.currentRatings = { pertinencia: 0, infraestructura: 0, talento: 0, productividad: 0, formacion: 0, sostenibilidad: 0 };
  document.querySelectorAll('.rating-btn').forEach(btn => btn.classList.remove('active'));
  updateWordCount();
  updateScoreCalculation();
  window.scrollTo({ top: 300, behavior: 'smooth' });
}

function resetEvaluationForm() {
  document.getElementById('evaluationForm').reset();
  toggleSubareaOtro();
  if (document.getElementById('comentariosAdicionales')) document.getElementById('comentariosAdicionales').value = '';
  AppState.currentRatings = { pertinencia: 0, infraestructura: 0, talento: 0, productividad: 0, formacion: 0, sostenibilidad: 0 };
  document.querySelectorAll('.rating-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.criterion-card').forEach(card => card.style.borderColor = 'var(--border)');
  updateWordCount();
  updateScoreCalculation();
}

function downloadSingleResponseJson() {
  const docente = document.getElementById('docenteNombre').value.trim();
  const nombreLinea = document.getElementById('nombreLinea').value.trim();
  if (!nombreLinea) {
    showToast('⚠️ Escriba al menos el nombre de la propuesta para descargarla.', 'warning');
    return;
  }

  const r = AppState.currentRatings;
  const w = AppState.weights;
  const total = Number(((r.pertinencia * w.pertinencia) +
                        (r.infraestructura * w.infraestructura) +
                        (r.talento * w.talento) +
                        (r.productividad * w.productividad) +
                        (r.formacion * w.formacion) +
                        (r.sostenibilidad * w.sostenibilidad)).toFixed(2));

  let prioridad = 'Media';
  if (total >= 4.0) prioridad = 'Alta';
  else if (total < 3.0) prioridad = 'Baja';

  const singleObj = {
    id: 'resp-' + Date.now(),
    fecha: new Date().toISOString(),
    docente: docente || 'Docente No Especificado',
    subarea: document.getElementById('subareaSelect').value,
    subareaOtro: document.getElementById('subareaOtro').value.trim(),
    nombreLinea: nombreLinea,
    definicion: document.getElementById('definicionLinea').value.trim(),
    palabrasDefinicion: updateWordCount(),
    criterios: { ...r },
    puntajesPonderados: {
      pertinencia: Number((r.pertinencia * w.pertinencia).toFixed(2)),
      infraestructura: Number((r.infraestructura * w.infraestructura).toFixed(2)),
      talento: Number((r.talento * w.talento).toFixed(2)),
      productividad: Number((r.productividad * w.productividad).toFixed(2)),
      formacion: Number((r.formacion * w.formacion).toFixed(2)),
      sostenibilidad: Number((r.sostenibilidad * w.sostenibilidad).toFixed(2)),
      total: total
    },
    prioridad: prioridad,
    accionConsolidacion: document.getElementById('accionConsolidacion').value.trim(),
    infraestructuraCritica: {
      item1: document.getElementById('infraItem1').value.trim(),
      item2: document.getElementById('infraItem2').value.trim()
    }
  };

  const safeName = (docente ? docente : 'Propuesta').replace(/[^a-zA-Z0-9_-]/g, '_');
  downloadBlob(JSON.stringify(singleObj, null, 2), `Propuesta_${safeName}.json`, 'application/json');
  showToast('📥 Descarga completada.', 'success');
}

// ==========================================
// 4. TABLERO DE ANÁLISIS, FILTROS Y GRÁFICOS
// ==========================================
function updateUI() {
  const badge = document.getElementById('badge-total-respuestas');
  if (badge) badge.textContent = AppState.responses.length;

  if (AppState.activeTab === 'dashboard') {
    renderTableAndCharts();
  }
}

function clearFilters() {
  document.getElementById('filterSearch').value = '';
  document.getElementById('filterSubarea').value = 'ALL';
  document.getElementById('filterPrioridad').value = 'ALL';
  renderTableAndCharts();
}

function getFilteredResponses() {
  const search = document.getElementById('filterSearch') ? document.getElementById('filterSearch').value.toLowerCase().trim() : '';
  const subarea = document.getElementById('filterSubarea') ? document.getElementById('filterSubarea').value : 'ALL';
  const prioridad = document.getElementById('filterPrioridad') ? document.getElementById('filterPrioridad').value : 'ALL';

  return AppState.responses.filter(item => {
    // Filtro por subárea
    if (subarea !== 'ALL') {
      if (subarea === 'Otra') {
        if (item.subarea !== 'Otra') return false;
      } else if (item.subarea !== subarea) {
        return false;
      }
    }

    // Filtro por prioridad
    if (prioridad !== 'ALL' && item.prioridad !== prioridad) {
      return false;
    }

    // Filtro por búsqueda
    if (search) {
      const matchDocente = item.docente && item.docente.toLowerCase().includes(search);
      const matchLinea = item.nombreLinea && item.nombreLinea.toLowerCase().includes(search);
      const matchDef = item.definicion && item.definicion.toLowerCase().includes(search);
      const matchConsol = item.accionConsolidacion && item.accionConsolidacion.toLowerCase().includes(search);
      const matchInfra1 = item.infraestructuraCritica?.item1 && item.infraestructuraCritica.item1.toLowerCase().includes(search);
      const matchInfra2 = item.infraestructuraCritica?.item2 && item.infraestructuraCritica.item2.toLowerCase().includes(search);
      if (!matchDocente && !matchLinea && !matchDef && !matchConsol && !matchInfra1 && !matchInfra2) {
        return false;
      }
    }

    return true;
  });
}

function renderTableAndCharts() {
  const filtered = getFilteredResponses();

  // Ordenar siempre de mayor a menor puntaje
  filtered.sort((a, b) => (b.puntajesPonderados?.total || 0) - (a.puntajesPonderados?.total || 0));

  renderKPIs(filtered);
  renderTable(filtered);
  renderRadarChart(filtered);
  renderBarChart(filtered);
  renderQualitative(filtered);
}

function renderKPIs(list) {
  const totalLineas = list.length;
  const docentesSet = new Set(list.map(i => i.docente?.trim().toLowerCase()).filter(Boolean));
  const totalDocentes = docentesSet.size;

  let sum = 0;
  let topItem = null;
  list.forEach(i => {
    const s = i.puntajesPonderados?.total || 0;
    sum += s;
    if (!topItem || s > (topItem.puntajesPonderados?.total || 0)) {
      topItem = i;
    }
  });

  const avg = totalLineas > 0 ? (sum / totalLineas).toFixed(2) : '0.00';

  document.getElementById('kpiTotalLineas').textContent = totalLineas;
  document.getElementById('kpiTotalDocentes').textContent = totalDocentes;
  document.getElementById('kpiPromedioPuntaje').textContent = avg;
  document.getElementById('kpiMejorPuntaje').textContent = topItem ? topItem.nombreLinea : '-';
  if (topItem) {
    document.getElementById('kpiMejorPuntaje').title = `${topItem.nombreLinea} (${topItem.puntajesPonderados?.total}/5.0)`;
  }
}

function renderTable(list) {
  const tbody = document.getElementById('tbodyPriorizacion');
  const countBadge = document.getElementById('tableCountBadge');
  countBadge.textContent = `Mostrando ${list.length} de ${AppState.responses.length} propuestas`;

  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="13" style="text-align: center; padding: 2rem; color: #94a3b8;">
          No se encontraron propuestas con los criterios seleccionados.
        </td>
      </tr>
    `;
    return;
  }

  list.forEach((item, idx) => {
    const tr = document.createElement('tr');

    const rankClass = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : '';
    const rankIcon = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`;

    const prioClass = item.prioridad === 'Alta' ? 'priority-alta' : item.prioridad === 'Media' ? 'priority-media' : 'priority-baja';
    const subareaDisplay = item.subarea === 'Otra' && item.subareaOtro ? `Otra: ${item.subareaOtro}` : item.subarea;

    tr.innerHTML = `
      <td style="text-align: center;">
        <span class="rank-badge ${rankClass}">${rankIcon}</span>
      </td>
      <td>
        <strong style="color: var(--text-main);">${escapeHtml(item.nombreLinea)}</strong>
        <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.2rem; max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${escapeHtml(item.definicion || '')}
        </div>
      </td>
      <td style="font-size: 0.85rem; color: #334155;">${escapeHtml(item.docente || '')}</td>
      <td><span style="font-size: 0.8rem; background: #f1f5f9; padding: 0.2rem 0.5rem; border-radius: 4px;">${escapeHtml(subareaDisplay)}</span></td>
      <td style="text-align: center; font-weight: 600;">${item.criterios?.pertinencia || '-'}</td>
      <td style="text-align: center; font-weight: 600;">${item.criterios?.infraestructura || '-'}</td>
      <td style="text-align: center; font-weight: 600;">${item.criterios?.talento || '-'}</td>
      <td style="text-align: center; font-weight: 600;">${item.criterios?.productividad || '-'}</td>
      <td style="text-align: center; font-weight: 600;">${item.criterios?.formacion || '-'}</td>
      <td style="text-align: center; font-weight: 600;">${item.criterios?.sostenibilidad || '-'}</td>
      <td style="text-align: center; font-weight: 800; font-size: 1.05rem; background: #f8fafc; color: var(--primary);">
        ${(item.puntajesPonderados?.total || 0).toFixed(2)}
      </td>
      <td style="text-align: center;">
        <span class="priority-badge-big ${prioClass}" style="font-size: 0.72rem; padding: 0.2rem 0.55rem;">
          ${item.prioridad}
        </span>
      </td>
      <td style="text-align: center;" class="no-print">
        <div style="display: flex; gap: 0.3rem; justify-content: center;">
          <button class="btn btn-outline btn-sm" onclick="showItemDetail('${item.id}')" title="Ver detalle completo">
            👁️
          </button>
          <button class="btn btn-outline btn-sm" style="color: var(--danger);" onclick="deleteItem('${item.id}')" title="Eliminar registro">
            🗑️
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Gráficos con Chart.js
function renderRadarChart(list) {
  const canvas = document.getElementById('radarChart');
  if (!canvas || !window.Chart) return;

  if (AppState.radarChartInstance) {
    AppState.radarChartInstance.destroy();
  }

  if (list.length === 0) return;

  // Comparar las mejores 3 líneas
  const topLines = list.slice(0, 3);
  const colors = [
    { bg: 'rgba(30, 58, 138, 0.2)', border: '#1e3a8a' },
    { bg: 'rgba(13, 148, 136, 0.2)', border: '#0d9488' },
    { bg: 'rgba(217, 119, 6, 0.2)', border: '#d97706' }
  ];

  const datasets = topLines.map((item, idx) => ({
    label: item.nombreLinea.length > 25 ? item.nombreLinea.slice(0, 25) + '...' : item.nombreLinea,
    data: [
      item.criterios?.pertinencia || 0,
      item.criterios?.infraestructura || 0,
      item.criterios?.talento || 0,
      item.criterios?.productividad || 0,
      item.criterios?.formacion || 0,
      item.criterios?.sostenibilidad || 0
    ],
    backgroundColor: colors[idx % colors.length].bg,
    borderColor: colors[idx % colors.length].border,
    pointBackgroundColor: colors[idx % colors.length].border,
    pointBorderColor: '#fff',
    pointHoverBackgroundColor: '#fff',
    pointHoverBorderColor: colors[idx % colors.length].border
  }));

  AppState.radarChartInstance = new Chart(canvas, {
    type: 'radar',
    data: {
      labels: [
        '1. Pertinencia (25%)',
        '2. Infraestructura (10%)',
        '3. Talento (10%)',
        '4. Productividad (20%)',
        '5. Formación (20%)',
        '6. Sostenibilidad (15%)'
      ],
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 5,
          ticks: { stepSize: 1 }
        }
      },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } }
      }
    }
  });
}

function renderBarChart(list) {
  const canvas = document.getElementById('barSubareaChart');
  if (!canvas || !window.Chart) return;

  if (AppState.barChartInstance) {
    AppState.barChartInstance.destroy();
  }

  // Agrupar por subárea
  const subareaStats = {};
  list.forEach(item => {
    const key = item.subarea || 'Sin clasificar';
    if (!subareaStats[key]) {
      subareaStats[key] = { count: 0, sum: 0 };
    }
    subareaStats[key].count += 1;
    subareaStats[key].sum += item.puntajesPonderados?.total || 0;
  });

  const labels = Object.keys(subareaStats);
  const dataAvg = labels.map(k => Number((subareaStats[k].sum / subareaStats[k].count).toFixed(2)));
  const dataCount = labels.map(k => subareaStats[k].count);

  AppState.barChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Puntaje Ponderado Promedio',
        data: dataAvg,
        backgroundColor: '#3b82f6',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0,
          max: 5,
          ticks: { stepSize: 1 }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: function(context) {
              const count = dataCount[context.dataIndex];
              return `Propuestas evaluadas: ${count}`;
            }
          }
        }
      }
    }
  });
}

function renderQualitative(list) {
  const consolidacionesContainer = document.getElementById('listConsolidaciones');
  const infraContainer = document.getElementById('listInfraestructura');

  consolidacionesContainer.innerHTML = '';
  infraContainer.innerHTML = '';

  let hasConsolidaciones = false;
  let hasInfra = false;

  list.forEach(item => {
    // Sinergias
    if (item.accionConsolidacion && item.accionConsolidacion.trim()) {
      hasConsolidaciones = true;
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="item-card-header">
          <span>${escapeHtml(item.nombreLinea)}</span>
          <span style="font-weight: normal; color: #64748b;">${escapeHtml(item.docente)}</span>
        </div>
        <div class="item-card-body">
          💡 ${escapeHtml(item.accionConsolidacion)}
        </div>
      `;
      consolidacionesContainer.appendChild(card);
    }

    // Infraestructura
    const it1 = item.infraestructuraCritica?.item1?.trim();
    const it2 = item.infraestructuraCritica?.item2?.trim();
    if (it1 || it2) {
      hasInfra = true;
      const card = document.createElement('div');
      card.className = 'item-card';
      let itemsHtml = '';
      if (it1) itemsHtml += `<div>🔹 <strong>1:</strong> ${escapeHtml(it1)}</div>`;
      if (it2) itemsHtml += `<div>🔹 <strong>2:</strong> ${escapeHtml(it2)}</div>`;

      card.innerHTML = `
        <div class="item-card-header">
          <span>${escapeHtml(item.nombreLinea)}</span>
          <span style="font-size: 0.75rem; background: #e0f2fe; color: #0369a1; padding: 0.15rem 0.4rem; border-radius: 4px;">
            ${escapeHtml(item.subarea)}
          </span>
        </div>
        <div class="item-card-body">
          ${itemsHtml}
        </div>
      `;
      infraContainer.appendChild(card);
    }
  });

  if (!hasConsolidaciones) {
    consolidacionesContainer.innerHTML = '<p style="color: #94a3b8; font-size: 0.85rem; padding: 1rem;">No hay sugerencias de consolidación en este filtro.</p>';
  }
  if (!hasInfra) {
    infraContainer.innerHTML = '<p style="color: #94a3b8; font-size: 0.85rem; padding: 1rem;">No hay necesidades de infraestructura en este filtro.</p>';
  }
}

// ==========================================
// 5. MODAL DE DETALLE Y ELIMINACIÓN
// ==========================================
function showItemDetail(id) {
  const item = AppState.responses.find(i => i.id === id);
  if (!item) return;

  const modal = document.getElementById('detailModal');
  document.getElementById('modalTituloLinea').textContent = item.nombreLinea;
  document.getElementById('modalDocenteSubarea').textContent = `${item.docente} • Subárea: ${item.subarea}${item.subareaOtro ? ' (' + item.subareaOtro + ')' : ''}`;

  const c = item.criterios || {};
  const p = item.puntajesPonderados || {};

  document.getElementById('modalBody').innerHTML = `
    <div style="background: #f8fafc; padding: 1rem; border-radius: 8px; border: 1px solid var(--border);">
      <h4 style="font-size: 0.9rem; color: #334155; margin-bottom: 0.3rem;">Definición Breve:</h4>
      <p style="color: #0f172a; line-height: 1.4;">${escapeHtml(item.definicion || 'Sin definición')}</p>
      <span style="font-size: 0.75rem; color: #64748b;">(${item.palabrasDefinicion || 0} palabras)</span>
    </div>

    <div>
      <h4 style="font-size: 0.9rem; color: #334155; margin-bottom: 0.5rem;">Desglose de Calificaciones:</h4>
      <table class="data-table" style="font-size: 0.82rem;">
        <thead>
          <tr>
            <th>Criterio</th>
            <th>Ponderación</th>
            <th style="text-align: center;">Calificación (1-5)</th>
            <th style="text-align: center;">Puntaje Ponderado</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1. Pertinencia Territorial e Industrial</td>
            <td>25%</td>
            <td style="text-align: center;">${c.pertinencia}</td>
            <td style="text-align: center;">${p.pertinencia}</td>
          </tr>
          <tr>
            <td>2. Capacidad Instalada e Infraestructura</td>
            <td>10%</td>
            <td style="text-align: center;">${c.infraestructura}</td>
            <td style="text-align: center;">${p.infraestructura}</td>
          </tr>
          <tr>
            <td>3. Talento Humano</td>
            <td>10%</td>
            <td style="text-align: center;">${c.talento || 0}</td>
            <td style="text-align: center;">${p.talento || 0}</td>
          </tr>
          <tr>
            <td>4. Productividad Académica y Transferencia</td>
            <td>20%</td>
            <td style="text-align: center;">${c.productividad}</td>
            <td style="text-align: center;">${p.productividad}</td>
          </tr>
          <tr>
            <td>5. Capacidad de Formación</td>
            <td>20%</td>
            <td style="text-align: center;">${c.formacion}</td>
            <td style="text-align: center;">${p.formacion}</td>
          </tr>
          <tr>
            <td>6. Sostenibilidad Financiera</td>
            <td>15%</td>
            <td style="text-align: center;">${c.sostenibilidad}</td>
            <td style="text-align: center;">${p.sostenibilidad}</td>
          </tr>
          <tr style="background: #eff6ff; font-weight: bold;">
            <td colspan="3">PUNTAJE PONDERADO TOTAL</td>
            <td style="text-align: center; color: var(--primary); font-size: 1rem;">${p.total} / 5.0</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
      <div style="background: #f8fafc; padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border);">
        <strong style="color: #1e3a8a; font-size: 0.85rem;">Acción de Consolidación:</strong>
        <p style="font-size: 0.82rem; margin-top: 0.3rem;">${escapeHtml(item.accionConsolidacion || 'Ninguna especificada')}</p>
      </div>
      <div style="background: #f8fafc; padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border);">
        <strong style="color: #0d9488; font-size: 0.85rem;">Infraestructura Clave (3 Años):</strong>
        <p style="font-size: 0.82rem; margin-top: 0.3rem;">1. ${escapeHtml(item.infraestructuraCritica?.item1 || '-')}</p>
        <p style="font-size: 0.82rem;">2. ${escapeHtml(item.infraestructuraCritica?.item2 || '-')}</p>
      </div>
    </div>

    <div style="background: #f8fafc; padding: 0.85rem; border-radius: 6px; border: 1px solid var(--border); margin-top: 0.5rem;">
      <strong style="color: #4338ca; font-size: 0.85rem;">Comentarios Adicionales y Argumentación de la Evaluación:</strong>
      <p style="font-size: 0.82rem; margin-top: 0.3rem; line-height: 1.4; color: #1e293b;">${escapeHtml(item.comentariosAdicionales || 'Sin comentarios adicionales registrados.')}</p>
    </div>
  `;

  modal.style.display = 'flex';
}

function closeModal() {
  document.getElementById('detailModal').style.display = 'none';
}

async function deleteItem(id) {
  if (!confirm('¿Está seguro de eliminar esta propuesta de la evaluación?')) return;

  AppState.responses = AppState.responses.filter(i => i.id !== id);
  localStorage.setItem('respuestas_lineas_backup', JSON.stringify(AppState.responses));

  if (AppState.serverAvailable) {
    try {
      await fetch('/api/eliminar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
      });
    } catch (e) {
      console.warn(e);
    }
  }

  showToast('🗑️ Registro eliminado.', 'info');
  updateUI();
}

// ==========================================
// 6. EXPORTACIONES E IMPORTACIÓN
// ==========================================
async function exportExcelFull() {
  if (AppState.responses.length === 0) {
    showToast('⚠️ No hay propuestas para exportar.', 'warning');
    return;
  }

  // Si hay servidor backend, pedir la exportación generada por pandas/openpyxl
  if (AppState.serverAvailable) {
    window.location.href = '/api/exportar-excel';
    showToast('📥 Descargando archivo Excel...', 'success');
    return;
  }

  // Si está en modo offline/archivo directo, usar SheetJS en cliente
  if (window.XLSX) {
    try {
      const wb = XLSX.utils.book_new();

      // Hoja 1: Priorización
      const rowsRanking = AppState.responses.map(item => ({
        'Docente / Evaluador': item.docente,
        'Subárea': item.subarea === 'Otra' && item.subareaOtro ? `Otra: ${item.subareaOtro}` : item.subarea,
        'Línea de Investigación': item.nombreLinea,
        'Pertinencia Territorial (25%)': item.criterios?.pertinencia || 0,
        'Capacidad Instalada (10%)': item.criterios?.infraestructura || 0,
        'Talento Humano (10%)': item.criterios?.talento || 0,
        'Productividad Académica (20%)': item.criterios?.productividad || 0,
        'Capacidad de Formación (20%)': item.criterios?.formacion || 0,
        'Sostenibilidad Financiera (15%)': item.criterios?.sostenibilidad || 0,
        'PUNTAJE PONDERADO TOTAL': item.puntajesPonderados?.total || 0,
        'Nivel de Prioridad': item.prioridad
      }));
      rowsRanking.sort((a, b) => b['PUNTAJE PONDERADO TOTAL'] - a['PUNTAJE PONDERADO TOTAL']);
      const wsRanking = XLSX.utils.json_to_sheet(rowsRanking);
      XLSX.utils.book_append_sheet(wb, wsRanking, '1. Priorización de Líneas');

      // Hoja 2: Cualitativo
      const rowsCualitativo = AppState.responses.map(item => ({
        'Línea Propuesta': item.nombreLinea,
        'Docente': item.docente,
        'Subárea': item.subarea,
        'Definición Breve (máx 50 palabras)': item.definicion,
        'Acción de Consolidación (Fusión)': item.accionConsolidacion,
        'Equipamiento / Software Clave 1': item.infraestructuraCritica?.item1 || '',
        'Equipamiento / Software Clave 2': item.infraestructuraCritica?.item2 || '',
        'Comentarios Adicionales / Argumentación': item.comentariosAdicionales || ''
      }));
      const wsCualitativo = XLSX.utils.json_to_sheet(rowsCualitativo);
      XLSX.utils.book_append_sheet(wb, wsCualitativo, '2. Análisis Cualitativo');

      // Descargar
      XLSX.writeFile(wb, 'Priorizacion_Lineas_Investigacion_Mecanica.xlsx');
      showToast('📥 Archivo Excel descargado exitosamente.', 'success');
    } catch (e) {
      showToast('Error exportando Excel: ' + e.message, 'warning');
    }
  } else {
    showToast('La librería de exportación a Excel no está disponible.', 'warning');
  }
}

function exportAllJsonBackup() {
  if (AppState.responses.length === 0) {
    showToast('⚠️ No hay datos para respaldar.', 'warning');
    return;
  }
  downloadBlob(JSON.stringify(AppState.responses, null, 2), 'respuestas_lineas_backup.json', 'application/json');
  showToast('📥 Respaldo JSON descargado.', 'success');
}

function handleImportJsonFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      const incoming = Array.isArray(parsed) ? parsed : [parsed];

      // Filtrar y anexar evitando duplicados por ID
      let addedCount = 0;
      incoming.forEach(newItem => {
        if (!newItem.id) newItem.id = 'resp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        const existingIdx = AppState.responses.findIndex(x => x.id === newItem.id);
        if (existingIdx >= 0) {
          AppState.responses[existingIdx] = newItem;
        } else {
          AppState.responses.push(newItem);
          addedCount++;
        }
      });

      localStorage.setItem('respuestas_lineas_backup', JSON.stringify(AppState.responses));

      if (AppState.serverAvailable) {
        await fetch('/api/guardar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(AppState.responses)
        });
      }

      showToast(`✅ Se importaron/actualizaron ${incoming.length} registros.`, 'success');
      updateUI();
      switchTab('dashboard');
    } catch (err) {
      showToast('⚠️ Error al leer archivo JSON: formato inválido.', 'warning');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

async function restoreSampleData() {
  if (!confirm('¿Desea restaurar los 5 ejemplos de líneas de Ingeniería Mecánica?')) return;

  try {
    const res = await fetch('ejemplo_respuestas.json');
    if (res.ok) {
      const data = await res.json();
      AppState.responses = data;
      localStorage.setItem('respuestas_lineas_backup', JSON.stringify(AppState.responses));

      if (AppState.serverAvailable) {
        await fetch('/api/restaurar-ejemplos', { method: 'POST' });
      }

      showToast('🔄 Ejemplos de Ingeniería Mecánica restaurados.', 'success');
      updateUI();
      switchTab('dashboard');
    }
  } catch (err) {
    showToast('No se pudieron restaurar los datos de ejemplo.', 'warning');
  }
}

async function clearAllData() {
  if (!confirm('⚠️ ¿ATENCIÓN: Está seguro de vaciar TODAS las respuestas registradas?')) return;

  AppState.responses = [];
  localStorage.setItem('respuestas_lineas_backup', JSON.stringify([]));

  if (AppState.serverAvailable) {
    try {
      await fetch('/api/eliminar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limpiar_todo: true })
      });
    } catch (e) {
      console.warn(e);
    }
  }

  showToast('🗑️ Base de datos vaciada.', 'info');
  updateUI();
}

function loadResponsesFromStorage() {
  syncWithGoogleSheets(false);
}

async function syncWithGoogleSheets(silent = false) {
  const url = GOOGLE_SHEETS_URL;
  if (!url || url.length < 10) return;

  if (!silent) {
    showToast('⏳ Conectando con Google Sheets...', 'info');
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Error al conectar con Google Sheets');
    const cloudData = await res.json();

    if (Array.isArray(cloudData)) {
      if (cloudData.length === 0) {
        if (!silent) showToast('ℹ️ La hoja de cálculo en Google Sheets aún no contiene respuestas.', 'info');
        return;
      }

      AppState.responses = cloudData;
      localStorage.setItem('respuestas_lineas_backup', JSON.stringify(AppState.responses));

      if (AppState.serverAvailable) {
        await fetch('/api/guardar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(AppState.responses)
        });
      }

      if (!silent) {
        showToast(`✅ ¡Sincronizado! Se cargaron ${cloudData.length} propuestas desde Google Sheets.`, 'success');
      }

      updateUI();
      renderTableAndCharts();
    }
  } catch (err) {
    console.error('Error sincronizando con Google Sheets:', err);
    if (!silent) {
      showToast('⚠️ No se pudo sincronizar con Google Sheets. Verifique la conexión a internet.', 'error');
    }
  }
}

// ==========================================
// 7. UTILIDADES
// ==========================================
function downloadBlob(content, filename, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  if (type === 'success') toast.style.background = '#065f46';
  else if (type === 'warning') toast.style.background = '#92400e';
  else if (type === 'error') toast.style.background = '#991b1b';

  toast.innerHTML = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
