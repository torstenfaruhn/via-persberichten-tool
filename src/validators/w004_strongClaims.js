'use strict';

// “Harde” claims: bijna altijd checken
const HARD = [
  { key: '100%', re: /\b100%\b/ },
  { key: 'garandeert', re: /\bgarandeert\b/ },
  { key: 'bewezen', re: /\bbewezen\b/ },
  { key: 'veiligst', re: /\bveiligst(e)?\b/ },
  { key: 'beste', re: /\bbest(e)?\b/ }
];

// “Context”-woorden: alleen checken als het geen neutrale context is
const SOFT = [
  { key: 'wereldwijd', re: /\bwereldwijd(e)?\b/ },
  { key: 'nummer 1', re: /\bnummer\s*1\b/ },
  { key: 'uniek', re: /\buniek(e)?\b/ }
];

// Context waarin “wereldwijd/uniek/nummer 1” vaak gewoon feitelijk/onschuldig is
function inSafeContext(textLower, index) {
  // Neem een klein venster rond de hit
  const start = Math.max(0, index - 60);
  const end = Math.min(textLower.length, index + 60);
  const ctx = textLower.slice(start, end);

  // “wereldwijde award/prijs” of vergelijkbare context
  if (/\b(award|prijs|onderscheiding|ranking|ranglijst|initiatief)\b/.test(ctx)) return true;
  return false;
}

function strongClaimWarnings(text) {
  const t = String(text || '');
  const lower = t.toLowerCase();
  if (!lower.trim()) return [];

  const hits = [];

  for (const item of HARD) {
    if (item.re.test(lower)) hits.push(item.key);
  }

  for (const item of SOFT) {
    const m = item.re.exec(lower);
    if (!m) continue;
    const idx = m.index || 0;
    if (!inSafeContext(lower, idx)) hits.push(item.key);
  }

  if (hits.length === 0) return [];
  const uniqueHits = Array.from(new Set(hits)).slice(0, 3).join(', ');

  return [{
    code: 'W004',
    message: `Sterke claim gevonden (${uniqueHits}). Controleer of dit klopt en onderbouwd is.`
  }];
}

module.exports = { strongClaimWarnings };
