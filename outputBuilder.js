'use strict';

const LLM_SCHEMA = {
  name: 'via_persbericht_output',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title','intro','body','bron','w_fields','flags','contact_block_candidate'],
    properties: {
      title: { type: 'string' },
      intro: { type: 'string' },
      body: { type: 'string' },
      bron: { type: 'string' },
      w_fields: {
        type: 'object',
        additionalProperties: false,
        required: ['wie','wat','waar','wanneer','waarom','hoe'],
        properties: {
          wie: { type: 'string' },
          wat: { type: 'string' },
          waar: { type: 'string' },
          wanneer: { type: 'string' },
          waarom: { type: 'string' },
          hoe: { type: 'string' }
        }
      },
      flags: {
        type: 'object',
        additionalProperties: false,
        required: ['extern_verifieren','sterke_claims','naam_inconsistenties'],
        properties: {
          extern_verifieren: { type: 'array', items: { type: 'string' } },
          sterke_claims: { type: 'array', items: { type: 'string' } },
          naam_inconsistenties: { type: 'array', items: { type: 'string' } }
        }
      },
      contact_block_candidate: { type: 'string' }
    }
  }
};

module.exports = { LLM_SCHEMA };
