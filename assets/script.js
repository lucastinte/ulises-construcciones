const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const BRAND_INFO = {
  name: 'BISEL.ARG',
  tagline: 'Soluciones estructurales comerciales y residenciales',
  logo: '/assets/logo-bisel.png',
};

const reportDateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const quantityFormatter = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const budgetConfig = {
  materials: {
    body: document.getElementById('materialsBody'),
    totalEl: document.getElementById('materialsTotal'),
    summaryEl: document.getElementById('summaryMaterials'),
    templateId: 'material-row-template',
    label: 'Materiales',
    totalValue: 0,
  },
  supplies: {
    body: document.getElementById('suppliesBody'),
    totalEl: document.getElementById('suppliesTotal'),
    summaryEl: document.getElementById('summarySupplies'),
    templateId: 'supplies-row-template',
    label: 'Insumos',
    totalValue: 0,
  },
  labor: {
    body: document.getElementById('laborBody'),
    totalEl: document.getElementById('laborTotal'),
    summaryEl: document.getElementById('summaryLabor'),
    templateId: 'labor-row-template',
    label: 'Mano de obra',
    totalValue: 0,
  },
};

const requiredProjectFieldKeys = [
  'projectName',
  'clientName',
  'creationDate',
  'projectMeasure',
  'projectLocation',
];

const requiredBudgetSections = ['materials', 'supplies', 'labor'];

const projectFields = {
  projectName: document.getElementById('projectName'),
  clientName: document.getElementById('clientName'),
  creationDate: document.getElementById('creationDate'),
  projectMeasure: document.getElementById('projectMeasure'),
  projectLocation: document.getElementById('projectLocation'),
  clientPhone: document.getElementById('clientPhone'),
  clientEmail: document.getElementById('clientEmail'),
  otherDetails: document.getElementById('otherDetails'),
  paymentMethods: document.getElementById('paymentMethods'),
  paymentDetails: document.getElementById('paymentDetails'),
  signatureName: document.getElementById('signatureName'),
  signatureRole: document.getElementById('signatureRole'),
  companyCuit: document.getElementById('companyCuit'),
  companyPhone: document.getElementById('companyPhone'),
  companySocial: document.getElementById('companySocial'),
  companyLocation: document.getElementById('companyLocation'),
};

const additionalInputs = {
  freight: document.getElementById('freightInput'),
  marginRate: document.getElementById('marginRate'),
};

const summaryElements = {
  supplies: document.getElementById('summarySupplies'),
  freight: document.getElementById('summaryFreight'),
  subtotal: document.getElementById('summarySubtotal'),
  margin: document.getElementById('summaryMargin'),
  total: document.getElementById('summaryGrandTotal'),
};

const downloadButton = document.getElementById('downloadPdf');
const clearButton = document.getElementById('clearData');
const saveCatalogButton = document.getElementById('saveCatalogFromBudget');
const catalogForm = document.getElementById('catalogForm');
const catalogSubmitButton = document.getElementById('catalogSubmit');
const catalogCancelButton = document.getElementById('catalogCancel');
const catalogListEl = document.getElementById('catalogList');
const catalogEmptyState = document.getElementById('catalogEmptyState');
const catalogCountEl = document.getElementById('catalogCount');

const catalogFields = {
  name: document.getElementById('catalogName'),
  category: document.getElementById('catalogCategory'),
  description: document.getElementById('catalogDescription'),
};

const catalogImageUrlInput = document.getElementById('catalogImageUrl');
const catalogDocumentUrlInput = document.getElementById('catalogDocumentUrl');
const catalogImagesListEl = document.getElementById('catalogImagesList');
const catalogDocumentsListEl = document.getElementById('catalogDocumentsList');

const catalogUploadButtons = document.querySelectorAll('[data-upload-target]');
const catalogMediaAddButtons = document.querySelectorAll('[data-media-add]');
const catalogFileInputs = {
  images: document.getElementById('catalogImagesFile'),
  documents: document.getElementById('catalogDocumentsFile'),
};
const driveUploadConfig = {
  endpoint: '/api/upload',
};

const materialSearchInput = document.getElementById('materialSearchInput');
const materialSuggestionsEl = document.getElementById('materialSuggestions');
const MAX_MEDIA_ITEMS = 5;
const MATERIAL_SUGGESTION_LIMIT = 12;
const MATERIAL_INLINE_LIMIT = 8;
const MATERIAL_SEARCH_DELAY = 280;
const SECTION_DATASET_MAP = {
  materials: 'materials',
  supplies: 'supplies',
  labor: 'labor',
};

const summaryValues = {
  materials: 0,
  labor: 0,
  supplies: 0,
  freight: 0,
  subtotal: 0,
  margin: 0,
  total: 0,
};

const storageKey = 'ulises-construcciones-budget-v2';
let storageAvailable = false;
let saveTimeout;

let catalogEntries = [];
let catalogEditingId = null;
let catalogLoading = false;
let catalogLoadError = null;
let catalogImages = [];
let catalogDocuments = [];
let materialSuggestionsAbortController = null;
let materialSuggestionItems = [];

const getInventoryUnitCost = (material) => {
  if (!material) return 0;
  if (Number.isFinite(material.price)) return material.price;
  if (Number.isFinite(material.priceCents)) return material.priceCents / 100;
  if (material.priceRaw) return parsePriceFromRaw(material.priceRaw);
  return 0;
};

function setCatalogLoadingState(isLoading, errorMessage = null) {
  catalogLoading = isLoading;
  catalogLoadError = errorMessage;
}

function sanitizeMediaUrl(value) {
  return String(value ?? '').trim();
}

function getMediaState(type) {
  return type === 'documents' ? catalogDocuments : catalogImages;
}

function getMediaListElement(type) {
  return type === 'documents' ? catalogDocumentsListEl : catalogImagesListEl;
}

function getFileDisplayName(url, fallbackLabel) {
  const fallback = fallbackLabel || 'Archivo';
  if (!url) return fallback;
  const safeUrl = String(url);
  const decode = (value) => {
    try {
      return decodeURIComponent(value);
    } catch (_error) {
      return value;
    }
  };
  try {
    const parsed = new URL(safeUrl, window.location.origin);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
      return decode(segments[segments.length - 1]) || fallback;
    }
  } catch (_error) {
    const parts = safeUrl.split('/').filter(Boolean);
    if (parts.length > 0) {
      return decode(parts[parts.length - 1]) || fallback;
    }
  }
  return fallback;
}

