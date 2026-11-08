// CSV discovery, loading, parsing, and normalization
import {
  EXPECTED_COLUMNS,
  REQUIRED_COLUMNS,
  NUMERIC_FIELDS,
  CATEGORICAL_FIELDS,
  DEFAULT_BUILTIN_CSV_PATHS,
  toNumberOrNull
} from './utils.js';

export async function discoverAvailableCsvFiles(state) {
  const discovered = [];

  const params = new URLSearchParams(globalThis.location?.search || "");
  const modelId = params.get("mine_model");
  if (modelId) {
    if (!/^[a-f0-9]{64}$/.test(modelId)) throw new Error("Invalid local mining model identifier.");
    const response = await fetch(`/api/jobs/${modelId}`);
    if (!response.ok) throw new Error("Local mining model is unavailable. Start the local mining app.");
    const job = await response.json();
    if (job.status !== "complete") throw new Error("This mining run has not completed.");
    const artifacts = params.get("embedded") === "1"
      ? job.artifacts.filter((a) => a.level === params.get("label_level")) : job.artifacts;
    if (!artifacts.length) throw new Error("The selected label model is not available in this mining run.");
    for (const artifact of artifacts) {
      const path = `/api/models/${modelId}/file/${artifact.csv}`;
      const descriptor = createSourceDescriptor(path, "builtin", null);
      descriptor.label = `Local model - ${artifact.level} - ${job.configuration.engine} - ${job.population.cases} cases`;
      discovered.push(descriptor);
    }
    if (params.get("embedded") === "1") {
      state.builtInSources = dedupeSources(discovered);
      state.allSources = [...state.builtInSources, ...state.uploadedSources];
      return;
    }
  }

  const manifestPaths = await fetchSourceManifest();
  const unique = new Set([...manifestPaths, ...DEFAULT_BUILTIN_CSV_PATHS]);
  for (const relativePath of unique) {
    const text = await loadCsvText(relativePath, true);
    if (text && text.includes("rule_id") && text.includes("rule_type")) {
      discovered.push(createSourceDescriptor(relativePath, "builtin", text));
      continue;
    }

    // Keep built-in entries visible in selectors even when prefetch fails
    // (e.g., app opened without local HTTP server). Actual loading is validated later.
    discovered.push(createSourceDescriptor(relativePath, "builtin", null));
  }

  state.builtInSources = dedupeSources(discovered);
  state.allSources = [...state.builtInSources, ...state.uploadedSources];
}

export async function fetchSourceManifest() {
  try {
    const res = await fetch("./csv-sources.json", { cache: "no-store" });
    if (!res.ok) return [];
    const payload = await res.json();
    if (!payload || !Array.isArray(payload.sources)) return [];
    return payload.sources
      .filter((p) => typeof p === "string")
      .map((p) => p.trim())
      .filter((p) => p.toLowerCase().endsWith("_constraints.csv"));
  } catch {
    return [];
  }
}

export function createSourceDescriptor(path, kind, csvText) {
  const filename = path.split("/").pop() || "unknown_constraints.csv";
  const stem = filename.replace(/\.csv$/i, "").replace(/_constraints$/i, "");
  const readableStem = stem
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  let sourceHint = "";
  if (csvText) {
    const lines = csvText.split(/\r?\n/);
    const headerLine = lines[0] || "";
    const firstDataLine = lines.find((line) => line && !line.startsWith("rule_id"));
    if (firstDataLine && headerLine) {
      const headers = headerLine.split(",").map((h) => h.trim());
      const values = firstDataLine.split(",");
      const sourceIdx = headers.indexOf("source");
      if (sourceIdx !== -1) sourceHint = (values[sourceIdx] || "").trim();
    }
  }

  const modelName = readableStem || "Dataset";
  const kindPrefix = kind === "upload" ? "Uploaded" : "Sample";

  const sourceNorm = String(sourceHint || "").trim().toLowerCase();
  let label;
  const normalizedPath = String(path || '').replace(/\\/g, '/').toLowerCase();
  const isDefaultDeclare =
    normalizedPath.endsWith('/preprocessed_declare4py_constraints.csv') ||
    normalizedPath.endsWith('preprocessed_declare4py_constraints.csv') ||
    normalizedPath.endsWith('/preprocessed_declare_constraints.csv') ||
    normalizedPath.endsWith('preprocessed_declare_constraints.csv');
  const isDefaultDiscover = normalizedPath.endsWith('/preprocessed_dcr_constraints.csv') || normalizedPath.endsWith('preprocessed_dcr_constraints.csv');

  if (kind === "builtin" && (sourceNorm === "declare4py" || isDefaultDeclare)) {
    label = "Sample data - Declare4Py";
  } else if (kind === "builtin" && (sourceNorm === "discover" || isDefaultDiscover)) {
    label = "Sample data - DisCoveR";
  } else {
    const secondary = [sourceHint].filter(Boolean).join(" • ");
    label = secondary
      ? `${kindPrefix} — ${modelName} (${filename}) · ${secondary}`
      : `${kindPrefix} — ${modelName} (${filename})`;
  }

  return {
    id: `${kind}:${path}`,
    path,
    kind,
    filename,
    label
  };
}

