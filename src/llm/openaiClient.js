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
function extractChatJsonText(resp){
  const txt=resp?.choices?.[0]?.message?.content;
  return (typeof txt==='string'&&txt.trim()) ? txt.trim() : null;
}
function safeParse(txt){
  try{
    const cleaned = normalizeJsonCandidate(txt);
    return {ok:true,data:JSON.parse(cleaned)};
  }catch(_){
    return {ok:false};
  }
}

function normalizeJsonCandidate(txt){
  let s = (typeof txt==='string' ? txt : '').trim();
  if(!s) return s;

  // Strip markdown code fences
  if (s.startsWith('```')) {
    const lines = s.split(/\r?\n/);
    // remove first fence line
    lines.shift();
    // remove last fence line if present
    if (lines.length && lines[lines.length - 1].trim().startsWith('```')) lines.pop();
    s = lines.join('\n').trim();
  }

  // If there's extra text around JSON, take the outermost object/array
  const firstObj = s.indexOf('{');
  const lastObj = s.lastIndexOf('}');
  const firstArr = s.indexOf('[');
  const lastArr = s.lastIndexOf(']');

  // Prefer object if it looks valid
  if(firstObj !== -1 && lastObj !== -1 && lastObj > firstObj){
    return s.slice(firstObj, lastObj+1).trim();
  }
  if(firstArr !== -1 && lastArr !== -1 && lastArr > firstArr){
    return s.slice(firstArr, lastArr+1).trim();
  }
  return s;
}


function isTypeError(err){return err instanceof TypeError || err?.name==='TypeError';}
function getStatus(err){return Number(err?.status || err?.response?.status || err?.statusCode || 0);}

async function callLLM({apiKey,instructions,input,model}){
  const client=new OpenAI({apiKey});
  const m=model || 'gpt-4o-mini';

  // Path A: Responses API (nieuw)
  if(client?.responses && typeof client.responses.create==='function'){
    try{
      const resp=await client.responses.create({
        model: m,
        instructions,
        input,
        store:false,
        text:{format:{type:'json_schema',json_schema:{name:LLM_SCHEMA.name,schema:LLM_SCHEMA.schema,strict:true}}}
      });
      return extractJsonText(resp);
    }catch(err){
      // Als dit pad faalt door SDK/endpoint mismatch, probeer Chat Completions.
      const status=getStatus(err);
      if(isTypeError(err) || status===404){
        // fallback hieronder
      }else{
        throw err;
      }
    }
  }

  // Path B: Chat Completions (ouder/breder compatibel)
  const resp=await client.chat.completions.create({
    model: m,
    messages:[
      {role:'system',content:instructions},
      {role:'user',content:input}
    ],
    response_format:{ type:'json_object' }
  });
  return extractChatJsonText(resp);
}

async function callLLMPlain({apiKey,instructions,input,model}){
  const client=new OpenAI({apiKey});
  const m=model || 'gpt-4o-mini';

  // Gebruik Chat Completions zonder response_format (max compatibiliteit).
  const resp=await client.chat.completions.create({
    model: m,
    messages:[
      {role:'system',content:instructions},
      {role:'user',content:input}
    ]
  });
  return extractChatJsonText(resp);
}


