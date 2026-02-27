'use strict';

function buildAuditInstructions() {
  return [
    'Je bent een auditmodule die inconsistenties detecteert in eigennamen en plaatskoppelingen.',
    'Je gebruikt uitsluitend de gegeven BRON_GELABELD en CONCEPT_GELABELD.',
    'Je corrigeert of herschrijft niets en introduceert geen nieuwe feiten.',
    'Je bepaalt niet wat waar is; je signaleert alleen interne conflicten.',
    'Geef ALLEEN geldige JSON terug conform het schema. Geen extra tekst.'
  ].join('\n');
}

function buildAuditInput({ labeledSourceText, labeledConceptText }) {
  // Few-shot voorbeeld met labels (kort houden om tokens te sparen)
  const example = {
    ok: true,
    issues: [
      {
        type: 'plaatskoppeling',
        entity_canonical: 'Glaspaleis',
        entity_type: 'gebouw',
        variants: ['Glaspaleis', 'het Glaspaleis'],
        places: ['Heerlen', 'Simpelveld'],
        evidence: [
          { where: 'bron', locator: '[BRON A02 Z07]', snippet: 'De lezing is … Glaspaleis in Heerlen.' },
          { where: 'bron', locator: '[BRON A02 Z10]', snippet: 'De filmzaal van het Glaspaleis in Simpelveld …' }
        ],
        severity: 'hoog',
        confidence: 'hoog',
        note: 'Zelfde gebouw lijkt aan twee verschillende plaatsen gekoppeld.'
      }
    ],
    stats: { entities_checked: 0, place_links_checked: 0 }
  };

  return [
    'TAK',
    'Analyseer BRON_GELABELD en CONCEPT_GELABELD op inconsistenties.',
    '',
    'BELANGRIJK OVER "ok"',
    '- Zet "ok" op true zodra je de analyse kunt uitvoeren.',
    '- Zet "ok" alleen op false als BRON_GELABELD of CONCEPT_GELABELD ontbreekt of te leeg is om te analyseren.',
    '- Zet "ok" NIET op false alleen omdat je onzeker bent; gebruik daarvoor "confidence" en "severity".',
    '',
    'A) Schrijfwijze-inconsistenties (eigennamen)',
    '- Rapporteer een issue als dezelfde entiteit meerdere schrijfwijzen heeft die waarschijnlijk naar dezelfde entiteit verwijzen.',
    '- Flag alleen als er minstens 2 verschillende varianten voorkomen.',
    '',
    'B) Plaatskoppeling-inconsistenties',
    '- Rapporteer een issue als dezelfde entiteit gekoppeld wordt aan meerdere plaatsnamen in hetzelfde document.',
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
    '- Zwakke patronen (lager vertrouwen): “vanuit {PLAATS}”, “regio {PLAATS}”.',
    '',
    'EVIDENCE & LOCATORS (ZEER BELANGRIJK)',
    '- "locator" moet EXACT een bestaand label zijn uit de tekst, inclusief de vierkante haken.',
    '- Voor bron gebruik je labels zoals: [BRON A02 Z07]. Voor concept: [CONCEPT INTRO Z01], [CONCEPT BODY A01 Z03], etc.',
    '- Verzin NOOIT je eigen locator-formaat en schrijf geen "bron:alinea..".',
    '- Voeg per issue minimaal 2 evidence-items toe als er 2 conflicterende vormen/plaatsen zijn.',
    '- "snippet" max 120 tekens.',
    '',
    'SEVERITY/CONFIDENCE (rubric)',
    '- Plaatskoppeling: hoog als dezelfde entiteit met sterke patronen aan 2+ verschillende plaatsen hangt.',
    '- Schrijfwijze: middel/hoog bij echte inconsistentie, laag bij twijfelgevallen.',
    '',
    'VOORBEELD OUTPUT (met labels als locator)',
    JSON.stringify(example, null, 2),
    '',
    String(labeledSourceText || 'BRON_GELABELD:\n'),
    '',
    String(labeledConceptText || 'CONCEPT_GELABELD:\n')
  ].join('\n');
}

module.exports = { buildAuditInstructions, buildAuditInput };
