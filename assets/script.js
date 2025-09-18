const formatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});

const budgetConfig = {
  materials: {
    body: document.getElementById('materialsBody'),
    totalEl: document.getElementById('materialsTotal'),
    summaryEl: document.getElementById('summaryMaterials'),
    totalValue: 0,
  },
  labor: {
    body: document.getElementById('laborBody'),
    totalEl: document.getElementById('laborTotal'),
    summaryEl: document.getElementById('summaryLabor'),
    totalValue: 0,
  },
  subcontracts: {
    body: document.getElementById('subcontractsBody'),
    totalEl: document.getElementById('subcontractsTotal'),
    summaryEl: document.getElementById('summarySubcontracts'),
    totalValue: 0,
  },
  others: {
    body: document.getElementById('othersBody'),
    totalEl: document.getElementById('othersTotal'),
    summaryEl: document.getElementById('summaryOthers'),
    totalValue: 0,
  },
};

const summarySubtotalEl = document.getElementById('summarySubtotal');
const summaryTaxEl = document.getElementById('summaryTax');
const summaryTotalEl = document.getElementById('summaryTotal');
const summaryValues = {
  subtotal: 0,
  tax: 0,
  total: 0,
};
const taxRateInput = document.getElementById('taxRate');
const downloadButton = document.getElementById('downloadJson');
const clearButton = document.getElementById('clearData');
const addScheduleButton = document.querySelector('[data-action="add-schedule"]');
const scheduleBody = document.getElementById('scheduleBody');

const projectFields = {
  projectName: document.getElementById('projectName'),
  clientName: document.getElementById('clientName'),
  clientEmail: document.getElementById('clientEmail'),
  clientPhone: document.getElementById('clientPhone'),
  projectLocation: document.getElementById('projectLocation'),
  creationDate: document.getElementById('creationDate'),
  responsable: document.getElementById('responsable'),
  projectStatus: document.getElementById('projectStatus'),
  duration: document.getElementById('duration'),
  exchangeRate: document.getElementById('exchangeRate'),
  scope: document.getElementById('scope'),
  notes: document.getElementById('notes'),
  links: document.getElementById('links'),
};

const storageKey = 'ulises-construcciones-budget-v1';
let storageAvailable = false;
let saveTimeout;

try {
  const testKey = '__storage_test__';
  window.localStorage.setItem(testKey, testKey);
  window.localStorage.removeItem(testKey);
  storageAvailable = true;
} catch (error) {
  storageAvailable = false;
}

function formatCurrency(value) {
  return formatter.format(Number.isFinite(value) ? value : 0);
}

