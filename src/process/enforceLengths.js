'use strict';

/**
 * Word-telling (tekens incl. spaties):
 * - vervangt regeleinden door spaties
 * - normaliseert dubbele spaties
 * - trimt
 */
function cc(s){
  return String(s||'').replace(/\r\n|\n|\r/g,' ').replace(/\s+/g,' ').trim().length;
}

function normalize(s){
  return String(s||'').replace(/\r\n|\n|\r/g,' ').replace(/\s+/g,' ').trim();
}

function truncateAtWordBoundary(text, max){
  const t = normalize(text);
  if(cc(t) <= max) return t;

  // Neem max+1 om veilig een woordgrens te vinden, dan terug.
  const slice = t.slice(0, Math.max(0, max + 1));

  // Probeer een nette knip: laatste punt binnen bereik, anders laatste spatie.
  const lastDot = slice.lastIndexOf('. ');
  if(lastDot >= 80) return normalize(slice.slice(0, lastDot + 1));

  const lastSpace = slice.lastIndexOf(' ');
  if(lastSpace >= 40) return normalize(slice.slice(0, lastSpace));

  return normalize(t.slice(0, max));
}

/**
 * Past maxima toe:
 * - kop <= 150 tekens (Word-telling)
 * - intro + body <= 1950 tekens (Word-telling)
 * De tool probeert eerst body te korten; intro blijft zo veel mogelijk intact.
 */
function enforceMaxLengths(llmData){
  const d = Object.assign({}, llmData || {});
  d.title = truncateAtWordBoundary(d.title || '', 150);

  const intro = normalize(d.intro || '');
  let body = normalize(d.body || '');

  const total = cc(intro) + cc(body);
  if(total <= 1950){
    d.intro = intro;
    d.body = body;
    return d;
  }

  // Eerst body inkorten zodat intro volledig kan blijven staan.
  const maxBody = Math.max(0, 1950 - cc(intro));
  if(maxBody === 0){
    d.intro = truncateAtWordBoundary(intro, 1950);
    d.body = '';
    return d;
  }

  body = truncateAtWordBoundary(body, maxBody);
  d.intro = intro;
  d.body = body;
  return d;
}

module.exports = { cc, enforceMaxLengths };
