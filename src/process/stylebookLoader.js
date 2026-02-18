'use strict';
const fs = require('fs/promises');
const path = require('path');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

/**
 * Laadt stijlboek-tekst uit 1 of meer bestanden.
 * - Geen logging van inhoud; alleen technische foutcodes.
 * - Ondersteunt: .txt, .md, .docx, .pdf
 * - Cache op basis van (pad + mtimeMs) binnen het Node-proces.
 */

const CACHE = new Map(); // key -> { mtimeMs, text }

function ext(p) { return path.extname(p || '').toLowerCase(); }

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

async function resolveDefaultPaths() {
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


function truncate(text, maxChars) {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n\n[STIJLBOEK INGKORT: te lang]';
}

async function loadStylebookText({ maxChars = 100000 } = {}) {
  const single = (process.env.STYLEBOOK_PATH || '').trim();
  const paths = single ? [single] : await resolveDefaultPaths();

  if (!paths || paths.length === 0) return '';

  const chunks = [];
  for (const p of paths) {
    try {
      const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
      const st = await fs.stat(abs);
      const key = abs;

      const cached = CACHE.get(key);
      if (cached && cached.mtimeMs === st.mtimeMs) {
        chunks.push(`\n\n### ${path.basename(abs)}\n${cached.text}`);
        continue;
      }

      const text = await readOne(abs);
      CACHE.set(key, { mtimeMs: st.mtimeMs, text });
      chunks.push(`\n\n### ${path.basename(abs)}\n${text}`);
    } catch (_) {
      // Stil: ontbrekend/kapot stijlboek mag verwerking niet blokkeren.
      continue;
    }
  }
  return truncate(chunks.join('\n'), maxChars).trim();
}

module.exports = { loadStylebookText };
