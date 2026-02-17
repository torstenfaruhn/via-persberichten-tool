'use strict';
const OpenAI = require('openai');
const { LLM_SCHEMA } = require('./schema');

/**
 * Alleen technische logging (geen tekst/persoonsdata).
 * Render logs zijn tijdelijk; er wordt niets lokaal bewaard.
 */
function techLog(line){
  try{ console.log(String(line).slice(0, 400)); }catch(_){}
}

function extractJsonText(resp){
  if(!resp) return null;
  if(typeof resp.output_text === 'string' && resp.output_text.trim()) return resp.output_text.trim();
  const out = resp.output || [];
  for(const item of out){
    if(item.type === 'message' && Array.isArray(item.content)){
      const t = item.content.find(c => c.type === 'output_text' || c.type === 'text');
      if(t && typeof t.text === 'string') return t.text.trim();
    }
  }
  return null;
}

function safeParse(txt){
  try{ return { ok:true, data: JSON.parse(txt) }; }
  catch(_){ return { ok:false }; }
}

/**
 * Belangrijk:
 * De Responses API verwacht JSON-schema op:
 * text.format.{ type, name, schema, strict }
 * (niet onder text.format.json_schema.*)
 */
async function callLLM({ apiKey, instructions, input, model }){
  const client = new OpenAI({ apiKey });
  const resp = await client.responses.create({
    model: model || 'gpt-4o-mini',
    instructions,
    input,
    store: false,
    text: {
      format: {
        type: 'json_schema',
        name: LLM_SCHEMA.name || 'persbericht_schema_v1',
        schema: LLM_SCHEMA.schema,
        strict: true
      }
    }
  });
  return extractJsonText(resp);
}

async function generateStructured({ apiKey, instructions, input, model, retryOnce }){
  try{
    const txt = await callLLM({ apiKey, instructions, input, model });
    const p = safeParse(txt || '');
    if(p.ok) return { ok:true, data: p.data };

    if(retryOnce){
      const strictInstr =
        instructions +
        '\n\nBELANGRIJK: Je geeft alleen 1 JSON-object terug. Geen extra tekens ervoor of erna.';
      const txt2 = await callLLM({ apiKey, instructions: strictInstr, input, model });
      const p2 = safeParse(txt2 || '');
      if(p2.ok) return { ok:true, data: p2.data };
    }

    // Geen JSON teruggekregen
    return {
      ok:false,
      errorCode: 'E406',
      techHelp: true,
      signals: [{ code:'E406', message:'AI antwoord is geen geldig JSON. Probeer opnieuw of controleer het prompt/schema.' }]
    };
  }catch(err){
    // Technische details voor debugging (geen inhoud)
    const status = Number(err?.status || err?.response?.status || 0);
    const code = String(err?.code || err?.error?.code || '');
    const param = String(err?.param || err?.error?.param || err?.response?.data?.error?.param || '');
    const message = String(err?.message || err?.response?.data?.error?.message || '');

    if(status) techLog(`openai_status:${status}`);
    if(code) techLog(`openai_errcode:${code}`);
    if(param) techLog(`openai_param:${param}`);
    if(message) techLog(`openai_message:${message.slice(0, 200)}`);
    if(err?.name) techLog(`openai_errname:${String(err.name).slice(0, 80)}`);

    return { ok:false, ...classifyOpenAIError(err) };
  }
}

module.exports = { generateStructured };

function classifyOpenAIError(err){
  const status = Number(err?.status || err?.response?.status || 0);
  const code = String(err?.code || err?.error?.code || err?.response?.data?.error?.code || '');
  const param = String(err?.param || err?.error?.param || err?.response?.data?.error?.param || '');
  const message = String(err?.message || err?.response?.data?.error?.message || '');

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
  if(status === 400){
    // Laat param/message zien in de UI (technisch, geen tekst-inhoud)
    const tail = [
      param ? `param=${param}` : '',
      code ? `code=${code}` : ''
    ].filter(Boolean).join(', ');
    return {
      errorCode: 'E400',
      techHelp: true,
      signals: [{
        code:'E400',
        message: `AI verzoek ongeldig (400). ${tail || 'Controleer model/parameters/schema.'}${message ? ' ' + message.slice(0, 160) : ''}`.trim()
      }]
    };
  }
  if(status === 403){
    return {
      errorCode: 'E403',
      techHelp: false,
      signals: [{ code:'E403', message:'AI weigert toegang (403). Controleer rechten/billing van de API-key.' }]
    };
  }
  if(status >= 500 && status <= 599){
    return {
      errorCode: 'E500',
      techHelp: true,
      signals: [{ code:'E500', message:'AI serverfout (5xx). Probeer later opnieuw.' }]
    };
  }

  // Fallback
  return {
    errorCode: 'W010',
    techHelp: true,
    signals: [{ code:'W010', message:'Technisch probleem bij AI-verwerking. Probeer het opnieuw.' }]
  };
}
