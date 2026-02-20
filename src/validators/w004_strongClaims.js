'use strict';

/**
 * Termen die we als "sterke claim" beschouwen.
 * Voeg hier gerust varianten aan toe.
 */
const CLAIM_TERMS = [
  'uniek',
  'unieke',
  'beste',
  'allerbeste',
  'bijzonder',
  'bijzondere',
  'speciaal',
  'speciale',
  'unicum',
  'uitzonderlijk',
  'onderscheidend',
  'voordelig',
  'voordelige',
  'goedkoper',
  'goedkopere',
  'juist nu',
  'rare tijden',
  'speciale tijden',
  'al jaren nummer één',
  'spetterend',
  'spetterende',
  'veiligst',
  'veiligste',
  'nummer 1',
  'wereldwijd',
  'wereldwijde',
  'garandeert',
  'gegarandeerd',
  'gegarandeerde',
  'bewezen',
  '100%',
  'nooit',
  'altijd',
  'gratis en voor niets',
  'prachtig',
  'prachtige',
];

function normalizeSpaces(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function clampSnippet(text, start, end, maxLen = 110) {
  const raw = text.slice(start, end);
  const sn = normalizeSpaces(raw);

  if (sn.length <= maxLen) return sn;

  // knip op maxLen, liefst op woordgrens
  const cut = sn.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  const safeCut = lastSpace > 60 ? cut.slice(0, lastSpace) : cut;
  return `${safeCut}…`;
}

/**
 * Vind matchposities van een term in een string (case-insensitive).
 * Voor termen met letters/cijfers gebruiken we woordgrenzen; voor symbolen (zoals %) niet.
 */
function findTermMatches(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hasWordChars = /[a-z0-9]/i.test(term);

  const pattern = hasWordChars ? `\\b${escaped}\\b` : `${escaped}`;
  const re = new RegExp(pattern, 'gi');

  const matches = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    matches.push({ index: m.index, length: m[0].length });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return matches;
}

/**
 * Bouw 1–2 snippets rondom de eerste hits.
 */
function buildSnippets(text, matches, { windowChars = 55, maxSnippets = 2 } = {}) {
  const original = String(text || '');
  if (!original.trim() || matches.length === 0) return [];

  const sorted = matches.slice().sort((a, b) => a.index - b.index);

  const uniq = [];
  const seen = new Set();
  for (const hit of sorted) {
    const key = `${hit.index}:${hit.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(hit);
    if (uniq.length >= maxSnippets) break;
  }

  return uniq.map((hit) => {
    const start = Math.max(0, hit.index - windowChars);
    const end = Math.min(original.length, hit.index + hit.length + windowChars);
    const snippet = clampSnippet(original, start, end, 110);
    return `“…${snippet}…”`;
  });
}

/**
 * @param {string} text
 * @param {object} opts
 * @param {string} opts.location - bv. "kop", "intro", "eerste alinea", "tweede alinea"
 * @returns {Array<{code:string,message:string}>}
 */
function strongClaimWarnings(text, { location } = {}) {
  const original = String(text || '');
  const t = original.toLowerCase();
  if (!t.trim()) return [];

  const allMatches = [];
  for (const term of CLAIM_TERMS) {
    if (!t.includes(term.toLowerCase())) continue; // snelle pre-check
    allMatches.push(...findTermMatches(original, term));
  }

  if (allMatches.length === 0) return [];

  const snippets = buildSnippets(original, allMatches, { windowChars: 55, maxSnippets: 2 });
  const loc = location ? ` Locatie: ${location}.` : '';
  const detail = snippets.length ? ` Snippet: ${snippets.join(' / ')}` : '';

  return [
    {
      code: 'W004',
      message: `Sterke claim gevonden.${loc} Controleer of dit klopt en onderbouwd is.${detail}`,
    },
  ];
}

module.exports = { strongClaimWarnings };
