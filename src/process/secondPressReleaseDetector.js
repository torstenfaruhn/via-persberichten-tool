'use strict';
function looksLikeDateline(s){
  return /\b[A-ZÁÉÍÓÚÄËÏÖÜ][\w\-.' ]{2,30},\s?\d{1,2}([\-\/. ]\d{1,2}([\-\/. ]\d{2,4})?|\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{4})\b/i.test(s);
}
function looksLikeSeparator(s){return /^(\*\*\*+|—+|-{3,}|=+|einde persbericht)$/i.test(s.trim());}
function splitSections(raw){
  const lines=String(raw||'').split(/\r\n|\n|\r/);
  for(let i=0;i<lines.length;i++){
    if(looksLikeSeparator((lines[i]||'').trim())) return {first:lines.slice(0,i).join('\n'),second:lines.slice(i+1).join('\n')};
  }
  const joined=lines.join('\n');
  const parts=joined.split(/\n\s*\n\s*\n\s*\n+/);
  if(parts.length>=2) return {first:parts[0],second:parts.slice(1).join('\n')};
  return {first:joined,second:''};
}
function countChars(s){return String(s||'').replace(/\r\n|\n|\r/g,' ').replace(/\s+/g,' ').trim().length;}
function detectSecondPressRelease(raw){
  const {first,second}=splitSections(raw);
  const secondLen=countChars(second);
  let score=0; const triggers=[];
  const lines=second.split(/\r\n|\n|\r/).map(l=>l.trim()).filter(Boolean);
  if(lines.some(looksLikeDateline)){score+=2;triggers.push('dateline');}
  const lead=lines.slice(0,5).join(' ');
  if(lead.length>80&&lead.length<320&&/\./.test(lead)){score+=2;triggers.push('lead');}
  const titleLine=lines.slice(0,6).find(l=>l.length>=20&&l.length<=120&&!/[.!?]$/.test(l));
  if(titleLine){score+=1;triggers.push('title');}
  if(/(contact|pers|media|\bwww\.|@|\+31|\b06\b)/i.test(second)){score+=1;triggers.push('contact');}
  if(second){score+=1;triggers.push('separator');}
  let decision='none';
  if(score>=4&&secondLen>=900) decision='error';
  else if(score>=2) decision='warn';
  return {score,triggers,secondSectionCharCount:secondLen,decision};
}
module.exports={detectSecondPressRelease};
