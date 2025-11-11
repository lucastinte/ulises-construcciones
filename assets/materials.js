const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 2,
});

const INVENTORY_TYPES = {
  materials: {
    label: 'Materiales',
    searchPlaceholder: 'Ej. ANGULOS 1 1/2" X 1/4"',
    importDescription: 'Carga un CSV con los materiales disponibles y sus precios actualizados.',
  },
  supplies: {
    label: 'Insumos',
    searchPlaceholder: 'Ej. Disco de corte 4"',
    importDescription: 'Carga un CSV con los insumos o consumibles que utilizas en obra.',
  },
  labor: {
    label: 'Mano de obra',
    searchPlaceholder: 'Ej. Soldador especializado',
    importDescription: 'Carga un CSV con perfiles de mano de obra y sus tarifas.',
  },
};

const tableBody = document.getElementById('materialsTableBody');
const emptyStateEl = document.getElementById('materialsEmptyState');
const paginationInfoEl = document.getElementById('materialsPaginationInfo');
const prevPageButton = document.getElementById('materialsPrevPage');
const nextPageButton = document.getElementById('materialsNextPage');
const paginationActions = document.querySelector('.materials-pagination__actions');
const globalMessageEl = document.getElementById('materialsGlobalMessage');

const inventoryTabs = document.querySelectorAll('[data-inventory-tab]');
const importLabelEl = document.getElementById('inventoryImportLabel');
const importDescriptionEl = document.getElementById('inventoryImportDescription');
const datasetLabelEl = document.getElementById('inventoryDatasetLabel');
const datasetDescriptionEl = document.getElementById('inventoryDatasetDescription');
const inventorySearchInput = document.getElementById('inventorySearchInput');
const inventorySearchClear = document.getElementById('inventorySearchClear');

const manualForm = document.getElementById('inventoryManualForm');
const manualFields = {
  name: document.getElementById('manualName'),
  price: document.getElementById('manualPrice'),
};

const materialImportForm = document.getElementById('materialImportForm');
const materialImportFileInput = document.getElementById('materialImportFile');
const materialImportStatusEl = document.getElementById('materialImportStatus');
const materialImportResetButton = document.getElementById('materialImportReset');
const materialImportSubmitButton = document.getElementById('materialImportSubmit');
const materialImportSummaryBox = document.getElementById('materialImportSummaryBox');
const materialImportSummaryList = document.getElementById('materialImportSummaryList');

const createInventoryState = () => ({
  page: 1,
  perPage: 20,
  totalPages: 1,
  totalItems: 0,
  loading: false,
  isSearching: false,
  searchTerm: '',
});

const inventoryStates = {
  materials: createInventoryState(),
  supplies: createInventoryState(),
  labor: createInventoryState(),
};

const inventoryCaches = {
  materials: new Map(),
  supplies: new Map(),
  labor: new Map(),
};

let currentInventory = 'materials';

const debounce = (fn, delay = 300) => {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), delay);
  };
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const payload = await readJsonPayload(response);
  if (!response.ok || (payload.ok !== undefined && payload.ok === false)) {
    throw new Error(payload.error || 'No se pudo completar la operación.');
  }
  return payload;
};

const formatPriceInputValue = (item) => {
  if (Number.isFinite(item?.price)) return item.price;
  if (Number.isFinite(item?.priceCents)) return item.priceCents / 100;
  if (item?.priceRaw) return item.priceRaw;
  return '';
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

const renderImportSummary = (summary) => {
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
    .map(([label, value]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(value))}</li>`)
    .join('');
  materialImportSummaryBox.hidden = false;
};

const updateInventoryCopy = () => {
  const config = INVENTORY_TYPES[currentInventory] || INVENTORY_TYPES.materials;
  if (importLabelEl) importLabelEl.textContent = config.label;
  if (datasetLabelEl) datasetLabelEl.textContent = config.label;
  if (importDescriptionEl) {
    importDescriptionEl.textContent = config.importDescription || 'Carga un CSV con los registros actualizados.';
  }
  if (datasetDescriptionEl) {
    datasetDescriptionEl.textContent =
      config.datasetDescription || 'Revisa el listado completo, navega por páginas y ajusta los valores.';
  }
  if (inventorySearchInput) {
    inventorySearchInput.placeholder = config.searchPlaceholder || 'Escribe para buscar...';
  }
  const manualTitleEl = manualForm?.querySelector('h3');
  if (manualTitleEl) {
    manualTitleEl.textContent = `Agregar ${config.label.toLowerCase()} manualmente`;
  }
};

const buildRowMarkup = (item, dataset) => {
  const priceValue = formatPriceInputValue(item);
  return `
    <tr data-id="${item.id}" data-inventory="${dataset}">
      <td><input type="text" data-field="name" value="${escapeHtml(item.name ?? '')}" /></td>
      <td>
        <div class="materials-price-field">
          <span class="materials-price-prefix">$</span>
          <input
            type="text"
            inputmode="decimal"
            data-field="price"
            value="${escapeHtml(priceValue ?? '')}"
            placeholder="${escapeHtml(item.priceRaw ?? '')}"
          />
        </div>
      </td>
      <td>
        <div class="materials-row-actions">
          <button type="button" class="button button--primary" data-action="save">Guardar</button>
          <button type="button" class="button button--ghost" data-action="reset">Revertir</button>
          <button type="button" class="button button--ghost button--danger" data-action="remove">Eliminar</button>
        </div>
        <small class="materials-alert" data-field="rowStatus"></small>
      </td>
    </tr>
  `;
};

const fillRowWithItem = (row, item) => {
  if (!row || !item) return;
  row.querySelector('[data-field="name"]').value = item.name || '';
  row.querySelector('[data-field="price"]').value = formatPriceInputValue(item) || '';
  setRowMessage(row, '');
};

const renderInventoryTable = (items, dataset) => {
  if (!tableBody) return;
  if (!items || items.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3">No hay registros para mostrar.</td>
      </tr>
    `;
    return;
  }
  tableBody.innerHTML = items.map((item) => buildRowMarkup(item, dataset)).join('');
};

