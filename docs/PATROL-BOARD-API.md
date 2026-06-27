# Patrol-Board & Leitstelle — MDT-Integrations-API

Vollständige Referenz für die Anbindung des FiveM-MDT an das LSPD-HR-Dashboard.
FiveM ist die **führende Datenquelle**; das Dashboard zeigt den synchronisierten
Zustand **read-only** an und akkumuliert die Streifenzeit pro Officer.

- **Basis-URL:** `https://<dashboard-domain>` (ohne abschließenden Slash)
- **Alle Pfade** beginnen mit `/api`
- **Antwort-Envelope (immer):**
  - Erfolg: `{ "success": true, "data": <payload> }`
  - Fehler: `{ "success": false, "error": "<meldung>" }`

---

## 1. Authentifizierung

Jeder Aufruf nutzt einen **Bearer-Token** und optional **Discord-ID-Impersonation**.

```http
Authorization: Bearer lspd_DEIN_API_TOKEN
X-Discord-Id: 123456789012345678
Accept: application/json
Content-Type: application/json
```

- **`Authorization`** — API-Token (Prefix `lspd_`). Im Dashboard unter *API-Tokens* erstellbar.
- **`X-Discord-Id`** — *optional*. Wenn gesetzt, handelt der Request „als" der
  Dashboard-User mit dieser Discord-ID. Die effektiven Rechte sind dann:

  ```
  effektive Rechte = Token-Scopes ∩ Rechte des impersonierten Users
  ```

  Ein Token kann dadurch nie mehr dürfen als der impersonierte User — und nie
  mehr als die eigenen Scopes. Die Discord-ID muss 17–22 Ziffern haben, sonst
  `401`.

### Benötigte Token-Scopes

| Zweck | Scope |
|---|---|
| Officer-Liste lesen, Streifenzeit lesen | `officers:view` |
| Board lesen, Leaderboard lesen | `patrol-board:view` |
| Board/Sessions/Leitstelle schreiben (Sync) | `patrol-board:manage` |

Für den vollen Sync-Flow braucht der Token (und der impersonierte User)
mindestens **`officers:view` + `patrol-board:manage`**.

---

## 2. Fehlercodes

| HTTP | Bedeutung |
|---:|---|
| 200 | OK |
| 201 | Angelegt (neue Ressource) |
| 400 | Ungültige Eingabe (Body/Parameter) |
| 401 | Token ungültig/abgelaufen, oder `X-Discord-Id` unbekannt/ungültig |
| 403 | Token oder User hat nicht alle benötigten Rechte |
| 404 | Ressource nicht gefunden |
| 500 | Interner Dashboard-Fehler |

---

## 3. Vorab: User & Officer auflösen

### 3.1 Rechte einer Discord-ID prüfen (optional, vor Impersonation)

```http
GET /api/users/by-discord/{discordId}
```
Antwort (`data`): `{ id, displayName, discordId, groups[], permissions[] }`.
Nutze das, um vor dem Sync zu prüfen, ob der User `officers:view` +
`patrol-board:manage` besitzt.

### 3.2 Officer-Zuordnung (Discord-ID → Officer-ID)

```http
GET /api/officers
```
Scope: `officers:view`. Liefert die Officer; baue daraus eine Map
`discordId → officer.id`. Ein Spieler wird nur ins Board übernommen, wenn ein
Officer mit seiner Discord-ID existiert. Empfohlener Cache: **5 Minuten**.

---

## 4. Streifenboard synchronisieren (Full-Replace)

Das Board wird bei jeder Änderung **vollständig atomar ersetzt** — nicht
inkrementell angehängt.

### 4.1 Aktives Board laden

```http
GET /api/patrol-boards
```
Scope: `patrol-board:view`. Antwort (`data`):
```json
{
  "activeBoard": { "id": "board-id", "title": "…", "patrols": [ … ] },
  "boards": [ … ],
  "activeDutyOfficers": [ … ],
  "dispatchCenters": [
    { "scope": "lspd", "occupiedAt": "2026-06-27T19:30:00.000Z",
      "officer": { "id": "…", "firstName": "Max", "lastName": "Mustermann", "badgeNumber": "01" } }
  ],
  "syncedAt": "2026-06-27T19:30:01.000Z"
}
```
Existiert noch kein Board, ist `activeBoard` `null` → dann anlegen (4.2).

