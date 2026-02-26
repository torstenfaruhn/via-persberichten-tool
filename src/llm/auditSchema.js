'use strict';

// Schema voor de consistency-audit (LLM call #2).
// Strikt en compact zodat parsing voorspelbaar blijft.

const AUDIT_SCHEMA = {
  name: 'via_persbericht_consistency_audit',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'issues', 'stats'],
    properties: {
      ok: { type: 'boolean' },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'type',
            'entity_canonical',
            'entity_type',
            'variants',
            'places',
            'evidence',
            'severity',
            'confidence',
            'note'
          ],
          properties: {
            type: { type: 'string', enum: ['plaatskoppeling', 'schrijfwijze'] },
            entity_canonical: { type: 'string' },
            entity_type: {
              type: 'string',
              enum: ['persoon', 'organisatie', 'locatie', 'gebouw', 'evenement', 'onbekend']
            },
            variants: { type: 'array', items: { type: 'string' } },
            places: { type: 'array', items: { type: 'string' } },
            evidence: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['where', 'locator', 'snippet'],
                properties: {
                  where: { type: 'string', enum: ['bron', 'concept'] },
                  locator: { type: 'string' },
                  snippet: { type: 'string' }
                }
              }
            },
            severity: { type: 'string', enum: ['laag', 'middel', 'hoog'] },
            confidence: { type: 'string', enum: ['laag', 'middel', 'hoog'] },
            note: { type: 'string' }
          }
        }
      },
      stats: {
        type: 'object',
        additionalProperties: false,
        required: ['entities_checked', 'place_links_checked'],
        properties: {
          entities_checked: { type: 'integer' },
          place_links_checked: { type: 'integer' }
        }
      }
    }
  }
};

module.exports = { AUDIT_SCHEMA };
