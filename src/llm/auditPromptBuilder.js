'use strict';

function buildAuditInstructions() {
  return [
    'Je bent een auditmodule die inconsistenties detecteert in eigennamen en plaatskoppelingen.',
    'Je gebruikt uitsluitend de gegeven BRONTEKST en het CONCEPT.',
    'Je corrigeert of herschrijft niets en introduceert geen nieuwe feiten.',
    'Je bepaalt niet wat waar is; je signaleert alleen interne conflicten.',
    'Geef ALLEEN geldige JSON terug conform het schema. Geen extra tekst.'
  ].join('\n');
}

function buildAuditInput({ sourceText, title, intro, body }) {
  const example1 = {
    ok: true,
    issues: [
      {
        type: 'plaatskoppeling',
        entity_canonical: 'Glaspaleis',
        entity_type: 'gebouw',
        variants: ['Glaspaleis', 'het Glaspaleis'],
        places: ['Heerlen', 'Simpelveld'],
        evidence: [
          { where: 'bron', locator: 'bron:alinea2:zin1', snippet: '… Glaspaleis in Heerlen …' },
          { where: 'bron', locator: 'bron:alinea4:zin2', snippet: '… in het Glaspaleis te Simpelveld …' }
        ],
        severity: 'hoog',
        confidence: 'hoog',
        note: 'Zelfde gebouw lijkt aan twee verschillende plaatsen gekoppeld.'
      }
    ],
    stats: { entities_checked: 0, place_links_checked: 0 }
  };

  const example2 = {
    ok: true,
    issues: [
      {
        type: 'schrijfwijze',
        entity_canonical: 'Zuyderland Medisch Centrum',
        entity_type: 'organisatie',
        variants: ['Zuyderland Medisch Centrum', 'Zuyderland Medisch centrum'],
        places: [],
        evidence: [
          { where: 'concept', locator: 'concept:intro:zin1', snippet: 'Zuyderland Medisch centrum meldt …' },
          { where: 'concept', locator: 'concept:body:alinea2:zin1', snippet: 'Volgens Zuyderland Medisch Centrum …' }
        ],
        severity: 'middel',
        confidence: 'hoog',
        note: 'Waarschijnlijkzelfde organisatie, maar wisselende kapitalisatie.'
      }
    ],
    stats: { entities_checked: 0, place_links_checked: 0 }
  };

  return [
    'TAK',
    'Analyseer BRONTEKST en CONCEPT op inconsistenties.',
    '',
    'BELANGRIJK OVER "ok"',
    '- Zet "ok" op true zodra je de analyse kunt uitvoeren.',
    '- Zet "ok" alleen op false als BRONTEKST of CONCEPT ontbreekt of te leeg is om te analyseren.',
    '- Zet "ok" NIET op false alleen omdat je onzeker bent; gebruik daarvoor "confidence" en "severity".',
    '',
    'A) Schrijfwijze-inconsistenties (eigennamen)',
    '- Rapporteer een issue als dezelfde entiteit binnen BRONTEKST+CONCEPT meerdere schrijfwijzen heeft die waarschijnlijk naar dezelfde entiteit verwijzen.',
    '- Flag alleen als er minstens 2 verschillende varianten voorkomen.',
    '',
    'B) Plaatskoppeling-inconsistenties',
    '- Rapporteer een issue als dezelfde entiteit in hetzelfde document gekoppeld wordt aan meerdere plaatsnamen.',
    '- Flag alleen als er minstens 2 verschillende plaatsen voorkomen.',
    '',
    'NORMALISATIE (voor matching; output behoudt originele varianten)',
    '- Case-insensitive vergelijken; diacritics negeren (é~e); meerdere spaties samenvoegen.',
    "- Negeer leidende lidwoorden voor entiteiten: de/het/'t.",
    '- Rechtsvorm-varianten als gelijk behandelen: B.V.~BV, N.V.~NV.',
    '- Interpunctie-/hyphen-varianten als gelijk behandelen ("-", "–").',
    '- Personen: initialen vs. voornaam niet automatisch mergen tenzij context heel duidelijk is (dan severity laag/middel).',
    '',
    'WAT TELT ALS PLAATSKOPPELING (sterke patronen)',
    '- “{ENTITEIT} in {PLAATS}”, “{ENTITEIT} te {PLAATS}”, “{ENTITEIT} ({PLAATS})”, “{ENTITEIT}, {PLAATS}”.',
    '- Adresregel met plaatsnaam mag meewegen als de entiteit in dezelfde zin/regel staat.',
    '- Zwakke patronen (lager vertrouwen): “vanuit {PLAATS}”, “regio {PLAATS}”.',
    '',
    'EVIDENCE & LOCATORS',
    '- Voeg per issue evidence-items toe die de conflicterende vormen/plaatsen laten zien (minimaal 2 als er 2 conflicterende vormen/plaatsen zijn).',
    '- Locator-formaat: bron:alinea{n}:zin{m} en concept:titel, concept:intro:zin{m}, concept:body:alinea{n}:zin{m}.',
    '- Snippet is max 120 tekens.',
    '',
    'SEVERITY/CONFIDENCE (rubric)',
    '- Plaatskoppeling: hoog als dezelfde entiteit met sterke patronen aan 2+ verschillende plaatsen hangt. Middel als 1 link ambigue is.',
    '- Schrijfwijze: hoog bij duidelijke spelfout/andere naam; middel bij kapitalisatie/stijl; laag bij twijfelgevallen.',
    '',
    'VOORBEELD (plaatskoppeling)',
    JSON.stringify(example1, null, 2),
    '',
    'VOORBEELD (schrijfwijze)',
    JSON.stringify(example2, null, 2),
    '',
    'BRONTEKST:',
    String(sourceText || ''),
    '',
    'CONCEPT_TITEL:',
    String(title || ''),
    '',
    'CONCEPT_INTRO:',
    String(intro || ''),
    '',
    'CONCEPT_BODY:',
    String(body || '')
  ].join('\n');
}

module.exports = { buildAuditInstructions, buildAuditInput };
