'use strict';
const fs=require('fs/promises');
const {safeLog}=require('../security/safeLog');
const {extractText}=require('./extractText');
const {detectSecondPressRelease}=require('./secondPressReleaseDetector');
const {detectContactBlock}=require('./contactDetect');
const {runValidators}=require('./runValidators');
const {buildOutput}=require('./outputBuilder');
const {buildInstructions,buildInput}=require('../llm/promptBuilder');
const {generateStructured}=require('../llm/openaiClient');

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

    const instructions=buildInstructions({stylebookText:''});
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

    const {errors,warnings}=runValidators({sourceCharCount:ex.charCount,llmData:llm.data,detectorResult:detector,contactInfo:contact});
    if(errors.length>0){
      safeLog(`error_code:${errors[0].code}`);
      return {ok:false,errorCode:errors[0].code,techHelp:errors[0].code==='E005'||errors[0].code==='W010',signals:errors};
    }

    const out=buildOutput({llmData:llm.data,signals:warnings,contactLines:contact.found?contact.lines:[]});
    await fs.writeFile(outputPath,out,'utf-8');
    return {ok:true,signals:warnings};
  }catch(_){
    safeLog('error_code:W010');
    return {ok:false,errorCode:'W010',techHelp:true,signals:[{code:'W010',message:'Technisch probleem tijdens verwerking. Herlaad de pagina (Ctrl+F5) en probeer het opnieuw.'}]};
  }
}
module.exports={processDocument};