export function dedupeSources(sources) {
  const seen = new Set();
  const out = [];
  for (const source of sources) {
    const key = `${source.kind}|${source.path}|${source.filename}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(source);
  }
  return out;
}

export async function loadCsvText(path, silent = false, state = null) {
  const uploadSource = state?.uploadedSources?.find((s) => s.path === path && s.uploadText);
  if (uploadSource) return uploadSource.uploadText;

  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (err) {
    if (!silent) console.warn("CSV load failed", path, err);
    return null;
  }
}

export function parseConstraintsCsv(csvText, sourceName) {
  try {
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      transformHeader: (header) => header.trim()
    });

    if (parsed.errors?.length) {
      const hard = parsed.errors.find((e) => e.type !== "FieldMismatch");
      if (hard) {
        return { ok: false, error: `CSV parsing error near row ${hard.row ?? "?"}: ${hard.message}` };
      }
    }

    const headers = parsed.meta?.fields || [];
    const missingRequired = REQUIRED_COLUMNS.filter((name) => !headers.includes(name));
    if (missingRequired.length > 0) {
      return {
        ok: false,
        error: `Missing required columns: ${missingRequired.join(", ")}.`
      };
    }

    const warnings = [];
    const missingExpected = EXPECTED_COLUMNS.filter((name) => !headers.includes(name));
    if (missingExpected.length > 0) {
      warnings.push(`Some expected columns are missing: ${missingExpected.join(", ")}. Missing values are treated as unavailable.`);
    }

    const normalized = [];
    for (const rawRecord of parsed.data) {
      const clean = normalizeConstraintRecord(rawRecord, sourceName);
      if (clean) normalized.push(clean);
    }

    return { ok: true, records: normalized, warnings };
  } catch (err) {
    return { ok: false, error: `Could not parse file ${sourceName}. ${String(err)}` };
  }
}

export function normalizeConstraintRecord(rawRecord, sourceName) {
  // Keep exported endpoint/category and model metadata without changing legacy fields.
  const record = { ...rawRecord };
  for (const key of EXPECTED_COLUMNS) {
    const value = rawRecord[key];
    record[key] = typeof value === "string" ? value.trim() : (value ?? "");
  }

  if (!record.rule_id || !record.rule_type || !record.activities) return null;

  for (const field of NUMERIC_FIELDS) {
    const value = rawRecord[field];
    record[field] = toNumberOrNull(value);
  }

  for (const field of CATEGORICAL_FIELDS) {
    const value = rawRecord[field];
    record[field] = typeof value === "string" && value.trim() ? value.trim() : "unknown";
  }

  const activityInfo = extractActivities(record.activities, record.category, record.rule_type);
  record.activityList = activityInfo.activityList;
  record.activityA = activityInfo.activityA;
  record.activityB = activityInfo.activityB;
  record.isUnary = activityInfo.isUnary;
  record.directionUncertain = activityInfo.directionUncertain;
  if (record.activity_categories) {
    const categories = typeof record.activity_categories === "string"
      ? JSON.parse(record.activity_categories) : record.activity_categories;
    if (!Array.isArray(categories) || categories.length !== record.activityList.length ||
        categories.some((values) => !Array.isArray(values) || values.some((v) => typeof v !== "string"))) {
      throw new Error("Endpoint activity categories must be a JSON list of category lists, one per activity.");
    }
    record.activityCategoryLists = categories;
  }
  record.source_file = sourceName;
  return record;
}

export function extractActivities(rawActivities, category, template) {
  const text = String(rawActivities || "").trim();
  if (!text) {
    return { activityList: [], activityA: null, activityB: null, isUnary: true, directionUncertain: true };
  }

  let parts = null;
  if (text.includes("|")) {
    parts = text.split("|");
  } else if (text.includes("->")) {
    parts = text.split("->");
  } else if (text.includes(";")) {
    parts = text.split(";");
  } else if (category?.toLowerCase() === "binary" && text.includes(",")) {
    parts = text.split(",");
  }

  const cleanParts = (parts || [text]).map((p) => p.trim()).filter(Boolean);
  const isUnary = cleanParts.length <= 1 || String(category).toLowerCase() === "unary";

  const symmetricTemplates = new Set([
    "choice", "exclusive_choice", "coexistence", "not_coexistence"
  ]);

  const templateKey = String(template || "").trim().toLowerCase();
  const directionUncertain = isUnary || symmetricTemplates.has(templateKey);

  return {
    activityList: cleanParts,
    activityA: cleanParts[0] || null,
    activityB: cleanParts[1] || cleanParts[0] || null,
    isUnary,
    directionUncertain
  };
}
