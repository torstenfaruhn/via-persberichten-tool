'use strict';
function cc(s){return String(s||'').replace(/\r\n|\n|\r/g,' ').replace(/\s+/g,' ').trim().length;}
function lengthWarnings({intro,body}){
  const total=cc(intro)+cc(body);
  if(total<=2150) return [];
  return [{code:'W007',message:'Intro+body is langer dan 2150 tekens. Eindredacteur moet inkorten.'}];
}
module.exports={lengthWarnings};
