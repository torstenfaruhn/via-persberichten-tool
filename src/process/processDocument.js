'use strict';

const fs = require('fs/promises');
const { safeLog } = require('../security/safeLog');

const { extractText } = require('./extractText');
const { detectSecondPressRelease } = require('./secondPressReleaseDetector');
const { detectContactBlock } = require('./contactDetect');
const { loadStylebookText } = require('./stylebookLoader');
const { runValidators } = require('./runValidators');
const { buildOutput } = require('./outputBuilder');

const { generateStructured } = require('../llm/openaiClient');

const { buildAuditInstructions, buildAuditInput } = require('../llm/auditPromptBuilder');
const { AUDIT_SCHEMA } = require('../llm/auditSchema');

const { loadReferenceEntities } = require('../reference/referenceLoader');
const { applyReferenceRulesToAudit } = require('../reference/applyReferenceRules');

const { labelSourceText, labelConceptText, sanitizeAuditIssues } = require('./labelText');

function safeErrStr(err) {
  const name = String(err?.name || 'Error');
  const msg = String(err?.message || '').replace(/\s+/g, ' ').trim();
  return `${name}:${msg.slice(0, 240)}`;
}

function resolveFn(mod, name) {
  if (!mod) return null;

  // 1) CommonJS: module.exports = { buildInstructions, buildInput }
  if (typeof mod[name] === 'function') return mod[name];

  // 2) ESM-ish interop: module.exports = { default: { buildInstructions, buildInput } }
  if (typeof mod.default?.[name] === 'function') return mod.default[name];

  // 3) module.exports = function () {} (alleen voor buildInstructions/buildInput is dat onwaarschijnlijk,
  // maar we ondersteunen het voor compatibiliteit)
  if (typeof mod === 'function' && name === 'buildInstructions') return mod;

  return null;
}

// Fallbacks (identiek aan jullie oorspronkelijke src/llm/promptBuilder.js)
function defaultBuildInstructions({ stylebookText }) {
  const style = stylebookText ? `\n\nSTIJLBOEK:\n${stylebookText}\n` : '';
  return [
    'Je herschrijft een hyperlokaal persbericht naar een conceptnieuwsbericht voor De Limburger.',
    'Gebruik alleen informatie uit de bron. Verzinnen is niet toegestaan.',
    'Schrijf in B1, neutraal, zonder marketingtaal.',
    'Citaten blijven letterlijk en worden toegeschreven.',
    'Aanhalingstekens: gebruik Nederlandse typografische aanhalingstekens: „open” en ”sluit”. Gebruik geen ".',
    'Waarom en Hoe vul je alleen in als dat letterlijk in de bron staat.',
    'INTRO-regel: de intro bestaat uit precies 2 zinnen. Maximaal 20 woorden per zin.',
    'Geef ALLEEN geldige JSON terug conform het schema. Geen extra tekst.'
  ].join('\n') + style;
}

function defaultBuildInput({ sourceText }) {
  return ['BRONTEKST:', String(sourceText || '')].join('\n\n');
}

// PromptBuilder import (met compat-resolutie)
let buildInstructions;
let buildInput;
try {
  const promptBuilderMod = require('../llm/promptBuilder');
  buildInstructions = resolveFn(promptBuilderMod, 'buildInstructions') || defaultBuildInstructions;
  buildInput = resolveFn(promptBuilderMod, 'buildInput') || defaultBuildInput;

  // Log alleen “welke route”; geen inhoud.
  const usingFallback =
    buildInstructions === defaultBuildInstructions || buildInput === defaultBuildInput;
  safeLog(`promptBuilder_resolved:${usingFallback ? 'fallback' : 'module'}`);
} catch (err) {
  // Als de module niet laadt, val terug i.p.v. crash.
  safeLog(`promptBuilder_load_failed:${safeErrStr(err)}`);
  console.error('promptBuilder_load_failed:', err?.stack || err);
  buildInstructions = defaultBuildInstructions;
  buildInput = defaultBuildInput;
}

