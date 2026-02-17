'use strict';
const {cc}=require('../process/enforceLengths');
function lengthWarnings({intro,body}){
  const total=cc(intro)+cc(body);
  // Ondergrens is hard (E004), dus hier alleen nog soft als het te lang blijft.
  if(total<=1950) return [];
  return [{code:'W007',message:'Nieuwsbericht te lang: eindredacteur moet inkorten.'}];
}
module.exports={lengthWarnings};
