'use strict';
const {M}=require('../validators/messages');
const {strongClaimWarnings}=require('../validators/w004_strongClaims');
const {nameInconsistencyWarnings}=require('../validators/w003_nameInconsistency');
const {externalVerifyWarnings}=require('../validators/w008_externalVerification');
const {lengthWarnings}=require('../validators/w007_lengthOutOfRange');
const {titleLengthWarnings}=require('../validators/w005_w006_titleLen');
const {missingWWarnings,minFiveWError}=require('../validators/wFields');
const {contactWarnings}=require('../validators/w009_contactFound');
const {cc}=require('./enforceLengths');

const ABS_MIN_SOURCE_CHARS = Number(process.env.ABS_MIN_SOURCE_CHARS ?? 950);
const SOFT_MIN_SOURCE_CHARS = Number(process.env.SOFT_MIN_SOURCE_CHARS ?? 1200);
const ABS_MIN_OUTPUT_CHARS = Number(process.env.ABS_MIN_OUTPUT_CHARS ?? 1100);
const SOFT_MIN_OUTPUT_CHARS = Number(process.env.SOFT_MIN_OUTPUT_CHARS ?? 1400);

function runValidators({sourceCharCount,llmData,detectorResult,contactInfo}){
  const errors=[]; const warnings=[];

  if(detectorResult?.decision==='error'){
    errors.push({code:'E007',message:M.E007});
    return {errors,warnings};
  }
  if(detectorResult?.decision==='warn'){
    warnings.push({code:'W015',message:'Mogelijk tweede persbericht in het document. Controleer de bron.'});
  }

  // Lengte-eisen bron (na opschonen)
  // - ABS: hard (E004)
  // - SOFT: waarschuwing (80/20: liever output dan stop)
  if(typeof sourceCharCount==='number' && sourceCharCount<ABS_MIN_SOURCE_CHARS){
    errors.push({code:'E004',message:M.E004});
    return {errors,warnings};
  }
  if(typeof sourceCharCount==='number' && sourceCharCount<SOFT_MIN_SOURCE_CHARS){
    warnings.push({code:'W016',message:'Brontekst is aan de korte kant. Output kan minder volledig zijn; controleer en vul waar nodig aan.'});
  }

  const mw=missingWWarnings(llmData);
  warnings.push(...mw.warnings);

  const min=minFiveWError(llmData);
  if(min.error){
    errors.push(min.error);
    return {errors,warnings};
  }

  if(!String(llmData?.w_fields?.waarom||'').trim()) warnings.push({code:'W001',message:'Waarom ontbreekt. Controleer of dit in de bron staat.'});
  if(!String(llmData?.w_fields?.hoe||'').trim()) warnings.push({code:'W002',message:'Hoe ontbreekt. Controleer of dit in de bron staat.'});

  // Lengte-eisen output (intro+body)
  // - ABS: hard (E004)
  // - SOFT: waarschuwing (80/20: liever output dan stop)
  const outLen = cc(llmData?.intro||'') + cc(llmData?.body||'');
  if(outLen < ABS_MIN_OUTPUT_CHARS){
    errors.push({code:'E004',message:M.E004});
    return {errors,warnings};
  }
  if(outLen < SOFT_MIN_OUTPUT_CHARS){
    warnings.push({code:'W017',message:'Output is korter dan de richtlijn. Eindredacteur kan inkorten/aanpassen of waar nodig aanvullen.'});
  }

  warnings.push(...titleLengthWarnings(llmData?.title||''));
  warnings.push(...lengthWarnings({intro:llmData?.intro||'',body:llmData?.body||''}));

  warnings.push(...strongClaimWarnings([llmData?.title,llmData?.intro,llmData?.body].filter(Boolean).join(' ')));
  warnings.push(...nameInconsistencyWarnings(llmData));
  warnings.push(...externalVerifyWarnings(llmData));
  if(contactInfo?.found) warnings.push(...contactWarnings());
  return {errors,warnings};
}
module.exports={runValidators};