async function processDocument({ inputPath, outputPath, apiKey, maxSeconds }) {
  const start = Date.now();
  const max = Number(maxSeconds || 360);
  const timeLeftOk = () => ((Date.now() - start) / 1000) < max;

  try {
    const ex = await extractText(inputPath);
    if (!ex.ok) {
      return {
        ok: false,
        errorCode: ex.errorCode || 'E002',
        techHelp: ex.techHelp === true,
        signals: ex.signals || []
      };
    }

    if (!timeLeftOk()) {
      return {
        ok: false,
        errorCode: 'E005',
        techHelp: true,
        signals: [{ code: 'E005', message: 'Maximale verwerkingstijd overschreden. Herstart de tool (Ctrl+F5) en probeer het opnieuw.' }]
      };
    }

    const detector = detectSecondPressRelease(ex.rawText);
    const contact = detectContactBlock(ex.rawText);
    const stylebookText = await loadStylebookText();

    // MAIN LLM call
    const instructions = buildInstructions({ stylebookText });
    const input = buildInput({ sourceText: ex.text });

    const llm = await generateStructured({
      apiKey,
      instructions,
      input,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      retryOnce: true
    });

    if (!llm.ok) {
      const code = llm.errorCode || 'W010';
      safeLog(`error_code:${code}`);
      return {
        ok: false,
        errorCode: code,
        techHelp: llm.techHelp === true,
        signals: llm.signals || [{ code, message: 'Verwerking mislukt. Probeer het opnieuw.' }]
      };
    }

    if (!timeLeftOk()) {
      return {
        ok: false,
        errorCode: 'E005',
        techHelp: true,
        signals: [{ code: 'E005', message: 'Maximale verwerkingstijd overschreden. Herstart de tool (Ctrl+F5) en probeer het opnieuw.' }]
      };
    }

    // --- Consistency audit (LLM call #2) + Route A referentie-verrijking + labels/index ---
    let consistency = null;
    const disableAudit = String(process.env.DISABLE_CONSISTENCY_AUDIT || '').trim() === '1';

    if (!disableAudit && timeLeftOk()) {
      try {
        safeLog('audit_status:started');

        // Deterministische labels (bron & concept)
        const sourceLabeled = labelSourceText(ex.rawText);
        const conceptLabeled = labelConceptText({
          title: llm.data?.title || '',
          intro: llm.data?.intro || '',
          body: llm.data?.body || ''
        });

        const allowedLabels = [...sourceLabeled.labels, ...conceptLabeled.labels];

        // Audit prompt met gelabelde teksten
        const auditInstructions = buildAuditInstructions();
        const auditInput = buildAuditInput({
          labeledSourceText: sourceLabeled.labeledText,
          labeledConceptText: conceptLabeled.labeledText
        });

        const auditModel = process.env.OPENAI_AUDIT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
        const audit = await generateStructured({
          apiKey,
          instructions: auditInstructions,
          input: auditInput,
          model: auditModel,
          retryOnce: true,
          schema: AUDIT_SCHEMA
        });

        if (audit.ok) {
          const payload = audit.data || {};
          const issuesRaw = Array.isArray(payload.issues) ? payload.issues : [];
          const stats = payload.stats || { entities_checked: 0, place_links_checked: 0 };
          const modelOk = payload.ok === true;

          // Sanitize locators → alleen bestaande labels
          const issues = sanitizeAuditIssues(issuesRaw, allowedLabels);

          safeLog(`audit_status:ok issues=${issues.length} modelOk=${modelOk}`);

          // Als model ok=false maar wél issues: beschouw als bruikbaar
          if (!modelOk && issues.length === 0) {
            consistency = { ok: false, errorCode: 'AUDIT_NOT_OK', issues: [], stats };
          } else {
            const normalizedAudit = { ok: true, issues, stats };

            // Route A: referentielijst toepassen
            const ref = await loadReferenceEntities({ filePath: process.env.REFERENCE_ENTITIES_PATH });
            consistency = applyReferenceRulesToAudit(normalizedAudit, ref.entities);

            // UX 2.2: index label->zin voor BRONINDEX
            consistency._locatorIndex = {
              bron: sourceLabeled.labelToText,
              concept: conceptLabeled.labelToText
            };
          }
        } else {
          const ec = audit.errorCode || 'UNKNOWN';
          safeLog(`audit_status:failed errorCode=${ec}`);
          consistency = { ok: false, errorCode: ec, issues: [], stats: { entities_checked: 0, place_links_checked: 0 } };
        }
      } catch (err) {
        safeLog(`audit_status:failed errorCode=EXCEPTION ${safeErrStr(err)}`);
        console.error('audit_exception:', err?.stack || err);
        consistency = { ok: false, errorCode: 'EXCEPTION', issues: [], stats: { entities_checked: 0, place_links_checked: 0 } };
      }
    }

    if (!timeLeftOk()) {
      return {
        ok: false,
        errorCode: 'E005',
        techHelp: true,
        signals: [{ code: 'E005', message: 'Maximale verwerkingstijd overschreden. Herstart de tool (Ctrl+F5) en probeer het opnieuw.' }]
      };
    }

    const { errors, warnings } = runValidators({
      sourceCharCount: ex.charCount,
      llmData: llm.data,
      detectorResult: detector,
      contactInfo: contact,
      consistency
    });

    if (errors.length > 0) {
      safeLog(`error_code:${errors[0].code}`);
      return {
        ok: false,
        errorCode: errors[0].code,
        techHelp: errors[0].code === 'E005' || errors[0].code === 'W010',
        signals: errors
      };
    }

    const out = buildOutput({
      llmData: llm.data,
      signals: warnings,
      contactLines: contact.found ? contact.lines : [],
      consistency
    });

    await fs.writeFile(outputPath, out, 'utf-8');
    return { ok: true, signals: warnings };
  } catch (err) {
    safeLog(`error_code:W010 ${safeErrStr(err)}`);
    console.error('processDocument_exception:', err?.stack || err);

    return {
      ok: false,
      errorCode: 'W010',
      techHelp: true,
      signals: [{ code: 'W010', message: 'Technisch probleem tijdens verwerking. Herlaad de pagina (Ctrl+F5) en probeer het opnieuw.' }]
    };
  }
}

module.exports = { processDocument };
