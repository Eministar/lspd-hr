# LSPD HR · Discord Bot

Discord-Schnittstelle für das HR-System. Vergibt automatisch Discord-Rollen
basierend auf Rang und abgeschlossenen Ausbildungen, postet Embeds für
Beförderungen / Kündigungen / Ausbildungen und stellt Slash-Commands +
Buttons für HR-Workflows bereit.

## Architektur

```
   Browser (HR-Dashboard)
            │
            ▼
       Next.js HR-API ─── posts events ───►  Discord-Bot HTTP (Express, /events)
            ▲                                       │
            │  bot reads /api/discord/*             ▼
            └───────────────────────────────  Discord Gateway (slash cmds, buttons)
```

* Bot ↔ HR-API: Bearer Token (`BACKEND_API_KEY` ↔ `discordBotApiKey` in den
  HR-Einstellungen).
* HR-API → Bot: Webhook auf `BOT_PUBLIC_URL/events` (kann eine
  Cloudflare-Tunnel-URL, ein Reverse-Proxy o. ä. sein).
* Bot → Discord: Slash-Commands + Components.

## Setup

```bash
cd bot
cp .env.example .env
#   .env ausfüllen (Token, Client/Guild ID, BACKEND_URL, BACKEND_API_KEY, ...)
npm install
npm run register   # registriert Slash-Commands in deiner Guild
npm run dev        # startet Bot mit Watch-Modus
```

In der HR-Web-UI: `Admin → Discord-Bot` öffnen und folgende Felder setzen:

| Feld                    | Wert                                                           |
| ----------------------- | -------------------------------------------------------------- |
| Bot API Key             | derselbe wie `BACKEND_API_KEY` (Button "🔄" generiert einen)  |
| Bot URL                 | `http://localhost:4747` oder die public URL                    |
| Guild ID                | Discord Server ID                                              |
| Channels                | optional, sonst werden Embeds nicht gepostet                   |

Anschließend für jeden Rang / jede Ausbildung in `Admin → Ränge` bzw.
`Admin → Ausbildungen` die zugehörige Discord Rollen-ID eintragen.

## Slash-Commands

| Command                                  | Wer    | Was                                                |
| ---------------------------------------- | ------ | -------------------------------------------------- |
| `/officer info [user|badge|id]`          | jeder  | Officer-Profil als Embed (mit Action-Buttons)      |
| `/officer search <query>`                | jeder  | Officer suchen                                     |
| `/officer sync [user|id]`                | jeder  | Discord-Rollen für einen Officer neu setzen        |
| `/training list`                         | jeder  | Alle Ausbildungen + Mapping anzeigen               |
| `/training set <officer> <key> <bool>`   | HR     | Ausbildung markieren / zurücksetzen                |
| `/rank list`                             | jeder  | Alle Ränge + Mapping anzeigen                      |
| `/sync-all`                              | Admin  | Rollen für alle Officer neu setzen                 |
| `/help`                                  | jeder  | Hilfe-Embed                                        |

HR/Admin werden über `HR_ROLE_IDS` / `ADMIN_ROLE_IDS` (Komma-Liste) bzw. die
Discord-Permission `Administrator` erkannt.

## Auto-Sync-Logik (`src/role-sync.ts`)

Pro Officer berechnet die HR-API einen `RoleSyncPlan`:

```jsonc
{
  "shouldHave":  ["<rankRole>", "<trainingRole>", ...],
  "managedRoles": ["<allMappedRoles>"],
  ...
}
```

Der Bot fügt fehlende Rollen aus `shouldHave` hinzu und entfernt verwaltete
Rollen, die aktuell nicht mehr gewünscht sind. Nicht verwaltete Rollen werden
nie angefasst.

Auslöser für einen Auto-Sync:

* Beförderung / Degradierung
* Kündigung (entfernt alle managed Roles)
* Officer-Update (Rang-/Status-/Discord-ID-Wechsel)
* Ausbildung markiert/zurückgenommen
* Manueller `/officer sync` oder `/sync-all`

## Deployment

* Lokal: `npm run dev`
* Produktion: hinter einem Reverse-Proxy / Tunnel — `npm run start` oder
  `npm run build && node dist/index.js`. Wichtig: der Port `HTTP_PORT` muss
  von der HR-Webapp aus erreichbar sein.
