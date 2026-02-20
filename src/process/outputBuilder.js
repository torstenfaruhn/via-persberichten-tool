'use strict';

function bullets(signals) {
  const arr = Array.isArray(signals) ? signals : [];
  if (arr.length === 0) return '- Geen meldingen.';
  return arr.map((s) => `- ${s.code}: ${s.message}`).join('\n');
}

/**
 * Bouwt het output-document.
 * Wijziging: verwijdert de KOP/INTRO/BODY-tags en output nu "plain" tekst:
 *   titel
 *   (lege regel)
 *   intro
 *   (lege regel)
 *   body
 *   (lege regel)
 * Daarna blijven SIGNALEN/BRON/CONTACT zoals voorheen.
 */
function buildOutput({ llmData, signals, contactLines }) {
  const title = String(llmData?.title || '').trim();
  const intro = String(llmData?.intro || '').trim();
  const body = String(llmData?.body || '').trim();
  const bron = (String(llmData?.bron || '').trim() || 'Op basis van een persbericht.');

  const parts = [];

  // Geen tags meer: alleen de inhoud.
  if (title) parts.push(title);
  if (title && (intro || body)) parts.push('');

  if (intro) parts.push(intro);
  if (intro && body) parts.push('');

  if (body) parts.push(body);

  // Altijd netjes afsluiten met een lege regel vóór de meta-secties, als er inhoud was.
  if (parts.length > 0) parts.push('');

  // Meta-secties blijven ongewijzigd.
  parts.push('SIGNALEN');
  parts.push(bullets(signals));
  parts.push('');
  parts.push('BRON');
  parts.push(bron);

  if (Array.isArray(contactLines) && contactLines.length > 0) {
    parts.push('');
    parts.push('CONTACT (niet voor publicatie)');
    parts.push(contactLines.join('\n'));
  }

  parts.push('');
  return parts.join('\n');
}

module.exports = { buildOutput };
