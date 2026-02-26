'use strict';

const {
  normalizePlace,
  findReferenceEntityByName,
  allowedPlacesForEntity
} = require('./referenceMatch');

function clampSeverity(current, next) {
  const rank = { laag: 1, middel: 2, hoog: 3 };
  const c = rank[String(current)] || 1;
  const n = rank[String(next)] || 1;
  return (n > c) ? next : current;
}

function clampConfidence(current, next) {
  const rank = { laag: 1, middel: 2, hoog: 3 };
  const c = rank[String(current)] || 1;
  const n = rank[String(next)] || 1;
  return (n > c) ? next : current;
}

function mergeNote(note, extra) {
  const a = String(note || '').trim();
  const b = String(extra || '').trim();
  if (!a) return b;
  if (!b) return a;
  return `${a} | ${b}`;
}

function mapRefTypeToAuditEnum(t) {
  const x = String(t || '').toLowerCase();
  if (['persoon', 'organisatie', 'locatie', 'gebouw', 'evenement', 'onbekend'].includes(x)) return x;
  // fallback mapping
  if (x.includes('org')) return 'organisatie';
  if (x.includes('gebouw')) return 'gebouw';
  if (x.includes('loc')) return 'locatie';
  return 'onbekend';
}

/**
 * Route A: verrijkt audit-issues deterministisch op basis van lokale referentielijst.
 * - Geen extra velden toevoegen (schema blijft geldig).
 * - Alleen severity/confidence/note/entity_type subtiel aanpassen.
 */
function applyReferenceRulesToAudit(audit, referenceEntities) {
  const out = {
    ok: Boolean(audit?.ok),
    issues: Array.isArray(audit?.issues) ? audit.issues.map((i) => ({ ...i })) : [],
    stats: audit?.stats || { entities_checked: 0, place_links_checked: 0 }
  };

  const entities = Array.isArray(referenceEntities) ? referenceEntities : [];
  if (entities.length === 0) return out;

  for (const issue of out.issues) {
    const { match, ambiguity } = findReferenceEntityByName(issue?.entity_canonical, entities);
    if (ambiguity) {
      issue.note = mergeNote(issue.note, 'Referentie: meerdere matches voor deze naam (ambigue).');
      issue.confidence = clampConfidence(issue.confidence, 'middel');
      continue;
    }
    if (!match) continue;

    // Verrijk entity_type indien onbekend
    if (String(issue.entity_type || '').trim() === 'onbekend') {
      issue.entity_type = mapRefTypeToAuditEnum(match.type);
    }

    // Schrijfwijze: voeg referentie-schrijfwijze toe in note
    if (issue.type === 'schrijfwijze') {
      if (match.canonical_name && match.canonical_name !== issue.entity_canonical) {
        issue.note = mergeNote(issue.note, `Referentie-schrijfwijze: ${match.canonical_name}.`);
        issue.severity = clampSeverity(issue.severity, 'middel');
      } else if (match.canonical_name) {
        issue.note = mergeNote(issue.note, `Referentie: ${match.canonical_name}.`);
      }
    }

    // Plaatskoppeling: check tegen allowed_places/canonical_place
    if (issue.type === 'plaatskoppeling') {
      const allowed = allowedPlacesForEntity(match);
      if (allowed.length === 0) continue;

      const allowedNorm = new Set(allowed.map(normalizePlace).filter(Boolean));
      const foundPlaces = Array.isArray(issue.places) ? issue.places : [];
      const outside = foundPlaces.filter((p) => {
        const k = normalizePlace(p);
        return k && !allowedNorm.has(k);
      });

      if (outside.length > 0) {
        const refPart = match.canonical_place ? `Referentieplaats: ${match.canonical_place}.` : `Referentieplaatsen: ${allowed.join(', ')}.`;
        issue.note = mergeNote(issue.note, `${refPart} Buiten referentie: ${outside.join(', ')}.`);
        issue.severity = clampSeverity(issue.severity, 'hoog');
        issue.confidence = clampConfidence(issue.confidence, 'hoog');
      } else {
        // Alle gevonden plaatsen zijn toegestaan; toch nuttig om norm te melden.
        if (match.canonical_place) {
          issue.note = mergeNote(issue.note, `Referentieplaats: ${match.canonical_place}.`);
        }
      }
    }
  }

  return out;
}

module.exports = { applyReferenceRulesToAudit };
