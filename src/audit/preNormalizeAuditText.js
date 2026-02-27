'use strict';

/**
 * Pre-normalisatie van concept-tekst voor audit-doeleinden (niet voor publicatie).
 *
 * Doel:
 * - Maak impliciete plaatskoppelingen explicieter zodat de audit-LLM conflicts beter ziet.
 * - Voorbeeld: "Cultuurhuis Heerlen" -> "Cultuurhuis in Heerlen"
 *
 * Strategie:
 * - Bouw een set met bekende plaatsen uit:
 *   a) referentielijst (canonical_place + allowed_places)
 *   b) concepttekst zelf (heuristiek: woorden na "in/te" met hoofdletters)
 * - Vervang patronen "X <PLAATS>" door "X in <PLAATS>" als <PLAATS> in de set zit.
 *
 * Let op:
 * - Dit wordt alleen toegepast op de audit-input, niet op de uiteindelijke outputtekst.
 */

function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeWhitespace(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

function extractPlacesFromReference(referenceEntities) {
  const places = new Set();
  const arr = Array.isArray(referenceEntities) ? referenceEntities : [];

  for (const e of arr) {
    const cp = String(e?.canonical_place || '').trim();
    if (cp) places.add(cp);

    const allowed = Array.isArray(e?.allowed_places) ? e.allowed_places : [];
    for (const p of allowed) {
      const x = String(p || '').trim();
      if (x) places.add(x);
    }
  }
  return places;
}

function extractPlacesFromTextHeuristic(text) {
  const places = new Set();
  const t = String(text || '');

  // Heuristiek: na "in" of "te" volgt vaak een plaatsnaam (1-3 woorden met hoofdletters).
  // Voorbeelden: "in Heerlen", "te Den Haag", "in Maastricht Aachen Airport"
  const re = /\b(?:in|te)\s+([A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){0,2})\b/gu;
  let m;
  while ((m = re.exec(t)) !== null) {
    const candidate = String(m[1] || '').trim();
    if (candidate) places.add(candidate);
  }

  return places;
}

function buildKnownPlaces({ referenceEntities, title, intro, body }) {
  const places = new Set();

  for (const p of extractPlacesFromReference(referenceEntities)) places.add(p);

  const combined = [title, intro, body].filter(Boolean).join('\n');
  for (const p of extractPlacesFromTextHeuristic(combined)) places.add(p);

  // Normaliseer: strip dubbele spaties
  const cleaned = Array.from(places)
    .map((p) => normalizeWhitespace(p).trim())
    .filter(Boolean);

  // Sorteer langste eerst (multi-word plaatsen eerst) om partial matches te beperken.
  cleaned.sort((a, b) => b.length - a.length);

  return cleaned;
}

function applyImplicitPlaceToExplicitIn(text, knownPlaces) {
  let out = String(text || '');
  let replacements = 0;

  if (!out.trim() || !Array.isArray(knownPlaces) || knownPlaces.length === 0) {
    return { text: out, replacements: 0 };
  }

  // We vervangen alleen als de plaats direct na een capitalized phrase staat:
  //   "<CAP...> <PLAATS>" -> "<CAP...> in <PLAATS>"
  //
  // Waarbij CAP... = 1-4 woorden met hoofdletters (om bv. "Limburgs Museum Venlo" te pakken).
  //
  // We vermijden gevallen met "..., <PLAATS>" en "(<PLAATS>)" omdat dat al expliciet genoeg is.
  for (const place of knownPlaces) {
    const pEsc = escapeRegex(place);

    const re = new RegExp(
      // group1: 1-4 woorden met hoofdletters/karakters die vaak in namen zitten
      // gevolgd door spatie + place
      `\\b([A-Z][\\p{L}0-9&'’.-]+(?:\\s+[A-Z][\\p{L}0-9&'’.-]+){0,3})\\s+(${pEsc})\\b`,
      'gu'
    );

    out = out.replace(re, (match, g1, g2, offset, full) => {
      const left = String(g1 || '');
      const right = String(g2 || '');

      // Als de linkerkant al eindigt op "in" of "te", dan niets doen.
      if (/\b(in|te)\s*$/i.test(left)) return match;

      // Als direct vóór de plaats een komma of '(' staat in de originele match, dan niets doen.
      // (We willen "X, Heerlen" of "X (Heerlen)" niet veranderen.)
      const idxPlaceStart = match.lastIndexOf(right);
      const charBeforePlace = idxPlaceStart > 0 ? match[idxPlaceStart - 1] : '';
      if (charBeforePlace === ',' || charBeforePlace === '(') return match;

      // Als de linkerkant eindigt met ',' of '(' dan niets doen.
      if (/[,(]$/.test(left.trim())) return match;

      // Voorkom dat we "Gemeente Heerlen" als "Gemeente in Heerlen" gaan behandelen in audit,
      // tenzij je dat wél wil. Conservatief: skip als left exact "Gemeente" / "gemeente".
      if (/^gemeente$/i.test(left.trim())) return match;

      replacements += 1;
      return `${left} in ${right}`;
    });
  }

  return { text: out, replacements };
}

function preNormalizeConceptForAudit({ title, intro, body, referenceEntities }) {
  const t = normalizeWhitespace(title);
  const i = normalizeWhitespace(intro);
  const b = normalizeWhitespace(body);

  const knownPlaces = buildKnownPlaces({ referenceEntities, title: t, intro: i, body: b });

  const r1 = applyImplicitPlaceToExplicitIn(t, knownPlaces);
  const r2 = applyImplicitPlaceToExplicitIn(i, knownPlaces);
  const r3 = applyImplicitPlaceToExplicitIn(b, knownPlaces);

  return {
    title: r1.text,
    intro: r2.text,
    body: r3.text,
    meta: {
      places_count: knownPlaces.length,
      replacements: (r1.replacements + r2.replacements + r3.replacements)
    }
  };
}

module.exports = { preNormalizeConceptForAudit };
