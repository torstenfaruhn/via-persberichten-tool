'use strict';
const OpenAI = require('openai');
const { LLM_SCHEMA } = require('./schema');
const { safeLog } = require('../security/safeLog');

function extractJsonText(resp) {
  if (!resp) return null;

  if (typeof resp.output_text === 'string' && resp.output_text.trim()) {
    return resp.output_text.trim();
  }

  const out = resp.output || [];
  for (const item of out) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      const t = item.content.find(c => c.type === 'output_text' || c.type === 'text');
      if (t && typeof t.text === 'string') return t.text.trim();
    }
  }
  return null;
}

function safeParse(txt) {
  try { return { ok: true, data: JSON.parse(txt) }; } catch (_) { return { ok: false }; }
}

function pickErrorMeta(err) {
  // OpenAI SDKs differ per version; support the common shapes.
  const status = Number(err?.status || err?.response?.status || err?.response?.statusCode || 0);

  const e =
    err?.error ||
    err?.response?.data?.error ||
    err?.response?.body?.error ||
    null;

  const code = (typeof e?.code === 'string' ? e.code : null) || (typeof err?.code === 'string' ? err.code : null);
  const param = (typeof e?.param === 'string' ? e.param : null) || null;
  const message = (typeof e?.message === 'string' ? e.message : null) || (typeof err?.message === 'string' ? err.message : null);

  return { status, code, param, message };
}

async function callLLM({ apiKey, instructions, input, model }) {
  const client = new OpenAI({ apiKey });

  // Let op: model is vereist in /responses. input mag string of array zijn.
  const resp = await client.responses.create({
    model: model || 'gpt-4o-mini',
    instructions,
    input,
    store: false,
    text: {
      format: {
        type: 'json_schema',
        json_schema: {
          name: LLM_SCHEMA.name,
          schema: LLM_SCHEMA.schema,
          strict: true
        }
      }
    }
  });

  return extractJsonText(resp);
}

async function generateStructured({ apiKey, instructions, input, model, retryOnce }) {
  try {
    const txt = await callLLM({ apiKey, instructions, input, model });
    const p = safeParse(txt || '');
    if (p.ok) return { ok: true, data: p.data };

    if (retryOnce) {
      const strictInstr = instructions + '\n\nBELANGRIJK: Je geeft alleen 1 JSON-object terug. Geen extra tekens ervoor of erna.';
      const txt2 = await callLLM({ apiKey, instructions: strictInstr, input, model });
      const p2 = safeParse(txt2 || '');
      if (p2.ok) return { ok: true, data: p2.data };
    }

    // JSON parse/format probleem (geen API-fout, maar output niet geldig)
    safeLog('openai_parse:invalid_json');
    return {
      ok: false,
      errorCode: 'E406',
      techHelp: true,
      signals: [{ code: 'E406', message: 'AI antwoord is niet in geldig JSON-formaat. Controleer prompt/schema of update de OpenAI library.' }]
    };
  } catch (err) {
    const meta = pickErrorMeta(err);

    // Alleen technische logs (geen inhoud).
    safeLog(`openai_status:${meta.status || 0}`);
    if (meta.code) safeLog(`openai_errcode:${String(meta.code).slice(0,80)}`);
    if (meta.param) safeLog(`openai_param:${String(meta.param).slice(0,120)}`);
    if (meta.message) safeLog(`openai_message:${String(meta.message).slice(0,180)}`);
    safeLog(`openai_errname:${String(err?.name || 'Error').slice(0,60)}`);

    return { ok: false, ...classifyOpenAIError(meta) };
  }
}

module.exports = { generateStructured };

function classifyOpenAIError(meta) {
  const status = Number(meta?.status || 0);
  const code = meta?.code || null;
  const param = meta?.param || null;

  if (status === 401) {
    return {
      errorCode: 'E401',
      techHelp: false,
      signals: [{ code: 'E401', message: 'AI weigert de API-key (401). Controleer of de key klopt en toegang heeft.' }]
    };
  }
  if (status === 403) {
    return {
      errorCode: 'E403',
      techHelp: false,
      signals: [{ code: 'E403', message: 'AI weigert toegang (403). Controleer rechten/billing van de API-key.' }]
    };
  }
  if (status === 404) {
    return {
      errorCode: 'E404',
      techHelp: true,
      signals: [{ code: 'E404', message: 'AI-model niet beschikbaar (404). Controleer het ingestelde model.' }]
    };
  }
  if (status === 429) {
    return {
      errorCode: 'E429',
      techHelp: true,
      signals: [{ code: 'E429', message: 'AI krijgt te veel aanvragen (429). Wacht even en probeer opnieuw.' }]
    };
  }
  if (status === 400) {
    // Dit is jouw huidige geval: missing_required_parameter.
    const extra = param ? ` (mist veld: ${param})` : '';
    const extra2 = code ? ` [${code}]` : '';
    return {
      errorCode: 'E400',
      techHelp: true,
      signals: [{
        code: 'E400',
        message: `AI verzoek is ongeldig (400)${extra2}${extra}. Meestal: verkeerde OpenAI library-versie of onjuiste request-velden.`
      }]
    };
  }
  if (status >= 500 && status <= 599) {
    return {
      errorCode: 'E500',
      techHelp: true,
      signals: [{ code: 'E500', message: `AI-serverfout (${status}). Probeer later opnieuw.` }]
    };
  }

  return {
    errorCode: 'W010',
    techHelp: true,
    signals: [{ code: 'W010', message: 'Technisch probleem bij AI-verwerking. Probeer het opnieuw.' }]
  };
}
