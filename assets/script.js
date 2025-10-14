const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 2,
});

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
  labor: {
    body: document.getElementById('laborBody'),
    totalEl: document.getElementById('laborTotal'),
    summaryEl: document.getElementById('summaryLabor'),
    templateId: 'labor-row-template',
    label: 'Mano de obra',
    totalValue: 0,
  },
};

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
  supplies: document.getElementById('suppliesInput'),
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

const MAX_MEDIA_ITEMS = 5;

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
      const displayName = escapeHtml(
        getFileDisplayName(url, type === 'images' ? `Imagen ${index + 1}` : `Documento ${index + 1}`)
      );
      if (type === 'images') {
        return `
          <div class="catalog-media-list__item" data-type="images" data-index="${index}">
            <div class="catalog-media-list__preview">
              <img src="${safeUrl}" alt="Imagen ${index + 1}" loading="lazy" onerror="this.src='';this.closest('.catalog-media-list__item').classList.add('catalog-media-list__item--broken');" />
            </div>
            <div class="catalog-media-list__info">
              <span class="catalog-media-list__url" title="${safeUrl}">${displayName}</span>
              <button type="button" class="catalog-media-list__remove" data-media-remove="images" data-index="${index}" aria-label="Quitar imagen ${index + 1}">Quitar</button>
            </div>
          </div>
        `;
      }
      return `
        <div class="catalog-media-list__item" data-type="documents" data-index="${index}">
          <div class="catalog-media-list__preview catalog-media-list__preview--doc">PDF</div>
          <div class="catalog-media-list__info">
            <span class="catalog-media-list__url" title="${safeUrl}">${displayName}</span>
            <button type="button" class="catalog-media-list__remove" data-media-remove="documents" data-index="${index}" aria-label="Quitar documento ${index + 1}">Quitar</button>
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
    { label: 'Flete', value: formatCurrency(summary.freight ?? additionals.freight ?? 0) },
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
      (payload.budget?.[sectionKey] || []).forEach((item) => {
        addBudgetRow(sectionKey, item);
      });
      if (config.body.children.length === 0) {
        addBudgetRow(sectionKey);
      }
      updateSectionTotals(sectionKey);
    });

    if (payload.additionals) {
      additionalInputs.supplies.value = payload.additionals.supplies ?? 0;
      additionalInputs.freight.value = payload.additionals.freight ?? 0;
      additionalInputs.marginRate.value = payload.additionals.marginRate ?? 10;
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
    supplies: parseNumber(additionalInputs.supplies.value),
    freight: parseNumber(additionalInputs.freight.value),
    marginRate: parseNumber(additionalInputs.marginRate.value),
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
  quantityInput.value = data.quantity ?? 0;
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

  return row;
}

function addBudgetRow(sectionKey, data) {
  const config = budgetConfig[sectionKey];
  const row = createBudgetRow(sectionKey, data);
  config.body.appendChild(row);
  updateRowTotal(row, sectionKey);
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

function updateSummary() {
  const supplies = parseNumber(additionalInputs.supplies.value);
  const freight = parseNumber(additionalInputs.freight.value);
  const marginRate = Math.max(0, parseNumber(additionalInputs.marginRate.value)) / 100;

  summaryValues.materials = budgetConfig.materials.totalValue;
  summaryValues.labor = budgetConfig.labor.totalValue;
  summaryValues.supplies = supplies;
  summaryValues.freight = freight;

  summaryValues.subtotal =
    summaryValues.materials + summaryValues.labor + summaryValues.supplies + summaryValues.freight;
  summaryValues.margin = summaryValues.subtotal * marginRate;
  summaryValues.total = summaryValues.subtotal + summaryValues.margin;

  budgetConfig.materials.summaryEl.textContent = formatCurrency(summaryValues.materials);
  budgetConfig.labor.summaryEl.textContent = formatCurrency(summaryValues.labor);
  summaryElements.supplies.textContent = formatCurrency(summaryValues.supplies);
  summaryElements.freight.textContent = formatCurrency(summaryValues.freight);
  summaryElements.subtotal.textContent = formatCurrency(summaryValues.subtotal);
  summaryElements.margin.textContent = formatCurrency(summaryValues.margin);
  summaryElements.total.textContent = formatCurrency(summaryValues.total);

  scheduleSave();
}

function clearAll() {
  const confirmClear = window.confirm('¿Deseas eliminar toda la información cargada?');
  if (!confirmClear) return;

  Object.values(projectFields).forEach((field) => {
    field.value = '';
  });
  projectFields.companyCuit.value = '20-41679715-4';

  additionalInputs.supplies.value = 0;
  additionalInputs.freight.value = 0;
  additionalInputs.marginRate.value = 10;

  Object.entries(budgetConfig).forEach(([sectionKey, config]) => {
    config.body.innerHTML = '';
    config.totalValue = 0;
    config.totalEl.textContent = formatCurrency(0);
    config.summaryEl.textContent = formatCurrency(0);
    addBudgetRow(sectionKey);
  });

  updateSummary();

  if (storageAvailable) {
    window.localStorage.removeItem(storageKey);
  }
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
  const summary = payload.summary || summaryValues;
  const items = buildReportItems(payload.budget || {});

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
  const marginRate = Number.isFinite(additionals.marginRate)
    ? additionals.marginRate
    : parseNumber(additionals.marginRate);
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
  const safeCompanyPhone = escapeHtml(companyPhone);
  const safeGeneratedDate = escapeHtml(generatedDate);

  const itemsMarkup =
    items.length > 0
      ? items
          .map(
            (item) => `<tr>
              <td>
                <span class="item__category">${escapeHtml(item.section)}</span>
                <span class="item__concept">${escapeHtml(item.concept)}</span>
              </td>
              <td>${formatCurrency(item.unitCost)}</td>
              <td>${quantityFormatter.format(parseNumber(item.quantity) || 0)}</td>
              <td>${formatCurrency(item.total)}</td>
            </tr>`
          )
          .join('')
      : '<tr class="items-empty"><td colspan="4">Sin partidas cargadas.</td></tr>';

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Presupuesto - ${safeProjectName}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;500;600;700&family=Montserrat:wght@500;600;700&display=swap');
      :root { color-scheme: light; font-family: 'Lato', 'Montserrat', sans-serif; }
      @page { size: A4; margin: 12mm 12mm 14mm; }
      body {
        margin: 0;
        background: radial-gradient(circle at top left, rgba(15, 63, 70, 0.12), transparent 48%),
          radial-gradient(circle at bottom right, rgba(193, 164, 123, 0.18), transparent 44%),
          #f4f5f6;
        color: #172327;
      }
      .document {
        width: calc(210mm - 24mm);
        max-width: calc(100vw - 40px);
        margin: 16mm auto;
        background: #fff;
        border-radius: 10px;
        box-shadow: 0 34px 68px rgba(9, 38, 43, 0.2);
        overflow: hidden;
      }
      .hero {
        display: flex;
        flex-wrap: wrap;
        padding: 28px 34px 22px;
      }
      .hero__brand {
        background: #0f3f46;
        color: #f4efe4;
        padding: 26px 24px;
        width: 260px;
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
      }
      .hero__brand h1 {
        margin: 0;
        font-family: 'Montserrat', sans-serif;
        font-size: 1.22rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .hero__brand p {
        margin: 0;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        font-size: 0.78rem;
      }
      .hero__brand span {
        font-size: 0.78rem;
        letter-spacing: 0.04em;
      }
      .hero__meta {
        flex: 1;
        padding: 24px 30px;
        background: linear-gradient(180deg, rgba(15, 63, 70, 0.06) 0%, rgba(255, 255, 255, 0.95) 55%);
        display: grid;
        gap: 0.9rem;
      }
      .hero__title {
        font-family: 'Montserrat', sans-serif;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        font-size: 1.6rem;
        color: #0f3f46;
        margin: 0;
      }
      .hero__code {
        font-family: 'Montserrat', sans-serif;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #c99d3b;
        font-size: 0.85rem;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 0.55rem 1rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .meta-grid li {
        display: grid;
        gap: 0.22rem;
      }
      .meta-label {
        font-family: 'Montserrat', sans-serif;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 0.68rem;
        color: #708083;
      }
      .meta-value {
        font-size: 0.94rem;
      }
      .section {
        padding: 26px 34px;
        border-top: 1px solid rgba(15, 63, 70, 0.08);
      }
      .section h2 {
        margin: 0 0 1.2rem;
        font-family: 'Montserrat', sans-serif;
        letter-spacing: 0.11em;
        text-transform: uppercase;
        color: #0f3f46;
        font-size: 0.95rem;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      thead th {
        background: #0f3f46;
        color: #f4efe4;
        padding: 0.7rem 0.85rem;
        font-family: 'Montserrat', sans-serif;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 0.72rem;
        text-align: left;
      }
      tbody td {
        padding: 0.68rem 0.85rem;
        border-bottom: 1px solid rgba(15, 63, 70, 0.08);
      }
      tbody tr:nth-child(even) td {
        background: rgba(242, 239, 233, 0.6);
      }
      td:nth-child(2),
      td:nth-child(3),
      td:nth-child(4) {
        text-align: right;
      }
      .item__category {
        display: block;
        font-size: 0.68rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #6d7d80;
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
      .summary-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1.4rem;
      }
      .summary-table tr td:first-child {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-family: 'Montserrat', sans-serif;
        font-size: 0.75rem;
        color: #5a6567;
      }
      .summary-table td {
        padding: 0.6rem 0.2rem;
        border-bottom: 1px solid rgba(15, 63, 70, 0.08);
      }
      .summary-table td:last-child {
        text-align: right;
        font-family: 'Montserrat', sans-serif;
      }
      .summary-highlight td {
        background: rgba(171, 201, 59, 0.2);
        font-weight: 700;
      }
      .details-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1.1rem 1.6rem;
        margin-top: 2rem;
      }
      .details-column h3 {
        margin: 0 0 0.6rem;
        font-family: 'Montserrat', sans-serif;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        font-size: 0.8rem;
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
        margin-top: 2rem;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        max-width: 300px;
      }
      .signature-line {
        height: 1px;
        background: rgba(15, 63, 70, 0.4);
        margin: 0.8rem 0 0.35rem;
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
        padding: 0 34px 34px;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        font-size: 0.82rem;
        color: #5a6567;
      }
      .footer strong {
        display: block;
        color: #0f3f46;
        margin-bottom: 0.2rem;
      }
      @media print {
        body { background: #fff; }
        .document { box-shadow: none; margin: 0 auto; width: auto; max-width: none; border-radius: 0; }
        .hero { padding: 18px 20px 14px; }
        .hero__brand { padding: 18px 18px; width: 220px; gap: 0.7rem; }
        .hero__meta { padding: 18px 22px; gap: 0.7rem; }
        .section { padding: 18px 22px; page-break-inside: avoid; }
        table { font-size: 0.92em; }
        thead th { padding: 0.55rem 0.7rem; }
        tbody td { padding: 0.55rem 0.7rem; }
        .summary-table { margin-top: 1.1rem; }
        .summary-table td { padding: 0.4rem 0; }
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
          <h1>Ulises Construcciones</h1>
          <p>Soluciones residenciales</p>
          <span>CUIT: ${escapeHtml(companyCuit)}</span>
        </div>
        <div class="hero__meta">
          <div>
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
        <table>
          <thead>
            <tr>
              <th>Descripción</th>
              <th>Precio unitario</th>
              <th>Cantidad</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>${itemsMarkup}</tbody>
        </table>
        <table class="summary-table">
          <tbody>
            <tr>
              <td>Materiales</td>
              <td>${formatCurrency(summary.materials)}</td>
            </tr>
            <tr>
              <td>Mano de obra</td>
              <td>${formatCurrency(summary.labor)}</td>
            </tr>
            <tr>
              <td>Insumos</td>
              <td>${formatCurrency(summary.supplies)}</td>
            </tr>
            <tr>
              <td>Flete</td>
              <td>${formatCurrency(summary.freight)}</td>
            </tr>
            <tr>
              <td>Total</td>
              <td>${formatCurrency(summary.subtotal)}</td>
            </tr>
            <tr>
              <td>Margen (${quantityFormatter.format(marginRateLabel)}%)</td>
              <td>${formatCurrency(summary.margin)}</td>
            </tr>
            <tr class="summary-highlight">
              <td>Total + margen</td>
              <td>${formatCurrency(summary.total)}</td>
            </tr>
          </tbody>
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
          <span>Tel: ${safeCompanyPhone}</span>
          ${companySocial ? `<span>Redes: ${safeCompanySocial}</span>` : ''}
          <span>Email: ${safeEmail}</span>
        </div>
        <div>
          <strong>Emitido</strong>
          <span>${safeGeneratedDate}</span>
          <span>Ubicación: ${safeCompanyLocation}</span>
        </div>
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

  const budgetData = collectBudgetData();
  const payload = {
    name: nameValue,
    category: catalogFields.category.value.trim(),
    description: catalogFields.description.value.trim(),
    images: [...catalogImages],
    documents: [...catalogDocuments],
    project: getProjectData(),
    budget: {
      materials: budgetData.materials || [],
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

  Object.entries(projectFields).forEach(([key, field]) => {
    field.value = entry.project?.[key] ?? '';
  });

  additionalInputs.supplies.value = entry.additionals?.supplies ?? 0;
  additionalInputs.freight.value = entry.additionals?.freight ?? 0;
  additionalInputs.marginRate.value = entry.additionals?.marginRate ?? 10;

  Object.entries(budgetConfig).forEach(([sectionKey, config]) => {
    config.body.innerHTML = '';
    const rows = entry.budget?.[sectionKey] || [];
    if (rows.length === 0) {
      addBudgetRow(sectionKey);
    } else {
      rows.forEach((item) => addBudgetRow(sectionKey, item));
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
    const toggleNavigation = () => {
      const isOpen = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!isOpen));
      nav.classList.toggle('app-nav--open', !isOpen);
      document.body.classList.toggle('nav-open', !isOpen);
    };

    navToggle.addEventListener('click', toggleNavigation);

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        if (window.matchMedia('(max-width: 720px)').matches) {
          navToggle.setAttribute('aria-expanded', 'false');
          nav.classList.remove('app-nav--open');
          document.body.classList.remove('nav-open');
        }
      });
    });

    const desktopQuery = window.matchMedia('(min-width: 961px)');
    const handleDesktopChange = (event) => {
      if (event.matches) {
        navToggle.setAttribute('aria-expanded', 'false');
        nav.classList.remove('app-nav--open');
        document.body.classList.remove('nav-open');
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
