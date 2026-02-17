'use strict';
const {normalizeText}=require('./normalize');

/**
 * Berekent de lengte van de opgeschoonde brontekst die als basis dient voor intro+body.
 * Doel: contact/niet-voor-publicatie delen niet meetellen.
 *
 * Heuristiek:
 * - Als een regel begint met (of sterk lijkt op) een contact-/niet-voor-publicatie marker,
 *   dan telt alleen de tekst vóór die marker mee.
 * - Daarna normaliseren we whitespace zoals in de rest van de tool.
 */
function getCleanSourceForIntroBody(rawText){
  const raw=String(rawText||'');
  const lines=raw.split(/\r\n|\n|\r/);

  const markerRe=/^\s*(contact|voor vragen|noot\s+voor\s+de\s+redactie|perscontact|media\s*contact|niet\s+voor\s+publicatie)\b/i;

  const idx=lines.findIndex(l=>markerRe.test(String(l||'')));
  const before = idx>=0 ? lines.slice(0, idx).join('\n') : raw;

  // kleine opschoning: verwijder expliciete eindmarkeringen als losse regels
  const withoutEndMarkers = before
    .split(/\r\n|\n|\r/)
    .filter(l=>!/^\s*(einde\s+persbericht|einde|\*\*\*+|—+|-{3,})\s*$/i.test(l))
    .join('\n');

  return normalizeText(withoutEndMarkers);
}

module.exports={getCleanSourceForIntroBody};
