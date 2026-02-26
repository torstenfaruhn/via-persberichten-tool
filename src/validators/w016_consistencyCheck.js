'use strict';

function consistencyCheckWarnings(consistency) {
  if (consistency && consistency.ok === false) {
    return [
      {
        code: 'W017',
        message: 'Consistentiecheck niet beschikbaar. Controleer eigennamen en plaatskoppelingen handmatig.'
      }
    ];
  }
  const issues = Array.isArray(consistency?.issues) ? consistency.issues : [];
  if (issues.length === 0) return [];

  return [
    {
      code: 'W016',
      message: 'Mogelijke inconsistenties in eigennamen of plaatskoppelingen. Zie CONSISTENTIECHECK.'
    }
  ];
}

module.exports = { consistencyCheckWarnings };