### 4.2 Board anlegen (nur falls keins existiert)

```http
POST /api/patrol-boards
Content-Type: application/json

{ "title": "Live-Streifen (FiveM)" }
```
Scope: `patrol-board:manage`. Antwort: das neue Board (mit `id`).

### 4.3 Vollständigen Zustand übertragen

```http
PATCH /api/patrol-boards/{boardId}
Content-Type: application/json

{
  "patrols": [
    {
      "name": "Adam-01",
      "callSign": "Adam-01",
      "assignment": "Status 1 — Einsatzbereit auf Funk",
      "status": 1,
      "scope": "lspd",
      "assignedDispatchId": null,
      "memberIds": ["officer-id-1", "officer-id-2"]
    }
  ],
  "confirmRuleViolations": true
}
```
Scope: `patrol-board:manage`.

**Felder pro Streife:**

| Feld | Typ | Pflicht | Bedeutung |
|---|---|:--:|---|
| `name` | String | ✓ | Rufname, z. B. `Adam-01` |
| `callSign` | String | – | i. d. R. gleich `name` |
| `assignment` | String | – | Status-Text (siehe Status-Tabelle) |
| `status` | Int (1–8) | – | Live-Status |
| `scope` | String | – | Organisationsbereich (z. B. `lspd`) |
| `assignedDispatchId` | Int \| null | – | zugewiesener Einsatz |
| `memberIds` | String[] | – | Dashboard-Officer-IDs (max. 3, je Officer nur 1×) |

**Limits & Regeln:**
- max. **30 Streifen** pro Board, max. **3 Officers** pro Streife, jeder Officer
  nur **einmal** im gesamten Board.
- Keine Streifenregel-Prüfung im Sync-Pfad: Solo-Streifen oder mehrere Rookies
  werden **nicht** abgelehnt (FiveM ist führend). `confirmRuleViolations` wird
  akzeptiert, aber ignoriert (nur Abwärtskompatibilität).
- Officers mit Status `TERMINATED` werden abgelehnt (`400`).

### 4.4 Status-Mapping (1–8)

| ID | Status |
|---:|---|
| 1 | Einsatzbereit auf Funk |
| 2 | Einsatzbereit auf Wache |
| 3 | Anfahrt zum Einsatzort |
| 4 | Ankunft am Einsatzort |
| 5 | Sprechwunsch |
| 6 | Nicht verfügbar |
| 7 | Anfahrt zum Zielort |
| 8 | Ankunft am Zielort |

Sende sowohl `status` (Zahl) als auch ein lesbares `assignment`
(`"Status 3 — Anfahrt zum Einsatzort"`).

### 4.5 Sync-Zeitpunkte

Sync auslösen bei: Streife erstellen/beitreten/verlassen/auflösen,
Statusänderung (Mitglied oder Leitstelle), Dispatch-Zuweisung, Detective-/
Air-Moduswechsel, Auto-Auflösung (Crew), Disconnect, Leitstellen-Übernahme.

Empfohlen: Änderungen **~1,5 s debouncen** und zusätzlich alle **60 s** einen
vollständigen Sicherheitsabgleich senden.

---

## 5. Leitstelle (Dispatch-Center)

Pro Scope max. eine aktive Leitstelle. Nur Anzeige im Dashboard.

### Besetzen

```http
PUT /api/dispatch-centers/{scope}/occupant
Content-Type: application/json

{ "officerDiscordId": "123456789012345678" }
```
Alternativ `{ "officerId": "officer-id" }`. Optional `occupiedAt` (ISO-8601;
Default = jetzt). Scope: `patrol-board:manage`. Antwort: der Leitstellen-State
inkl. `officer`.

### Freigeben

```http
DELETE /api/dispatch-centers/{scope}/occupant
```
Scope: `patrol-board:manage`. Setzt `officerId`/`occupiedAt` auf `null`.

> `{scope}` ist frei wählbar (z. B. `lspd`). Beim Disconnect der Leitstelle
> sollte FiveM `DELETE` senden.

