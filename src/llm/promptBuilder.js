'use strict';
function buildInstructions({stylebookText}){
  const style=stylebookText?`\n\nSTIJLBOEK:\n${stylebookText}\n`:'';
  return [
    'Je herschrijft een hyperlokaal persbericht naar een conceptnieuwsbericht voor De Limburger.',
    'Gebruik alleen informatie uit de bron. Verzinnen is niet toegestaan.',
    'Schrijf in B1, neutraal, zonder marketingtaal.',
    'Citaten blijven letterlijk en worden toegeschreven.',
    'Waarom en Hoe vul je alleen in als dat letterlijk in de bron staat.',
    'Geef ALLEEN geldige JSON terug conform het schema. Geen extra tekst.'
  ].join('\n')+style;
}
function buildInput({sourceText}){return ['BRONTEKST:',sourceText].join('\n\n');}
module.exports={buildInstructions,buildInput};
