'use strict';
const CLAIM_WORDS=['uniek','beste','veiligst','nummer 1','wereldwijd','garandeert','bewezen','100%'];
function strongClaimWarnings(text){
  const t=String(text||'').toLowerCase();
  const hits=CLAIM_WORDS.filter(w=>t.includes(w));
  if(hits.length===0) return [];
  return [{code:'W004',message:'Sterke claim gevonden. Controleer of dit klopt en onderbouwd is.'}];
}
module.exports={strongClaimWarnings};
