'use strict';
const { M } = require('../validators/messages');
const { strongClaimWarnings } = require('../validators/w004_strongClaims');
const { nameInconsistencyWarnings } = require('../validators/w003_nameInconsistency');
const { externalVerifyWarnings } = require('../validators/w008_externalVerification');
const { lengthWarnings } = require('../validators/w007_lengthOutOfRange');
const { titleLengthWarnings } = require('../validators/w005_w006_titleLen');
const { missingWWarnings, minFiveWError } = require('../validators/wFields');
const { contactWarnings } = require('../validators/w009_contactFound');
const { consistencyCheckWarnings } = require('../validators/w016_consistencyCheck');

function splitParagraphs(body) {
  return String(body || '')
    .split(/\n\s*\n+/)     // split op lege regels
    .map((p) => p.trim())
    .filter(Boolean);
}

function ordinalWordNl(n) {
  // 1 -> eerste, 2 -> tweede, ... (tot 10), daarna "11e" etc.
  const map = {
    1: 'eerste',
    2: 'tweede',
    3: 'derde',
    4: 'vierde',
    5: 'vijfde',
    6: 'zesde',
    7: 'zevende',
    8: 'achtste',
    9: 'negende',
    10: 'tiende',
  };
  return map[n] || `${n}e`;
}

function runValidators({ sourceCharCount, llmData, detectorResult, contactInfo, consistency }) {
  const errors = [];
  const warnings = [];

  // Voorheen: E007 als error + return (stoppen).
  // Nu: altijd als waarschuwing W015 zodat de tool door kan.
  if (detectorResult?.decision === 'error') {
    warnings.push({ code: 'W015', message: M.E007 });
  }

  if (detectorResult?.decision === 'warn') {
    warnings.push({
      code: 'W015',
      message: 'Mogelijk meerdere persberichten in de upload. Controleer de bron.',
    });
  }

  if (typeof sourceCharCount === 'number' && sourceCharCount < 950) {
    errors.push({ code: 'E004', message: M.E004 });
    return { errors, warnings };
  }

  const mw = missingWWarnings(llmData);
  warnings.push(...mw.warnings);

  const min = minFiveWError(llmData);
  if (min.error) {
    errors.push(min.error);
    return { errors, warnings };
  }

  if (!String(llmData?.w_fields?.waarom || '').trim()) {
    warnings.push({
      code: 'W001',
      message: 'Waarom ontbreekt. Controleer of dit in de bron staat.',
    });
  }

  if (!String(llmData?.w_fields?.hoe || '').trim()) {
    warnings.push({
      code: 'W002',
      message: 'Hoe ontbreekt. Controleer of dit in de bron staat.',
    });
  }

  warnings.push(...titleLengthWarnings(llmData?.title || ''));
  warnings.push(
    ...lengthWarnings({
      intro: llmData?.intro || '',
      body: llmData?.body || '',
    })
  );

  // W004: run per onderdeel zodat we locatie kunnen melden
  warnings.push(...strongClaimWarnings(llmData?.title || '', { location: 'kop' }));
  warnings.push(...strongClaimWarnings(llmData?.intro || '', { location: 'intro' }));

  const paras = splitParagraphs(llmData?.body || '');
  paras.forEach((p, idx) => {
    const label = `${ordinalWordNl(idx + 1)} alinea`;
    warnings.push(...strongClaimWarnings(p, { location: label }));
  });

  warnings.push(...nameInconsistencyWarnings(llmData));
  warnings.push(...externalVerifyWarnings(llmData));

  // W016: consistency-audit
  warnings.push(...consistencyCheckWarnings(consistency));

  if (contactInfo?.found) warnings.push(...contactWarnings());

  return { errors, warnings };
}

module.exports = { runValidators };
