# LSPD HR Playtime Resource

Dieses FiveM-Resource sendet echte Spielzeit an das LSPD HR Dashboard. Die Zuordnung passiert automatisch über den Discord-Identifier des Spielers und die `discordId` des Officers im HR-Tool.

## Installation

1. Ordner `lspd-hr-playtime` in den `resources`-Ordner des FiveM-Servers legen.
2. In `config.lua` setzen:
   - `Config.Endpoint`: `https://deine-domain.de/api/fivem/playtime`
   - `Config.Token`: Wert aus `FIVEM_INGEST_TOKEN`
3. Im HR-Tool in `.env` denselben Token setzen:
   - `FIVEM_INGEST_TOKEN="ein-langer-zufaelliger-token"`
4. In der `server.cfg` eintragen:
   - `ensure lspd-hr-playtime`

## Was gesendet wird

- Join
- Leave
- regelmäßiger Heartbeat
- Discord-ID
- FiveM-License
- Spielername
- Server-ID

Im HR-Dashboard wird daraus sichtbar:

- wer wirklich wach war
- wer nur per Duty-Button eingestempelt war
- wer wach war, aber nicht eingestempelt
- Spielzeitverlauf pro Officer
