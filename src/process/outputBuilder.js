'use strict';

function bullets(signals) {
  const arr = Array.isArray(signals) ? signals : [];
  if (arr.length === 0) return '- Geen meldingen.';
  return arr.map((s) => `- ${s.code}: ${s.message}`).join('\n');
}

function truncate(s, n) {
  const t = String(s || '');
  return t.length <= n ? t : (t.slice(0, n - 1) + '…');
}

function escPipe(x) {
  return String(x || '').replace(/\|/g, '\\|');
}

function parseBronLabel(label) {
  const m = String(label || '').match(/^\[BRON A(\d+)\s+Z(\d+)\]$/);
  if (!m) return null;
  return { a: Number(m[1]), z: Number(m[2]) };
}

function formatBronIndex(consistency) {
  const ok = Boolean(consistency?.ok);
  const issues = Array.isArray(consistency?.issues) ? consistency.issues : [];
  const idx = consistency?._locatorIndex?.bron;

  if (!ok || issues.length === 0) return [];
  if (!idx || typeof idx !== 'object') return [];

  // Verzamel alle gebruikte BRON locators uit evidence
  const used = new Set();
  for (const it of issues) {
    const ev = Array.isArray(it?.evidence) ? it.evidence : [];
    for (const e of ev) {
      const loc = String(e?.locator || '').trim();
      if (!loc) continue;
      if (loc.startsWith('[BRON ')) used.add(loc);
    }
  }

  if (used.size === 0) return [];

  // Sorteer op (A, Z)
  const sorted = Array.from(used).sort((x, y) => {
    const px = parseBronLabel(x);
    const py = parseBronLabel(y);
    if (!px && !py) return x.localeCompare(y);
    if (!px) return 1;
    if (!py) return -1;
    if (px.a !== py.a) return px.a - py.a;
    return px.z - py.z;
  });

  // Cap om output beheersbaar te houden
  const cap = 40;
  const lines = [];
  lines.push('BRONINDEX (vindplaatsen)');
  for (const lab of sorted.slice(0, cap)) {
    const sentence = idx[lab];
    if (!sentence) continue;
    lines.push(`${lab} ${truncate(sentence, 220)}`);
  }
  if (sorted.length > cap) {
    lines.push(`- (ingekort) ${sorted.length - cap} extra vindplaatsen niet getoond.`);
  }

  return lines;
}

function formatConsistencyCheck(consistency) {
  if (!consistency) return [];

  const ok = Boolean(consistency?.ok);
  const issues = Array.isArray(consistency?.issues) ? consistency.issues : [];

  const lines = [];
  lines.push('CONSISTENTIECHECK (voor eindredactie)');

  if (!ok) {
    lines.push('- Consistentiecheck kon niet worden uitgevoerd. Controleer eigennamen en plaatskoppelingen handmatig.');
    return lines;
  }

  if (issues.length === 0) {
    lines.push('- Geen inconsistenties gedetecteerd.');
    return lines;
  }

  // Markdown-achtige tabel
  lines.push('| Type | Entiteit | Varianten / Plaatsen | Vindplaatsen | Ernst | Opmerking |');
  lines.push('|---|---|---|---|---|---|');

  for (const it of issues) {
    const type = String(it?.type || '').trim() || '-';
    const ent = String(it?.entity_canonical || '').trim() || '-';

    const varOrPlace = (type === 'schrijfwijze')
      ? (Array.isArray(it?.variants) ? it.variants.filter(Boolean).join(' · ') : '')
      : (Array.isArray(it?.places) ? it.places.filter(Boolean).join(' · ') : '');

    const locs = Array.isArray(it?.evidence)
      ? it.evidence
          .map((e) => String(e?.locator || '').trim())
          .filter(Boolean)
          .slice(0, 3)
          .join(' · ')
      : '';

    const sev = String(it?.severity || '').trim() || '-';
    const note = truncate(String(it?.note || '').trim(), 180) || '-';

    lines.push(`| ${escPipe(type)} | ${escPipe(ent)} | ${escPipe(varOrPlace)} | ${escPipe(locs)} | ${escPipe(sev)} | ${escPipe(note)} |`);
  }

  // UX optie 2.2: BRONINDEX direct onder de CONSISTENTIECHECK
  const bronIndexLines = formatBronIndex(consistency);
  if (bronIndexLines.length > 0) {
    lines.push('');
    lines.push(...bronIndexLines);
  }

  return lines;
}

/**
 * Output document:
 * titel + intro + body (plain)
 * daarna: SIGNALEN
 * daarna: CONSISTENTIECHECK (+ BRONINDEX)
 * daarna: BRON
 * daarna: CONTACT
 */
function buildOutput({ llmData, signals, contactLines, consistency }) {
  const title = String(llmData?.title || '').trim();
  const intro = String(llmData?.intro || '').trim();
  const body = String(llmData?.body || '').trim();
  const bron = (String(llmData?.bron || '').trim() || 'Op basis van een persbericht.');

  const parts = [];

  if (title) parts.push(title);
  if (title && (intro || body)) parts.push('');

  if (intro) parts.push(intro);
  if (intro && body) parts.push('');

  if (body) parts.push(body);

  if (parts.length > 0) parts.push('');

  // SIGNALEN eerst
  parts.push('SIGNALEN');
  parts.push(bullets(signals));
  parts.push('');

  // CONSISTENTIECHECK onder SIGNALEN
  const cc = formatConsistencyCheck(consistency);
  if (cc.length > 0) {
    parts.push(...cc);
    parts.push('');
  }

  // BRON
  parts.push('BRON');
  parts.push(bron);

  // CONTACT
  if (Array.isArray(contactLines) && contactLines.length > 0) {
    parts.push('');
    parts.push('CONTACT (niet voor publicatie)');
    parts.push(contactLines.join('\n'));
  }

  parts.push('');
  return parts.join('\n');
}

module.exports = { buildOutput };