const updatePaginationControls = (dataset = currentInventory) => {
  const state = inventoryStates[dataset];
  if (!paginationInfoEl) return;
  if (state.isSearching && state.searchTerm) {
    paginationInfoEl.textContent = `Coincidencias: ${state.totalItems}`;
  } else {
    paginationInfoEl.textContent = `Página ${state.page} de ${state.totalPages} · ${state.totalItems} registros`;
  }
  if (prevPageButton) {
    prevPageButton.disabled = state.loading || state.page <= 1 || state.isSearching;
  }
  if (nextPageButton) {
    nextPageButton.disabled = state.loading || state.page >= state.totalPages || state.isSearching;
  }
  if (paginationActions) {
    paginationActions.classList.toggle('is-disabled', Boolean(state.isSearching && state.searchTerm));
  }
};

const fetchInventoryItems = async (dataset = currentInventory, { page = 1, search = null } = {}) => {
  const state = inventoryStates[dataset];
  state.loading = true;
  updatePaginationControls(dataset);
  if (emptyStateEl) {
    emptyStateEl.textContent = 'Cargando catálogo…';
  }
  try {
    let items = [];
    if (search) {
      const endpoint = new URL(`/api/${dataset}`, window.location.origin);
      endpoint.searchParams.set('limit', '50');
      endpoint.searchParams.set('q', search);
      const payload = await requestJson(endpoint.toString());
      items = payload.items || [];
      state.isSearching = true;
      state.searchTerm = search;
      state.page = 1;
      state.totalPages = 1;
      state.totalItems = items.length;
    } else {
      const endpoint = new URL(`/api/${dataset}/list`, window.location.origin);
      endpoint.searchParams.set('page', String(page));
      endpoint.searchParams.set('limit', String(state.perPage));
      const payload = await requestJson(endpoint.toString());
      items = payload.items || [];
      const pagination = payload.pagination || {};
      state.isSearching = false;
      state.searchTerm = '';
      state.page = pagination.page || page;
      state.totalPages = pagination.totalPages ?? 1;
      state.totalItems = pagination.totalItems ?? items.length;
    }
    inventoryCaches[dataset].clear();
    items.forEach((item) => inventoryCaches[dataset].set(item.id, item));
    renderInventoryTable(items, dataset);
    updatePaginationControls(dataset);
  } catch (error) {
    console.error('Error al cargar registros:', error);
    setGlobalMessage(error.message || 'No se pudieron obtener los registros.', 'error');
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message || 'Error inesperado.')}</td></tr>`;
    }
  } finally {
    state.loading = false;
    updatePaginationControls(dataset);
  }
};

const collectRowPayload = (row) => {
  const getValue = (selector) => row.querySelector(selector)?.value.trim() || '';
  return {
    name: getValue('[data-field="name"]'),
    price: getValue('[data-field="price"]'),
  };
};

const handleSaveRow = async (row, id, dataset) => {
  if (!Number.isFinite(id)) return;
  const payload = collectRowPayload(row);
  setRowMessage(row, 'Guardando…');
  disableRowButtons(row, true);
  try {
    const response = await requestJson(`/api/${dataset}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    inventoryCaches[dataset].set(id, response.item);
    fillRowWithItem(row, response.item);
    setRowMessage(row, 'Cambios guardados.', 'success');
  } catch (error) {
    console.error('Error al guardar:', error);
    setRowMessage(row, error.message || 'Error al guardar.', 'error');
  } finally {
    disableRowButtons(row, false);
  }
};

