'use strict';
const OpenAI = require('openai');
const { LLM_SCHEMA } = require('./schema');

function extractJsonText(resp) {
  if (!resp) return null;
  if (typeof resp.output_text === 'string' && resp.output_text.trim()) return resp.output_text.trim();
  const out = resp.output || [];
  for (const item of out) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      const t = item.content.find((c) => c.type === 'output_text' || c.type === 'text');
      if (t && typeof t.text === 'string') return t.text.trim();
    }
  }
  return null;
}

function safeParse(txt) {
  try {
    return { ok: true, data: JSON.parse(txt) };
  } catch (_) {
    return { ok: false };
  }
}

// Alleen technische diagnosevelden. Geen tekst, geen API-key.
function buildDiag(err) {
  return {
    stage: 'openai_call',
    httpStatus: Number(err?.status || err?.response?.status || 0) || 0,
    errName: err?.name ? String(err.name) : null,
    errCode: err?.code ? String(err.code) : null
  };
}

function classifyOpenAIError(err) {
  const diag = buildDiag(err);
  const s = diag.httpStatus;

  if (s === 401) {
    return {
      ok: false,
      errorCode: 'E401',
      techHelp: false,
      diag,
      signals: [{ code: 'E401', message: 'AI weigert de API-key (401). Controleer of de key klopt en toegang heeft.' }]
    };
  }

  if (s === 404) {
    return {
      ok: false,
      errorCode: 'E404',
      techHelp: true,
      diag,
      signals: [{ code: 'E404', message: 'AI-model niet beschikbaar (404). Controleer de ingestelde modelnaam.' }]
    };
  }

  if (s === 429) {
    return {
      ok: false,
      errorCode: 'E429',
      techHelp: true,
      diag,
      signals: [{ code: 'E429', message: 'Te veel AI-aanvragen (429). Wacht even en probeer het opnieuw.' }]
    };
  }

  // Netwerk/egress issues (status vaak 0)
  const netCodes = new Set(['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED']);
  if (diag.errCode && netCodes.has(diag.errCode)) {
    return {
      ok: false,
      errorCode: 'E0NET',
      techHelp: true,
      diag,
      signals: [{ code: 'E0NET', message: 'Netwerkprobleem richting AI. Probeer het opnieuw.' }]
    };
  }

  return {
    ok: false,
    errorCode: 'W010',
    techHelp: true,
    diag,
    signals: [{ code: 'W010', message: 'Technisch probleem bij AI-verwerking. Probeer het opnieuw.' }]
  };
}

async function callLLM({ apiKey, instructions, input, model }) {
  const client = new OpenAI({ apiKey });
  const resp = await client.responses.create({
    model: model || 'gpt-4o-mini',
    instructions,
    input,
    store: false,
    text: {
      format: {
        type: 'json_schema',
        json_schema: { name: LLM_SCHEMA.name, schema: LLM_SCHEMA.schema, strict: true }
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
      const strictInstr =
        instructions + '\n\nBELANGRIJK: Je geeft alleen 1 JSON-object terug. Geen extra tekens ervoor of erna.';
      const txt2 = await callLLM({ apiKey, instructions: strictInstr, input, model });
      const p2 = safeParse(txt2 || '');
      if (p2.ok) return { ok: true, data: p2.data };
    }

    // Geen exception, maar geen parseerbare JSON: behandel als technische fout.
    return classifyOpenAIError(null);
  } catch (err) {
    return classifyOpenAIError(err);
  }
}

module.exports = { generateStructured };