---

## 6. Streifenzeit pro Officer (Sessions)

„Streifenzeit" = Summe aller Zeitspannen, in denen ein Officer **Mitglied einer
Streife** war. FiveM berechnet die Sessions (Start beim Beitritt, Ende beim
Verlassen) und sendet sie fertig ans Dashboard, das pro Officer aggregiert.

### 6.1 Eine Session senden

```http
POST /api/patrol-sessions
Content-Type: application/json

{
  "externalId": "fivem-session-uuid",
  "officerDiscordId": "123456789012345678",
  "officerName": "Max Mustermann",
  "scope": "lspd",
  "patrolName": "Adam-01",
  "designationAtJoin": "Adam",
  "gradeAtJoin": 5,
  "joinedAt": "2026-06-27T19:30:00.000Z",
  "leftAt": "2026-06-27T20:15:00.000Z",
  "durationSeconds": 2700,
  "endReason": "leave"
}
```
Scope: `patrol-board:manage`. Antwort:
`{ "id": "…", "status": "created" | "updated" }` (`201` created / `200` updated).

**Pflichtfelder:** `officerName`, `scope`, `patrolName`, `joinedAt`,
`durationSeconds` (≥ 0), `endReason`.

| Feld | Typ | Pflicht | Hinweis |
|---|---|:--:|---|
| `externalId` | String | – | **Idempotenz-Schlüssel.** Gleiche `externalId` erneut senden → Update statt Duplikat. Dringend empfohlen. |
| `officerDiscordId` | String | – | Officer wird darüber verknüpft. Kein Match → Session wird trotzdem gespeichert (officer = null, später nachziehbar). |
| `officerName` | String | ✓ | IC-Name (für Anzeige/Backfill) |
| `scope` | String | ✓ | z. B. `lspd` |
| `patrolName` | String | ✓ | z. B. `Adam-01` |
| `designationAtJoin` | String | – | Bezeichnung beim Eintritt |
| `gradeAtJoin` | Int | – | ESX-Grade beim Eintritt |
| `joinedAt` | ISO-8601 | ✓ | Session-Start |
| `leftAt` | ISO-8601 \| null | – | Session-Ende |
| `durationSeconds` | Int ≥ 0 | ✓ | Dauer |
| `endReason` | Enum | ✓ | `leave` \| `disband` \| `crew` \| `disconnect` \| `server_shutdown` |

### 6.2 Sessions im Batch senden (robust)

```http
POST /api/patrol-sessions/batch
Content-Type: application/json

{ "sessions": [ { /* wie 6.1 */ }, … ] }
```
Scope: `patrol-board:manage`. Max. **500** pro Request. Antwort:
`{ "created": 12, "updated": 3, "skipped": 1, "total": 16 }`
(`skipped` = ungültige Datensätze, der Rest wird trotzdem verarbeitet).

**Empfohlenes Muster:** Sessions lokal mit `synced=0` puffern, periodisch (z. B.
alle 60 s) als Batch senden, bei Erfolg auf `synced=1` setzen. Dank `externalId`
gehen bei Wiederholung keine Zeiten verloren und es entstehen keine Duplikate.

---

## 7. Streifenzeit auslesen (Aggregation)

### 7.1 Pro Officer

```http
GET /api/officers/{officerId}/patrol-time?from=2026-06-01&to=2026-06-30
```
Scope: `officers:view`. `from`/`to` optional (ISO-8601). Antwort:
```json
{
  "officerId": "…",
  "totalSeconds": 86400,
  "sessionCount": 32,
  "last7DaysSeconds": 18000,
  "lastSessionAt": "2026-06-27T20:15:00.000Z",
  "byScope": { "lspd": 86400 }
}
```

### 7.2 Rangliste

```http
GET /api/patrol-time/leaderboard?scope=lspd&from=…&to=…&limit=20
```
Scope: `patrol-board:view`. `limit` 1–100 (Default 20). Antwort: Array
`[{ officerId, officer: { id, firstName, lastName, badgeNumber } | null, totalSeconds, sessionCount }]`,
absteigend nach `totalSeconds`.

---

## 8. FiveM / Lua — Anbindung

