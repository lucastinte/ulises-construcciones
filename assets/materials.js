const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 2,
});

const tableBody = document.getElementById('materialsTableBody');
const emptyStateEl = document.getElementById('materialsEmptyState');
const paginationInfoEl = document.getElementById('materialsPaginationInfo');
const prevPageButton = document.getElementById('materialsPrevPage');
const nextPageButton = document.getElementById('materialsNextPage');
const globalMessageEl = document.getElementById('materialsGlobalMessage');

const materialImportForm = document.getElementById('materialImportForm');
const materialImportFileInput = document.getElementById('materialImportFile');
const materialImportStatusEl = document.getElementById('materialImportStatus');
const materialImportResetButton = document.getElementById('materialImportReset');
const materialImportSubmitButton = document.getElementById('materialImportSubmit');
const materialImportSummaryBox = document.getElementById('materialImportSummaryBox');
const materialImportSummaryList = document.getElementById('materialImportSummaryList');

const materialsState = {
  page: 1,
  perPage: 20,
  totalPages: 1,
  totalItems: 0,
  loading: false,
};

const materialCache = new Map();

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatCurrency = (value) => {
  if (Number.isFinite(value)) {
    return currencyFormatter.format(value);
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? currencyFormatter.format(parsed) : '—';
};

const formatPriceInputValue = (material) => {
  if (Number.isFinite(material?.price)) return material.price;
  if (Number.isFinite(material?.priceCents)) return material.priceCents / 100;
  if (material?.priceRaw) return material.priceRaw;
  return '';
};

const readJsonPayload = async (response) => {
  const raw = await response.text();
  try {
    return JSON.parse(raw || '{}');
  } catch (_error) {
    const snippet = raw ? raw.slice(0, 200).replace(/\s+/g, ' ').trim() : '';
    const error = new Error(
      snippet
        ? `El servidor devolvió HTML en lugar de JSON. Detalle: ${snippet}`
        : 'El servidor devolvió un formato de respuesta inesperado.'
    );
    error.code = 'INVALID_JSON';
    throw error;
  }
};

const setGlobalMessage = (message, type = 'info') => {
  if (!globalMessageEl) return;
  globalMessageEl.textContent = message || '';
  globalMessageEl.classList.remove('materials-alert--success', 'materials-alert--error');
  if (!message) return;
  if (type === 'success') {
    globalMessageEl.classList.add('materials-alert--success');
  } else if (type === 'error') {
    globalMessageEl.classList.add('materials-alert--error');
  }
};

const setRowMessage = (row, message, type = 'info') => {
  const statusEl = row.querySelector('[data-field="rowStatus"]');
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.classList.remove('materials-alert--success', 'materials-alert--error');
  if (!message) return;
  if (type === 'success') {
    statusEl.classList.add('materials-alert--success');
  } else if (type === 'error') {
    statusEl.classList.add('materials-alert--error');
  }
};

const disableRowButtons = (row, disabled) => {
  row.querySelectorAll('button').forEach((button) => {
    button.disabled = disabled;
  });
};

const buildRowMarkup = (material) => {
  const priceValue = formatPriceInputValue(material);
  return `
    <tr data-id="${material.id}">
      <td><input type="text" data-field="name" value="${escapeHtml(material.name ?? '')}" /></td>
      <td><input type="text" data-field="category" value="${escapeHtml(material.category ?? '')}" /></td>
      <td><input type="text" data-field="unit" value="${escapeHtml(material.unit ?? '')}" /></td>
      <td>
        <div class="materials-inline-input">
          <input
            type="text"
            inputmode="decimal"
            data-field="price"
            value="${escapeHtml(priceValue ?? '')}"
            placeholder="${escapeHtml(material.priceRaw ?? '')}"
          />
        </div>
        <small>${escapeHtml(material.currency || 'ARS')}</small>
      </td>
      <td>
        <div class="materials-row-actions">
          <button type="button" class="button button--primary" data-action="save">Guardar</button>
          <button type="button" class="button button--ghost" data-action="reset">Revertir</button>
        </div>
        <small class="materials-alert" data-field="rowStatus"></small>
      </td>
    </tr>
  `;
};

const fillRowWithMaterial = (row, material) => {
  if (!row || !material) return;
  row.querySelector('[data-field="name"]').value = material.name || '';
  row.querySelector('[data-field="category"]').value = material.category || '';
  row.querySelector('[data-field="unit"]').value = material.unit || '';
  row.querySelector('[data-field="price"]').value = formatPriceInputValue(material) || '';
  setRowMessage(row, '');
};

const renderMaterialsTable = (items) => {
  if (!tableBody) return;
  if (!items || items.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5">No hay materiales para mostrar.</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = items.map((item) => buildRowMarkup(item)).join('');
  tableBody.querySelectorAll('tr').forEach((row) => {
    const id = Number.parseInt(row.dataset.id, 10);
    const material = materialCache.get(id);
    row.addEventListener('click', (event) => {
      const action = event.target.closest('button[data-action]');
      if (!action) return;
      if (action.dataset.action === 'save') {
        handleSaveRow(row, id);
      } else if (action.dataset.action === 'reset') {
        fillRowWithMaterial(row, material);
      }
    });
  });
};

const updatePaginationControls = () => {
  if (paginationInfoEl) {
    paginationInfoEl.textContent = `Página ${materialsState.page} de ${materialsState.totalPages} · ${
      materialsState.totalItems
    } registros`;
  }
  if (prevPageButton) {
    prevPageButton.disabled = materialsState.page <= 1 || materialsState.loading;
  }
  if (nextPageButton) {
    nextPageButton.disabled = materialsState.page >= materialsState.totalPages || materialsState.loading;
  }
};

const fetchMaterials = async (page = 1) => {
  if (!tableBody) return;
  materialsState.loading = true;
  updatePaginationControls();
  if (emptyStateEl) {
    emptyStateEl.textContent = 'Cargando catálogo…';
  }
  try {
    const endpoint = new URL('/api/materials/list', window.location.origin);
    endpoint.searchParams.set('page', String(page));
    endpoint.searchParams.set('limit', String(materialsState.perPage));
    const response = await fetch(endpoint.toString());
    if (!response.ok) {
      throw new Error('No se pudo obtener el catálogo.');
    }
    const payload = await readJsonPayload(response);
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'No se pudo obtener el catálogo (respuesta no válida).');
    }
    const items = payload.items || [];
    materialCache.clear();
    items.forEach((item) => {
      materialCache.set(item.id, item);
    });
    materialsState.page = payload.pagination?.page || page;
    materialsState.totalItems = payload.pagination?.totalItems ?? items.length;
    materialsState.totalPages = payload.pagination?.totalPages ?? 1;
    renderMaterialsTable(items);
    updatePaginationControls();
  } catch (error) {
    console.error('Error al cargar materiales:', error);
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`;
    }
  } finally {
    materialsState.loading = false;
    updatePaginationControls();
  }
};

const collectRowPayload = (row) => {
  const getValue = (selector) => row.querySelector(selector)?.value.trim() || '';
  return {
    name: getValue('[data-field="name"]'),
    category: getValue('[data-field="category"]'),
    unit: getValue('[data-field="unit"]'),
    price: getValue('[data-field="price"]'),
  };
};

const handleSaveRow = async (row, id) => {
  if (!Number.isFinite(id)) return;
  const payload = collectRowPayload(row);
  setRowMessage(row, 'Guardando…');
  disableRowButtons(row, true);
  try {
    const response = await fetch(`/api/materials/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const payload = await readJsonPayload(response);
    const data = payload;
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo guardar el material.');
    }
    materialCache.set(id, data.item);
    fillRowWithMaterial(row, data.item);
    setRowMessage(row, 'Cambios guardados.', 'success');
  } catch (error) {
    console.error('Error al guardar material:', error);
    setRowMessage(row, error.message || 'Error al guardar.', 'error');
  } finally {
    disableRowButtons(row, false);
  }
};

