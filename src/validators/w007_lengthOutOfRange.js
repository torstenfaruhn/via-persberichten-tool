'use strict';
const {cc}=require('../process/enforceLengths');

const MAX_INTRO_BODY_CHARS = Number(process.env.MAX_INTRO_BODY_CHARS ?? 2200);

function lengthWarnings({intro,body}){
  const total=cc(intro)+cc(body);
  // Ondergrens wordt elders afgehandeld (E004 of waarschuwing).
  // Hier alleen nog soft als het (ondanks inkorten) te lang blijft.
  if(total<=MAX_INTRO_BODY_CHARS) return [];
  return [{code:'W007',message:'Nieuwsbericht te lang: eindredacteur moet inkorten.'}];
}
module.exports={lengthWarnings};
