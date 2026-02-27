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

  // Markdown-achtige tabel (werkt in plain text en is goed scanbaar).
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
    const note = truncate(String(it?.note || '').trim(), 140) || '-';

    const esc = (x) => String(x || '').replace(/\|/g, '\\|');
    lines.push(`| ${esc(type)} | ${esc(ent)} | ${esc(varOrPlace)} | ${esc(locs)} | ${esc(sev)} | ${esc(note)} |`);
  }

  return lines;
}

/**
 * Bouwt het output-document.
 * Plain tekst:
 *   titel
 *   (lege regel)
 *   intro
 *   (lege regel)
 *   body
 * Daarna:
 *   SIGNALEN
 *   CONSISTENTIECHECK (optioneel)
 *   BRON/CONTACT
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

  // Daarna BRON / CONTACT
  parts.push('BRON');
  parts.push(bron