function parseNumber(value) {
  const number = parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function updateRowTotal(row, sectionKey) {
  const [conceptInput, quantityInput, unitInput, unitCostInput] = row.querySelectorAll('input');
  const output = row.querySelector('output');
  const quantity = parseNumber(quantityInput.value);
  const unitCost = parseNumber(unitCostInput.value);
  const total = quantity * unitCost;

  output.value = formatCurrency(total);
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

  updateSummary();
}

function updateSummary() {
  let subtotal = 0;
  Object.values(budgetConfig).forEach((config) => {
    subtotal += config.totalValue || 0;
  });

  const taxRate = parseNumber(taxRateInput.value) / 100;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  summaryValues.subtotal = subtotal;
  summaryValues.tax = tax;
  summaryValues.total = total;

  summarySubtotalEl.textContent = formatCurrency(subtotal);
  summaryTaxEl.textContent = formatCurrency(tax);
  summaryTotalEl.textContent = formatCurrency(total);

  scheduleSave();
}

function createBudgetRow(sectionKey, data = {}) {
  const template = document.getElementById('budget-row-template');
  const row = template.content.firstElementChild.cloneNode(true);
  const [conceptInput, quantityInput, unitInput, unitCostInput] = row.querySelectorAll('input');
  const removeButton = row.querySelector('[data-action="remove-row"]');

  conceptInput.value = data.concept || '';
  quantityInput.value = data.quantity ?? 0;
  unitInput.value = data.unit || '';
  unitCostInput.value = data.unitCost ?? 0;

  const handleInput = () => updateRowTotal(row, sectionKey);

  quantityInput.addEventListener('input', handleInput);
  unitCostInput.addEventListener('input', handleInput);
  conceptInput.addEventListener('input', scheduleSave);
  unitInput.addEventListener('input', scheduleSave);

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

function createScheduleRow(data = {}) {
  const template = document.getElementById('schedule-row-template');
  const row = template.content.firstElementChild.cloneNode(true);
  const [activityInput, responsableInput, startInput, endInput] = row.querySelectorAll('input');
  const statusSelect = row.querySelector('select');
  const removeButton = row.querySelector('[data-action="remove-row"]');

  activityInput.value = data.activity || '';
  responsableInput.value = data.responsable || '';
  startInput.value = data.startDate || '';
  endInput.value = data.endDate || '';
  statusSelect.value = data.status || 'pendiente';

  const handleInput = scheduleSave;

  [activityInput, responsableInput, startInput, endInput, statusSelect].forEach((element) => {
    element.addEventListener('input', handleInput);
    element.addEventListener('change', handleInput);
  });

  removeButton.addEventListener('click', () => {
    row.remove();
    scheduleSave();
  });

  return row;
}

function addScheduleRow(data) {
  const row = createScheduleRow(data);
  scheduleBody.appendChild(row);
}

function collectBudgetData() {
  const data = {};

  Object.entries(budgetConfig).forEach(([sectionKey, config]) => {
    data[sectionKey] = Array.from(config.body.querySelectorAll('tr')).map((row) => {
      const [conceptInput, quantityInput, unitInput, unitCostInput] = row.querySelectorAll('input');
      const output = row.querySelector('output');

      return {
        concept: conceptInput.value,
        quantity: parseNumber(quantityInput.value),
        unit: unitInput.value,
        unitCost: parseNumber(unitCostInput.value),
        total: parseNumber(row.dataset.total),
        totalFormatted: output.value,
      };
    });
  });

  return data;
}

function collectScheduleData() {
  return Array.from(scheduleBody.querySelectorAll('tr')).map((row) => {
    const [activityInput, responsableInput, startInput, endInput] = row.querySelectorAll('input');
    const statusSelect = row.querySelector('select');

    return {
      activity: activityInput.value,
      responsable: responsableInput.value,
      startDate: startInput.value,
      endDate: endInput.value,
      status: statusSelect.value,
    };
  });
}

function getProjectData() {
  const data = {};
  Object.entries(projectFields).forEach(([key, field]) => {
    data[key] = field.value;
  });
  const taxRate = parseNumber(taxRateInput.value);
  const subtotal = Object.values(budgetConfig).reduce((acc, config) => acc + (config.totalValue || 0), 0);
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  data.taxRate = taxRate;
  data.summary = {
    materials: budgetConfig.materials.totalValue,
    labor: budgetConfig.labor.totalValue,
    subcontracts: budgetConfig.subcontracts.totalValue,
    others: budgetConfig.others.totalValue,
    subtotal,
    tax,
    total,
  };
  return data;
}

function scheduleSave() {
  if (!storageAvailable) return;
  window.clearTimeout(saveTimeout);
  saveTimeout = window.setTimeout(saveToStorage, 400);
}

function saveToStorage() {
  if (!storageAvailable) return;
  const payload = {
    project: getProjectData(),
    budget: collectBudgetData(),
    schedule: collectScheduleData(),
    savedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch (error) {
    console.error('No se pudo guardar la información en el navegador.', error);
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

    if (payload.project && typeof payload.project.taxRate !== 'undefined') {
      taxRateInput.value = payload.project.taxRate;
    }

    Object.entries(budgetConfig).forEach(([sectionKey, config]) => {
      config.body.innerHTML = '';
      (payload.budget?.[sectionKey] || []).forEach((item) => {
        addBudgetRow(sectionKey, item);
      });
      updateSectionTotals(sectionKey);
    });

    scheduleBody.innerHTML = '';
    (payload.schedule || []).forEach((item) => addScheduleRow(item));
    if (!payload.schedule || payload.schedule.length === 0) {
      addScheduleRow();
    }

    updateSummary();
  } catch (error) {
    console.error('No se pudo cargar la información guardada.', error);
  }
}

function clearAll() {
  const confirmClear = window.confirm('¿Deseas eliminar toda la información capturada?');
  if (!confirmClear) return;

  Object.values(projectFields).forEach((field) => {
    field.value = '';
  });
  projectFields.projectStatus.value = 'borrador';
  taxRateInput.value = 16;

  Object.entries(budgetConfig).forEach(([sectionKey, config]) => {
    config.body.innerHTML = '';
    config.totalValue = 0;
    config.totalEl.textContent = formatCurrency(0);
    config.summaryEl.textContent = formatCurrency(0);
    addBudgetRow(sectionKey);
  });

  scheduleBody.innerHTML = '';
  addScheduleRow();
  updateSummary();

  if (storageAvailable) {
    window.localStorage.removeItem(storageKey);
  }
}

function downloadBudget() {
  const data = {
    project: getProjectData(),
    budget: collectBudgetData(),
    schedule: collectScheduleData(),
    generatedAt: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const fileName = `${projectFields.projectName.value || 'presupuesto-ulises'}-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function initialize() {
  document.querySelectorAll('[data-action="add-row"]').forEach((button) => {
    const sectionKey = button.dataset.section;
    button.addEventListener('click', () => addBudgetRow(sectionKey));
  });

  Object.keys(budgetConfig).forEach((sectionKey) => {
    if (budgetConfig[sectionKey].body.children.length === 0) {
      addBudgetRow(sectionKey);
    }
  });

  addScheduleButton.addEventListener('click', () => addScheduleRow());
  if (scheduleBody.children.length === 0) {
    addScheduleRow();
  }

  taxRateInput.addEventListener('input', updateSummary);
  downloadButton.addEventListener('click', downloadBudget);
  clearButton.addEventListener('click', clearAll);

  Object.values(projectFields).forEach((field) => {
    field.addEventListener('input', scheduleSave);
    field.addEventListener('change', scheduleSave);
  });

  loadFromStorage();
  updateSummary();
}

document.addEventListener('DOMContentLoaded', initialize);
