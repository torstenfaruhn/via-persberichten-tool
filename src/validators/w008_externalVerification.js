'use strict';
function hasRelativeTime(text){
  const t=String(text||'').toLowerCase();
  return /\b(vandaag|gisteren|morgen|vanmiddag|vanochtend|vanavond|nu)\b/.test(t);
}
function externalVerifyWarnings(llmData){
  const warnings=[];
  const combined=[llmData?.title,llmData?.intro,llmData?.body].filter(Boolean).join(' ');
  const hasAbsDate=/\b\d{1,2}\b.*\b(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\b/i.test(combined) || /\b\d{4}\b/.test(combined);
  if(hasRelativeTime(combined)&&!hasAbsDate){
    warnings.push({code:'W008',message:'Extern verifiëren: relatieve tijdsaanduiding gevonden. Voeg een datum toe of controleer.'});
    return warnings;
  }
  const ext=llmData?.flags?.extern_verifieren||[];
  if(Array.isArray(ext)&&ext.length>0){
    warnings.push({code:'W008',message:'Extern verifiëren: controleer namen, cijfers, data of citaten.'});
  }
  return warnings;
}
module.exports={externalVerifyWarnings};
