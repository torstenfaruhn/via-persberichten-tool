'use strict';
const fs=require('fs/promises');
const {safeLog}=require('../security/safeLog');
const {extractText}=require('./extractText');
const {detectSecondPressRelease}=require('./secondPressReleaseDetector');
const {detectContactBlock}=require('./contactDetect');
const {loadStylebookText}=require('./stylebookLoader');
const {runValidators}=require('./runValidators');
const {buildOutput}=require('./outputBuilder');
const {buildInstructions,buildInput}=require('../llm/promptBuilder');
const {generateStructured}=require('../llm/openaiClient');
const { buildAuditInstructions, buildAuditInput } = require('../llm/auditPromptBuilder');
const { AUDIT_SCHEMA } = require('../llm/auditSchema');
const { loadReferenceEntities } = require('../reference/referenceLoader');
const { applyReferenceRulesToAudit } = require('../reference/applyReferenceRules');

async function processDocument({inputPath,outputPath,apiKey,maxSeconds}){
  const start=Date.now();
  const max=Number(maxSeconds||360);

  const timeLeftOk=()=>((Date.now()-start)/1000)<max;

  try{
    const ex=await extractText(inputPath);
    if(!ex.ok) return {ok:false,errorCode:ex.errorCode||'E002',techHelp:ex.techHelp===true,signals:ex.signals||[]};
    if(!timeLeftOk()) return {ok:false,errorCode:'E005',techHelp:true,signals:[{code:'E005',message:'Maximale verwerkingstijd overschreden. Herstart de tool (Ctrl+F5) en probeer het opnieuw.'}]};

    const detector=detectSecondPressRelease(ex.rawText);
    const contact=detectContactBlock(ex.rawText);

    const stylebookText = await loadStylebookText();

    const instructions=buildInstructions({stylebookText});
    const input=buildInput({sourceText:ex.text});

    const llm=await generateStructured({
      apiKey,
      instructions,
      input,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      retryOnce: true
    });

   if(!llm.ok){
  const code = llm.errorCode || 'W010';
  safeLog(`error_code:${code}`);
  return {
    ok:false,
    errorCode: code,
    techHelp: llm.techHelp === true,
    signals: llm.signals || [{ code, message: 'Verwerking mislukt. Probeer het opnieuw.' }]
  };
}

    if(!timeLeftOk()) return {ok:false,errorCode:'E005',techHelp:true,signals:[{code:'E005',message:'Maximale verwerkingstijd overschreden. Herstart de tool (Ctrl+F5) en probeer het opnieuw.'}]};

    // --- Consistency audit (LLM call #2) + Route A referentie-verrijking ---
    let consistency = null;
    const disableAudit = String(process.env.DISABLE_CONSISTENCY_AUDIT || '').trim() === '1';
    if (!disableAudit && timeLeftOk()) {
      try {
        const auditInstructions = buildAuditInstructions();
        const auditInput = buildAuditInput({
          sourceText: ex.text,
          title: llm.data?.title || '',
          intro: llm.data?.intro || '',
          body: llm.data?.body || ''
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
          // Route A: lokale referentielijst toepassen (deterministisch)
          const ref = await loadReferenceEntities({ filePath: process.env.REFERENCE_ENTITIES_PATH });
          consistency = applyReferenceRulesToAudit(audit.data, ref.entities);
        } else {
          consistency = { ok: false, issues: [], stats: { entities_checked: 0, place_links_checked: 0 } };
        }
      } catch (_) {
        consistency = { ok: false, issues: [], stats: { entities_checked: 0, place_links_checked: 0 } };
      }
    }

    if(!timeLeftOk()) return {ok:false,errorCode:'E005',techHelp:true,signals:[{code:'E005',message:'Maximale verwerkingstijd overschreden. Herstart de tool (Ctrl+F5) en probeer het opnieuw.'}]};

    const {errors,warnings}=runValidators({
      sourceCharCount:ex.charCount,
      llmData:llm.data,
      detectorResult:detector,
      contactInfo:contact,
      consistency
    });
    if(errors.length>0){
      safeLog(`error_code:${errors[0].code}`);
      return {ok:false,errorCode:errors[0].code,techHelp:errors[0].code==='E005'||errors[0].code==='W010',signals:errors};
    }

    // Als audit uitstaat, consistency blijft null en wordt sectie niet getoond.
    // Als audit faalde, tonen we een korte melding onder CONSISTENTIECHECK.
    const out=buildOutput({
      llmData:llm.data,
      signals:warnings,
      contactLines:contact.found?contact.lines:[],
      consistency
    });
    await fs.writeFile(outputPath,out,'utf-8');
    return {ok:true,signals:warnings};
  }catch(_){
    safeLog('error_code:W010');
    return {ok:false,errorCode:'W010',techHelp:true,signals:[{code:'W010',message:'Technisch probleem tijdens verwerking. Herlaad de pagina (Ctrl+F5) en probeer het opnieuw.'}]};
  }
}
module.exports={processDocument};
