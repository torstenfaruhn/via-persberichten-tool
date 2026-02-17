'use strict';
function buildInstructions({stylebookText}){
  const style=stylebookText?`\n\nSTIJLBOEK:\n${stylebookText}\n`:'';
  return [
    'Je herschrijft een hyperlokaal persbericht naar een conceptnieuwsbericht voor De Limburger.',
    'Gebruik alleen informatie uit de bron. Verzinnen is niet toegestaan.',
    'Schrijf in B1, neutraal, zonder marketingtaal.',
    'Citaten blijven letterlijk en worden toegeschreven.',
    'Waarom en Hoe vul je alleen in als dat letterlijk in de bron staat.',
    'Lengte: KOP maximaal 150 tekens (incl. spaties). INTRO + BODY samen tussen 1750 en 1950 tekens (incl. spaties).',
    'Neem geen contactblok, noten voor de redactie of tekst die niet voor publicatie is over in kop/intro/body.',
    'Geef ALLEEN geldige JSON terug conform het schema. Geen extra tekst.'
  ].join('\n')+style;
}
function buildInput({sourceText}){return ['BRONTEKST:',sourceText].join('\n\n');}
module.exports={buildInstructions,buildInput};
