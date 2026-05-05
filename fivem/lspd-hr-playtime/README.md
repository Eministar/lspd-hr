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

## HTTP 401 beheben

`HTTP 401` bedeutet: Die Web-App lehnt den Request ab, weil der Token fehlt oder nicht exakt übereinstimmt.

Prüfen:

- In der Web-App `.env` muss `FIVEM_INGEST_TOKEN` gesetzt sein.
- In `config.lua` muss `Config.Token` exakt denselben Wert haben.
- Nach einer `.env`-Änderung muss die Web-App neu gestartet werden.
- Nach einer `config.lua`-Änderung muss die FiveM-Resource neu gestartet werden:
  - `restart lspd-hr-playtime`
- Wenn der Token stimmt und trotzdem 401 kommt, deployed die aktuelle Resource-Version erneut. Sie sendet neben `Authorization` auch `X-LSPD-Ingest-Token`, weil manche Proxys den Authorization-Header nicht weiterreichen.

Der Token darf nicht der Platzhalter `HIER_DEN_FIVEM_INGEST_TOKEN_EINTRAGEN` sein.

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
