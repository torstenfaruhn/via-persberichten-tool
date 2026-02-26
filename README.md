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
- `STYLEBOOK_PATH` (default: stylebook/stylebook-extract.md)
- `DISABLE_CONSISTENCY_AUDIT` (set to `1` om de Consistentiecheck uit te zetten)
- `REFERENCE_ENTITIES_PATH` (optional; pad naar lokale referentielijst JSON. Default: `src/reference/entities.nl.json`)

## Stijlboek (leidend)
De map `stylebook/` bevat de stijlboekbronnen. De tool gebruikt in productie **alleen** `stylebook/stylebook-extract.md` via `STYLEBOOK_PATH`.

De server leest het stijlboek in (TXT/MD/DOCX/PDF), zet het om naar platte tekst en voegt dit toe aan de LLM-instructies via `buildInstructions({ stylebookText })`.

- Maximaal 100.000 tekens worden meegestuurd (daarna afkappen).
- Als het stijlboek ontbreekt of niet leesbaar is: **stil doorgaan** zonder stijlboek (geen UI-melding; alleen technische foutcode in serverlog).