const setMaterialImportStatus = (message, variant = 'info') => {
  if (!materialImportStatusEl) return;
  materialImportStatusEl.textContent = message || '';
  materialImportStatusEl.classList.remove('material-import__status--ok', 'material-import__status--error');
  if (!message) return;
  if (variant === 'success') {
    materialImportStatusEl.classList.add('material-import__status--ok');
  } else if (variant === 'error') {
    materialImportStatusEl.classList.add('material-import__status--error');
  }
};

const renderMaterialImportSummary = (summary) => {
  if (!materialImportSummaryBox || !materialImportSummaryList) return;
  if (!summary) {
    materialImportSummaryBox.hidden = true;
    materialImportSummaryList.innerHTML = '';
    return;
  }
  const entries = [
    ['Filas leídas', summary.rowsRead ?? '—'],
    ['Importadas', summary.imported ?? '—'],
    ['Nuevas', summary.inserted ?? '—'],
    ['Actualizadas', summary.updated ?? '—'],
    ['Omitidas', summary.skipped ?? '—'],
    ['Duplicadas', summary.duplicates ?? '—'],
    ['Moneda', summary.currency ?? 'ARS'],
    ['Fecha', summary.lastImportedAt ? new Date(summary.lastImportedAt).toLocaleString('es-AR') : '—'],
  ];
  materialImportSummaryList.innerHTML = entries
    .map(([label, value]) => `<li><strong>${label}:</strong> ${escapeHtml(String(value))}</li>`)
    .join('');
  materialImportSummaryBox.hidden = false;
};

