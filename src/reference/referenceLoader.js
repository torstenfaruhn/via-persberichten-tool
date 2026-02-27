'use strict';

const fs = require('fs/promises');
const path = require('path');

const DEFAULT_PATH = path.join(__dirname, 'entities.nl.json');

async function loadReferenceEntities({ filePath } = {}) {
  const p = filePath ? String(filePath) : DEFAULT_PATH;
  try {
    const raw = await fs.readFile(p, 'utf-8');
    const data = JSON.parse(raw);
    const entities = Array.isArray(data) ? data : (Array.isArray(data?.entities) ? data.entities : []);
    return { ok: true, entities: sanitizeEntities(entities), version: data?.version || null };
  } catch (err) {
    // Bestaat niet of is ongeldig JSON: niet fataal.
    return { ok: true, entities: [], version: null };
  }
}

function sanitizeEntities(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((e) => ({
      id: safeStr(e?.id),
      type: safeStr(e?.type) || 'onbekend',
      canonical_name: safeStr(e?.canonical_name),
      aliases: Array.isArray(e?.aliases) ? e.aliases.map(safeStr).filter(Boolean) : [],
      canonical_place: safeStr(e?.canonical_place),
      allowed_places: Array.isArray(e?.allowed_places) ? e.allowed_places.map(safeStr).filter(Boolean) : [],
      status: safeStr(e?.status) || 'active',
      notes: safeStr(e?.notes)
    }))
    .filter((e) => e.canonical_name);
}

function safeStr(v) {
  const s = (v === undefined || v === null) ? '' : String(v);
  return s.trim();
}

module.exports = { loadReferenceEntities };
