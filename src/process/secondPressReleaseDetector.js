'use strict';

/**
 * Detecteert of er waarschijnlijk meer dan één persbericht in één document staat.
 * Belangrijk: DOCX-extractie kan veel extra witregels opleveren. Daarom:
 * - splitsen op "heel veel witregels" gebeurt alleen als het eerste deel ook substantieel is,
 *   anders is het vrijwel zeker opmaak en geen echt 1e persbericht.
 */

function countChars(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim().length;
}

function looksLikeSeparator(line) {
  const t = String(line || '').trim().toLowerCase();
  if (!t) return false;

  // Streep-/ster-achtige scheiders
  if (/^[-*_]{3,}$/.test(t)) return true;

  // Veelgebruikte expliciete afsluiters / scheiders
  if (t.includes('einde persbericht')) return true;
  if (t.includes('einde bericht')) return true;
  if (t.includes('---')) return true;

  return false;
}

function looksLikeDateline(text) {
  const s = String(text || '').trim();

  // Eenvoudige NL-dateline patronen (plaats + datum)
  // Voorbeelden: "Maastricht, 10 februari 2026" / "Heerlen – 10-02-2026"
  if (/\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/.test(s)) return true;
  if (/\b\d{1,2}\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{4}\b/i.test(s))
    return true;
  if (/^[A-ZÀ-ÖØ-Þ][\wÀ-ÖØ-öø-ÿ .'-]{2,},\s+/.test(s) && (/\d{4}\b/.test(s) || /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/.test(s)))
    return true;

  return false;
}

function hasContactMarkers(text) {
  const s = String(text || '');

  // Contactregels (heel globaal, zonder PII te extraheren)
  if (/\b(contact|pers|perscontact|media|voor de pers)\b/i.test(s)) return true;
  if (/\b(tel\.?|telefoon|mobiel)\b/i.test(s)) return true;
  if (/\b(e-?mail|@)\b/i.test(s)) return true;
  if (/\bwww\.\b/i.test(s)) return true;

  return false;
}

/**
 * Splitst het document in 1e en 2e deel.
 * - Eerst: expliciete scheiders (leidend).
 * - Daarna: split op 4+ lege regels, maar alleen als het eerste deel lang genoeg is.
 */
function splitSections(raw) {
  const lines = String(raw || '').split(/\r\n|\n|\r/);

  // 1) Expliciete separators blijven leidend
  for (let i = 0; i < lines.length; i++) {
    if (looksLikeSeparator((lines[i] || '').trim())) {
      return {
        first: lines.slice(0, i).join('\n'),
        second: lines.slice(i + 1).join('\n')
      };
    }
  }

  const joined = lines.join('\n');

  // 2) Split op heel veel witregels (DOCX kan dit veroorzaken)
  const parts = joined.split(/\n\s*\n\s*\n\s*\n+/);
  if (parts.length >= 2) {
    const first = parts[0];
    const second = parts.slice(1).join('\n');

    // AANPASSING: guard tegen false positives door DOCX-opmaak.
    // Als het eerste deel te kort is (bijv. alleen een titel), dan is dit vrijwel zeker geen echt 1e persbericht.
    // Drempel kun je later tunen; 600 is een pragmatisch startpunt.
    if (countChars(first) < 600) {
      return { first: joined, second: '' };
    }

    return { first, second };
  }

  return { first: joined, second: '' };
}

function scoreSecondSection(second) {
  const s = String(second || '').trim();
  if (!s) return 0;

  let score = 0;

  // Heuristiek: dateline aanwezig
  if (looksLikeDateline(s.slice(0, 400))) score += 2;

  // Heuristiek: contactblok indicaties
  if (hasContactMarkers(s)) score += 2;

  // Heuristiek: "titel-achtige" start (eerste niet-lege regel relatief kort)
  const firstLine = s.split(/\r\n|\n|\r/).map(l => l.trim()).find(Boolean) || '';
  if (firstLine && firstLine.length <= 120) score += 1;

  // Heuristiek: veel hoofdletters in het begin (kop-achtig)
  const head = s.slice(0, 200);
  const letters = (head.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).length;
  const uppers = (head.match(/[A-ZÀ-ÖØ-Þ]/g) || []).length;
  if (letters >= 30 && uppers / Math.max(letters, 1) > 0.35) score += 1;

  return score;
}

function detectSecondPressRelease(rawText) {
  const { first, second } = splitSections(rawText);

  const secondChars = countChars(second);
  if (secondChars === 0) {
    return {
      decision: 'ok',
      firstSectionCharCount: countChars(first),
      secondSectionCharCount: 0,
      score: 0
    };
  }

  const score = scoreSecondSection(second);

  // Originele stijl: als het "tweede deel" groot is én genoeg signalen heeft -> error.
  // Drempels kun je later tunen als je wilt.
  const decision = (secondChars >= 900 && score >= 4) ? 'error' : 'warn';

  return {
    decision,
    firstSectionCharCount: countChars(first),
    secondSectionCharCount: secondChars,
    score
  };
}

module.exports = { detectSecondPressRelease };