function renderMediaList(type) {
  const list = getMediaState(type);
  const listEl = getMediaListElement(type);
  if (!listEl) return;

  if (!list || list.length === 0) {
    listEl.innerHTML = '<p class="catalog-media-list__empty">Aún no agregaste archivos.</p>';
    return;
  }

  listEl.innerHTML = list
    .map((url, index) => {
      const safeUrl = escapeHtml(url);
      const rawName = getFileDisplayName(
        url,
        type === 'images' ? `Imagen ${index + 1}` : `Documento ${index + 1}`
      );
      const displayName = escapeHtml(rawName);
      const downloadName = escapeHtml(rawName);
      if (type === 'images') {
        return `
          <div class="catalog-media-list__item" data-type="images" data-index="${index}">
            <div class="catalog-media-list__preview">
              <img src="${safeUrl}" alt="Imagen ${index + 1}" loading="lazy" onerror="this.src='';this.closest('.catalog-media-list__item').classList.add('catalog-media-list__item--broken');" />
            </div>
            <div class="catalog-media-list__info">
              <span class="catalog-media-list__url" title="${safeUrl}">${displayName}</span>
              <div class="catalog-media-list__actions">
                <a href="${safeUrl}" class="catalog-media-list__action" target="_blank" rel="noopener" download="${downloadName}">Descargar</a>
                <button type="button" class="catalog-media-list__remove" data-media-remove="images" data-index="${index}" aria-label="Quitar imagen ${index + 1}">Quitar</button>
              </div>
            </div>
          </div>
        `;
      }
      return `
        <div class="catalog-media-list__item" data-type="documents" data-index="${index}">
          <div class="catalog-media-list__preview catalog-media-list__preview--doc">PDF</div>
          <div class="catalog-media-list__info">
            <span class="catalog-media-list__url" title="${safeUrl}">${displayName}</span>
            <div class="catalog-media-list__actions">
              <a href="${safeUrl}" class="catalog-media-list__action" target="_blank" rel="noopener" download="${downloadName}">Descargar</a>
              <button type="button" class="catalog-media-list__remove" data-media-remove="documents" data-index="${index}" aria-label="Quitar documento ${index + 1}">Quitar</button>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

function setCatalogMedia(type, urls) {
  const list = getMediaState(type);
  list.length = 0;
  (Array.isArray(urls) ? urls : [])
    .map((value) => sanitizeMediaUrl(value))
    .filter(Boolean)
    .slice(0, MAX_MEDIA_ITEMS)
    .forEach((value) => list.push(value));
  renderMediaList(type);
}

function addMediaUrl(type, url) {
  const cleanUrl = sanitizeMediaUrl(url);
  if (!cleanUrl) return;
  const list = getMediaState(type);
  if (list.includes(cleanUrl)) {
    window.alert('El archivo ya fue agregado.');
    return;
  }
  if (list.length >= MAX_MEDIA_ITEMS) {
    window.alert(`Puedes agregar hasta ${MAX_MEDIA_ITEMS} archivos en esta sección.`);
    return;
  }
  list.push(cleanUrl);
  renderMediaList(type);
}

function removeMediaAt(type, index) {
  const list = getMediaState(type);
  if (!Array.isArray(list)) return;
  list.splice(index, 1);
  renderMediaList(type);
}

function handleMediaAdd(type) {
  const input = type === 'documents' ? catalogDocumentUrlInput : catalogImageUrlInput;
  if (!input) return;
  const value = input.value;
  if (!value.trim()) {
    input.focus();
    return;
  }
  addMediaUrl(type, value);
  input.value = '';
  input.focus();
}

function handleMediaListClick(event) {
  const button = event.target.closest('[data-media-remove]');
  if (!button) return;
  const type = button.dataset.mediaRemove === 'documents' ? 'documents' : 'images';
  const index = Number.parseInt(button.dataset.index, 10);
  if (Number.isNaN(index)) return;
  removeMediaAt(type, index);
}

async function refreshCatalogEntries() {
  setCatalogLoadingState(true);
  renderCatalog();

  try {
    const response = await fetch('/api/catalog');
    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!data || data.ok !== true || !Array.isArray(data.items)) {
      throw new Error('Respuesta inválida del servidor.');
    }
    catalogEntries = data.items;
    setCatalogLoadingState(false);
  } catch (error) {
    console.error('Error al cargar el catálogo.', error);
    catalogEntries = [];
    setCatalogLoadingState(false, 'No se pudo cargar el catálogo. Intenta nuevamente.');
  }

  renderCatalog();
}

async function persistCatalogEntry(entry, isUpdate) {
  const url = isUpdate ? `/api/catalog/${encodeURIComponent(entry.id)}` : '/api/catalog';
  const method = isUpdate ? 'PUT' : 'POST';

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(entry),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.ok !== true || !data.item) {
    const message = (data && data.error) || `Error HTTP ${response.status}`;
    throw new Error(message);
  }

  return data.item;
}

async function removeCatalogEntry(id) {
  const response = await fetch(`/api/catalog/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || (data && data.ok === false)) {
    const message = (data && data.error) || `Error HTTP ${response.status}`;
    throw new Error(message);
  }
}

function buildDefinitionList(items) {
  const meaningful = items.filter((item) => item.value);
  if (meaningful.length === 0) {
    return '<p class="catalog-detail__empty">Sin información disponible.</p>';
  }
  return `
    <dl class="catalog-detail__list">
      ${meaningful
        .map(
          (item) => `
            <div class="catalog-detail__list-item">
              <dt>${escapeHtml(item.label)}</dt>
              <dd>${escapeHtml(item.value).replace(/\n/g, '<br />')}</dd>
            </div>
          `
        )
        .join('')}
    </dl>
  `;
}

function buildSummaryMarkup(entry) {
  const summary = entry.summary || {};
  const additionals = entry.additionals || {};
  const marginRateValue = Number.parseFloat(additionals.marginRate);
  const marginRateLine = Number.isFinite(marginRateValue)
    ? {
        label: 'Margen (%)',
        value: `${marginRateValue.toFixed(2).replace(/\.00$/, '')}%`,
      }
    : null;
  const lines = [
    { label: 'Materiales', value: formatCurrency(summary.materials ?? 0) },
    { label: 'Mano de obra', value: formatCurrency(summary.labor ?? 0) },
    { label: 'Insumos', value: formatCurrency(summary.supplies ?? additionals.supplies ?? 0) },
    {
      label: 'Flete / logística (costo adicional)',
      value: formatCurrency(summary.freight ?? additionals.freight ?? 0),
    },
    { label: 'Margen', value: formatCurrency(summary.margin ?? 0) },
    marginRateLine,
    { label: 'Total estimado', value: formatCurrency(summary.total ?? 0), strong: true },
  ].filter(Boolean);

  if (lines.length === 0) {
    return '<p class="catalog-detail__empty">Sin resumen disponible.</p>';
  }

  return `
    <ul class="catalog-detail__summary">
      ${lines
        .map(
          (item) => `
            <li>
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(item.value)}</strong>
            </li>
          `
        )
        .join('')}
    </ul>
  `;
}

