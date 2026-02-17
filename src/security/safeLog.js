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
      // technische kenmerken
      name: err?.name || null,
      errCode: err?.code || null,         // bv. ENOENT, ETIMEDOUT
      status: Number(err?.status || err?.response?.status || 0) || null,
      type: err?.type || null,            // sommige SDK's gebruiken dit
      // stack: alleen eerste regel (locatie), geen volledige stack dump
      stack0: typeof err?.stack === 'string' ? err.stack.split('\n')[0].slice(0, 200) : null
    };
    console.log(JSON.stringify(payload));
  } catch (_) {
    safeLog('error_logger_failed');
  }
}

module.exports = { safeLog, safeLogError };
