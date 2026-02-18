'use strict';
function titleLengthWarnings(title){
  const len=String(title||'').replace(/\s+/g,' ').trim().length;
  const warnings=[];
  if(len>0&&len<100) warnings.push({code:'W005',message:'Kop is korter dan 100 tekens. Controleer of dit voldoende is.'});
  if(len>150) warnings.push({code:'W006',message:'Kop is langer dan 150 tekens. Overweeg inkorten.'});
  return warnings;
}
module.exports={titleLengthWarnings};
