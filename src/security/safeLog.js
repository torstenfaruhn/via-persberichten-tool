'use strict';

function safeLog(message) {
  if (!message || typeof message !== 'string') return;
  const clean = message.replace(/[\r\n]/g, ' ').slice(0, 400);
  console.log(clean);
}

/**
 * Veilige error-logger: GEEN content, GEEN prompts, GEEN api-keys.
 * Logt alleen technische velden die helpen bij debugging.
 */
function safeLogError(err, meta = {}) {
  try {
    const payload = {
      tag: 'error',
      at: meta.at || 'unknown',
      traceId: meta.traceId || null,
      code: meta.code || null,

      name: err?.name || null,
      errCode: err?.code || null,
      status: Number(err?.status || err?.response?.status || 0) || null,
      type: err?.type || null,

      // Keuze 1A: alleen eerste stackregel
      stack0:
        typeof err?.stack === 'string'
          ? err.stack.split('\n')[0].slice(0, 200)
          : null
    };

    console.log(JSON.stringify(payload));
    // Keuze 2: extra korte regel voor snelle zoekactie
    if (meta.code || meta.traceId) {
      safeLog(`error_code:${meta.code || 'unknown'} traceId=${meta.traceId || 'n/a'}`);
    }
  } catch (_) {
    safeLog('error_logger_failed');
  }
}

module.exports = { safeLog, safeLogError };
