import express from 'express';
import multer from 'multer';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const MAX_UPLOAD_MB = Number.parseInt(process.env.MAX_UPLOAD_MB || '15', 10);
const UPLOAD_LIMIT_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;
const MATERIAL_DEFAULT_CURRENCY = process.env.MATERIAL_CURRENCY
  ? String(process.env.MATERIAL_CURRENCY).trim().toUpperCase() || 'ARS'
  : 'ARS';
const MATERIAL_IMPORT_ROW_LIMIT = Math.max(
  100,
  Math.min(Number.parseInt(process.env.MATERIAL_IMPORT_ROW_LIMIT || '2000', 10), 5000)
);
const MATERIAL_QUERY_LIMIT = Math.max(
  5,
  Math.min(Number.parseInt(process.env.MATERIAL_QUERY_LIMIT || '30', 10), 100)
);

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const uploadsDir = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const dbPath = path.join(DATA_DIR, 'storage.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stored_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    logical_name TEXT,
    category TEXT,
    mime_type TEXT,
    size INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS catalog_entries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    description TEXT,
    image TEXT,
    plan TEXT,
    images_json TEXT,
    documents_json TEXT,
    project_json TEXT,
    budget_json TEXT,
    additionals_json TEXT,
    summary_json TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

const ensureCatalogColumn = (columnName) => {
  const exists = db
    .prepare("SELECT 1 FROM pragma_table_info('catalog_entries') WHERE name = ?")
    .get(columnName);
  if (!exists) {
    db.exec(`ALTER TABLE catalog_entries ADD COLUMN ${columnName} TEXT`);
  }
};

ensureCatalogColumn('images_json');
ensureCatalogColumn('documents_json');

const insertFileStmt = db.prepare(`
  INSERT INTO files (stored_name, original_name, logical_name, category, mime_type, size)
  VALUES (@storedName, @originalName, @logicalName, @category, @mimeType, @size)
`);

const latestFilesStmt = db.prepare(`
  SELECT id, stored_name, original_name, logical_name, category, mime_type, size, created_at
  FROM files
  ORDER BY datetime(created_at) DESC
  LIMIT @limit
`);

const searchFilesStmt = db.prepare(`
  SELECT id, stored_name, original_name, logical_name, category, mime_type, size, created_at
  FROM files
  WHERE lower(COALESCE(logical_name, original_name)) LIKE lower(@prefix) || '%'
  ORDER BY datetime(created_at) DESC
  LIMIT @limit
`);

const listCatalogEntriesStmt = db.prepare(`
  SELECT id, name, category, description, image, plan, images_json, documents_json, project_json, budget_json, additionals_json, summary_json, created_at, updated_at
  FROM catalog_entries
  ORDER BY datetime(updated_at) DESC
  LIMIT @limit
`);

const getCatalogEntryStmt = db.prepare(`
  SELECT id, name, category, description, image, plan, images_json, documents_json, project_json, budget_json, additionals_json, summary_json, created_at, updated_at
  FROM catalog_entries
  WHERE id = @id
`);

const insertCatalogEntryStmt = db.prepare(`
  INSERT INTO catalog_entries (
    id, name, category, description, image, plan, images_json, documents_json,
    project_json, budget_json, additionals_json, summary_json,
    created_at, updated_at
  ) VALUES (
    @id, @name, @category, @description, @image, @plan, @imagesJson, @documentsJson,
    @projectJson, @budgetJson, @additionalsJson, @summaryJson,
    datetime('now'), datetime('now')
  )
`);

const updateCatalogEntryStmt = db.prepare(`
  UPDATE catalog_entries SET
    name = @name,
    category = @category,
    description = @description,
    image = @image,
    plan = @plan,
    images_json = @imagesJson,
    documents_json = @documentsJson,
    project_json = @projectJson,
    budget_json = @budgetJson,
    additionals_json = @additionalsJson,
    summary_json = @summaryJson,
    updated_at = datetime('now')
  WHERE id = @id
`);

const deleteCatalogEntryStmt = db.prepare(`
  DELETE FROM catalog_entries WHERE id = @id
`);

const countCatalogEntriesStmt = db.prepare(`SELECT COUNT(*) AS total FROM catalog_entries`);

const createInventoryModel = (tableName) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      price_cents INTEGER,
      price_raw TEXT,
      currency TEXT,
      last_imported_at TEXT,
      extra_json TEXT
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_${tableName}_normalized ON ${tableName} (normalized_name);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_${tableName}_last_imported ON ${tableName} (last_imported_at);`);

  const findByNormalizedNameStmt = db.prepare(
    `SELECT id FROM ${tableName} WHERE normalized_name = @normalizedName`
  );
  const insertStmt = db.prepare(`
    INSERT INTO ${tableName} (
      name, normalized_name, price_cents, price_raw, currency, last_imported_at, extra_json
    ) VALUES (
      @name, @normalizedName, @priceCents, @priceRaw, @currency, @lastImportedAt, @extraJson
    )
  `);
  const importUpdateStmt = db.prepare(`
    UPDATE ${tableName} SET
      name = @name,
      price_cents = @priceCents,
      price_raw = @priceRaw,
      currency = @currency,
      last_imported_at = @lastImportedAt,
      extra_json = @extraJson
    WHERE id = @id
  `);
  const manualUpdateStmt = db.prepare(`
    UPDATE ${tableName} SET
      name = @name,
      normalized_name = @normalizedName,
      price_cents = @priceCents,
      price_raw = @priceRaw,
      currency = @currency,
      last_imported_at = @lastImportedAt,
      extra_json = @extraJson
    WHERE id = @id
  `);
  const listRecentStmt = db.prepare(`
    SELECT id, name, price_cents, price_raw, currency, last_imported_at, extra_json
    FROM ${tableName}
    ORDER BY
      CASE WHEN last_imported_at IS NULL THEN 1 ELSE 0 END,
      last_imported_at DESC,
      name ASC
    LIMIT @limit
  `);
  const searchStmt = db.prepare(`
    SELECT id, name, price_cents, price_raw, currency, last_imported_at, extra_json
    FROM ${tableName}
    WHERE normalized_name LIKE @pattern
    ORDER BY name ASC
    LIMIT @limit
  `);
  const listPaginatedStmt = db.prepare(`
    SELECT id, name, price_cents, price_raw, currency, last_imported_at, extra_json
    FROM ${tableName}
    ORDER BY name ASC
    LIMIT @limit OFFSET @offset
  `);
  const getByIdStmt = db.prepare(`
    SELECT id, name, price_cents, price_raw, currency, last_imported_at, extra_json
    FROM ${tableName}
    WHERE id = @id
  `);
  const countStmt = db.prepare(`SELECT COUNT(*) AS total FROM ${tableName}`);

  const saveTransaction = db.transaction((items) => {
    let inserted = 0;
    let updated = 0;
    items.forEach((item) => {
      const existing = findByNormalizedNameStmt.get({ normalizedName: item.normalizedName });
      if (existing) {
        importUpdateStmt.run({ ...item, id: existing.id });
        updated += 1;
      } else {
        insertStmt.run(item);
        inserted += 1;
      }
    });
    return { inserted, updated };
  });

  return {
    tableName,
    findByNormalizedNameStmt,
    insertStmt,
    importUpdateStmt,
    manualUpdateStmt,
    listRecentStmt,
    searchStmt,
    listPaginatedStmt,
    getByIdStmt,
    countStmt,
    saveTransaction,
  };
};

const inventoryModels = {
  materials: createInventoryModel('materials'),
  supplies: createInventoryModel('supplies'),
  labor: createInventoryModel('labor_items'),
};

const inventoryMeta = {
  materials: { label: 'Materiales', path: 'materials' },
  supplies: { label: 'Insumos', path: 'supplies' },
  labor: { label: 'Mano de obra', path: 'labor' },
};

const sanitizeName = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const sanitizeText = (value) => String(value ?? '').trim();

const sanitizeUrlList = (value, maxItems) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(item))
    .filter(Boolean)
    .slice(0, maxItems);
};

const stripDiacritics = (value) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const normalizeMaterialName = (value) => {
  const base = sanitizeName(value);
  if (!base) return '';
  return stripDiacritics(base).toLowerCase();
};

const sanitizeCurrency = (value) => {
  const upper = sanitizeText(value).toUpperCase();
  if (!upper) return MATERIAL_DEFAULT_CURRENCY;
  return upper.length > 6 ? upper.slice(0, 6) : upper;
};

const parseJsonField = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
};

const resolveUrl = (value, req) => {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) {
    return `${req.protocol}://${req.get('host')}${value}`;
  }
  return value;
};

