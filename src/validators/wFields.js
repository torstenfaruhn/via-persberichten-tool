'use strict';
const {M}=require('./messages');
function missingWWarnings(llmData){
  const w=llmData&&llmData.w_fields?llmData.w_fields:{};
  const warnings=[];
  if(!String(w.wie||'').trim()) warnings.push({code:'W011',message:'Wie ontbreekt. Controleer of dit in de bron staat.'});
  if(!String(w.wat||'').trim()) warnings.push({code:'W012',message:'Wat ontbreekt. Controleer of dit in de bron staat.'});
  if(!String(w.waar||'').trim()) warnings.push({code:'W013',message:'Waar ontbreekt. Controleer of dit in de bron staat.'});
  if(!String(w.wanneer||'').trim()) warnings.push({code:'W014',message:'Wanneer ontbreekt. Controleer of dit in de bron staat.'});
  return {warnings};
}
function minFiveWError(llmData){
  const w=llmData&&llmData.w_fields?llmData.w_fields:{};
  const hard=['wie','wat','waar','wanneer','waarom'].filter(k=>!String(w[k]||'').trim());
  if(hard.length>=2) return {error:{code:'E006',message:M.E006}};
  return {error:null};
}
module.exports={missingWWarnings,minFiveWError};