function buildBudgetList(items, emptyMessage) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="catalog-detail__empty">${escapeHtml(emptyMessage)}</p>`;
  }

  return `
    <ul class="catalog-detail__items">
      ${items
        .map((item) => {
          const concept = escapeHtml(item.concept || 'Sin concepto');
          const quantity = escapeHtml(quantityFormatter.format(item.quantity ?? 0));
          const unitCost = formatCurrency(item.unitCost ?? 0);
          const total = formatCurrency(item.total ?? (item.quantity ?? 0) * (item.unitCost ?? 0));
          return `
            <li>
              <div class="catalog-detail__item-name">${concept}</div>
              <div class="catalog-detail__item-meta">
                <span>Cant.: ${quantity}</span>
                <span>Unit.: ${unitCost}</span>
                <span>Total: ${total}</span>
              </div>
            </li>
          `;
        })
        .join('')}
    </ul>
  `;
}

function formatCurrency(value) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

function parseNumber(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePriceFromRaw(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value !== 'string') {
    return parseNumber(value);
  }
  const cleaned = value.replace(/[^\d,.-]/g, '').replace(/\s+/g, '');
  if (!cleaned) return 0;
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;
  if (hasComma && hasDot) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (hasComma && !hasDot) {
    normalized = normalized.replace(',', '.');
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  if (date && !Number.isNaN(date.getTime())) {
    return reportDateFormatter.format(date);
  }
  return reportDateFormatter.format(new Date());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createListMarkup(text, fallback) {
  const items = String(text || '')
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
  if (items.length === 0) {
    return `<li>${escapeHtml(fallback)}</li>`;
  }
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}

function createParagraphMarkup(text, fallback) {
  const lines = String(text || '')
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return `<p>${escapeHtml(fallback)}</p>`;
  }
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
}

function debounce(fn, delay = 250) {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

async function fetchMaterialSuggestionsList(
  dataset = 'materials',
  term = '',
  limit = MATERIAL_SUGGESTION_LIMIT,
  signal
) {
  const endpoint = new URL(`/api/${dataset}`, window.location.origin);
  if (term) {
    endpoint.searchParams.set('q', term);
  }
  endpoint.searchParams.set('limit', String(limit));
  const response = await fetch(endpoint.toString(), { signal });
  if (!response.ok) {
    throw new Error('No se pudo contactar al servidor.');
  }
  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(payload.error || 'No se pudieron obtener los materiales.');
  }
  return payload.items || [];
}

function scheduleSave() {
  if (!storageAvailable) return;
  window.clearTimeout(saveTimeout);
  saveTimeout = window.setTimeout(saveToStorage, 300);
}

function saveToStorage() {
  if (!storageAvailable) return;

  const payload = {
    project: getProjectData(),
    budget: collectBudgetData(),
    additionals: getAdditionals(),
    summary: summaryValues,
    savedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch (error) {
    console.warn('No se pudo guardar la información en el navegador.', error);
  }
}

function loadFromStorage() {
  if (!storageAvailable) return;
  const stored = window.localStorage.getItem(storageKey);
  if (!stored) return;

  try {
    const payload = JSON.parse(stored);

    Object.entries(projectFields).forEach(([key, field]) => {
      if (payload.project && Object.prototype.hasOwnProperty.call(payload.project, key)) {
        field.value = payload.project[key];
      }
    });

    Object.entries(budgetConfig).forEach(([sectionKey, config]) => {
      config.body.innerHTML = '';
      const storedRows = payload.budget?.[sectionKey] || [];
      if (storedRows.length > 0) {
        storedRows.forEach((item) => addBudgetRow(sectionKey, item));
      } else if (sectionKey === 'supplies' && payload.additionals) {
        const legacySupplies = parseNumber(payload.additionals.supplies);
        if (legacySupplies > 0) {
          addBudgetRow(sectionKey, {
            concept: 'Insumos adicionales',
            quantity: 1,
            unitCost: legacySupplies,
          });
        } else {
          addBudgetRow(sectionKey);
        }
      } else {
        addBudgetRow(sectionKey);
      }
      updateSectionTotals(sectionKey);
    });

    if (payload.additionals) {
      if (additionalInputs.freight) {
        additionalInputs.freight.value = payload.additionals.freight ?? 0;
      }
      if (additionalInputs.marginRate) {
        additionalInputs.marginRate.value = payload.additionals.marginRate ?? 10;
      }
    }

    updateSummary();
  } catch (error) {
    console.warn('No se pudo cargar la información guardada.', error);
  }
}

function getProjectData() {
  const data = {};
  Object.entries(projectFields).forEach(([key, field]) => {
    data[key] = field.value.trim();
  });
  return data;
}

function getAdditionals() {
  return {
    supplies: budgetConfig.supplies.totalValue,
    freight: parseNumber(additionalInputs.freight?.value),
    marginRate: parseNumber(additionalInputs.marginRate?.value),
  };
}

function updateRowTotal(row, sectionKey) {
  const quantityInput = row.querySelector('[data-field="quantity"]');
  const unitCostInput = row.querySelector('[data-field="unitCost"]');
  const totalOutput = row.querySelector('[data-field="total"]');

  const quantity = parseNumber(quantityInput.value);
  const unitCost = parseNumber(unitCostInput.value);
  const total = quantity * unitCost;

  totalOutput.textContent = formatCurrency(total);
  row.dataset.total = total;

  updateSectionTotals(sectionKey);
  scheduleSave();
}

function updateSectionTotals(sectionKey) {
  const config = budgetConfig[sectionKey];
  let total = 0;

  config.body.querySelectorAll('tr').forEach((row) => {
    total += parseNumber(row.dataset.total);
  });

  config.totalValue = total;
  config.totalEl.textContent = formatCurrency(total);
  config.summaryEl.textContent = formatCurrency(total);

  summaryValues[sectionKey] = total;
  updateSummary();
}

function createBudgetRow(sectionKey, data = {}) {
  const config = budgetConfig[sectionKey];
  const template = document.getElementById(config.templateId);
  const row = template.content.firstElementChild.cloneNode(true);

  const conceptInput = row.querySelector('[data-field="concept"]');
  const quantityInput = row.querySelector('[data-field="quantity"]');
  const unitCostInput = row.querySelector('[data-field="unitCost"]');
  const removeButton = row.querySelector('[data-action="remove-row"]');

  conceptInput.value = data.concept || '';
  quantityInput.value = data.quantity ?? 1;
  unitCostInput.value = data.unitCost ?? 0;

  const handleInput = () => updateRowTotal(row, sectionKey);

  quantityInput.addEventListener('input', handleInput);
  unitCostInput.addEventListener('input', handleInput);
  conceptInput.addEventListener('input', scheduleSave);

  removeButton.addEventListener('click', () => {
    row.remove();
    updateSectionTotals(sectionKey);
    scheduleSave();
  });

  attachInventoryInlineAutocomplete(row, sectionKey);

  return row;
}

function addBudgetRow(sectionKey, data) {
  const config = budgetConfig[sectionKey];
  const row = createBudgetRow(sectionKey, data);
  config.body.appendChild(row);
  updateRowTotal(row, sectionKey);
}

function attachInventoryInlineAutocomplete(row, sectionKey) {
  const dataset = SECTION_DATASET_MAP[sectionKey] || 'materials';
  const conceptInput = row.querySelector('[data-field="concept"]');
  const unitCostInput = row.querySelector('[data-field="unitCost"]');
  const suggestionList = row.querySelector('[data-role="inline-material-suggestions"]');
  if (!conceptInput || !unitCostInput || !suggestionList) return;

  let currentItems = [];
  let inlineAbortController = null;

  const hideSuggestions = () => {
    suggestionList.hidden = true;
    suggestionList.innerHTML = '';
  };

  const renderSuggestions = (items, options = {}) => {
    const { loading = false, error = null } = options;
    if (loading) {
      suggestionList.hidden = false;
      suggestionList.innerHTML = '<li class="material-inline-suggestions__empty">Buscando…</li>';
      return;
    }
    if (error) {
      suggestionList.hidden = false;
      suggestionList.innerHTML = `<li class="material-inline-suggestions__empty">${escapeHtml(error)}</li>`;
      return;
    }
    if (!items || items.length === 0) {
      suggestionList.hidden = false;
      suggestionList.innerHTML = '<li class="material-inline-suggestions__empty">Sin coincidencias.</li>';
      return;
    }
    suggestionList.hidden = false;
    suggestionList.innerHTML = items
      .map((item, index) => {
        const priceLabel =
          Number.isFinite(item.price) && item.price !== null ? formatCurrency(item.price) : item.priceRaw || '—';
        return `<li>
          <button type="button" data-inline-material-index="${index}">
            <span class="material-inline-suggestions__name">${escapeHtml(item.name)}</span>
            <span class="material-inline-suggestions__price">${escapeHtml(priceLabel)}</span>
          </button>
        </li>`;
      })
      .join('');
  };

  const searchItems = async (term) => {
    if (inlineAbortController) {
      inlineAbortController.abort();
    }
    inlineAbortController = new AbortController();
    renderSuggestions([], { loading: true });
    try {
      currentItems = await fetchMaterialSuggestionsList(
        dataset,
        term,
        MATERIAL_INLINE_LIMIT,
        inlineAbortController.signal
      );
      renderSuggestions(currentItems);
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('Error al buscar registros (fila):', error);
      renderSuggestions([], { error: 'Error al buscar.' });
    }
  };

  const debouncedSearch = debounce((term) => {
    if (!term) {
      hideSuggestions();
      return;
    }
    searchItems(term);
  }, MATERIAL_SEARCH_DELAY);

  conceptInput.addEventListener('input', (event) => {
    const term = event.target.value.trim();
    debouncedSearch(term);
  });

  conceptInput.addEventListener('focus', () => {
    const term = conceptInput.value.trim();
    if (term) {
      debouncedSearch(term);
    } else if (currentItems.length > 0) {
      renderSuggestions(currentItems);
    }
  });

  conceptInput.addEventListener('blur', () => {
    window.setTimeout(() => {
      hideSuggestions();
    }, 150);
  });

  suggestionList.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });

  suggestionList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-inline-material-index]');
    if (!button) return;
    const index = Number.parseInt(button.dataset.inlineMaterialIndex, 10);
    const material = currentItems[index];
    if (!material) return;
    conceptInput.value = material.name || '';
    const unitCost = getInventoryUnitCost(material);
    unitCostInput.value = Number.isFinite(unitCost) ? unitCost : 0;
    hideSuggestions();
    updateRowTotal(row, sectionKey);
    scheduleSave();
  });
}

function hideMaterialSuggestions() {
  if (!materialSuggestionsEl) return;
  materialSuggestionsEl.hidden = true;
  materialSuggestionsEl.innerHTML = '';
}

function renderMaterialSuggestions(items, options = {}) {
  if (!materialSuggestionsEl) return;
  const { loading = false, error = null, hideWhenEmpty = false } = options;
  if (loading) {
    materialSuggestionsEl.hidden = false;
    materialSuggestionsEl.innerHTML = '<li class="material-suggestions__empty">Buscando materiales…</li>';
    return;
  }
  if (error) {
    materialSuggestionsEl.hidden = false;
    materialSuggestionsEl.innerHTML = `<li class="material-suggestions__empty">${escapeHtml(error)}</li>`;
    return;
  }
  if (!items || items.length === 0) {
    if (hideWhenEmpty) {
      hideMaterialSuggestions();
      return;
    }
    materialSuggestionsEl.hidden = false;
    materialSuggestionsEl.innerHTML =
      '<li class="material-suggestions__empty">Sin coincidencias. Probá con otro término.</li>';
    return;
  }
  materialSuggestionsEl.hidden = false;
  materialSuggestionsEl.innerHTML = items
    .map((item, index) => {
      const priceLabel =
        Number.isFinite(item.price) && item.price !== null ? formatCurrency(item.price) : item.priceRaw || '—';
      return `<li>
        <button type="button" data-material-index="${index}">
          <span class="material-suggestion__name">${escapeHtml(item.name)}</span>
          <span class="material-suggestion__price">${escapeHtml(priceLabel)}</span>
        </button>
      </li>`;
    })
    .join('');
}

async function requestMaterialSuggestions(term = '', options = {}) {
  if (!materialSuggestionsEl) return;
  const { hideWhenEmpty = false } = options;
  if (materialSuggestionsAbortController) {
    materialSuggestionsAbortController.abort();
  }
  materialSuggestionsAbortController = new AbortController();
  renderMaterialSuggestions([], { loading: true });
  try {
    materialSuggestionItems = await fetchMaterialSuggestionsList(
      'materials',
      term,
      MATERIAL_SUGGESTION_LIMIT,
      materialSuggestionsAbortController.signal
    );
    renderMaterialSuggestions(materialSuggestionItems, { hideWhenEmpty });
  } catch (error) {
    if (error.name === 'AbortError') {
      return;
    }
    console.error('Error al buscar materiales:', error);
    renderMaterialSuggestions([], { error: 'No se pudo cargar el catálogo.' });
  }
}

function addMaterialToBudget(material) {
  if (!material) return;
  const unitCost = getInventoryUnitCost(material);
  addBudgetRow('materials', {
    concept: material.name,
    quantity: 1,
    unitCost: Number.isFinite(unitCost) ? unitCost : 0,
  });
}

function setupMaterialSearch() {
  if (!materialSearchInput || !materialSuggestionsEl) return;
  const debouncedSearch = debounce((term) => {
    requestMaterialSuggestions(term, { hideWhenEmpty: term.trim().length === 0 });
  }, MATERIAL_SEARCH_DELAY);

  materialSearchInput.addEventListener('input', (event) => {
    const term = event.target.value.trim();
    if (!term) {
      requestMaterialSuggestions('', { hideWhenEmpty: true });
      return;
    }
    debouncedSearch(term);
  });

  materialSearchInput.addEventListener('focus', () => {
    if (materialSuggestionItems.length === 0) {
      requestMaterialSuggestions(materialSearchInput.value.trim(), { hideWhenEmpty: true });
    } else {
      renderMaterialSuggestions(materialSuggestionItems);
    }
  });

  materialSearchInput.addEventListener('blur', () => {
    window.setTimeout(() => {
      hideMaterialSuggestions();
    }, 150);
  });

  materialSuggestionsEl.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-material-index]');
    if (!button) return;
    const index = Number.parseInt(button.dataset.materialIndex, 10);
    const material = materialSuggestionItems[index];
    if (!material) return;
    addMaterialToBudget(material);
    materialSearchInput.value = '';
    hideMaterialSuggestions();
  });

  requestMaterialSuggestions('', { hideWhenEmpty: true });
}

function collectBudgetData() {
  const payload = {};
  Object.entries(budgetConfig).forEach(([sectionKey, config]) => {
    payload[sectionKey] = Array.from(config.body.querySelectorAll('tr')).map((row) => {
      const conceptInput = row.querySelector('[data-field="concept"]');
      const quantityInput = row.querySelector('[data-field="quantity"]');
      const unitCostInput = row.querySelector('[data-field="unitCost"]');
      return {
        concept: conceptInput.value,
        quantity: parseNumber(quantityInput.value),
        unitCost: parseNumber(unitCostInput.value),
        total: parseNumber(row.dataset.total),
      };
    });
  });
  return payload;
}

function hasMeaningfulRows(rows = []) {
  return rows.some((item) => {
    const concept = String(item.concept || '').trim();
    const quantity = Number(item.quantity || 0);
    const unitCost = Number(item.unitCost || 0);
    const total = Number(item.total || 0);
    return concept && (quantity > 0 || unitCost > 0 || total > 0);
  });
}

const projectFieldLabels = {
  projectName: 'Nombre del proyecto',
  clientName: 'Cliente',
  creationDate: 'Fecha',
  projectMeasure: 'Medidas / Alcance',
  projectLocation: 'Ubicación del proyecto',
};

function validateCatalogReadiness(budgetData) {
  const missingFields = requiredProjectFieldKeys
    .map((key) => ({ key, field: projectFields[key] }))
    .filter(({ field }) => !field || !field.value.trim());

  const missingSections = requiredBudgetSections.filter((sectionKey) => {
    const rows = budgetData[sectionKey] || [];
    return rows.length === 0 || !hasMeaningfulRows(rows);
  });

  if (missingFields.length === 0 && missingSections.length === 0) {
    return { ok: true };
  }

  const messages = [];
  if (missingFields.length > 0) {
    const labels = missingFields.map(({ key }) => projectFieldLabels[key] || key);
    messages.push(`Completa los datos obligatorios: ${labels.join(', ')}.`);
  }
  if (missingSections.length > 0) {
    const sectionLabels = missingSections.map((key) => budgetConfig[key]?.label || key);
    messages.push(`Agregá al menos un registro con valores en: ${sectionLabels.join(', ')}.`);
  }
  messages.push('Si solo necesitás un borrador, descargá el PDF desde el botón correspondiente.');

  let focus = missingFields[0]?.field || null;
  if (!focus && missingSections.length > 0) {
    const sectionConfig = budgetConfig[missingSections[0]];
    if (sectionConfig?.body) {
      focus = sectionConfig.body.querySelector('[data-field="concept"]');
    }
  }

  return {
    ok: false,
    message: messages.join('\n'),
    focus,
  };
}

function updateSummary() {
  const freight = parseNumber(additionalInputs.freight?.value);
  const marginRate = Math.max(0, parseNumber(additionalInputs.marginRate?.value)) / 100;

  summaryValues.materials = budgetConfig.materials.totalValue;
  summaryValues.supplies = budgetConfig.supplies.totalValue;
  summaryValues.labor = budgetConfig.labor.totalValue;
  summaryValues.freight = freight;

  summaryValues.subtotal =
    summaryValues.materials + summaryValues.supplies + summaryValues.labor + summaryValues.freight;
  summaryValues.margin = summaryValues.subtotal * marginRate;
  summaryValues.total = summaryValues.subtotal + summaryValues.margin;

  budgetConfig.materials.summaryEl.textContent = formatCurrency(summaryValues.materials);
  budgetConfig.supplies.summaryEl.textContent = formatCurrency(summaryValues.supplies);
  budgetConfig.labor.summaryEl.textContent = formatCurrency(summaryValues.labor);
  summaryElements.supplies.textContent = formatCurrency(summaryValues.supplies);
  summaryElements.freight.textContent = formatCurrency(summaryValues.freight);
  summaryElements.subtotal.textContent = formatCurrency(summaryValues.subtotal);
  summaryElements.margin.textContent = formatCurrency(summaryValues.margin);
  summaryElements.total.textContent = formatCurrency(summaryValues.total);

  scheduleSave();
}

function resetWorkspace({ resetStorage = true } = {}) {
  Object.values(projectFields).forEach((field) => {
    field.value = '';
  });
  projectFields.companyCuit.value = '20-41679715-4';

  if (additionalInputs.freight) {
    additionalInputs.freight.value = 0;
  }
  if (additionalInputs.marginRate) {
    additionalInputs.marginRate.value = 10;
  }

  Object.entries(budgetConfig).forEach(([sectionKey, config]) => {
    config.body.innerHTML = '';
    config.totalValue = 0;
    config.totalEl.textContent = formatCurrency(0);
    config.summaryEl.textContent = formatCurrency(0);
    addBudgetRow(sectionKey);
  });

  updateSummary();

  if (resetStorage && storageAvailable) {
    window.localStorage.removeItem(storageKey);
  }
}

function clearAll() {
  const confirmClear = window.confirm('¿Deseas eliminar toda la información cargada?');
  if (!confirmClear) return;
  resetWorkspace();
}

function buildReportItems(budgetData = {}) {
  const items = [];
  Object.entries(budgetConfig).forEach(([sectionKey, config]) => {
    const rows = budgetData[sectionKey] || [];
    rows.forEach((item, index) => {
      const hasValues = item.concept || item.quantity || item.unitCost;
      if (!hasValues) return;
      items.push({
        section: config.label,
        concept: item.concept || `${config.label} ${index + 1}`,
        quantity: item.quantity,
        unitCost: item.unitCost,
        total: item.total,
      });
    });
  });
  return items;
}

function createBudgetCode(dateValue) {
  const baseDate = dateValue ? new Date(dateValue) : new Date();
  const year = String(baseDate.getFullYear()).slice(-2);
  const month = String(baseDate.getMonth() + 1).padStart(2, '0');
  const day = String(baseDate.getDate()).padStart(2, '0');
  return `${year}${month}${day}-${String(baseDate.getTime()).slice(-4)}`;
}

function renderBudgetDocument(payload) {
  const project = payload.project || {};
  const additionals = payload.additionals || {};
  const summary = { ...summaryValues, ...(payload.summary || {}) };
  const suppliesValue = Number.isFinite(summary.supplies)
    ? summary.supplies
    : parseNumber(additionals.supplies);
  summary.supplies = suppliesValue;
  const freightValue = Number.isFinite(summary.freight)
    ? summary.freight
    : parseNumber(additionals.freight);
  summary.freight = freightValue;
  const subtotalValue = Number.isFinite(summary.subtotal)
    ? summary.subtotal
    : summary.materials + summary.labor + suppliesValue + freightValue;
  summary.subtotal = subtotalValue;
  const marginRateRaw = Number.isFinite(additionals.marginRate)
    ? additionals.marginRate
    : parseNumber(additionals.marginRate);
  const marginRate = Number.isFinite(marginRateRaw) ? marginRateRaw : 0;
  const marginValue = Number.isFinite(summary.margin) ? summary.margin : subtotalValue * marginRate;
  summary.margin = marginValue;
  summary.total = Number.isFinite(summary.total) ? summary.total : subtotalValue + marginValue;
  const items = buildReportItems(payload.budget || {});

  const brandName = project.companyName || BRAND_INFO.name;
  const brandTagline = project.brandTagline || BRAND_INFO.tagline;
  const brandLogoUrl = project.brandLogo || new URL(BRAND_INFO.logo, window.location.origin).href;
  const projectName = project.projectName || 'Proyecto sin título';
  const clientName = project.clientName || 'Cliente sin nombre';
  const creationDate = formatDate(project.creationDate || payload.generatedAt);
  const budgetCode = createBudgetCode(payload.generatedAt);
  const measure = project.projectMeasure || '—';
  const location = project.projectLocation || '—';
  const phone = project.clientPhone || '—';
  const email = project.clientEmail || '—';
  const companyCuit = project.companyCuit || '20-41679715-4';
  const companyPhone = project.companyPhone || phone || '—';
  const companySocial = project.companySocial || '';
  const companyLocation = project.companyLocation || location || '—';
  const generatedDate = formatDate(payload.generatedAt);
  const marginRateLabel = Number.isFinite(marginRate) ? marginRate : 0;
  const otherDetailsMarkup = createListMarkup(project.otherDetails, 'Sin detalles adicionales.');
  const paymentMethodsMarkup = createListMarkup(project.paymentMethods, 'Sin especificar métodos de pago.');
  const paymentDetailsMarkup = createParagraphMarkup(
    project.paymentDetails,
    'Completa los datos bancarios antes de enviar el presupuesto.'
  );
  const signatureName = project.signatureName || 'Nombre del responsable';
  const signatureRole = project.signatureRole || 'Representante';
  const safeProjectName = escapeHtml(projectName);
  const safeClientName = escapeHtml(clientName);
  const safeMeasure = escapeHtml(measure);
  const safeLocation = escapeHtml(location);
  const safeEmail = escapeHtml(email);
  const safeCompanyLocation = escapeHtml(companyLocation);
  const safeCompanySocial = escapeHtml(companySocial);
  const safeCompanyCuit = escapeHtml(`CUIT: ${companyCuit}`);
  const safeCompanyPhone = escapeHtml(companyPhone);
  const safeBrandName = escapeHtml(brandName);
  const safeBrandTagline = escapeHtml(brandTagline);
  const safeGeneratedDate = escapeHtml(generatedDate);

  const renderItemRow = (item) => {
    const sectionLabel = item.section || '';
    const rowClasses = ['items-row'];
    if (sectionLabel === 'Materiales') {
      rowClasses.push('items-row--materials');
    } else if (sectionLabel === 'Insumos') {
      rowClasses.push('items-row--supplies');
    } else if (sectionLabel === 'Mano de obra') {
      rowClasses.push('items-row--labor');
    }
    const safeSection = escapeHtml(sectionLabel);
    const safeConcept = escapeHtml(item.concept);
    const quantity = quantityFormatter.format(parseNumber(item.quantity) || 0);
    return `<tr class="${rowClasses.join(' ')}" data-section="${safeSection}">
      <td>
        <span class="item__category">${safeSection}</span>
        <span class="item__concept">${safeConcept}</span>
      </td>
      <td>${formatCurrency(item.unitCost)}</td>
      <td>${quantity}</td>
      <td>${formatCurrency(item.total)}</td>
    </tr>`;
  };

  const itemsBodyMarkup =
    items.length > 0
      ? items.map((item) => renderItemRow(item)).join('')
      : '<tr class="items-empty"><td colspan="4">Sin partidas cargadas.</td></tr>';

  const summaryEntries = [
    { label: 'Materiales', value: summary.materials },
    { label: 'Mano de obra', value: summary.labor },
    { label: 'Insumos', value: summary.supplies },
    { label: 'Flete / logística (costo adicional)', value: summary.freight },
    { label: 'Total', value: summary.subtotal, rowClass: 'summary-divider' },
    { label: `Margen (${quantityFormatter.format(marginRateLabel)}%)`, value: summary.margin },
    { label: 'Total + margen', value: summary.total, rowClass: 'summary-highlight' },
  ];

  const summaryFooterMarkup = summaryEntries
    .map((entry) => {
      const rowClasses = ['summary-row'];
      if (entry.rowClass) {
        rowClasses.push(entry.rowClass);
      }
      const safeLabel = escapeHtml(entry.label);
      return `<tr class="${rowClasses.join(' ')}">
        <td class="summary-label">${safeLabel}</td>
        <td class="summary-spacer"></td>
        <td class="summary-spacer"></td>
        <td class="summary-value">${formatCurrency(entry.value)}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Presupuesto - ${safeProjectName}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;500;600;700&family=Montserrat:wght@500;600;700&display=swap');
      :root { color-scheme: light; font-family: 'Lato', 'Montserrat', sans-serif; }
      @page { size: A4; margin: 10mm 10mm 12mm; }
      body {
        margin: 0;
        background: radial-gradient(circle at top left, rgba(15, 63, 70, 0.12), transparent 48%),
          radial-gradient(circle at bottom right, rgba(193, 164, 123, 0.18), transparent 44%),
          #f4f5f6;
        color: #172327;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .document {
        width: 880px;
        max-width: calc(100vw - 32px);
        margin: 16mm auto 12mm;
        background: #fff;
        border-radius: 16px;
        box-shadow: 0 30px 58px rgba(9, 38, 43, 0.16);
        overflow: hidden;
      }
      .hero {
        display: grid;
        grid-template-columns: minmax(260px, 1fr) minmax(320px, 1.4fr);
        gap: 20px;
        padding: 26px 28px 20px;
      }
      .hero__brand {
        background: linear-gradient(155deg, #0f3f46 0%, #123f45 55%, #0a2c31 100%);
        color: #f4efe4;
        padding: 22px 24px;
        border-radius: 14px;
        display: flex;
        align-items: center;
        gap: 1rem;
        min-height: 170px;
      }
      .hero__brand-logo {
        width: 105px;
        height: 105px;
        border-radius: 28px;
        background: rgba(4, 14, 26, 0.35);
        border: 1px solid rgba(255, 255, 255, 0.25);
        padding: 0.35rem;
        box-shadow: inset 0 0 18px rgba(255, 255, 255, 0.15), 0 18px 28px rgba(0, 0, 0, 0.35);
      }
      .hero__brand-logo img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .hero__brand-identity {
        display: grid;
        gap: 0.65rem;
      }
      .hero__brand-identity h1 {
        margin: 0;
        font-family: 'Montserrat', sans-serif;
        font-size: 1.32rem;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        line-height: 1.35;
      }
      .hero__brand-identity p {
        margin: 0;
        letter-spacing: 0.13em;
        text-transform: uppercase;
        font-size: 0.8rem;
        opacity: 0.9;
      }
      .hero__brand-identity span {
        font-size: 0.78rem;
        letter-spacing: 0.06em;
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
      }
      .hero__meta {
        background: linear-gradient(180deg, rgba(15, 63, 70, 0.08) 0%, rgba(255, 255, 255, 0.94) 68%);
        border-radius: 16px;
        padding: 24px 24px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 1rem;
      }
      .hero__meta-header {
        display: grid;
        gap: 0.25rem;
      }
      .hero__title {
        font-family: 'Montserrat', sans-serif;
        text-transform: uppercase;
        letter-spacing: 0.2em;
        font-size: 1.32rem;
        color: #0f3f46;
        margin: 0;
      }
      .hero__code {
        font-family: 'Montserrat', sans-serif;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #c99d3b;
        font-size: 0.78rem;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 0.45rem 0.9rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .meta-grid li {
        display: grid;
        gap: 0.14rem;
      }
      .meta-label {
        font-family: 'Montserrat', sans-serif;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        font-size: 0.64rem;
        color: #6f7b7d;
      }
      .meta-value {
        font-size: 0.86rem;
        font-weight: 600;
      }
      .section {
        padding: 18px 26px 20px;
        border-top: 1px solid rgba(15, 63, 70, 0.1);
        page-break-inside: auto;
        break-inside: auto;
      }
      .section:first-of-type {
        padding-top: 8px;
        margin-top: -6px;
      }
      .section h2 {
        margin: 0 0 0.95rem;
        font-family: 'Montserrat', sans-serif;
        letter-spacing: 0.11em;
        text-transform: uppercase;
        color: #0f3f46;
        font-size: 0.9rem;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 0.85rem;
        page-break-inside: auto;
        font-size: 0.9rem;
      }
      thead {
        background: #0f3f46;
        color: #f4efe4;
      }
      thead th {
        padding: 0.6rem 0.8rem;
        font-family: 'Montserrat', sans-serif;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        font-size: 0.68rem;
        text-align: left;
      }
      tbody tr {
        page-break-inside: avoid;
      }
      tbody td {
        padding: 0.58rem 0.8rem;
        border-bottom: 1px solid rgba(15, 63, 70, 0.08);
        background: rgba(255, 255, 255, 0.97);
        vertical-align: top;
      }
      .items-row td:nth-child(n + 2) {
        text-align: right;
      }
      .items-row--materials td {
        background: rgba(15, 63, 70, 0.05);
      }
      .items-row--supplies td {
        background: rgba(201, 157, 59, 0.12);
      }
      .items-row--labor td {
        background: rgba(17, 70, 82, 0.07);
      }
      .item__category {
        display: block;
        font-size: 0.6rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #4f5a5d;
        margin-bottom: 0.18rem;
      }
      .item__concept {
        font-weight: 600;
      }
      .items-empty td {
        text-align: center;
        font-style: italic;
        background: rgba(255, 255, 255, 0.9);
      }
      .summary-row {
        page-break-inside: avoid;
      }
      .summary-row td {
        padding: 0.6rem 0.2rem;
        border-top: 1px solid rgba(15, 63, 70, 0.08);
        background: rgba(255, 255, 255, 0.95);
      }
      .summary-label {
        display: block;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-family: 'Montserrat', sans-serif;
        font-size: 0.68rem;
        color: #5a6567;
      }
      .summary-spacer {
        border-top: 1px solid rgba(15, 63, 70, 0.08);
      }
      .summary-value {
        text-align: right;
        font-family: 'Montserrat', sans-serif;
        font-weight: 600;
      }
      .summary-divider td {
        padding-top: 0.8rem;
        border-top: 2px solid rgba(15, 63, 70, 0.16);
      }
      .summary-highlight td {
        background: rgba(171, 201, 59, 0.22);
        font-weight: 700;
        color: #0f3f46;
      }
      .details-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 0.75rem 1.1rem;
        margin-top: 1.2rem;
      }
      .details-column h3 {
        margin: 0 0 0.6rem;
        font-family: 'Montserrat', sans-serif;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        font-size: 0.72rem;
        color: #c99d3b;
      }
      .details-column ul {
        margin: 0;
        padding-left: 1rem;
        display: grid;
        gap: 0.3rem;
        font-size: 0.9rem;
      }
      .details-column p {
        margin: 0.25rem 0;
        font-size: 0.9rem;
      }
      .signature-block {
        margin-top: 1.4rem;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        max-width: 260px;
      }
      .signature-line {
        height: 1px;
        background: rgba(15, 63, 70, 0.4);
        margin: 0.65rem 0 0.32rem;
      }
      .signature-name {
        font-family: 'Montserrat', sans-serif;
        font-weight: 600;
      }
      .signature-role {
        font-size: 0.82rem;
        color: #5a6567;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .footer {
        padding: 0 26px 24px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 0.8rem;
        font-size: 0.8rem;
        color: #5a6567;
        border-top: 1px solid rgba(15, 63, 70, 0.1);
        background: linear-gradient(180deg, rgba(244, 239, 233, 0.4) 0%, rgba(255, 255, 255, 0.95) 100%);
      }
      .footer strong {
        display: block;
        color: #0f3f46;
        margin-bottom: 0.2rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 0.78rem;
      }
      .footer span {
        display: block;
        margin-bottom: 0.2rem;
      }
      @media print {
        body { background: #fff; }
        .document { box-shadow: none; margin: 0 auto; width: auto; max-width: none; border-radius: 0; }
        .hero { padding: 18px 20px; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 14px; }
        .hero__brand { padding: 20px 20px; min-height: 150px; flex-direction: column; text-align: center; }
        .hero__brand-logo { margin: 0 auto; }
        .hero__brand-identity { text-align: center; }
        .hero__meta { padding: 22px 22px; }
        .section { padding: 18px 22px; page-break-inside: auto; break-inside: auto; }
        table { font-size: 0.86em; }
        thead { display: table-header-group; }
        tbody tr { page-break-inside: avoid; }
        thead th { padding: 0.55rem 0.7rem; }
        tbody td { padding: 0.55rem 0.7rem; }
        tfoot .summary-row td { padding: 0.4rem 0; }
        .details-grid { gap: 0.9rem 1.4rem; margin-top: 1.3rem; }
        .signature-block { margin-top: 1.4rem; }
        .footer { padding: 0 22px 22px; }
      }
    </style>
  </head>
  <body>
    <div class="document">
      <header class="hero">
        <div class="hero__brand">
          <div class="hero__brand-logo">
            <img src="${brandLogoUrl}" alt="${safeBrandName} logo" />
          </div>
          <div class="hero__brand-identity">
            <h1>${safeBrandName}</h1>
            <p>${safeBrandTagline}</p>
            <span>${safeCompanyCuit}</span>
          </div>
        </div>
        <div class="hero__meta">
          <div class="hero__meta-header">
            <p class="hero__title">Presupuesto</p>
            <p class="hero__code">N° ${budgetCode}</p>
          </div>
          <ul class="meta-grid">
            <li>
              <span class="meta-label">Fecha</span>
              <span class="meta-value">${escapeHtml(creationDate)}</span>
            </li>
            <li>
              <span class="meta-label">Proyecto</span>
              <span class="meta-value">${safeProjectName}</span>
            </li>
            <li>
              <span class="meta-label">Cliente</span>
              <span class="meta-value">${safeClientName}</span>
            </li>
            <li>
              <span class="meta-label">Medidas / Alcance</span>
              <span class="meta-value">${safeMeasure}</span>
            </li>
            <li>
              <span class="meta-label">Ubicación</span>
              <span class="meta-value">${safeLocation}</span>
            </li>
          </ul>
        </div>
      </header>

      <section class="section">
        <h2>Detalle</h2>
        <table class="report-table">
          <thead>
            <tr>
              <th>Descripción</th>
              <th>Precio unitario</th>
              <th>Cantidad</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>${itemsBodyMarkup}</tbody>
          <tfoot>${summaryFooterMarkup}</tfoot>
        </table>
        <div class="details-grid">
          <div class="details-column">
            <h3>Otros detalles</h3>
            <ul>${otherDetailsMarkup}</ul>
          </div>
          <div class="details-column">
            <h3>Métodos de pago</h3>
            <ul>${paymentMethodsMarkup}</ul>
          </div>
          <div class="details-column">
            <h3>Datos de pago</h3>
            ${paymentDetailsMarkup}
          </div>
        </div>
        <div class="signature-block">
          <div class="signature-line"></div>
          <span class="signature-name">${escapeHtml(signatureName)}</span>
          <span class="signature-role">${escapeHtml(signatureRole)}</span>
        </div>
      </section>

      <footer class="footer">
        <div>
          <strong>Contacto</strong>
          <span>📞 ${safeCompanyPhone}</span>
          <span>✉️ ${safeEmail}</span>
        </div>
        <div>
          <strong>Ubicación</strong>
          <span>📍 ${safeCompanyLocation}</span>
          <span>📅 Emitido: ${safeGeneratedDate}</span>
        </div>
        ${
          companySocial
            ? `<div>
                <strong>Redes</strong>
                <span>📸 Instagram: ${safeCompanySocial}</span>
              </div>`
            : ''
        }
      </footer>
    </div>
    <script>
      window.addEventListener('load', () => {
        setTimeout(() => window.print(), 150);
      });
    </script>
  </body>
</html>`;
}

function downloadBudget() {
  updateSummary();

  const data = {
    project: getProjectData(),
    budget: collectBudgetData(),
    additionals: getAdditionals(),
    summary: { ...summaryValues },
    generatedAt: new Date().toISOString(),
  };

  const reportWindow = window.open('', '_blank', 'width=900,height=1200');
  if (!reportWindow) {
    window.alert('Activa las ventanas emergentes para poder descargar el PDF.');
    return;
  }

  const reportHtml = renderBudgetDocument(data);
  reportWindow.document.open();
  reportWindow.document.write(reportHtml);
  reportWindow.document.close();
  reportWindow.focus();
}

function sanitizeFileName(fileName) {
  return String(fileName || 'archivo')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_.-]/g, '')
    .replace(/-+/g, '-')
    .slice(-120) || `archivo-${Date.now()}`;
}

async function uploadFileToDrive(file, folder) {
  const targetEndpoint = driveUploadConfig.endpoint;
  if (!targetEndpoint) {
    throw new Error('Servicio de subida no configurado.');
  }
  const cleanName = sanitizeFileName(file.name);
  const folderPrefix = folder ? `${folder}/` : '';
  const fileName = `${folderPrefix}${Date.now()}-${cleanName}`;
  const formData = new FormData();
  formData.append('filename', fileName);
  formData.append('file', file);
  if (folder) {
    formData.append('category', folder);
  }

  const response = await fetch(targetEndpoint, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText || `Error HTTP ${response.status}`);
  }

  const result = await response.json();
  if (!result || result.ok !== true) {
    throw new Error(result?.error || 'Respuesta inválida de Apps Script.');
  }

  return {
    name: result.name || fileName,
    viewUrl: result.url,
    downloadUrl: result.download || result.url,
  };
}

function resetCatalogForm() {
  catalogEditingId = null;
  catalogSubmitButton.textContent = 'Guardar presupuesto actual';
  catalogForm.classList.remove('is-editing');
  Object.values(catalogFields).forEach((field) => {
    field.value = '';
  });
  setCatalogMedia('images', []);
  setCatalogMedia('documents', []);
  if (catalogImageUrlInput) catalogImageUrlInput.value = '';
  if (catalogDocumentUrlInput) catalogDocumentUrlInput.value = '';
}

function renderCatalog() {
  catalogCountEl.textContent = catalogEntries.length;

  if (catalogLoading) {
    catalogEmptyState.style.display = 'none';
    catalogListEl.innerHTML =
      '<p class="catalog-loading">Cargando plantillas guardadas…</p>';
    return;
  }

  if (catalogLoadError) {
    catalogEmptyState.style.display = 'none';
    catalogListEl.innerHTML = `<p class="catalog-error">${escapeHtml(catalogLoadError)}</p>`;
    return;
  }

  if (catalogEntries.length === 0) {
    catalogListEl.innerHTML = '';
    catalogEmptyState.style.display = 'block';
    return;
  }

  catalogEmptyState.style.display = 'none';
  catalogListEl.innerHTML = '';

  catalogEntries.forEach((entry) => {
    const card = document.createElement('article');
    card.className = 'catalog-card catalog-card--compact';
    card.dataset.id = entry.id;

    const updatedLabel = entry.updatedAt ? formatDate(entry.updatedAt) : formatDate(entry.createdAt);
    const totalValue = entry.summary ? formatCurrency(entry.summary.total) : formatCurrency(0);
    const attachmentsMeta = [];
    if (Array.isArray(entry.images) && entry.images.length) {
      attachmentsMeta.push(`${entry.images.length} img`);
    }
    if (Array.isArray(entry.documents) && entry.documents.length) {
      attachmentsMeta.push(`${entry.documents.length} doc`);
    }
    const attachmentsText = attachmentsMeta.length ? attachmentsMeta.join(' · ') : 'Sin adjuntos';
    const encodedId = encodeURIComponent(entry.id);
    const detailUrl = `catalog-detail.html?id=${encodedId}`;

    card.innerHTML = `
      <div class="catalog-card__header">
        <h4 class="catalog-card__title">${escapeHtml(entry.name)}</h4>
        <span class="catalog-card__badge">${escapeHtml(entry.category || 'Sin categoría')}</span>
      </div>
      <div class="catalog-card__meta">
        <span>Actualizado: ${escapeHtml(updatedLabel)}</span>
        <span>Total estimado: <strong>${totalValue}</strong></span>
        <span>${escapeHtml(attachmentsText)}</span>
      </div>
      <div class="catalog-card__actions">
        <a href="${detailUrl}" class="button button--ghost">Ver detalle</a>
        <button type="button" class="button" data-action="apply" data-id="${entry.id}">Aplicar</button>
        <button type="button" class="button button--ghost" data-action="edit" data-id="${entry.id}">Editar</button>
        <button type="button" class="button button--secondary" data-action="delete" data-id="${entry.id}">Eliminar</button>
      </div>
    `;

    catalogListEl.appendChild(card);
  });
}

async function handleCatalogSubmit(event) {
  event.preventDefault();
  const nameValue = catalogFields.name.value.trim() || projectFields.projectName.value.trim();
  if (!nameValue) {
    window.alert('Ingresa un nombre para la plantilla o completa el nombre del proyecto.');
    catalogFields.name.focus();
    return;
  }

  updateSummary();
  const budgetData = collectBudgetData();
  const validation = validateCatalogReadiness(budgetData);
  if (!validation.ok) {
    window.alert(validation.message);
    if (validation.focus && typeof validation.focus.focus === 'function') {
      validation.focus.focus({ preventScroll: true });
      if (typeof validation.focus.scrollIntoView === 'function') {
        validation.focus.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    return;
  }

  const payload = {
    name: nameValue,
    category: catalogFields.category.value.trim(),
    description: catalogFields.description.value.trim(),
    images: [...catalogImages],
    documents: [...catalogDocuments],
    project: getProjectData(),
    budget: {
      materials: budgetData.materials || [],
      supplies: budgetData.supplies || [],
      labor: budgetData.labor || [],
    },
    additionals: getAdditionals(),
    summary: { ...summaryValues },
  };

  if (catalogEditingId) {
    payload.id = catalogEditingId;
  }

  catalogSubmitButton.disabled = true;
  try {
    const savedEntry = await persistCatalogEntry(payload, Boolean(catalogEditingId));
    await refreshCatalogEntries();
    resetCatalogForm();
    window.location.href = `catalog-detail.html?id=${encodeURIComponent(savedEntry.id)}`;
  } catch (error) {
    console.error('Error al guardar la plantilla.', error);
    window.alert(error.message || 'No se pudo guardar la plantilla.');
  } finally {
    catalogSubmitButton.disabled = false;
  }
}

function handleCatalogCancel() {
  resetCatalogForm();
}

function fillCatalogForm(entry) {
  catalogFields.name.value = entry.name || '';
  catalogFields.category.value = entry.category || '';
  catalogFields.description.value = entry.description || '';
  setCatalogMedia('images', entry.images || (entry.image ? [entry.image] : []));
  setCatalogMedia('documents', entry.documents || (entry.plan ? [entry.plan] : []));
  catalogEditingId = entry.id;
  catalogSubmitButton.textContent = 'Actualizar plantilla';
  catalogForm.classList.add('is-editing');
  catalogFields.name.focus();
}

function applyCatalogEntry(entry) {
  if (!entry) return;

  resetWorkspace({ resetStorage: false });

  Object.entries(projectFields).forEach(([key, field]) => {
    field.value = entry.project?.[key] ?? '';
  });

  if (additionalInputs.freight) {
    additionalInputs.freight.value = entry.additionals?.freight ?? 0;
  }
  if (additionalInputs.marginRate) {
    additionalInputs.marginRate.value = entry.additionals?.marginRate ?? 10;
  }

  Object.entries(budgetConfig).forEach(([sectionKey, config]) => {
    config.body.innerHTML = '';
    const rows = entry.budget?.[sectionKey] || [];
    if (rows.length > 0) {
      rows.forEach((item) => addBudgetRow(sectionKey, item));
    } else if (sectionKey === 'supplies') {
      const legacySupplies = parseNumber(entry.additionals?.supplies);
      if (legacySupplies > 0) {
        addBudgetRow(sectionKey, {
          concept: 'Insumos adicionales',
          quantity: 1,
          unitCost: legacySupplies,
        });
      } else {
        addBudgetRow(sectionKey);
      }
    } else {
      addBudgetRow(sectionKey);
    }
    updateSectionTotals(sectionKey);
  });

  updateSummary();
  scheduleSave();
  saveToStorage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function applyEntryFromSession() {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  const raw = window.sessionStorage.getItem('catalogEntryToApply');
  if (!raw) return;
  try {
    const entry = JSON.parse(raw);
    if (entry && typeof entry === 'object') {
      applyCatalogEntry(entry);
      window.alert('Plantilla aplicada al presupuesto.');
    }
  } catch (error) {
    console.warn('No se pudo aplicar la plantilla enviada desde el detalle.', error);
  } finally {
    window.sessionStorage.removeItem('catalogEntryToApply');
  }
}

async function handleCatalogListClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  const entry = catalogEntries.find((item) => item.id === id);

  if (!entry) return;

  if (action === 'apply') {
    applyCatalogEntry(entry);
  } else if (action === 'edit') {
    applyCatalogEntry(entry);
    fillCatalogForm(entry);
  } else if (action === 'delete') {
    const confirmDelete = window.confirm(
      `¿Eliminar la plantilla "${entry.name}" del catálogo?`
    );
    if (!confirmDelete) return;

    try {
      await removeCatalogEntry(id);
      if (catalogEditingId === id) {
        resetCatalogForm();
      }
      await refreshCatalogEntries();
    } catch (error) {
      console.error('Error al eliminar la plantilla.', error);
      window.alert(error.message || 'No se pudo eliminar la plantilla.');
    }
  }
}

function handleSaveCatalogShortcut() {
  const catalogSection = document.getElementById('catalogo');
  if (catalogSection) {
    catalogSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (!catalogFields.name.value.trim() && projectFields.projectName.value.trim()) {
    catalogFields.name.value = projectFields.projectName.value.trim();
  }
  catalogFields.name.focus();
}

function toggleUploadButtonState(target, isLoading) {
  const button = document.querySelector(`[data-upload-target="${target}"]`);
  if (!button) return;
  button.disabled = isLoading;
  button.classList.toggle('is-loading', isLoading);
  if (isLoading) {
    button.dataset.originalText = button.dataset.originalText || button.textContent;
    button.textContent = 'Subiendo...';
  } else if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
    delete button.dataset.originalText;
  }
}

async function handleCatalogFileUpload(target, file) {
  const list = getMediaState(target);
  if (Array.isArray(list) && list.length >= MAX_MEDIA_ITEMS) {
    window.alert(`Puedes agregar hasta ${MAX_MEDIA_ITEMS} archivos en esta sección.`);
    return;
  }

  const folder = target === 'documents' ? 'project_documents' : 'project_images';
  toggleUploadButtonState(target, true);
  try {
    const { downloadUrl, viewUrl } = await uploadFileToDrive(file, folder);
    const urlToUse = downloadUrl || viewUrl;
    addMediaUrl(target, urlToUse);
    window.alert('Archivo cargado correctamente.');
  } catch (error) {
    console.error('Error al subir archivo.', error);
    window.alert('No se pudo subir el archivo. Revisa la consola para más detalles.');
  } finally {
    toggleUploadButtonState(target, false);
  }
}

function setupCatalogUploads() {
  const normalizeTarget = (value) => (value === 'documents' || value === 'document' ? 'documents' : 'images');

  catalogUploadButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (!driveUploadConfig.endpoint) {
        window.alert('El servicio de carga no está disponible en este momento.');
        return;
      }
      const target = normalizeTarget(button.dataset.uploadTarget);
      const input = catalogFileInputs[target];
      if (input) {
        input.click();
      }
    });
  });

  Object.entries(catalogFileInputs).forEach(([target, input]) => {
    if (!input) return;
    input.addEventListener('change', async () => {
      const files = Array.from(input.files || []);
      if (files.length === 0) return;
      for (const file of files) {
        if (getMediaState(target).length >= MAX_MEDIA_ITEMS) {
          window.alert(`Puedes agregar hasta ${MAX_MEDIA_ITEMS} archivos en esta sección.`);
          break;
        }
        // eslint-disable-next-line no-await-in-loop
        await handleCatalogFileUpload(target, file);
      }
      input.value = '';
    });
  });
}

function setupCatalogMediaControls() {
  catalogMediaAddButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const type = button.dataset.mediaAdd === 'document' ? 'documents' : 'images';
      handleMediaAdd(type);
    });
  });

  if (catalogImageUrlInput) {
    catalogImageUrlInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleMediaAdd('images');
      }
    });
  }

  if (catalogDocumentUrlInput) {
    catalogDocumentUrlInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleMediaAdd('documents');
      }
    });
  }

  if (catalogImagesListEl) {
    catalogImagesListEl.addEventListener('click', handleMediaListClick);
  }
  if (catalogDocumentsListEl) {
    catalogDocumentsListEl.addEventListener('click', handleMediaListClick);
  }
}

function initialize() {
  try {
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    storageAvailable = true;
  } catch (error) {
    storageAvailable = false;
  }

  setupMaterialSearch();
  document.querySelectorAll('[data-action="add-row"]').forEach((button) => {
    const sectionKey = button.dataset.section;
    button.addEventListener('click', () => addBudgetRow(sectionKey));
  });

  Object.keys(budgetConfig).forEach((sectionKey) => {
    if (budgetConfig[sectionKey].body.children.length === 0) {
      addBudgetRow(sectionKey);
    }
  });

  Object.values(projectFields).forEach((field) => {
    field.addEventListener('input', scheduleSave);
  });

  Object.values(additionalInputs).forEach((input) => {
    input.addEventListener('input', () => {
      updateSummary();
      scheduleSave();
    });
  });

  downloadButton.addEventListener('click', downloadBudget);
  clearButton.addEventListener('click', clearAll);
  saveCatalogButton.addEventListener('click', handleSaveCatalogShortcut);
  catalogForm.addEventListener('submit', handleCatalogSubmit);
  catalogCancelButton.addEventListener('click', handleCatalogCancel);
  catalogListEl.addEventListener('click', handleCatalogListClick);

  setupCatalogMediaControls();
  setupCatalogUploads();

  renderMediaList('images');
  renderMediaList('documents');

  const navToggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.app-nav');
  if (navToggle && nav) {
    const navClose = nav.querySelector('.app-nav__close');
    const firstNavLink = nav.querySelector('.app-nav__list a');
    const desktopQuery = window.matchMedia('(min-width: 961px)');

    const openNavigation = () => {
      navToggle.setAttribute('aria-expanded', 'true');
      nav.classList.add('app-nav--open');
      document.body.classList.add('nav-open');
      const focusTarget = firstNavLink || navClose;
      if (focusTarget) {
        window.requestAnimationFrame(() => {
          focusTarget.focus();
        });
      }
    };

    const closeNavigation = ({ returnFocus = true } = {}) => {
      navToggle.setAttribute('aria-expanded', 'false');
      nav.classList.remove('app-nav--open');
      document.body.classList.remove('nav-open');
      if (returnFocus) {
        navToggle.focus();
      }
    };

    const toggleNavigation = () => {
      const isOpen = nav.classList.contains('app-nav--open');
      if (isOpen) {
        closeNavigation();
      } else {
        openNavigation();
      }
    };

    navToggle.addEventListener('click', toggleNavigation);

    if (navClose) {
      navClose.addEventListener('click', () => closeNavigation());
    }

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        if (!desktopQuery.matches) {
          closeNavigation({ returnFocus: false });
        }
      });
    });

    const handleDesktopChange = (event) => {
      if (event.matches) {
        closeNavigation({ returnFocus: false });
      }
    };

    if (typeof desktopQuery.addEventListener === 'function') {
      desktopQuery.addEventListener('change', handleDesktopChange);
    } else if (typeof desktopQuery.addListener === 'function') {
      desktopQuery.addListener(handleDesktopChange);
    }

    handleDesktopChange(desktopQuery);
  }

  loadFromStorage();
  updateSummary();
  refreshCatalogEntries().finally(applyEntryFromSession);
}

document.addEventListener('DOMContentLoaded', initialize);
