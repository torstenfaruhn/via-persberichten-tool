'use strict';
const {M}=require('../validators/messages');
const {strongClaimWarnings}=require('../validators/w004_strongClaims');
const {nameInconsistencyWarnings}=require('../validators/w003_nameInconsistency');
const {externalVerifyWarnings}=require('../validators/w008_externalVerification');
const {lengthWarnings}=require('../validators/w007_lengthOutOfRange');
const {titleLengthWarnings}=require('../validators/w006_titleLength');
const {quoteWarnings}=require('../validators/w005_quotes');
const {contactWarnings}=require('../validators/w009_contactFound');

function runValidators({sourceCharCount,llmData,detectorResult,contactInfo}){
  const errors=[]; const warnings=[];
  if(detectorResult?.decision==='error'){
    // Voorheen: harde stop (E007). Nu: waarschuwing (W015) zodat de tool door kan.
    warnings.push({code:'W015',message:M.E007});
  }
  else if(detectorResult?.decision==='warn'){
    warnings.push({code:'W015',message:'Mogelijk meerdere persberichten in de upload. Controleer de bron.'});
  }

  if(typeof sourceCharCount==='number'&&sourceCharCount>0){
    warnings.push(...lengthWarnings(sourceCharCount));
  }

  warnings.push(...titleLengthWarnings(llmData));
  warnings.push(...quoteWarnings(llmData));
  warnings.push(...nameInconsistencyWarnings(llmData));
  warnings.push(...strongClaimWarnings(llmData));
  warnings.push(...externalVerifyWarnings(llmData));

  if(contactInfo?.found) warnings.push(...contactWarnings());
  return {errors,warnings};
}
module.exports={runValidators};