const toCatalogEntry = (row, req) => {
  if (!row) return null;
  const summary = parseJsonField(row.summary_json) || {};
  const imageUrl = resolveUrl(row.image, req) || null;
  const planUrl = resolveUrl(row.plan, req) || null;
  const imagesRaw = parseJsonField(row.images_json);
  const documentsRaw = parseJsonField(row.documents_json);
  const images = Array.isArray(imagesRaw) ? imagesRaw : [];
  const documents = Array.isArray(documentsRaw) ? documentsRaw : [];
  if (images.length === 0 && imageUrl) {
    images.push(imageUrl);
  }
  if (documents.length === 0 && planUrl) {
    documents.push(planUrl);
  }
  const resolvedImages = images.map((item) => resolveUrl(item, req));
  const resolvedDocuments = documents.map((item) => resolveUrl(item, req));
  const budgetRaw = parseJsonField(row.budget_json) || {};
  const budget = {
    materials: Array.isArray(budgetRaw.materials) ? budgetRaw.materials : [],
    supplies: Array.isArray(budgetRaw.supplies) ? budgetRaw.supplies : [],
    labor: Array.isArray(budgetRaw.labor) ? budgetRaw.labor : [],
  };
  const additionals = parseJsonField(row.additionals_json) || {};
  const suppliesFromBudget = budget.supplies.reduce((acc, item) => {
    const value = Number.parseFloat(item?.total ?? 0);
    return Number.isFinite(value) ? acc + value : acc;
  }, 0);
  const summarySuppliesNumber = Number.parseFloat(summary.supplies);
  if (!Number.isFinite(summarySuppliesNumber) && suppliesFromBudget > 0) {
    summary.supplies = suppliesFromBudget;
  }
  const additionalsSuppliesNumber = Number.parseFloat(additionals.supplies);
  if (!Number.isFinite(additionalsSuppliesNumber) && suppliesFromBudget > 0) {
    additionals.supplies = suppliesFromBudget;
  }

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    project: parseJsonField(row.project_json) || {},
    budget,
    additionals,
    summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    image: imageUrl,
    plan: planUrl,
    images: resolvedImages,
    documents: resolvedDocuments,
  };
};