async function generateStructured({apiKey,instructions,input,model,retryOnce}){
  try{
    // Guard: voorkom te grote requests (snel en voorspelbaar)
    const maxChars = Number(process.env.MAX_LLM_CHARS || 120000);
    const approxChars = String(instructions||'').length + String(input||'').length;
    if(Number.isFinite(maxChars) && maxChars > 0 && approxChars > maxChars){
      return {
        ok:false,
        errorCode:'E413',
        techHelp:false,
        signals:[{code:'E413', message:`Invoer is te lang voor AI-verwerking (limiet ${maxChars} tekens). Maak het document korter of splits het op.`}]
      };
    }
    const txt=await callLLM({apiKey,instructions,input,model});
    const p=safeParse(txt||'');
    if(p.ok) return {ok:true,data:p.data};

    if(retryOnce){
      const strictInstr=instructions+'\n\nBELANGRIJK: Je geeft alleen 1 JSON-object terug. Geen extra tekens ervoor of erna.';
      const txt2=await callLLM({apiKey,instructions:strictInstr,input,model});
      const p2=safeParse(txt2||'');
      if(p2.ok) return {ok:true,data:p2.data};
    }

    return {ok:false, errorCode:'EJSON', techHelp:true, signals:[{code:'EJSON', message:'AI gaf geen geldig JSON-resultaat terug. Probeer het opnieuw; als dit blijft: korter document of beheerder.'}]};
  }catch(err){
    // Log alleen technische metadata (geen tekst/prompt)
    logOpenAIError(err);

    const classified = classifyOpenAIError(err);

    // Compat fallback: als structured output 400 geeft, probeer nog 1x zonder response_format.
    if(classified?.errorCode === 'E400' && retryOnce){
      try{
        const strictInstr = instructions + '

BELANGRIJK: Je geeft alleen 1 JSON-object terug. Geen extra tekens ervoor of erna.';
        const txt2 = await callLLMPlain({apiKey,instructions:strictInstr,input,model});
        const p2 = safeParse(txt2||'');
        if(p2.ok) return {ok:true,data:p2.data};
        return {
          ok:false,
          errorCode:'EJSON',
          techHelp:true,
          signals:[{code:'EJSON', message:'AI gaf geen geldig JSON-resultaat terug. Probeer het opnieuw; als dit blijft: korter document of beheerder.'}]
        };
      }catch(err2){
        logOpenAIError(err2);
        return {ok:false, ...classifyOpenAIError(err2)};
      }
    }

    return {ok:false, ...classified};
  }
}


function safe(v){ return (v===undefined||v===null) ? '' : String(v); }

function getErrMeta(err){
  const status = getStatus(err);
  const type = err?.error?.type || err?.type || err?.name || '';
  const code = err?.code || err?.cause?.code || err?.error?.code || '';
  const param = err?.error?.param || err?.param || '';
  return {status, type, code, param};
}

function logOpenAIError(err){
  const {status,type,code,param} = getErrMeta(err);
  // Alleen technische logging: status/type/code/param
  console.log(`openai_error:status=${safe(status)||'na'} type=${safe(type)} code=${safe(code)} param=${safe(param)}`);
}
module.exports={generateStructured};

function classifyOpenAIError(err){
  const status = getStatus(err);
  const errCode = String(err?.code || err?.cause?.code || '');

  // Netwerk/transport fouten (geen inhoud loggen)
  const netCodes = new Set([
    'ENOTFOUND','ECONNRESET','ETIMEDOUT','EAI_AGAIN','ECONNREFUSED',
    'UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET','UND_ERR_HEADERS_TIMEOUT'
  ]);
  if(netCodes.has(errCode)){
    return {
      errorCode: 'E503NET',
      techHelp: true,
      signals: [{ code:'E503NET', message:'Netwerkprobleem bij AI-koppeling. Probeer het opnieuw; als dit blijft: beheerder laten controleren.' }]
    };
  }

  // OpenAI/Upstream 5xx
  if(status >= 500){
    return {
      errorCode: 'E5XX',
      techHelp: true,
      signals: [{ code:'E5XX', message:'AI-dienst is tijdelijk niet beschikbaar (5xx). Probeer het later opnieuw.' }]
    };
  }

  // SDK mismatch / programmeerfout (geen tekstdata loggen/tonen)
  if(isTypeError(err)){
    return {
      errorCode: 'E400SDK',
      techHelp: true,
      signals: [{ code:'E400SDK', message:'Technische fout in AI-koppeling (SDK mismatch). Redeploy met vastgezette dependencies.' }]
    };
  }

  if(status === 400){
    return {
      errorCode: 'E400',
      techHelp: true,
      signals: [{ code:'E400', message:'AI weigert de aanvraag (400). Mogelijk te lange invoer of ongeldig formaat. Probeer een korter document.' }]
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
      signals: [{ code:'E404', message:'AI-model of endpoint niet beschikbaar (404). Controleer model en dependencies.' }]
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
