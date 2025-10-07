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
  image: document.getElementById('catalogImage'),
  description: document.getElementById('catalogDescription'),
  plan: document.getElementById('catalogPlan'),
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

const catalogStorageKey = 'ulises-construcciones-catalog-v1';
let catalogEntries = [];
let catalogEditingId = null;

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

function createCatalogId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `catalog-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
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
      :root { color-scheme: light; font-family: 'Lato', 'Montserrat', sans-serif; }
      body {
        margin: 0;
        background: #f1ece4;
        color: #172327;
      }
      .document {
        max-width: 900px;
        margin: 3rem auto;
        background: #fff;
        box-shadow: 0 30px 60px rgba(15, 63, 70, 0.18);
      }
      .hero {
        display: flex;
        flex-wrap: wrap;
      }
      .hero__brand {
        background: #0f3f46;
        color: #f4efe4;
        padding: 32px 30px;
        width: 280px;
        display: flex;
        flex-direction: column;
        gap: 1.1rem;
      }
      .hero__brand h1 {
        margin: 0;
        font-family: 'Montserrat', sans-serif;
        font-size: 1.3rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .hero__brand p {
        margin: 0;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        font-size: 0.82rem;
      }
      .hero__brand span {
        font-size: 0.82rem;
        letter-spacing: 0.04em;
      }
      .hero__meta {
        flex: 1;
        padding: 34px 40px;
        background: linear-gradient(180deg, rgba(15, 63, 70, 0.06) 0%, rgba(255, 255, 255, 0.95) 55%);
        display: grid;
        gap: 1.1rem;
      }
      .hero__title {
        font-family: 'Montserrat', sans-serif;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        font-size: 1.8rem;
        color: #0f3f46;
        margin: 0;
      }
      .hero__code {
        font-family: 'Montserrat', sans-serif;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #c99d3b;
        font-size: 0.9rem;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 0.6rem 1.2rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .meta-grid li {
        display: grid;
        gap: 0.25rem;
      }
      .meta-label {
        font-family: 'Montserrat', sans-serif;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 0.72rem;
        color: #708083;
      }
      .meta-value {
        font-size: 0.98rem;
      }
      .section {
        padding: 32px 40px;
        border-top: 1px solid rgba(15, 63, 70, 0.08);
      }
      .section h2 {
        margin: 0 0 1.4rem;
        font-family: 'Montserrat', sans-serif;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #0f3f46;
        font-size: 1rem;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      thead th {
        background: #0f3f46;
        color: #f4efe4;
        padding: 0.85rem 1rem;
        font-family: 'Montserrat', sans-serif;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 0.75rem;
        text-align: left;
      }
      tbody td {
        padding: 0.85rem 1rem;
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
        font-size: 0.7rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #6d7d80;
        margin-bottom: 0.2rem;
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
        margin-top: 1.6rem;
      }
      .summary-table tr td:first-child {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-family: 'Montserrat', sans-serif;
        font-size: 0.78rem;
        color: #5a6567;
      }
      .summary-table td {
        padding: 0.75rem 0.2rem;
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
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 1.4rem 2rem;
        margin-top: 2.4rem;
      }
      .details-column h3 {
        margin: 0 0 0.8rem;
        font-family: 'Montserrat', sans-serif;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        font-size: 0.82rem;
        color: #c99d3b;
      }
      .details-column ul {
        margin: 0;
        padding-left: 1.1rem;
        display: grid;
        gap: 0.35rem;
        font-size: 0.92rem;
      }
      .details-column p {
        margin: 0.35rem 0;
        font-size: 0.92rem;
      }
      .signature-block {
        margin-top: 2.4rem;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        max-width: 320px;
      }
      .signature-line {
        height: 1px;
        background: rgba(15, 63, 70, 0.4);
        margin: 1rem 0 0.4rem;
      }
      .signature-name {
        font-family: 'Montserrat', sans-serif;
        font-weight: 600;
      }
      .signature-role {
        font-size: 0.85rem;
        color: #5a6567;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .footer {
        padding: 0 40px 40px;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        font-size: 0.85rem;
        color: #5a6567;
      }
      .footer strong {
        display: block;
        color: #0f3f46;
        margin-bottom: 0.2rem;
      }
      @media print {
        body { background: #fff; }
        .document { box-shadow: none; margin: 0; }
        .section { page-break-inside: avoid; }
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

function resetCatalogForm() {
  catalogEditingId = null;
  catalogSubmitButton.textContent = 'Guardar presupuesto actual';
  catalogForm.classList.remove('is-editing');
  Object.values(catalogFields).forEach((field) => {
    field.value = '';
  });
}

function loadCatalogFromStorage() {
  if (!storageAvailable) return;
  const stored = window.localStorage.getItem(catalogStorageKey);
  if (!stored) return;

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      catalogEntries = parsed;
    }
  } catch (error) {
    console.warn('No se pudo cargar el catálogo guardado.', error);
  }
}

function saveCatalogToStorage() {
  if (!storageAvailable) return;
  try {
    window.localStorage.setItem(catalogStorageKey, JSON.stringify(catalogEntries));
  } catch (error) {
    console.warn('No se pudo guardar el catálogo.', error);
  }
}

function renderCatalog() {
  catalogCountEl.textContent = catalogEntries.length;
  if (catalogEntries.length === 0) {
    catalogEmptyState.style.display = 'block';
    catalogListEl.innerHTML = '';
    return;
  }

  catalogEmptyState.style.display = 'none';
  catalogListEl.innerHTML = '';

  catalogEntries.forEach((entry) => {
    const card = document.createElement('article');
    card.className = 'catalog-card';
    card.dataset.id = entry.id;

    let mediaMarkup = '';
    if (entry.image) {
      const safeImage = escapeHtml(entry.image);
      const safeAlt = escapeHtml(entry.name || 'Proyecto');
      mediaMarkup = `<img src="${safeImage}" alt="${safeAlt}" class="catalog-card__image" onerror="this.replaceWith(Object.assign(document.createElement('div'), {className: 'catalog-card__placeholder', textContent: 'SIN IMG'}));" />`;
    } else {
      mediaMarkup = '<div class="catalog-card__placeholder">SIN IMAGEN</div>';
    }

    const planMarkup = entry.plan
      ? `<a class="catalog-card__link" href="${escapeHtml(entry.plan)}" target="_blank" rel="noopener">Ver plano / documentación</a>`
      : '';

    const totalValue = entry.summary ? formatCurrency(entry.summary.total) : formatCurrency(0);
    const updatedLabel = entry.updatedAt ? formatDate(entry.updatedAt) : formatDate(entry.createdAt);

    card.innerHTML = `
      ${mediaMarkup}
      <div class="catalog-card__body">
        <h4 class="catalog-card__title">${escapeHtml(entry.name)}</h4>
        <div class="catalog-card__meta">
          <span>Categoria: <strong>${escapeHtml(entry.category || 'Sin categoría')}</strong></span>
          <span>Total: <strong>${totalValue}</strong></span>
          <span>Actualizado: ${escapeHtml(updatedLabel)}</span>
        </div>
        <p class="catalog-card__description">${escapeHtml(entry.description || 'Sin descripción.')}</p>
        ${planMarkup}
        <div class="catalog-card__actions">
          <button type="button" class="button" data-action="apply" data-id="${entry.id}">Aplicar al presupuesto</button>
          <button type="button" class="button button--ghost" data-action="edit" data-id="${entry.id}">Editar</button>
          <button type="button" class="button button--secondary" data-action="delete" data-id="${entry.id}">Eliminar</button>
        </div>
      </div>
    `;

    catalogListEl.appendChild(card);
  });
}

function handleCatalogSubmit(event) {
  event.preventDefault();
  const nameValue = catalogFields.name.value.trim() || projectFields.projectName.value.trim();
  if (!nameValue) {
    window.alert('Ingresa un nombre para la plantilla o completa el nombre del proyecto.');
    catalogFields.name.focus();
    return;
  }

  const entry = {
    id: catalogEditingId || createCatalogId(),
    name: nameValue,
    category: catalogFields.category.value.trim(),
    description: catalogFields.description.value.trim(),
    image: catalogFields.image.value.trim(),
    plan: catalogFields.plan.value.trim(),
    project: getProjectData(),
    budget: collectBudgetData(),
    additionals: getAdditionals(),
    summary: { ...summaryValues },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (catalogEditingId) {
    const index = catalogEntries.findIndex((item) => item.id === catalogEditingId);
    if (index !== -1) {
      entry.createdAt = catalogEntries[index].createdAt || entry.createdAt;
      catalogEntries[index] = entry;
    }
  } else {
    catalogEntries.unshift(entry);
  }

  saveCatalogToStorage();
  renderCatalog();
  resetCatalogForm();
  window.alert('Plantilla guardada en el catálogo.');
}

function handleCatalogCancel() {
  resetCatalogForm();
}

function fillCatalogForm(entry) {
  catalogFields.name.value = entry.name || '';
  catalogFields.category.value = entry.category || '';
  catalogFields.description.value = entry.description || '';
  catalogFields.image.value = entry.image || '';
  catalogFields.plan.value = entry.plan || '';
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

function handleCatalogListClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const id = button.dataset.id;
  const entry = catalogEntries.find((item) => item.id === id);
  if (!entry) return;

  const action = button.dataset.action;

  if (action === 'apply') {
    applyCatalogEntry(entry);
  } else if (action === 'edit') {
    fillCatalogForm(entry);
  } else if (action === 'delete') {
    const confirmDelete = window.confirm(`¿Eliminar la plantilla "${entry.name}" del catálogo?`);
    if (!confirmDelete) return;
    catalogEntries = catalogEntries.filter((item) => item.id !== id);
    saveCatalogToStorage();
    renderCatalog();
    if (catalogEditingId === id) {
      resetCatalogForm();
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
  }

  loadFromStorage();
  loadCatalogFromStorage();
  renderCatalog();
  updateSummary();
}

document.addEventListener('DOMContentLoaded', initialize);
