'use strict';
function nameInconsistencyWarnings(llmData){
  const flags=llmData?.flags?.naam_inconsistenties||[];
  if(Array.isArray(flags)&&flags.length>0){
    return [{code:'W003',message:'Mogelijke naam-inconsistentie. Controleer spelling van namen/organisaties.'}];
  }
  return [];
}
module.exports={nameInconsistencyWarnings};
