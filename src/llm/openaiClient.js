'use strict';
const OpenAI=require('openai');
const {LLM_SCHEMA}=require('./schema');

function extractJsonText(resp){
  if(!resp) return null;
  if(typeof resp.output_text==='string'&&resp.output_text.trim()) return resp.output_text.trim();
  const out=resp.output||[];
  for(const item of out){
    if(item.type==='message'&&Array.isArray(item.content)){
      const t=item.content.find(c=>c.type==='output_text'||c.type==='text');
      if(t&&typeof t.text==='string') return t.text.trim();
    }
  }
  return null;
}
function safeParse(txt){try{return {ok:true,data:JSON.parse(txt)};}catch(_){return {ok:false};}}
async function callLLM({apiKey,instructions,input,model}){
  const client=new OpenAI({apiKey});
  const resp=await client.responses.create({
    model: model || 'gpt-4o-mini',
    instructions,
    input,
    store:false,
    text:{format:{type:'json_schema',json_schema:{name:LLM_SCHEMA.name,schema:LLM_SCHEMA.schema,strict:true}}}
  });
  return extractJsonText(resp);
}
async function generateStructured({apiKey,instructions,input,model,retryOnce}){
  try{
    const txt=await callLLM({apiKey,instructions,input,model});
    const p=safeParse(txt||'');
    if(p.ok) return {ok:true,data:p.data};
    if(retryOnce){
      const strictInstr=instructions+'\n\nBELANGRIJK: Je geeft alleen 1 JSON-object terug. Geen extra tekens ervoor of erna.';
      const txt2=await callLLM({apiKey,instructions:strictInstr,input,model});
      const p2=safeParse(txt2||'');
      if(p2.ok) return {ok:true,data:p2.data};
    }
    return {ok:false,errorCode:'W010',techHelp:true};
  }catch(_){
    return {ok:false,errorCode:'W010',techHelp:true};
  }
}
module.exports={generateStructured};
