'use strict';
function bullets(signals){
  const arr=Array.isArray(signals)?signals:[];
  if(arr.length===0) return '- Geen meldingen.';
  return arr.map(s=>`- ${s.code}: ${s.message}`).join('\n');
}
function buildOutput({llmData,signals,contactLines}){
  const parts=[];
  parts.push('KOP'); parts.push(String(llmData.title||'').trim()); parts.push('');
  parts.push('INTRO'); parts.push(String(llmData.intro||'').trim()); parts.push('');
  parts.push('BODY'); parts.push(String(llmData.body||'').trim()); parts.push('');
  parts.push('SIGNALEN'); parts.push(bullets(signals)); parts.push('');
  parts.push('BRON'); parts.push(String(llmData.bron||'').trim()||'Op basis van een persbericht.');
  if(Array.isArray(contactLines)&&contactLines.length>0){
    parts.push(''); parts.push('CONTACT (niet voor publicatie)'); parts.push(contactLines.join('\n'));
  }
  parts.push('');
  return parts.join('\n');
}
module.exports={buildOutput};
