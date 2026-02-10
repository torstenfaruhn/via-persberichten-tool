'use strict';

const OpenAI = require('openai');
const { LLM_SCHEMA } = require('./schema');

/**
 * Haalt de tekst terug uit de Responses API response.
 */
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

/**
 * Zet OpenAI/SDK fouten om naar duidelijke (maar privacy-safe) codes.
 * Log GEEN tekst, alleen codes.
 */
function classifyOpenAIError(err) {
  // OpenAI SDK errors hebben meestal `status` (HTTP) of `response.status`.
  const status = Number(err?.status || err?.response?.status || 0);

  // Veelvoorkomend: SDK mismatch / methode bestaat niet / wrong import
  const msg = String(err?.message || '');
  const isSdkMismatch =
    msg.includes('responses') ||
    msg.includes('is not a function') ||
    msg.includes('Cannot read properties of undefined') ||
    msg.includes('undefined');

  if (status === 401) {
    return {
      ok: false,
      errorCode: 'E401',
      techHelp: false,
      signals: [{ code: 'E401', message: 'AI weigert de API-key (401). Controleer of de key klopt en toegang heeft.' }]
    };
  }

  if (status === 404) {
    return {
      ok: false,
      errorCode: 'E404',
      techHelp: true,
      signals: [{ code: 'E404', message: 'AI-model niet beschikbaar (404). Controleer de ingestelde modelnaam.' }]
    };
  }

  if (status === 429) {
    return {
      ok: false,
      errorCode: 'E429',
      techHelp: true,
      signals: [{ code: 'E429', message: 'Te veel AI-aanvragen (429). Wacht even en probeer het opnieuw.' }]
    };
  }

  // Als status 0 en het lijkt op SDK mismatch, geef een aparte code.
  if (!status && isSdkMismatch) {
    return {
      ok: false,
      errorCode: 'ESDK',
      techHelp: true,
      signals: [{ code: 'ESDK', message: 'AI-koppeling werkt niet in deze omgeving. Controleer de OpenAI library-versie.' }]
    };
  }

  // Overige onbekende technische fout
  return {
    ok: false,
    errorCode: 'W010',
    techHelp: true,
    signals: [{ code: 'W010', message: 'Technisch probleem bij AI-verwerking. Probeer het opnieuw.' }]
  };
}

async function callLLM({ apiKey, instructions, input, model }) {
  const client = new OpenAI({ apiKey });

  // Let op: deze call kan falen als de geïnstalleerde openai-versie dit niet ondersteunt.
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

    // Geen exception, maar wel geen geldig JSON => behandel als technisch probleem (blijft W010)
    return classifyOpenAIError(null);
  } catch (err) {
    return classifyOpenAIError(err);
  }
}

module.exports = { generateStructured };