const handleInventoryImportSubmit = async (event) => {
  event.preventDefault();
  if (!materialImportFileInput || !materialImportFileInput.files || materialImportFileInput.files.length === 0) {
    setMaterialImportStatus('Seleccioná un archivo CSV antes de importar.', 'error');
    materialImportFileInput?.focus();
    return;
  }
  const file = materialImportFileInput.files[0];
  const formData = new FormData();
  formData.append('file', file);

  setMaterialImportPending(true);
  setMaterialImportStatus('Procesando archivo…');
  renderImportSummary(null);

  try {
    const payload = await requestJson(`/api/${currentInventory}/import`, {
      method: 'POST',
      body: formData,
    });
    setMaterialImportStatus('Catálogo actualizado exitosamente.', 'success');
    renderImportSummary(payload.summary);
    materialImportForm?.reset();
    setGlobalMessage(`Se actualizaron los ${INVENTORY_TYPES[currentInventory].label.toLowerCase()}.`, 'success');
    await fetchInventoryItems(currentInventory, { page: 1 });
  } catch (error) {
    console.error('Error al importar:', error);
    setMaterialImportStatus(error.message || 'No se pudo importar el archivo.', 'error');
  } finally {
    setMaterialImportPending(false);
  }
};

const handleManualSubmit = async (event) => {
  event.preventDefault();
  const payload = {
    name: manualFields.name?.value.trim(),
    price: manualFields.price?.value.trim(),
  };
  if (!payload.name || !payload.price) {
    window.alert('Completa al menos el nombre y el precio.');
    return;
  }
  try {
    await requestJson(`/api/${currentInventory}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setGlobalMessage('Registro agregado correctamente.', 'success');
    manualForm?.reset();
    fetchInventoryItems(currentInventory, { page: 1 });
  } catch (error) {
    console.error('Error al crear registro:', error);
    setGlobalMessage(error.message || 'No se pudo guardar el registro.', 'error');
  }
};

const handleSearch = debounce((term) => {
  if (term && term.length >= 2) {
    fetchInventoryItems(currentInventory, { search: term });
  } else if (!term) {
    fetchInventoryItems(currentInventory, { page: 1 });
  }
}, 300);

const handleTabClick = (dataset) => {
  if (dataset === currentInventory) return;
  currentInventory = dataset;
  inventoryTabs.forEach((button) => {
    if (button.dataset.inventoryTab === dataset) {
      button.classList.add('is-active');
    } else {
      button.classList.remove('is-active');
    }
  });
  inventorySearchInput.value = '';
  renderImportSummary(null);
  setMaterialImportStatus('');
  setGlobalMessage('');
  updateInventoryCopy();
  fetchInventoryItems(currentInventory, { page: inventoryStates[currentInventory].page });
};

const initializeInventoryManager = () => {
  updateInventoryCopy();
  fetchInventoryItems(currentInventory);

  inventoryTabs.forEach((button) => {
    button.addEventListener('click', () => handleTabClick(button.dataset.inventoryTab));
  });

  if (prevPageButton) {
    prevPageButton.addEventListener('click', () => {
      const state = inventoryStates[currentInventory];
      if (state.page > 1 && !state.isSearching) {
        fetchInventoryItems(currentInventory, { page: state.page - 1 });
      }
    });
  }

  if (nextPageButton) {
    nextPageButton.addEventListener('click', () => {
      const state = inventoryStates[currentInventory];
      if (state.page < state.totalPages && !state.isSearching) {
        fetchInventoryItems(currentInventory, { page: state.page + 1 });
      }
    });
  }

  if (inventorySearchInput) {
    inventorySearchInput.addEventListener('input', (event) => {
      const term = event.target.value.trim();
      handleSearch(term);
    });
  }

  if (inventorySearchClear) {
    inventorySearchClear.addEventListener('click', () => {
      inventorySearchInput.value = '';
      fetchInventoryItems(currentInventory, { page: 1 });
    });
  }

  if (tableBody) {
    tableBody.addEventListener('click', (event) => {
      const actionButton = event.target.closest('button[data-action]');
      if (!actionButton) return;
      const row = actionButton.closest('tr');
      if (!row) return;
      const dataset = row.dataset.inventory || currentInventory;
      const id = Number.parseInt(row.dataset.id, 10);
      if (actionButton.dataset.action === 'save') {
        handleSaveRow(row, id, dataset);
      } else if (actionButton.dataset.action === 'reset') {
        const cacheItem = inventoryCaches[dataset].get(id);
        fillRowWithItem(row, cacheItem);
        setRowMessage(row, 'Valores originales restaurados.');
      }
    });
  }

  if (materialImportForm) {
    materialImportForm.addEventListener('submit', handleInventoryImportSubmit);
  }
  if (materialImportResetButton) {
    materialImportResetButton.addEventListener('click', () => {
      materialImportForm?.reset();
      setMaterialImportStatus('');
      renderImportSummary(null);
    });
  }

  if (manualForm) {
    manualForm.addEventListener('submit', handleManualSubmit);
    manualForm.addEventListener('reset', () => {
      setGlobalMessage('');
    });
  }
};

document.addEventListener('DOMContentLoaded', initializeInventoryManager);