const isMeaningfulCell = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim().length > 0;
  return false;
};

const normalizeRowValues = (row = []) =>
  row.map((cell) => {
    if (typeof cell === 'string') return cell.trim();
    if (typeof cell === 'number' && Number.isFinite(cell)) return cell;
    return cell ?? '';
  });

const parsePriceValue = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return {
      cents: Math.round(value * 100),
      raw: String(value),
    };
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numericPart = trimmed.replace(/[^\d,.-]/g, '').replace(/\s+/g, '');
  if (!numericPart) return null;
  const hasComma = numericPart.includes(',');
  const hasDot = numericPart.includes('.');
  let normalized = numericPart;
  if (hasComma && hasDot) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (hasComma && !hasDot) {
    normalized = normalized.replace(',', '.');
  }
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return {
    cents: Math.round(parsed * 100),
    raw: trimmed,
  };
};

const findPriceCandidate = (row = []) => {
  for (let index = row.length - 1; index >= 0; index -= 1) {
    const cell = row[index];
    if (typeof cell === 'number' && Number.isFinite(cell)) return cell;
    if (typeof cell === 'string' && /\d/.test(cell)) return cell;
  }
  return null;
};

const buildInventoryItemFromRow = (row = []) => {
  if (!Array.isArray(row) || row.length === 0) return null;
  const normalizedRow = normalizeRowValues(row);
  const name = sanitizeText(normalizedRow[0]);
  if (!name) return null;
  const normalizedName = normalizeMaterialName(name);
  if (!normalizedName) return null;
  const priceCandidate = findPriceCandidate(normalizedRow);
  if (priceCandidate === null || priceCandidate === undefined) return null;
  const priceInfo = parsePriceValue(priceCandidate);
  if (!priceInfo) return null;
  const extra = { rawRow: normalizedRow };
  return {
    name,
    normalizedName,
    priceCents: priceInfo.cents,
    priceRaw: priceInfo.raw,
    extraJson: JSON.stringify(extra),
  };
};

