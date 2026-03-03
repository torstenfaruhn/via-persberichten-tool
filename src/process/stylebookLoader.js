'use strict';
const fs = require('fs/promises');
const path = require('path');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { safeLog } = require('../security/safeLog');

/**
 * Stijlboek-loader
 *
 * Doelen:
 * - Sneller prompt-gewicht: gebruik modulaire modules (core + auto-detect) als die aanwezig zijn.
 * - Privacy: geen logging van stijlboek- of broninhoud; alleen technische status.
 * - Backwards compatible: legacy modus blijft beschikbaar.
 *
 * Modes (env STYLEBOOK_MODE):
 * - modular (default): gebruik stylebook/modular/index.json + geselecteerde modules (auto-detect).
 * - legacy: gebruik bestaande loader (STYLEBOOK_PATH of stylebook/stylebook-extract.md, of overige bronnen).
 * - file: laad 1 bestand via STYLEBOOK_PATH (TXT/MD/DOCX/PDF).
 *
 * Extra env:
 * - STYLEBOOK_MODULES: comma-separated module ids om altijd mee te sturen (modular).
 * - STYLEBOOK_EXCLUDE_MODULES: comma-separated module ids om nooit mee te sturen (modular).
 * - STYLEBOOK_AUTODETECT_ONLY: comma-separated module ids die alléén bij detectie worden geladen
 *   (default: limburgse_plaatsnamen).
 * - STYLEBOOK_DEBUG=1: logt alleen module-ids (geen inhoud).
 */

const CACHE = new Map(); // absPath -> { mtimeMs, text }

const LIMB_DETECT_CACHE = {
  abs: null,
  mtimeMs: 0,
  regex: null
};

function mode() {
  return String(process.env.STYLEBOOK_MODE || 'modular').trim().toLowerCase();
}

function ext(p) { return path.extname(p || '').toLowerCase(); }

function truncate(text, maxChars) {
  const mc = Number(maxChars || 0);
  if (!mc || mc <= 0) return '';
  if (!text) return '';
  if (text.length <= mc) return text;
  return text.slice(0, mc) + '\n\n[STIJLBOEK INGKORT: te lang]';
}

