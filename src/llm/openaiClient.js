'use strict';
const OpenAI=require('openai');
const {LLM_SCHEMA}=require('./schema');
const {safeLog}=require('../security/safeLog');

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

    safeLog('openai_parse_fail:1');
    return {ok:false, ...classifyOpenAIError({status:0,name:'PARSE_FAIL'})};
  }catch(err){
    const status = Number(err?.status || err?.response?.status || 0);
    const name = String(err?.name || 'unknown').slice(0,60);
    const code = String(err?.code || '').slice(0,60);
    if(status) safeLog(`openai_status:${status}`);
    safeLog(`openai_errname:${name}`);
    if(code) safeLog(`openai_errcode:${code}`);
    return {ok:false, ...classifyOpenAIError(err)};
  }
}

module.exports={generateStructured};

function classifyOpenAIError(err){
  const status = Number(err?.status || err?.response?.status || 0);
  const name = String(err?.name || '');

  // LLM output kon niet als JSON worden gelezen
  if(!status && name === 'PARSE_FAIL'){
    return {
      errorCode: 'E406',
      techHelp: true,
      signals: [{ code:'E406', message:'AI-antwoord is niet leesbaar als JSON. Probeer het opnieuw.' }]
    };
  }

  if(status === 400){
    return {
      errorCode: 'E400',
      techHelp: true,
      signals: [{ code:'E400', message:'AI-verzoek ongeldig (400). Controleer model/parameters en deploy opnieuw.' }]
    };
  }
  if(status === 403){
    return {
      errorCode: 'E403',
      techHelp: false,
      signals: [{ code:'E403', message:'AI weigert toegang (403). Controleer rechten van de API-key.' }]
    };
  }
  if(status >= 500 && status <= 599){
    return {
      errorCode: 'E500',
      techHelp: true,
      signals: [{ code:'E500', message:'AI-service heeft een storing (5xx). Probeer later opnieuw.' }]
    };
  }

  if(status === 401){
    return {
      errorCode: 'E401',
      techHelp: false,
      signals: [{ code:'E401', message:'AI weigert de API-key (401). Controleer of de key klopt en toegang heeft.' }]
    };
  }
  if(status === 404){
    return {
      errorCode: 'E404',
      techHelp: true,
      signals: [{ code:'E404', message:'AI-model niet beschikbaar (404). Controleer het ingestelde model.' }]
    };
  }
  if(status === 429){
    return {
      errorCode: 'E429',
      techHelp: true,
      signals: [{ code:'E429', message:'AI krijgt te veel aanvragen (429). Wacht even en probeer opnieuw.' }]
    };
  }

  // Fallback
  return {
    errorCode: 'W010',
    techHelp: true,
    signals: [{ code:'W010', message:'Technisch probleem bij AI-verwerking. Probeer het opnieuw.' }]
  };
}

