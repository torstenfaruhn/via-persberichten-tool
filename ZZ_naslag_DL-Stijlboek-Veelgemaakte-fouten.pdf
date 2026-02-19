'use strict';
function cc(s){return String(s||'').replace(/\r\n|\n|\r/g,' ').replace(/\s+/g,' ').trim().length;}
function lengthWarnings({intro,body}){
  const total=cc(intro)+cc(body);
  const inXS=total>=950&&total<=1150;
  const inS=total>=1750&&total<=1950;
  if(inXS||inS) return [];
  return [{code:'W007',message:'Lengte buiten de afgesproken bandbreedte. Controleer of dit oké is.'}];
}
module.exports={lengthWarnings};
