'use strict';

/**
 * Optie 2 (robust): maak deterministische locators door BRON en CONCEPT vooraf te labelen.
 *
 * BRON labels:   [BRON A02 Z07]  (A = alinea, Z = zin)
 * CONCEPT labels:
 *   [CONCEPT TITEL]
 *   [CONCEPT INTRO Z01]
 *   [CONCEPT BODY A01 Z01]
 *
 * Deze labels gaan de audit-LLM in; de LLM mag alleen bestaande labels als locator gebruiken.
 * De outputBuilder kan daarna met dezelfde label->zin mapping een BRONINDEX renderen.
 */

function pad2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '00';
  if (x < 10) return `0${x}`;
  return String(x);
}

function normalizeLineEndings(s) {
  return String(s || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function splitParagraphsKeepingIntent(raw) {
  let t = normalizeLineEndings(raw);

  // Maak whitespace voorspelbaar, maar behoud newlines
  t = t.replace(/\t/g, ' ');
  t = t.replace(/[ \u00A0]+\n/g, '\n');     // trim end-of-line spaces
  t = t.replace(/\n[ \u00A0]+/g, '\n');     // trim start-of-line spaces
  t = t.trim();

  // Converteer 3+ newlines naar 2 newlines (visuele alinea-break)
  t = t.replace(/\n{3,}/g, '\n\n');

  // Als er "lege regels" bestaan, splits daarop; anders splits op enkele newline.
  const hasBlankLines = /\n\s*\n/.test(t);
  const parts = hasBlankLines ? t.split(/\n\s*\n+/) : t.split(/\n+/);

  return parts
    .map((p) => String(p || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function splitSentencesIntl(text) {
  // Node 18+ heeft Intl.Segmenter; Node 22 (Render) zeker.
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      const seg = new Intl.Segmenter('nl', { granularity: 'sentence' });
      const out = [];
      for (const s of seg.segment(String(text || ''))) {
        const st = String(s.segment || '').trim();
        if (st) out.push(st);
      }
      return out;
    }
  } catch (_) {
    // fall through
  }
  return null;
}

function splitSentencesFallback(text) {
  const t = String(text || '').trim();
  if (!t) return [];

  // Heel simpele fallback: split op .!? + whitespace/einde
  // (Niet perfect, maar alleen als Intl.Segmenter ontbreekt.)
  const out = [];
  const re = /(.+?[.!?]+)(\s+|$)/g;

  let lastIndex = 0;
  let m;
  while ((m = re.exec(t)) !== null) {
    const chunk = String(m[1] || '').trim();
    if (chunk) out.push(chunk);
    lastIndex = re.lastIndex;
  }

  // Rest zonder afsluitende punctuation
  const rest = t.slice(lastIndex).trim();
  if (rest) out.push(rest);

  return out.length ? out : [t];
}

function splitSentences(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const intl = splitSentencesIntl(t);
  if (Array.isArray(intl) && intl.length) return intl;
  return splitSentencesFallback(t);
}

function labelSourceText(rawText) {
  const paras = splitParagraphsKeepingIntent(rawText);
  const labelToText = {};
  const labels = [];
  const lines = [];

  lines.push('BRON_GELABELD:');

  for (let ai = 0; ai < paras.length; ai++) {
    const sentences = splitSentences(paras[ai]);
    for (let zi = 0; zi < sentences.length; zi++) {
      const label = `[BRON A${pad2(ai + 1)} Z${pad2(zi + 1)}]`;
      const sentence = String(sentences[zi] || '').trim();
      if (!sentence) continue;

      labelToText[label] = sentence;
      labels.push(label);
      lines.push(`${label} ${sentence}`);
    }
  }

  return {
    labeledText: lines.join('\n'),
    labelToText,
    labels
  };
}

function labelConceptText({ title, intro, body }) {
  const labelToText = {};
  const labels = [];
  const lines = [];

  lines.push('CONCEPT_GELABELD:');

  const t = String(title || '').replace(/\s+/g, ' ').trim();
  if (t) {
    const label = '[CONCEPT TITEL]';
    labelToText[label] = t;
    labels.push(label);
    lines.push(`${label} ${t}`);
  }

  const i = String(intro || '').trim();
  if (i) {
    const introSentences = splitSentences(i);
    for (let zi = 0; zi < introSentences.length; zi++) {
      const label = `[CONCEPT INTRO Z${pad2(zi + 1)}]`;
      const sentence = String(introSentences[zi] || '').trim();
      if (!sentence) continue;

      labelToText[label] = sentence;
      labels.push(label);
      lines.push(`${label} ${sentence}`);
    }
  }

  const b = String(body || '').trim();
  if (b) {
    const paras = splitParagraphsKeepingIntent(b);
    for (let ai = 0; ai < paras.length; ai++) {
      const sentences = splitSentences(paras[ai]);
      for (let zi = 0; zi < sentences.length; zi++) {
        const label = `[CONCEPT BODY A${pad2(ai + 1)} Z${pad2(zi + 1)}]`;
        const sentence = String(sentences[zi] || '').trim();
        if (!sentence) continue;

        labelToText[label] = sentence;
        labels.push(label);
        lines.push(`${label} ${sentence}`);
      }
    }
  }

  return {
    labeledText: lines.join('\n'),
    labelToText,
    labels
  };
}

function normalizeLocator(locator, allowedSet) {
  const raw = String(locator || '').trim();
  if (!raw) return null;
  if (allowedSet.has(raw)) return raw;

  // Soms geeft het model extra tekst mee: pak eerste [...] label
  const m = raw.match(/\[(BRON|CONCEPT)[^\]]+\]/);
  if (m && allowedSet.has(m[0])) return m[0];

  return null;
}

/**
 * Sanitize audit payload: zorg dat evidence.locator altijd een bestaand label is
 * (of verwijder evidence item als het niet te normaliseren is).
 */
function sanitizeAuditIssues(issues, allowedLabels) {
  const allowedSet = new Set(Array.isArray(allowedLabels) ? allowedLabels : []);

  return (Array.isArray(issues) ? issues : []).map((it) => {
    const evidence = Array.isArray(it?.evidence) ? it.evidence : [];
    const cleanedEvidence = [];

    for (const e of evidence) {
      const loc = normalizeLocator(e?.locator, allowedSet);
      if (!loc) continue;
      cleanedEvidence.push({
        where: e?.where === 'concept' ? 'concept' : 'bron',
        locator: loc,
        snippet: String(e?.snippet || '').trim().slice(0, 140)
      });
    }

    return {
      ...it,
      evidence: cleanedEvidence
    };
  });
}

module.exports = {
  labelSourceText,
  labelConceptText,
  sanitizeAuditIssues
};
