'use strict';
const fs=require('fs/promises'); const path=require('path');
const mammoth=require('mammoth'); const pdfParse=require('pdf-parse');
const {normalizeText}=require('./normalize');
function ext(p){return path.extname(p||'').toLowerCase();}
async function extractText(inputPath){
  try{
    const e=ext(inputPath); let raw='';
    if(e==='.txt'){raw=await fs.readFile(inputPath,'utf-8');}
    else if(e==='.docx'){const buf=await fs.readFile(inputPath); const r=await mammoth.extractRawText({buffer:buf}); raw=(r&&r.value)||'';}
    else if(e==='.pdf'){const buf=await fs.readFile(inputPath); const r=await pdfParse(buf); raw=(r&&r.text)||'';}
    else return {ok:false,errorCode:'E002',techHelp:false,signals:[{code:'E002',message:'Bestandstype niet ondersteund.'}]};
    const n=normalizeText(raw);
    if(n.charCount<800) return {ok:false,errorCode:'E003',techHelp:false,signals:[{code:'E003',message:'Te weinig bruikbare brontekst. Upload een ander bestand.'}]};
    return {ok:true,rawText:raw,text:n.text,charCount:n.charCount,fileType:e.replace('.','')};
  }catch(_){
    return {ok:false,errorCode:'E002',techHelp:true,signals:[{code:'E002',message:'Bestand kan niet worden gelezen. Upload een ander bestand.'}]};
  }
}
module.exports={extractText};