function parseCsv(v) {
  return String(v || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function escapeRegexLiteral(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readOne(filePath) {
  const e = ext(filePath);
  if (e === '.txt' || e === '.md') {
    return await fs.readFile(filePath, 'utf-8');
  }
  if (e === '.docx') {
    const buf = await fs.readFile(filePath);
    const r = await mammoth.extractRawText({ buffer: buf });
    return (r && r.value) ? r.value : '';
  }
  if (e === '.pdf') {
    const buf = await fs.readFile(filePath);
    const r = await pdfParse(buf);
    return (r && r.text) ? r.text : '';
  }
  return '';
}

async function readCached(absPath) {
  try {
    const st = await fs.stat(absPath);
    const cached = CACHE.get(absPath);
    if (cached && cached.mtimeMs === st.mtimeMs) return cached.text;

    const text = await readOne(absPath);
    CACHE.set(absPath, { mtimeMs: st.mtimeMs, text });
    return text;
  } catch (_) {
    return '';
  }
}

// ---------------------------
// Legacy loader (bestaand gedrag)
// ---------------------------
async function resolveLegacyPaths() {
  // Hardening: if an extract exists, prefer it as single source of truth.
  const extract = path.join(process.cwd(), 'stylebook', 'stylebook-extract.md');
  try {
    await fs.access(extract);
    return [extract];
  } catch (_) {
    // ignore
  }

  const dir = path.join(process.cwd(), 'stylebook');
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter(e => e.isFile())
      .map(e => path.join(dir, e.name))
      .filter(p => !path.basename(p).startsWith('ZZ_naslag_'))
      .filter(p => ['.txt', '.md', '.docx', '.pdf'].includes(ext(p)));
  } catch (_) {
    return [];
  }
}

async function loadLegacyStylebook({ maxChars = 100000 } = {}) {
  const single = (process.env.STYLEBOOK_PATH || '').trim();
  const paths = single ? [single] : await resolveLegacyPaths();

  if (!paths || paths.length === 0) return '';

  const chunks = [];
  for (const p of paths) {
    try {
      const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
      const text = await readCached(abs);
      if (!text) continue;
      chunks.push(`\n\n### ${path.basename(abs)}\n${text}`);
    } catch (_) {
      continue;
    }
  }
  return truncate(chunks.join('\n'), maxChars).trim();
}

// ---------------------------
// Modular loader
// ---------------------------
async function resolveModularIndex() {
  // Default location inside this repo
  const root = path.join(process.cwd(), 'stylebook', 'modular');
  const idx = path.join(root, 'index.json');
  try {
    await fs.access(idx);
    return { root, idx };
  } catch (_) {
    return null;
  }
}

async function readJson(absPath) {
  try {
    const txt = await fs.readFile(absPath, 'utf-8');
    return JSON.parse(txt);
  } catch (_) {
    return null;
  }
}

function buildKeywordDetector(keywords) {
  const list = Array.isArray(keywords) ? keywords : [];
  return (text) => {
    const low = String(text || '').toLowerCase();
    for (const k of list) {
      if (!k) continue;
      if (low.includes(String(k).toLowerCase())) return true;
    }
    return false;
  };
}

async function getLimburgRegex(absModulePath) {
  try {
    const st = await fs.stat(absModulePath);
    if (LIMB_DETECT_CACHE.regex && LIMB_DETECT_CACHE.abs === absModulePath && LIMB_DETECT_CACHE.mtimeMs === st.mtimeMs) {
      return LIMB_DETECT_CACHE.regex;
    }

    const content = await fs.readFile(absModulePath, 'utf-8');

    // Parse variants
    const variants = new Set();
    const stop = new Set(['limburgse', 'plaatsnamen']);

    const lines = content.split(/\r?\n/);
    for (const raw of lines) {
      const line = String(raw || '').trim();
      if (!line) continue;
      if (line.startsWith('#')) continue;

      const toks = line.split(/\s+/).filter(Boolean);
      if (toks.length === 0) continue;

      const first = toks[0];
      const idx = [];
      for (let i = 0; i < toks.length; i++) {
        if (toks[i] === first) idx.push(i);
      }

      const chunks = [];
      if (idx.length > 1) {
        for (let k = 0; k < idx.length; k++) {
          const i = idx[k];
          const j = (k + 1 < idx.length) ? idx[k + 1] : toks.length;
          const seg = toks.slice(i, j).join(' ').trim();
          if (seg) chunks.push(seg);
        }
      } else {
        for (const t of toks) chunks.push(t);
      }

      for (const v of chunks) {
        const clean = v.replace(/[“”„"'’]/g, '').trim();
        if (!clean) continue;
        if (clean.length < 3) continue;
        if (stop.has(clean.toLowerCase())) continue;
        variants.add(clean);
      }
    }

    const parts = Array.from(variants)
      .sort((a, b) => b.length - a.length)
      .map((v) => v.split(/\s+/).map(escapeRegexLiteral).join('\\s+'));

    // Worst-case fallback: als regex te groot wordt, nooit crashen.
    if (parts.length === 0) return null;

    const pattern = `(?<!\\p{L})(?:${parts.join('|')})(?!\\p{L})`;
    const rx = new RegExp(pattern, 'iu');

    LIMB_DETECT_CACHE.abs = absModulePath;
    LIMB_DETECT_CACHE.mtimeMs = st.mtimeMs;
    LIMB_DETECT_CACHE.regex = rx;
    return rx;
  } catch (_) {
    return null;
  }
}

async function detectModules({ sourceText, modularRoot, indexModules }) {
  const text = String(sourceText || '');
  if (!text.trim()) return [];

  const detected = new Set();
  const low = text.toLowerCase();

  // sport
  const sportHit =
    /\b\d{1,2}\s*-\s*\d{1,2}\b/.test(text) ||
    buildKeywordDetector([
      'wedstrijd', 'competitie', 'score', 'doelpunt', 'doelpunten', 'trainer', 'coach',
      'eredivisie', 'eerste divisie', 'beker', 'kampioen', 'finale', 'set', 'sets', 'tie-break'
    ])(low);

  if (sportHit) detected.add('sport');

  // cultuur/feestdagen
  const cultuurHit = buildKeywordDetector([
    'carnaval', 'vastelaovend', 'kerst', 'kerstmis', 'pasen', 'pinksteren',
    'koningsdag', 'dodenherdenking', 'bevrijdingsdag', 'ramadan', 'suikerfeest', 'offerfeest'
  ])(low);

  if (cultuurHit) detected.add('cultuur_feest');

  // Limburgse plaatsnamen (relatief zware module): alleen laden als er een match is.
  const limbMeta = (Array.isArray(indexModules) ? indexModules : []).find(m => m && m.id === 'limburgse_plaatsnamen');
  if (limbMeta && limbMeta.file) {
    const abs = path.join(modularRoot, limbMeta.file);
    const rx = await getLimburgRegex(abs);
    if (rx && rx.test(text)) detected.add('limburgse_plaatsnamen');
  }

  return Array.from(detected);
}

async function loadModularStylebook({ sourceText, maxChars = 100000 } = {}) {
  const mc = Number(maxChars || 0);
  if (!mc || mc <= 0) return '';

  const mod = await resolveModularIndex();
  if (!mod) return null;

  const index = await readJson(mod.idx);
  const indexModules = Array.isArray(index?.modules) ? index.modules : [];
  if (indexModules.length === 0) return '';

  const include = new Set();
  const exclude = new Set(parseCsv(process.env.STYLEBOOK_EXCLUDE_MODULES));

  const autodetectOnly = new Set(parseCsv(process.env.STYLEBOOK_AUTODETECT_ONLY || 'limburgse_plaatsnamen'));

  // Defaults (maar niet als ze in autodetect-only staan)
  for (const m of indexModules) {
    if (m && m.default === true && !autodetectOnly.has(m.id)) include.add(m.id);
  }

  // Core altijd (defensief)
  include.add('core');

  // Auto-detect (bron-afhankelijk)
  const detected = await detectModules({ sourceText, modularRoot: mod.root, indexModules });
  for (const id of detected) include.add(id);

  // Force include via env
  for (const id of parseCsv(process.env.STYLEBOOK_MODULES)) include.add(id);

  // Apply excludes
  for (const id of exclude) include.delete(id);

  const selected = indexModules.filter(m => m && include.has(m.id));

  // In vaste index-volgorde (stabiel)
  const chunks = [];
  const selectedIds = [];
  for (const m of selected) {
    try {
      const abs = path.join(mod.root, m.file);
      const t = await readCached(abs);
      if (!t) continue;
      selectedIds.push(m.id);
      chunks.push(`\n\n### ${m.id}\n${t}`);
    } catch (_) {
      continue;
    }
  }

  if (String(process.env.STYLEBOOK_DEBUG || '').trim() === '1') {
    safeLog(`stylebook_modules:${selectedIds.join(',')}`);
  }

  return truncate(chunks.join('\n').trim(), mc).trim();
}

// ---------------------------
// Public API
// ---------------------------
async function loadStylebookText({ sourceText, maxChars = 100000 } = {}) {
  const m = mode();

  // Explicit file-only
  if (m === 'file') {
    const p = (process.env.STYLEBOOK_PATH || '').trim();
    if (!p) return '';
    const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
    const txt = await readCached(abs);
    if (!txt) return '';
    return truncate(`### ${path.basename(abs)}\n${txt}`, maxChars).trim();
  }

  // Modular default: ignore STYLEBOOK_PATH, tenzij legacy/file.
  if (m === 'modular') {
    const modular = await loadModularStylebook({ sourceText, maxChars });
    if (typeof modular === 'string') return modular;
    // fallback
    return await loadLegacyStylebook({ maxChars });
  }

  // Legacy: bestaand gedrag
  return await loadLegacyStylebook({ maxChars });
}

module.exports = { loadStylebookText };
