'use strict';
const EMAIL_RE=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL_RE=/(https?:\/\/\S+|www\.\S+)/gi;
const PHONE_RE=/(\+31\s?6\s?\d{8}|06\s?\d{8}|0\d{1,3}[\s-]?\d{6,8})/g;
function detectContactBlock(sourceRaw){
  const raw=String(sourceRaw||'');
  const lines=raw.split(/\r\n|\n|\r/).map(l=>l.trim()).filter(Boolean);
  const startIdx=lines.findIndex(l=>/^(contact|voor vragen|noot voor de redactie|perscontact|media|niet voor publicatie)/i.test(l));
  let cand=[];
  if(startIdx>=0) cand=lines.slice(startIdx,startIdx+25);
  else{
    const idx=lines.findIndex(l=>EMAIL_RE.test(l)||PHONE_RE.test(l)||URL_RE.test(l));
    if(idx>=0) cand=lines.slice(Math.max(0,idx-2),Math.min(lines.length,idx+10));
  }
  EMAIL_RE.lastIndex=0;
  const keep=cand.filter(l=>
    /(contact|vragen|pers|media|niet voor publicatie)/i.test(l) ||
    EMAIL_RE.test(l)||PHONE_RE.test(l)||URL_RE.test(l)
  );
  const cleaned=keep.map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean).slice(0,10);
  const found=cleaned.some(l=>EMAIL_RE.test(l)||PHONE_RE.test(l)||URL_RE.test(l));
  EMAIL_RE.lastIndex=0;
  return {found,lines:cleaned};
}
module.exports={detectContactBlock};