const parseInventoryItemsFromBuffer = (buffer) => {
  if (!buffer || buffer.length === 0) {
    const error = new Error('No se detectaron datos en el archivo.');
    error.code = 'EMPTY_IMPORT';
    throw error;
  }
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch (error) {
    const parseError = new Error('El archivo no parece ser un Excel válido.');
    parseError.code = 'INVALID_EXCEL';
    throw parseError;
  }
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) {
    const error = new Error('La hoja está vacía.');
    error.code = 'EMPTY_IMPORT';
    throw error;
  }
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
  });
  const rows = rawRows
    .map((row) => (Array.isArray(row) ? row : [row]))
    .filter((row) => row.some((cell) => isMeaningfulCell(cell)));
  if (rows.length === 0) {
    const error = new Error('No se encontraron filas con datos.');
    error.code = 'EMPTY_IMPORT';
    throw error;
  }

  const uniqueMaterials = new Map();
  let skipped = 0;
  let duplicates = 0;

  rows.forEach((row) => {
    const material = buildInventoryItemFromRow(row);
    if (!material) {
      skipped += 1;
      return;
    }
    if (uniqueMaterials.has(material.normalizedName)) {
      duplicates += 1;
    }
    if (!uniqueMaterials.has(material.normalizedName) && uniqueMaterials.size >= MATERIAL_IMPORT_ROW_LIMIT) {
      skipped += 1;
      return;
    }
    uniqueMaterials.set(material.normalizedName, material);
  });

  return {
    rowsRead: rows.length,
    skipped,
    duplicates,
    items: Array.from(uniqueMaterials.values()),
  };
};

const toInventoryItemResponse = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    price: Number.isFinite(row.price_cents) ? row.price_cents / 100 : null,
    priceCents: row.price_cents ?? null,
    priceRaw: row.price_raw,
    currency: row.currency || MATERIAL_DEFAULT_CURRENCY,
    lastImportedAt: row.last_imported_at,
    extra: parseJsonField(row.extra_json) || {},
  };
};

const buildInventoryItemPayload = (row, body = {}) => {
  const baseRow = row || {};
  const name = sanitizeText(body.name ?? baseRow.name);
  if (!name) {
    const error = new Error('El nombre es obligatorio.');
    error.code = 'INVALID_NAME';
    throw error;
  }
  const normalizedName = normalizeMaterialName(name);
  if (!normalizedName) {
    const error = new Error('El nombre es obligatorio.');
    error.code = 'INVALID_NAME';
    throw error;
  }
  let priceCents = baseRow.price_cents ?? null;
  let priceRaw = baseRow.price_raw ?? null;
  if (
    Object.prototype.hasOwnProperty.call(body, 'price') ||
    Object.prototype.hasOwnProperty.call(body, 'priceRaw')
  ) {
    const priceSource = body.price ?? body.priceRaw;
    const parsedPrice = parsePriceValue(priceSource);
    if (!parsedPrice) {
      const error = new Error('El precio ingresado no es válido.');
      error.code = 'INVALID_PRICE';
      throw error;
    }
    priceCents = parsedPrice.cents;
    priceRaw = parsedPrice.raw;
  } else if (!row) {
    const error = new Error('El precio es obligatorio.');
    error.code = 'INVALID_PRICE';
    throw error;
  }

  const currency = sanitizeCurrency(body.currency ?? baseRow.currency ?? MATERIAL_DEFAULT_CURRENCY);
  const lastImportedAt = new Date().toISOString();
  const existingExtra = parseJsonField(baseRow.extra_json) || {};
  const mergedExtra =
    body.extra && typeof body.extra === 'object' ? { ...existingExtra, ...body.extra } : existingExtra;

  return {
    id: baseRow.id,
    name,
    normalizedName,
    priceCents,
    priceRaw,
    currency,
    lastImportedAt,
    extraJson: JSON.stringify(mergedExtra),
  };
};

