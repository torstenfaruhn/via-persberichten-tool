# VIA Persberichten-tool (Web Service)

## Wat is dit?
Een eenvoudige webtool (1 pagina) om een persbericht (.txt/.docx/.pdf) te uploaden, met AI te herschrijven en als concepttekst te downloaden.

## Privacy & guardrails (kort)
- Geen analytics, geen tracking, geen third-party scripts.
- Geen logging van bron- of outputtekst. Alleen technische status/foutcodes.
- Uploads en output worden tijdelijk verwerkt in `/tmp` en daarna verwijderd.
- API-key wordt niet opgeslagen (alleen per request in memory).
- CSP header: alleen 'self'.

## Lokaal draaien
1. Installeer Node.js 18+.
2. In deze map:
   - `npm install`
   - `npm start`
3. Open: http://localhost:3000

## Gebruik
1. Vul API-key in (Enter).
2. Klik **Persbericht uploaden** en kies een bestand.
3. Klik **Document bewerken**.
4. Klik **Nieuwbericht downloaden**.

## Github → Render deploy (exact)
1. `git init`
2. `git add .`
3. `git commit -m "Initial commit"`
4. Maak een Github repo aan en push:
   - `git remote add origin <repo-url>`
   - `git push -u origin main`
5. Render:
   - New → Web Service
   - Koppel de Github repo
   - Branch: `main`
   - Build command: `npm ci` (vereist `package-lock.json` in de repo)
   - Start command: `npm start`
   - Deploy

## Render variabelen
- `MAX_UPLOAD_MB` (default 10)
- `OPENAI_MODEL` (default gpt-4o-mini)
- `OPENAI_AUDIT_MODEL` (optional; default: `OPENAI_MODEL`)
- `MAX_LLM_CHARS` (default 120000; harde limiet voor instructies + bron)
- `STYLEBOOK_MODE` (default `modular`)
  - `modular`: gebruikt `stylebook/modular/index.json` + modules op basis van auto-detect.
  - `legacy`: gebruikt het oude gedrag (1 groot bestand, zoals `stylebook/stylebook-extract.md`).
  - `file`: laadt 1 bestand via `STYLEBOOK_PATH` (TXT/MD/DOCX/PDF).
- `STYLEBOOK_PATH` (alleen relevant bij `STYLEBOOK_MODE=file` of `legacy`)
- `STYLEBOOK_MODULES` (modular; optioneel: force-include, comma-separated ids)
- `STYLEBOOK_EXCLUDE_MODULES` (modular; optioneel: uitsluiten, comma-separated ids)
- `STYLEBOOK_AUTODETECT_ONLY` (modular; default `limburgse_plaatsnamen`)
- `DISABLE_CONSISTENCY_AUDIT` (set to `1` om de Consistentiecheck uit te zetten)
- `REFERENCE_ENTITIES_PATH` (optional; pad naar lokale referentielijst JSON. Default: `src/reference/entities.nl.json`)

## Stijlboek (leidend)
De tool kan met 2 varianten werken:

### 1) Modulair (default)
- Map: `stylebook/modular/`
- Bestanden:
  - `core.md` (altijd)
  - `modules/*.md` (per onderwerp)
  - `index.json` (lijst + defaults)
- Auto-detect (op basis van de brontekst):
  - `limburgse_plaatsnamen` wordt alleen toegevoegd als er een Limburgse plaatsnaam/afleiding wordt herkend.
  - `sport` en `cultuur_feest` worden alleen toegevoegd als er duidelijke sport-/feestdag-termen staan.

Je kunt modules forceren of uitsluiten via `STYLEBOOK_MODULES` en `STYLEBOOK_EXCLUDE_MODULES`.

### 2) Legacy / 1 bestand
- `STYLEBOOK_MODE=legacy` gebruikt het oude gedrag (zoals `stylebook/stylebook-extract.md`).
- `STYLEBOOK_MODE=file` laadt 1 bestand via `STYLEBOOK_PATH`.

De server zet DOCX/PDF zo nodig om naar platte tekst, en voegt het stijlboek toe aan de LLM-instructies via `buildInstructions({ stylebookText })`.
