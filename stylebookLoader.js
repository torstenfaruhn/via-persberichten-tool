'use strict';
function normalizeText(raw){
  const oneLine=String(raw||'').replace(/\r\n|\n|\r/g,' ');
  const single=oneLine.replace(/\s+/g,' ').trim();
  return {text:single,charCount:single.length};
}
module.exports={normalizeText};