const setMaterialImportPending = (isPending) => {
  if (materialImportSubmitButton) {
    materialImportSubmitButton.disabled = isPending;
    materialImportSubmitButton.textContent = isPending ? 'Importando…' : 'Importar';
  }
  if (materialImportResetButton) {
    materialImportResetButton.disabled = isPending;
  }
  if (materialImportFileInput) {
    materialImportFileInput.disabled = isPending;
  }
};

const handleMaterialImportSubmit = async (event) => {
  event.preventDefault();
  if (!materialImportFileInput || !materialImportFileInput.files || materialImportFileInput.files.length === 0) {
    setMaterialImportStatus('Seleccioná un archivo antes de importar.', 'error');
    materialImportFileInput?.focus();
    return;
  }
  const file = materialImportFileInput.files[0];
  const formData = new FormData();
  formData.append('file', file);

  setMaterialImportPending(true);
  setMaterialImportStatus('Procesando archivo…');
  renderMaterialImportSummary(null);

  try {
    const response = await fetch('/api/materials/import', {
      method: 'POST',
      body: formData,
    });
    const payload = await readJsonPayload(response);
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'No se pudo importar el archivo.');
    }
    const summary = payload.summary || {};
    setMaterialImportStatus(
      `Importados ${summary.imported ?? 0} · nuevos ${summary.inserted ?? 0} · actualizados ${
        summary.updated ?? 0
      }`,
      'success'
    );
    renderMaterialImportSummary(summary);
    materialImportForm?.reset();
    setGlobalMessage('Catálogo actualizado con éxito.', 'success');
    await fetchMaterials(1);
  } catch (error) {
    console.error('Error al importar materiales:', error);
    setMaterialImportStatus(error.message || 'Error al importar.', 'error');
    setGlobalMessage('No se pudo actualizar el catálogo.', 'error');
  } finally {
    setMaterialImportPending(false);
  }
};

const setupImportForm = () => {
  if (!materialImportForm) return;
  materialImportForm.addEventListener('submit', handleMaterialImportSubmit);
  if (materialImportResetButton) {
    materialImportResetButton.addEventListener('click', () => {
      materialImportForm.reset();
      setMaterialImportStatus('');
      renderMaterialImportSummary(null);
    });
  }
};

const setupPagination = () => {
  if (prevPageButton) {
    prevPageButton.addEventListener('click', () => {
      if (materialsState.page > 1) {
        fetchMaterials(materialsState.page - 1);
      }
    });
  }
  if (nextPageButton) {
    nextPageButton.addEventListener('click', () => {
      if (materialsState.page < materialsState.totalPages) {
        fetchMaterials(materialsState.page + 1);
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  setupImportForm();
  setupPagination();
  fetchMaterials(materialsState.page);
});
