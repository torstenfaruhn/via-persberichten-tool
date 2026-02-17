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

function runValidators({sourceCharCount,llmData,detectorResult,contactInfo}){
  const errors=[]; const warnings=[];

  if(detectorResult?.decision==='error'){
    errors.push({code:'E007',message:M.E007});
    return {errors,warnings};
  }
  if(detectorResult?.decision==='warn'){
    warnings.push({code:'W015',message:'Mogelijk tweede persbericht in het document. Controleer de bron.'});
  }

  // Harde lengte-eisen bron (na opschonen)
  if(typeof sourceCharCount==='number' && sourceCharCount<950){
    errors.push({code:'E004',message:M.E004});
    return {errors,warnings};
  }
  if(typeof sourceCharCount==='number' && sourceCharCount<1750){
    errors.push({code:'E004',message:M.E004});
    return {errors,warnings};
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

  // Harde lengte-eis output (intro+body)
  const outLen = cc(llmData?.intro||'') + cc(llmData?.body||'');
  if(outLen < 1750){
    errors.push({code:'E004',message:M.E004});
    return {errors,warnings};
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
