'use strict';

// Deterministische normalisatie voor lookup.

function normalizeKey(s) {
  let x = String(s || '').trim().toLowerCase();
  if (!x) return '';

  // Diacritics-fold
  try {
    x = x.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (_) {}

  // unify quotes/dashes
  x = x
    .replace(/[’']/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');

  // strip leading Dutch articles
  x = x.replace(/^(de|het|'t)\s+/i, '');

  // normalize legal forms
  x = x
    .replace(/\bb\.?v\.?\b/g, 'bv')
    .replace(/\bn\.?v\.?\b/g, 'nv');

  // remove non-alnum except spaces and hyphen
  x = x.replace(/[^a-z0-9\s-]/g, '');
  x = x.replace(/\s+/g, ' ').trim();
  return x;
}

function normalizePlace(s) {
  // Voor nu dezelfde normalisatie; aparte functie zodat je later kunt uitbreiden.
  return normalizeKey(s);
}

function findReferenceEntityByName(name, entities) {
  const key = normalizeKey(name);
  if (!key) return { match: null, ambiguity: false };

  const hits = [];
  for (const e of (Array.isArray(entities) ? entities : [])) {
    const forms = [e.canonical_name, ...(e.aliases || [])];
    for (const f of forms) {
      if (normalizeKey(f) === key) {
        hits.push(e);
        break;
      }
    }
  }
  if (hits.length === 1) return { match: hits[0], ambiguity: false };
  if (hits.length > 1) return { match: null, ambiguity: true };
  return { match: null, ambiguity: false };
}

function allowedPlacesForEntity(refEntity) {
  const allowed = Array.isArray(refEntity?.allowed_places) ? refEntity.allowed_places : [];
  if (allowed.length > 0) return allowed;
  const cp = String(refEntity?.canonical_place || '').trim();
  return cp ? [cp] : [];
}

module.exports = {
  normalizeKey,
  normalizePlace,
  findReferenceEntityByName,
  allowedPlacesForEntity
};