const generateCatalogId = () => `cat_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

const buildCatalogParams = (body, id) => {
  const name = sanitizeText(body.name);
  if (!name) {
    const error = new Error('El nombre es obligatorio.');
    error.code = 'INVALID_NAME';
    throw error;
  }

  const images = sanitizeUrlList(body.images, 5);
  const documents = sanitizeUrlList(body.documents, 5);
  const fallbackImage = sanitizeText(body.image);
  const fallbackDocument = sanitizeText(body.plan);

  if (images.length === 0 && fallbackImage) {
    images.push(fallbackImage);
  }
  if (documents.length === 0 && fallbackDocument) {
    documents.push(fallbackDocument);
  }

  return {
    id,
    name,
    category: sanitizeText(body.category) || null,
    description: sanitizeText(body.description),
    image: images[0] || null,
    plan: documents[0] || null,
    imagesJson: JSON.stringify(images),
    documentsJson: JSON.stringify(documents),
    projectJson: JSON.stringify(body.project || {}),
    budgetJson: JSON.stringify(body.budget || {}),
    additionalsJson: JSON.stringify(body.additionals || {}),
    summaryJson: JSON.stringify(body.summary || {}),
  };
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: UPLOAD_LIMIT_BYTES,
  },
});

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: UPLOAD_LIMIT_BYTES,
  },
});

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadsDir));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const buildPublicUrl = (req, storedName) =>
  `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(storedName)}`;

app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ ok: false, error: 'No se recibió archivo para subir.' });
      return;
    }

    const logicalNameRaw = sanitizeName(req.body?.filename || '');
    const logicalName = logicalNameRaw || req.file.originalname;
    const category = sanitizeName(req.body?.category || '') || null;

    insertFileStmt.run({
      storedName: req.file.filename,
      originalName: req.file.originalname,
      logicalName,
      category,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });

    const fileUrl = buildPublicUrl(req, req.file.filename);

    res.json({
      ok: true,
      name: logicalName,
      url: fileUrl,
      download: fileUrl,
      category,
      size: req.file.size,
      mimeType: req.file.mimetype,
    });
  } catch (error) {
    console.error('Error al guardar archivo:', error);
    res.status(500).json({ ok: false, error: 'No se pudo guardar el archivo en el servidor.' });
  }
});

const handleInventoryImportUpload = excelUpload.single('file');

const registerInventoryRoutes = (slug, model) => {
  const meta = inventoryMeta[slug] || { label: 'Catálogo' };

  app.post(`/api/${slug}/import`, (req, res) => {
    handleInventoryImportUpload(req, res, (uploadError) => {
      if (uploadError) {
        if (uploadError.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            ok: false,
            error: `El archivo supera el máximo permitido (${MAX_UPLOAD_MB} MB).`,
          });
          return;
        }
        res.status(400).json({ ok: false, error: 'No se pudo leer el archivo enviado.' });
        return;
      }
      try {
        if (!req.file) {
          res.status(400).json({ ok: false, error: 'Adjunta un archivo .csv con la lista.' });
          return;
        }
        const extensionValid = /\.csv$/i.test(req.file.originalname || '');
        if (!extensionValid) {
          res.status(400).json({ ok: false, error: 'Solo se aceptan archivos con extensión .csv.' });
          return;
        }
        const currency = sanitizeCurrency(req.body?.currency);
        const parsed = parseInventoryItemsFromBuffer(req.file.buffer);
        if (!parsed.items || parsed.items.length === 0) {
          res.status(400).json({ ok: false, error: 'No se encontraron registros válidos en el archivo.' });
          return;
        }
        const timestamp = new Date().toISOString();
        const payload = parsed.items.map((item) => ({
          ...item,
          currency,
          lastImportedAt: timestamp,
        }));
        const { inserted, updated } = model.saveTransaction(payload);
        res.json({
          ok: true,
          summary: {
            rowsRead: parsed.rowsRead,
            imported: payload.length,
            inserted,
            updated,
            skipped: parsed.skipped,
            duplicates: parsed.duplicates,
            currency,
            lastImportedAt: timestamp,
          },
        });
      } catch (error) {
        if (error.code === 'EMPTY_IMPORT' || error.code === 'INVALID_EXCEL') {
          res.status(400).json({ ok: false, error: error.message });
          return;
        }
        console.error(`Error al importar ${meta.label.toLowerCase()}:`, error);
        res.status(500).json({ ok: false, error: 'No se pudo importar la lista.' });
      }
    });
  });

  app.get(`/api/${slug}`, (req, res) => {
    try {
      const limit = Math.max(
        1,
        Math.min(Number.parseInt(req.query.limit || String(MATERIAL_QUERY_LIMIT), 10), MATERIAL_QUERY_LIMIT)
      );
      const query = sanitizeText(req.query.q || '');
      let rows = [];
      if (query) {
        const normalized = normalizeMaterialName(query);
        if (normalized) {
          const pattern = `%${normalized.replace(/\s+/g, '%')}%`;
          rows = model.searchStmt.all({ pattern, limit });
        } else {
          rows = model.listRecentStmt.all({ limit });
        }
      } else {
        rows = model.listRecentStmt.all({ limit });
      }
      res.json({ ok: true, items: rows.map(toInventoryItemResponse) });
    } catch (error) {
      console.error(`Error al consultar ${meta.label.toLowerCase()}:`, error);
      res.status(500).json({ ok: false, error: 'No se pudieron obtener los registros.' });
    }
  });

  app.get(`/api/${slug}/list`, (req, res) => {
    try {
      const limit = Math.max(5, Math.min(Number.parseInt(req.query.limit || '20', 10), 100));
      const pageRaw = Number.parseInt(req.query.page || '1', 10);
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
      const offset = (page - 1) * limit;
      const rows = model.listPaginatedStmt.all({ limit, offset });
      const totalRow = model.countStmt.get();
      const totalItems = totalRow?.total ?? 0;
      const totalPages = totalItems > 0 ? Math.ceil(totalItems / limit) : 1;
      res.json({
        ok: true,
        items: rows.map(toInventoryItemResponse),
        pagination: {
          page,
          perPage: limit,
          totalItems,
          totalPages,
        },
      });
    } catch (error) {
      console.error(`Error al paginar ${meta.label.toLowerCase()}:`, error);
      res.status(500).json({ ok: false, error: 'No se pudo obtener el listado paginado.' });
    }
  });

  app.post(`/api/${slug}`, (req, res) => {
    try {
      const params = buildInventoryItemPayload(null, req.body || {});
      const existing = model.findByNormalizedNameStmt.get({ normalizedName: params.normalizedName });
      if (existing) {
        res.status(409).json({ ok: false, error: 'Ya existe un registro con ese nombre.' });
        return;
      }
      const info = model.insertStmt.run(params);
      const row = model.getByIdStmt.get({ id: info.lastInsertRowid });
      res.status(201).json({ ok: true, item: toInventoryItemResponse(row) });
    } catch (error) {
      if (error.code === 'INVALID_NAME' || error.code === 'INVALID_PRICE') {
        res.status(400).json({ ok: false, error: error.message });
        return;
      }
      if (error.code && error.code.startsWith('SQLITE_CONSTRAINT')) {
        res.status(409).json({ ok: false, error: 'Ya existe un registro con ese nombre.' });
        return;
      }
      console.error(`Error al crear ${meta.label.toLowerCase()}:`, error);
      res.status(500).json({ ok: false, error: 'No se pudo crear el registro.' });
    }
  });

  app.patch(`/api/${slug}/:id`, (req, res) => {
    try {
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ ok: false, error: 'ID inválido.' });
        return;
      }
      const current = model.getByIdStmt.get({ id });
      if (!current) {
        res.status(404).json({ ok: false, error: 'Registro no encontrado.' });
        return;
      }
      const params = buildInventoryItemPayload(current, req.body || {});
      model.manualUpdateStmt.run(params);
      const updated = model.getByIdStmt.get({ id });
      res.json({ ok: true, item: toInventoryItemResponse(updated) });
    } catch (error) {
      if (error.code === 'INVALID_NAME' || error.code === 'INVALID_PRICE') {
        res.status(400).json({ ok: false, error: error.message });
        return;
      }
      if (error.code && error.code.startsWith('SQLITE_CONSTRAINT')) {
        res.status(409).json({ ok: false, error: 'Ya existe otro registro con ese nombre.' });
        return;
      }
      console.error(`Error al actualizar ${meta.label.toLowerCase()}:`, error);
      res.status(500).json({ ok: false, error: 'No se pudo guardar el registro.' });
    }
  });
};

registerInventoryRoutes('materials', inventoryModels.materials);
registerInventoryRoutes('supplies', inventoryModels.supplies);
registerInventoryRoutes('labor', inventoryModels.labor);

app.get('/api/catalog', (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit || '200', 10), 200));
    const rows = listCatalogEntriesStmt.all({ limit });
    const totalRow = countCatalogEntriesStmt.get();
    const items = rows.map((row) => toCatalogEntry(row, req));
    res.json({ ok: true, items, total: totalRow?.total ?? items.length });
  } catch (error) {
    console.error('Error al listar catálogos:', error);
    res.status(500).json({ ok: false, error: 'No se pudo obtener el catálogo.' });
  }
});

app.get('/api/catalog/:id', (req, res) => {
  try {
    const id = sanitizeText(req.params.id);
    if (!id) {
      res.status(400).json({ ok: false, error: 'ID inválido.' });
      return;
    }
    const row = getCatalogEntryStmt.get({ id });
    if (!row) {
      res.status(404).json({ ok: false, error: 'Plantilla no encontrada.' });
      return;
    }
    res.json({ ok: true, item: toCatalogEntry(row, req) });
  } catch (error) {
    console.error('Error al obtener catálogo:', error);
    res.status(500).json({ ok: false, error: 'No se pudo obtener la plantilla solicitada.' });
  }
});

app.post('/api/catalog', (req, res) => {
  try {
    const id = generateCatalogId();
    const params = buildCatalogParams(req.body || {}, id);
    insertCatalogEntryStmt.run(params);
    const row = getCatalogEntryStmt.get({ id });
    res.status(201).json({ ok: true, item: toCatalogEntry(row, req) });
  } catch (error) {
    if (error.code === 'INVALID_NAME') {
      res.status(400).json({ ok: false, error: error.message });
      return;
    }
    if (error.code && error.code.startsWith('SQLITE_CONSTRAINT')) {
      res.status(409).json({ ok: false, error: 'Ya existe una plantilla con ese identificador.' });
      return;
    }
    console.error('Error al crear catálogo:', error);
    res.status(500).json({ ok: false, error: 'No se pudo guardar la plantilla.' });
  }
});

app.put('/api/catalog/:id', (req, res) => {
  try {
    const id = sanitizeText(req.params.id);
    if (!id) {
      res.status(400).json({ ok: false, error: 'ID inválido.' });
      return;
    }
    const params = buildCatalogParams(req.body || {}, id);
    const info = updateCatalogEntryStmt.run(params);
    if (info.changes === 0) {
      res.status(404).json({ ok: false, error: 'Plantilla no encontrada.' });
      return;
    }
    const row = getCatalogEntryStmt.get({ id });
    res.json({ ok: true, item: toCatalogEntry(row, req) });
  } catch (error) {
    if (error.code === 'INVALID_NAME') {
      res.status(400).json({ ok: false, error: error.message });
      return;
    }
    console.error('Error al actualizar catálogo:', error);
    res.status(500).json({ ok: false, error: 'No se pudo actualizar la plantilla.' });
  }
});

app.delete('/api/catalog/:id', (req, res) => {
  try {
    const id = sanitizeText(req.params.id);
    if (!id) {
      res.status(400).json({ ok: false, error: 'ID inválido.' });
      return;
    }
    const info = deleteCatalogEntryStmt.run({ id });
    if (info.changes === 0) {
      res.status(404).json({ ok: false, error: 'Plantilla no encontrada.' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Error al eliminar catálogo:', error);
    res.status(500).json({ ok: false, error: 'No se pudo eliminar la plantilla.' });
  }
});

app.get('/api/search', (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit || '20', 10), 100));
    const query = sanitizeName(req.query.q || '');

    const rows =
      query.length > 0
        ? searchFilesStmt.all({ prefix: query, limit })
        : latestFilesStmt.all({ limit });

    const items = rows.map((row) => {
      const url = buildPublicUrl(req, row.stored_name);
      return {
        id: row.id,
        name: row.logical_name || row.original_name,
        url,
        download: url,
        category: row.category,
        mimeType: row.mime_type,
        size: row.size,
        created: row.created_at,
      };
    });

    res.json({ ok: true, items });
  } catch (error) {
    console.error('Error al buscar archivos:', error);
    res.status(500).json({ ok: false, error: 'No se pudo recuperar la lista de archivos.' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor disponible en http://localhost:${PORT}`);
  console.log(`Subidas almacenadas en: ${uploadsDir}`);
  console.log(`Base de datos: ${dbPath}`);
});
