# Stylebook – modulair pakket (prompt)

Dit pakket splitst het stijlboek op in modules. Het is bedoeld om later **selectief** modules mee te sturen in de prompt.

## Bestanden
- `core.md` (altijd)
- `modules/…` (per onderwerp)
- `index.json` (lijst + defaults)

## Gebruik (nu)
Je kunt alle modules samenvoegen door ze achter elkaar te plakken (core + modules).

## Gebruik (later, in code)
- Kies modules op basis van:
  1) expliciete selectie (UI of env), of
  2) auto-detectie op basis van bron (keywords/regex).