### 8.1 Helper

```lua
local API = {
    base  = 'https://dashboard-domain.tld',
    token = 'lspd_DEIN_API_TOKEN',
}

local function GetDiscordId(src)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, 8) == 'discord:' then return id:sub(9) end
    end
    return nil
end

-- method: 'GET'|'POST'|'PATCH'|'PUT'|'DELETE', body: table|nil, actorDiscordId: string|nil
local function ApiCall(method, path, body, actorDiscordId, cb)
    local headers = {
        ['Authorization'] = 'Bearer ' .. API.token,
        ['Accept']        = 'application/json',
        ['Content-Type']  = 'application/json',
    }
    if actorDiscordId then headers['X-Discord-Id'] = actorDiscordId end
    PerformHttpRequest(API.base .. path, function(status, text, _)
        local ok, decoded = pcall(json.decode, text or '')
        cb(status, ok and decoded or nil)
    end, method, body and json.encode(body) or '', headers)
end
```

### 8.2 Board synchronisieren

```lua
local function SyncBoard(boardId, patrols, actorDiscordId)
    ApiCall('PATCH', '/api/patrol-boards/' .. boardId, {
        patrols = patrols,            -- siehe 4.3 (name, status, memberIds, …)
        confirmRuleViolations = true, -- FiveM ist führend
    }, actorDiscordId, function(status, res)
        if status ~= 200 then
            print(('[MDT] Board-Sync fehlgeschlagen: %s'):format(status))
        end
    end)
end
```

### 8.3 Session beim Verlassen senden

```lua
-- beim Eintritt:  member.joinedAt = os.time()
-- beim Austritt/Disconnect/Auflösen:
local function PushSession(member, patrol, endReason, actorDiscordId)
    local leftAt = os.time()
    ApiCall('POST', '/api/patrol-sessions', {
        externalId       = member.sessionId,           -- stabile UUID je Session
        officerDiscordId = member.discord,
        officerName      = member.name,
        scope            = patrol.scope,
        patrolName       = patrol.name,
        designationAtJoin= member.designationAtJoin,
        gradeAtJoin      = member.gradeAtJoin,
        joinedAt         = os.date('!%Y-%m-%dT%H:%M:%S.000Z', member.joinedAt),
        leftAt           = os.date('!%Y-%m-%dT%H:%M:%S.000Z', leftAt),
        durationSeconds  = leftAt - member.joinedAt,
        endReason        = endReason,                   -- leave|disband|crew|disconnect|server_shutdown
    }, actorDiscordId, function(status) end)
end
```

> **Tipp:** Sessions zusätzlich lokal/in DB persistieren und per `/batch`
> nachsenden (Abschnitt 6.2), damit bei kurzzeitig nicht erreichbarem Dashboard
> keine Zeiten verloren gehen. Beim Resource-Start offene Sessions
> (`leftAt IS NULL`) als `endReason = "server_shutdown"` schließen.

### 8.4 Audit-Aktor (`X-Discord-Id`)

Verwende möglichst die Discord-ID des auslösenden Spielers:

| Aktion | `X-Discord-Id` |
|---|---|
| Spieler erstellt/tritt bei/verlässt Streife | Discord-ID des Spielers |
| Mitglied setzt Status | Discord-ID des Mitglieds |
| Leitstelle setzt Status / löst auf / weist zu / übernimmt | Discord-ID der Leitstelle |
| Auto-Sync ohne Auslöser | letzter gültiger Aktor → Leitstelle → ein Mitglied |

Ohne verbundenen Spieler mit gültiger Discord-ID **keinen** impersonierten
Aufruf ausführen.

---

## 9. Datenhoheit (wichtig)

Das synchronisierte Board ist im Dashboard **schreibgeschützt**. Manuelles
Bearbeiten im Dashboard ist entfernt — der einzige Schreibpfad ist diese API.
Direkte Änderungen würden ohnehin beim nächsten FiveM-Sync überschrieben.

„Streifenzeit" (dieses Dokument) misst nur die **Streifen-Mitgliedschaft** und
ist getrennt von der allgemeinen **Dienstzeit** (On/Off-Duty) zu betrachten.
