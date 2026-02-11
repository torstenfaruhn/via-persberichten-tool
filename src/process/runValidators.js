'use strict';
const { M } = require('../validators/messages');
const { strongClaimWarnings } = require('../validators/w004_strongClaims');
const { nameInconsistencyWarnings } = require('../validators/w003_nameInconsistency');
const { externalVerifyWarnings } = require('../validators/w008_externalVerification');
const { lengthWarnings } = require('../validators/w007_lengthOutOfRange');
const { titleLengthWarnings } = require('../validators/w005_w006_titleLen');
const { missingWWarnings, minFiveWError } = require('../validators/wFields');
const { contactWarnings } = require('../validators/w009_contactFound');

/**
 * Heuristiek: staat er in de bron (of in de gegenereerde tekst) een duidelijke “waarom”-onderbouwing?
 * Doel: W001 niet afvuren als er wel degelijk reden/onderbouwing in de bron staat.
 */
function hasWhySignals(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return false;

  // veelvoorkomende “waarom”-signalen in persberichten
  const patterns = [
    /\bomdat\b/,
    /\bvanwege\b/,
    /\bwegens\b/,
    /\bdankzij\b/,
    /\bde reden\b/,
    /\bals erkenning\b/,
    /\berkenning voor\b/,
    /\btoege(?:kend|wezen)\b.*\bomdat\b/,
    /\bon(de)?r de indruk\b/,
    /\bvoorbeeld\b.*\bwereldwijd\b/,
    /\bstrategisch(e)? initiatieven\b/,
    /\bprestaties\b.*\bstimul(?:eren|ering)\b/,
    /\binnovatie\b.*\beconomische groei\b/
  ];

  return patterns.some((re) => re.test(t));
}

function runValidators({ sourceCharCount, llmData, detectorResult, contactInfo, sourceText }) {
  const errors = [];
  const warnings = [];

  if (detectorResult?.decision === 'error') {
    errors.push({ code: 'E007', message: M.E007 });
    return { errors, warnings };
  }
  if (detectorResult?.decision === 'warn') {
    warnings.push({ code: 'W015', message: 'Mogelijk meerdere persberichten in de upload. Controleer de bron.' });
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

  // --- W001/W002 (Waarom/Hoe) slimmer maken ---
  const waarom = String(llmData?.w_fields?.waarom || '').trim();
  const hoe = String(llmData?.w_fields?.hoe || '').trim();

  // Gebruik bron als die is meegegeven; anders val terug op de gegenereerde tekst
  const combinedOut = [llmData?.title, llmData?.intro, llmData?.body].filter(Boolean).join(' ');
  const referenceText = String(sourceText || combinedOut);

  // W001: alleen waarschuwen als "waarom" leeg is én er ook geen waarom-signalen in bron/tekst staan
  if (!waarom && !hasWhySignals(referenceText)) {
    warnings.push({ code: 'W001', message: 'Waarom ontbreekt. Controleer of dit in de bron staat.' });
  }

  // W002: laten we streng zoals nu (want “hoe” is vaak echt afwezig), maar je kunt hier later dezelfde aanpak op loslaten
  if (!hoe) {
    warnings.push({ code: 'W002', message: 'Hoe ontbreekt. Controleer of dit in de bron staat.' });
  }

  warnings.push(...titleLengthWarnings(llmData?.title || ''));
  warnings.push(...lengthWarnings({ intro: llmData?.intro || '', body: llmData?.body || '' }));

  const fullText = [llmData?.title, llmData?.intro, llmData?.body].filter(Boolean).join(' ');
  warnings.push(...strongClaimWarnings(fullText));

  warnings.push(...nameInconsistencyWarnings(llmData));
  warnings.push(...externalVerifyWarnings(llmData));
  if (contactInfo?.found) warnings.push(...contactWarnings());

  return { errors, warnings };
}

module.exports = { runValidators };
