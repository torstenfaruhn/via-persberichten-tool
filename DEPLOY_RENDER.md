# Deploy naar Render (v7) – stabiele runtime (Oplossing 3)

Doel: vaste Node-versie + vaste OpenAI SDK-versie, zodat updates niet onverwacht je productie breken.

## Bestanden die dit regelen
- `.nvmrc` – Node major versie voor lokale dev en CI.
- `package.json` – `engines.node` en exacte dependency-versies.
- `.npmrc` – zorgt dat nieuwe installs exact opslaan (geen `^`).
- `render.yaml` – gebruikt `npm ci` voor reproduceerbare builds en zet AI-timeout/retries.

## Stappen (lokaal)
1. Zet de Node-versie:
   - Installeer Node 20 (bijv. via nvm) en gebruik:
     - `nvm use` (leest `.nvmrc`)

2. Verwijder oude lock/install (eenmalig):
   - verwijder `node_modules/` (map)
   - verwijder `package-lock.json` (bestand) als die bestaat

3. Installeer met exacte versies en maak lockfile:
   - `npm install`

4. Controleer dat `package-lock.json` is aangemaakt en commit alles:
   - `.nvmrc`
   - `.npmrc`
   - `package.json`
   - `package-lock.json`
   - `render.yaml`
   - (en je codewijziging in `src/llm/openaiClient.js`)

## Stappen (GitHub → Render)
1. Push naar GitHub (main branch).
2. Render:
   - Maak een **Web Service**
   - Koppel aan je GitHub repo
   - Kies omgeving: **Node**
   - Build command: komt uit `render.yaml` (`npm ci`)
   - Start command: komt uit `render.yaml` (`npm start`)
3. Environment variables in Render:
   - Laat `render.yaml` leidend (Blueprint), of zet handmatig:
     - `NODE_ENV=production`
     - `MAX_UPLOAD_MB=10`
     - `OPENAI_MODEL=gpt-4o-mini`
     - `STYLEBOOK_PATH=stylebook/stylebook-extract.md`
     - `OPENAI_TIMEOUT_MS=60000`
     - `OPENAI_MAX_RETRIES=2`

## Wat je hiermee oplost
- Geen onverwachte dependency-updates (lockfile + `npm ci`)
- Geen onverwachte Node major changes
- Minder kans op ‘hang’ door een AI-call (timeout)
