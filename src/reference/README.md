# Lokale referentielijst (Route A)

Deze map bevat een **lokale referentielijst** waarmee de tool de output van de consistency-audit
(LLM call #2) deterministisch kan verrijken:

- *Geen* referentielijst in de prompt (dus geen prompt-bloat).
- Wél extra logica in Node.js om issues te escaleren of van notities te voorzien.

## Bestand: `entities.nl.json`

Top-level:

```json
{
  "version": "YYYY-MM-DD",
  "entities": [
    {
      "id": "stable-id",
      "type": "persoon|organisatie|locatie|gebouw|evenement|onbekend",
      "canonical_name": "...",
      "aliases": ["..."],
      "canonical_place": "...",
      "allowed_places": ["..."],
      "status": "active|deprecated",
      "notes": "..."
    }
  ]
}
```

### Interpretatie

- `canonical_name`: gewenste schrijfwijze.
- `aliases`: varianten die je wilt herkennen (oude namen, lidwoorden, afkortingen).
- `canonical_place`: voorkeurs-/normplaats (optioneel).
- `allowed_places`: toegestane plaatsen. Leeg/afwezig betekent: alleen `canonical_place` (als die bestaat).
- `status`: kan later gebruikt worden om extra waarschuwingen te maken (optioneel).

## Beheer

Houd deze lijst onder versiebeheer en laat wijzigingen reviewen door eindredactie.
