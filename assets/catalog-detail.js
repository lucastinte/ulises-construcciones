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

const params = new URLSearchParams(window.location.search);
const entryId = params.get('id');

const detailRoot = document.getElementById('detailRoot');
const detailStatus = document.getElementById('detailStatus');
const applyButton = document.getElementById('detailApplyButton');

let currentEntry = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(value) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  if (date && !Number.isNaN(date.getTime())) {
    return reportDateFormatter.format(date);
  }
  return reportDateFormatter.format(new Date());
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
        value: `${marginRateValue.toFixed(2).replace(/\\.00$/, '')}%`,
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

function renderEntry(entry) {
  currentEntry = entry;
  const project = entry.project || {};
  const summaryMarkup = buildSummaryMarkup(entry);
  const materials = Array.isArray(entry.budget?.materials) ? entry.budget.materials : [];
  const labor = Array.isArray(entry.budget?.labor) ? entry.budget.labor : [];
  const projectDetails = buildDefinitionList([
    { label: 'Proyecto', value: project.projectName },
    { label: 'Cliente', value: project.clientName },
    { label: 'Ubicación', value: project.projectLocation },
    { label: 'Fecha', value: project.creationDate ? formatDate(project.creationDate) : '' },
    { label: 'Medidas / Alcance', value: project.projectMeasure },
    { label: 'Contacto', value: project.clientPhone },
    { label: 'Correo', value: project.clientEmail },
  ]);

  const images = Array.isArray(entry.images)
    ? entry.images
    : entry.image
    ? [entry.image]
    : [];
  const documents = Array.isArray(entry.documents)
    ? entry.documents
    : entry.plan
    ? [entry.plan]
    : [];

  const imagesMarkup = images.length
    ? `
        <div class="catalog-detail__gallery">
          ${images
            .map(
              (url, index) => `
                <figure>
                  <img src="${escapeHtml(url)}" alt="Imagen ${index + 1} - ${escapeHtml(entry.name)}" loading="lazy" />
                </figure>
              `
            )
            .join('')}
        </div>
      `
    : '<p class="catalog-detail__empty">Sin imágenes asociadas.</p>';

  const documentsMarkup = documents.length
    ? `
        <ul class="catalog-detail__documents">
          ${documents
            .map((url, index) => {
              const name = escapeHtml(getFileDisplayName(url, `Documento ${index + 1}`));
              return `
                <li>
                  <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="catalog-detail__link">
                    ${name}
                  </a>
                </li>
              `;
            })
            .join('')}
        </ul>
      `
    : '<p class="catalog-detail__empty">Sin documentación adjunta.</p>';

  detailRoot.innerHTML = `
    <header class="catalog-detail__header">
      <h1>${escapeHtml(entry.name)}</h1>
      <div class="catalog-detail__tags">
        <span>${escapeHtml(entry.category || 'Sin categoría')}</span>
        <span>${escapeHtml(
          entry.updatedAt ? `Actualizado ${formatDate(entry.updatedAt)}` : `Creado ${formatDate(entry.createdAt)}`
        )}</span>
      </div>
      ${
        entry.description
          ? `<p class="catalog-detail__description">${escapeHtml(entry.description)}</p>`
          : ''
      }
    </header>
    <section>
      <h2>Resumen económico</h2>
      ${summaryMarkup}
    </section>
    <section>
      <h2>Información del proyecto</h2>
      ${projectDetails}
    </section>
    <section>
      <h2>Materiales</h2>
      ${buildBudgetList(materials, 'Sin materiales registrados.')}
    </section>
    <section>
      <h2>Mano de obra</h2>
      ${buildBudgetList(labor, 'Sin mano de obra registrada.')}
    </section>
    <section>
      <h2>Adjuntos</h2>
      <div class="catalog-detail__attachments">
        <div>
          <h6>Imágenes</h6>
          ${imagesMarkup}
        </div>
        <div>
          <h6>Documentos</h6>
          ${documentsMarkup}
        </div>
      </div>
    </section>
  `;

  detailRoot.hidden = false;
  detailStatus.hidden = true;
  if (applyButton) {
    applyButton.disabled = false;
  }
  document.title = `${entry.name} · Catálogo - Ulises Construcciones`;
}

function showError(message) {
  detailRoot.hidden = true;
  detailStatus.hidden = false;
  detailStatus.textContent = message;
  if (applyButton) {
    applyButton.disabled = true;
  }
}

async function loadEntry() {
  if (!entryId) {
    showError('Falta el identificador de la plantilla.');
    return;
  }
  detailStatus.hidden = false;
  detailStatus.textContent = 'Cargando plantilla…';
  try {
    const response = await fetch(`/api/catalog/${encodeURIComponent(entryId)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Error HTTP ${response.status}`);
    }
    if (!data || data.ok !== true || !data.item) {
      throw new Error('No se pudo obtener la plantilla solicitada.');
    }
    renderEntry(data.item);
  } catch (error) {
    console.error('No se pudo cargar la plantilla.', error);
    showError(error.message || 'No se pudo cargar la plantilla.');
  }
}

if (applyButton) {
  applyButton.addEventListener('click', () => {
    if (!currentEntry) return;
    try {
      window.sessionStorage.setItem('catalogEntryToApply', JSON.stringify(currentEntry));
    } catch (error) {
      console.warn('No se pudo preparar la plantilla para aplicar.', error);
    }
    window.location.href = 'index.html';
  });
}

loadEntry();
