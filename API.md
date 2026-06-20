# LSPD HR Dashboard — Public API

> **Vollständige HTTP-API für das LSPD HR Dashboard. Jede Dashboard-Funktion ist auch programmatisch verfügbar.**

**Interaktive Doku & Try-it-out:** [`/docs`](/docs) im Dashboard
**OpenAPI 3.1 (JSON):** [`/api/v1/openapi.json`](/api/v1/openapi.json)
**OpenAPI 3.1 (YAML):** [`/api/v1/openapi.yaml`](/api/v1/openapi.yaml)
**Markdown-Doku:** [`/api/v1/openapi.md`](/api/v1/openapi.md)

---

## Inhaltsverzeichnis

- [Officers](#officers)
- [Trainings](#trainings)
- [Units](#units)
- [Ranks](#ranks)
- [Sanctions](#sanctions)
- [Promotions](#promotions)
- [Terminations](#terminations)
- [Probations](#probations)
- [Calendar](#calendar)
- [Duty Times](#duty-times)
- [Absences](#absences)
- [Notes](#notes)
- [Tasks](#tasks)
- [SRU](#sru)
- [Patrol Board](#patrol-board)
- [Admin](#admin)
- [Users](#users)
- [API Tokens](#api-tokens)
- [Public](#public)

---

## Authentifizierung

Alle API-Endpoints (außer `/api/health` und `/api/public/*`) erfordern Authentifizierung via **Bearer-Token**.

```bash
curl https://deine-domain/api/officers \
  -H "Authorization: Bearer lspd_DEIN_TOKEN"
```

### Token erstellen

1. Im Dashboard: **Admin → API-Tokens → „Neuer Token"**
2. **Name** vergeben (z. B. „Discord-Bot", „CI-Pipeline")
3. Optional **Scopes** einschränken (leer = alle deine Rechte)
4. Optional **Ablaufdatum** setzen (oder unbegrenzt)
5. **Klartext-Token kopieren** — wird nur EINMALIG angezeigt!

### Token-Format

```
lspd_<32 base62-zeichen>
# Beispiel
lspd_p4A8xKzQ2mN7vR3jH9wT5yL1cV8bF0dG2nS6hX
```

### Sicherheit

- **SHA-256-Hash** wird gespeichert, Klartext wird nie persistiert
- **Pro Token** ein eigenes Scope-Set möglich (Least-Privilege)
- **Revoke** im Dashboard oder per `DELETE /api/api-tokens/{id}` — sofortige Sperre
- **Detaillierte Usage-Logs** (Methode, Pfad, Status, IP, Timing) für Audit & Monitoring
- **Token-Scopes** sind immer eine Teilmenge der Inhaber-Rechte — keine Rechte-Eskalation möglich
- **Limit pro Benutzer** konfigurierbar (oder unbegrenzt) in den Einstellungen

### Discord-ID-Impersonation (`X-Discord-Id` Header)

Wenn ein API-Token-Request zusätzlich den Header `X-Discord-Id: <discord-snowflake>` trägt, werden die effektiven Rechte dieses Requests **automatisch auf die Schnittmenge** aus Token-Scopes und den tatsächlichen Rechten des Users mit dieser Discord-ID beschränkt. Das gilt auch für User ohne Rechte: Eine leere Rechtemenge bleibt leer. Der Audit-Log-Eintrag zeigt den impersonierten User als Aktor; die `details` enthalten zusätzlich Token-Name und Discord-ID des Aufrufers.

**Sicherheit:** Die effektiven Rechte sind `min(Token-Scopes, User-Permissions)`:
- Ein Token kann nie mehr Rechte ausüben, als der impersonierte User tatsächlich hat
- Umgekehrt werden Rechte, die der User hat, aber der Token nicht, ebenfalls blockiert

```bash
# Beispiel: Token hat "officers:view, officers:write", User hat "officers:view, calendar:manage"
# → effektive Rechte dieses Requests: nur "officers:view"

curl https://deine-domain/api/officers \
  -H "Authorization: Bearer lspd_…" \
  -H "X-Discord-Id: 123456789012345678"
```

**Use-Cases:**
- Multi-Tenant-Bot: Ein einziger Admin-Token kann im Namen verschiedener User agieren — jeder Request bekommt automatisch die Rechte des Ziels.
- Least-Privilege: Du musst dem Token keine breiten Scopes geben — die echten Rechte kommen vom User.
- Audit-Compliance: Der Audit-Log zeigt immer den **tatsächlichen Aktor** (impersonierter User), nicht den Token-Besitzer.

**Voraussetzungen abfragen** (vor dem Request):

```bash
curl https://deine-domain/api/users/by-discord/123456789012345678 \
  -H "Authorization: Bearer lspd_…"
```

```json
{
  "id": "ckabc",
  "discordId": "123456789012345678",
  "displayName": "Erika Musterfrau",
  "groups": [{ "id": "g1", "name": "HR-Team" }],
  "permissions": ["officers:view", "calendar:manage", "hr:view", "hr:manage"]
}
```

### Scopes

| Permission | Beschreibung |
| :-- | :-- |
| `dashboard:view` | Dashboard ansehen |
| `calendar:view` | Kalender ansehen |
| `calendar:manage` | Kalender verwalten |
| `duty-times:view` | Dienstzeiten ansehen |
| `duty-times:manage` | Dienstzeiten verwalten |
| `patrol-board:view` | Streifenboard ansehen |
| `patrol-board:manage` | Streifenboard verwalten |
| `officers:view` | Officers ansehen |
| `officers:write` | Officers bearbeiten |
| `officer-trainings:manage` | Officer-Ausbildungen setzen |
| `officers:delete` | Officers löschen |
| `terminations:view` | Kündigungen ansehen |
| `terminations:manage` | Kündigungen verwalten |
| `probations:view` | Probezeiten ansehen |
| `probations:manage` | Probezeiten verwalten |
| `sanctions:manage` | Sanktionen ausstellen |
| `rank-changes:view` | Beförderungen/Degradierungen ansehen |
| `rank-changes:manage` | Beförderungen/Degradierungen |
| `rank-change-lists:execute` | Beförderungen/Degradierungen durchführen |
| `rank-change-lists:delete` | Beförderungs-/Degradierungslisten löschen |
| `academy:view` | Academy ansehen |
| `academy:manage` | Academy verwalten |
| `hr:view` | HR ansehen |
| `hr:manage` | HR verwalten |
| `sru:view` | S.R.U. ansehen |
| `sru:manage` | S.R.U. verwalten |
| `detective:view` | Detective Unit ansehen |
| `detective:manage` | Detective Unit verwalten |
| `notes:view` | Notizen ansehen |
| `notes:manage` | Notizen verwalten |
| `logs:view` | Protokoll ansehen |
| `exports:view` | Exporte verwenden |
| `ranks:view` | Ränge ansehen |
| `ranks:manage` | Ränge verwalten |
| `trainings:view` | Ausbildungen ansehen |
| `trainings:manage` | Ausbildungen verwalten |
| `units:view` | Units ansehen |
| `units:manage` | Units verwalten |
| `users:manage` | Benutzer verwalten |
| `groups:manage` | Benutzergruppen verwalten |
| `settings:manage` | Einstellungen verwalten |
| `updates:send` | Updates senden |
| `password:change` | Eigenes Passwort ändern |

---

## Antwort-Format

Alle Antworten verwenden JSON mit konsistenter Struktur:

**Erfolg:**
```json
{ "success": true, "data": { ... } }
```

**Fehler:**
```json
{ "success": false, "error": "Officer nicht gefunden" }
```

## HTTP-Status-Codes

| Code | Bedeutung |
| :-- | :-- |
| `200 OK`           | Erfolg (GET / PATCH / DELETE) |
| `201 Created`      | Erstellt (POST) |
| `400 Bad Request`  | Validation-Fehler / fehlende Felder |
| `401 Unauthorized` | Kein / ungültiger Token |
| `403 Forbidden`    | Token gültig, aber Scopes reichen nicht |
| `404 Not Found`    | Resource existiert nicht |
| `409 Conflict`     | Eindeutigkeits-Konflikt |
| `500 Server Error` | Unerwarteter Fehler |

---

## Officers

### `GET /api/officers` 🔒 `officers:view`
Liefert alle Officers (ausgenommen `TERMINATED` standardmäßig).

| Query-Param | Typ | Beschreibung |
| :-- | :-- | :-- |
| `search` | string | Volltextsuche (Name, Dienstnummer, Discord-ID) |
| `status` | enum | `ACTIVE`, `AWAY`, `INACTIVE`, `TERMINATED` |
| `rankId` | string | Filter auf Rang-ID |

```bash
curl https://deine-domain/api/officers?search=Max \
  -H "Authorization: Bearer $LSPD_TOKEN"
```

### `POST /api/officers` 🔒 `officers:write`
Legt einen neuen Officer an. Wenn keine `badgeNumber` übergeben wird, wird die nächste freie Nummer im Bereich des Rangs vergeben.

```json
{
  "firstName": "Max",
  "lastName": "Muster",
  "rankId": "ckxyz...",
  "badgeNumber": "1234",
  "discordId": "123456789012345678",
  "unit": "patrol",
  "units": ["patrol", "k9"],
  "flag": "BLUE",
  "status": "ACTIVE"
}
```

### `GET /api/officers/{id}` 🔒 `officers:view`
Liefert einen Officer inkl. Rang und Ausbildungen.

### `PATCH /api/officers/{id}` 🔒 `officers:write`
Aktualisiert Felder eines Officers.

### `DELETE /api/officers/{id}` 🔒 `officers:delete`
Löscht einen Officer (Hard-Delete). Empfohlen ist `POST /api/terminations` für saubere Kündigungen.

### `GET /api/officers/{id}/timeline` 🔒 `officers:view`
Vollständige Historie: Beförderungen, Kündigungen, Notizen, Audit-Logs.

### `GET /api/officers/{id}/trainings` 🔒 `officers:view`
Alle Ausbildungen inkl. Status (completed).

### `PUT /api/officers/{id}/trainings` 🔒 `officer-trainings:manage`
Überschreibt den Ausbildungsstatus eines Officers.
```json
{ "trainings": [{ "trainingId": "ckabc", "completed": true }] }
```

### `POST /api/officers/{id}/move` 🔒 `officers:write`
Setzt die primäre Unit eines Officers.
```json
{ "unitKey": "k9" }
```

---

## Trainings

### `GET /api/trainings` 🔒 `trainings:view`
Alle verfügbaren Ausbildungen mit Mindest-Rang.

### `POST /api/trainings` 🔒 `trainings:manage`
```json
{ "key": "k9-handler", "label": "K-9 Handler", "minRankId": "ck..." }
```

### `PATCH /api/trainings/{id}` 🔒 `trainings:manage`

### `DELETE /api/trainings/{id}` 🔒 `trainings:manage`

---

## Units

### `GET /api/units` 🔒 `units:view`

### `POST /api/units` 🔒 `units:manage`
```json
{ "key": "k9", "name": "K-9 Einheit", "color": "#d4af37" }
```

### `PATCH /api/units/{id}` 🔒 `units:manage`

### `DELETE /api/units/{id}` 🔒 `units:manage`

---

## Ranks

### `GET /api/ranks` 🔒 `ranks:view`
Alle Ränge sortiert nach `sortOrder`.

### `POST /api/ranks` 🔒 `ranks:manage`
```json
{
  "name": "Senior Officer",
  "sortOrder": 5,
  "color": "#d4af37",
  "badgeMin": 1000,
  "badgeMax": 1999
}
```

### `PATCH /api/ranks/{id}` 🔒 `ranks:manage`

### `DELETE /api/ranks/{id}` 🔒 `ranks:manage`

---

## Sanctions

### `POST /api/sanctions` 🔒 `sanctions:manage`
Stellt eine neue Sanktion aus. Discord-Statusaktualisierung erfolgt automatisch.
```json
{
  "officerId": "ckabc",
  "reason": "Dienstvergehen",
  "penalGrade": "C",
  "deadlineDays": 14
}
```

### `PATCH /api/sanctions/{id}` 🔒 `sanctions:manage`
Status ändern (z. B. `PAID`, `ESCALATED`).

---

## Promotions

### `GET /api/promotions` 🔒 `rank-changes:view`
Beförderungs-Historie.

### `GET /api/rank-change-lists` 🔒 `rank-changes:view`
Drafts und abgeschlossene Listen.

### `POST /api/rank-change-lists` 🔒 `rank-changes:manage`
```json
{ "name": "Q4 Beförderungen", "type": "PROMOTION", "description": "..." }
```

### `POST /api/rank-change-lists/{id}/entries` 🔒 `rank-changes:manage`
```json
{
  "officerId": "ckabc",
  "proposedRankId": "ckxyz",
  "newBadgeNumber": "2345",
  "note": "..."
}
```

### `POST /api/rank-change-lists/{id}/execute` 🔒 `rank-change-lists:execute`
Führt alle Einträge der Liste aus.

### `POST /api/rank-change-lists/{id}/entries/{entryId}/undo` 🔒 `rank-change-lists:execute`
Macht eine bereits ausgeführte Beförderung/Degradierung rückgängig.

---

## Terminations

### `GET /api/terminations` 🔒 `terminations:view`

### `POST /api/terminations` 🔒 `terminations:manage`
```json
{ "officerId": "ckabc", "reason": "Eigene Kündigung" }
```

---

## Probations

### `GET /api/probations` 🔒 `probations:view`

### `POST /api/probations` 🔒 `probations:manage`

### `PATCH /api/probations/{id}` 🔒 `probations:manage`
Setzt Status (`PASSED` / `FAILED` / `EXTENDED`).

---

## Calendar

### `GET /api/calendar-events` 🔒 `calendar:view`

### `POST /api/calendar-events` 🔒 `calendar:manage`

### `PATCH /api/calendar-events/{id}` 🔒 `calendar:manage`

### `DELETE /api/calendar-events/{id}` 🔒 `calendar:manage`

---

## Duty Times

### `GET /api/duty-times` 🔒 `duty-times:view`

### `POST /api/duty-times/discord-message` 🔒 `duty-times:manage`
Löst eine Discord-Aktualisierungs-Message aus.

---

## Absences

### `GET /api/absences` 🔒 `officers:view`

### `POST /api/absences` 🔒 `officers:write`

### `PATCH /api/absences/{id}` 🔒 `officers:write`

### `DELETE /api/absences/{id}` 🔒 `officers:write`

---

## Notes

### `GET /api/notes` 🔒 `notes:view`

### `POST /api/notes` 🔒 `notes:manage`

### `PATCH /api/notes/{id}` 🔒 `notes:manage`

### `DELETE /api/notes/{id}` 🔒 `notes:manage`

---

## Tasks

### `GET /api/task-lists` 🔒 `academy:view`

### `POST /api/task-lists` 🔒 `academy:manage`

### `GET /api/task-lists/{id}/tasks` 🔒 `academy:view`

### `POST /api/task-lists/{id}/tasks` 🔒 `academy:manage`

### `PATCH /api/tasks/{id}` 🔒 `academy:manage`

### `DELETE /api/tasks/{id}` 🔒 `academy:manage`

### `POST /api/tasks/{id}/assignees` 🔒 `academy:manage`
```json
{ "officerId": "ckabc" }
```

---

## SRU

### `GET /api/sru/folders` 🔒 `sru:view`
### `POST /api/sru/folders` 🔒 `sru:manage`

### `GET /api/sru/documents` 🔒 `sru:view`
### `POST /api/sru/documents` 🔒 `sru:manage`
### `PATCH /api/sru/documents/{id}` 🔒 `sru:manage`
### `DELETE /api/sru/documents/{id}` 🔒 `sru:manage`

---

## Patrol Board

### `GET /api/patrol-boards` 🔒 `patrol-board:view`
Liefert die letzten 20 Streifenlisten, das aktive Board, aktuell im Dienst befindliche Officers und den Sync-Zeitpunkt.

### `POST /api/patrol-boards` 🔒 `patrol-board:manage`
Erstellt eine Streifenliste mit drei leeren Standardstreifen.

```json
{
  "title": "Abendstreife",
  "startsAt": "2026-06-20T18:00:00.000Z"
}
```

### `GET /api/patrol-boards/{id}` 🔒 `patrol-board:view`
Liefert ein einzelnes Board vollständig mit Streifen, Besatzungen und Officer-Daten.

### `PATCH /api/patrol-boards/{id}` 🔒 `patrol-board:manage`
Ersetzt die vollständige Streifenaufteilung atomar.

```json
{
  "title": "Abendstreife",
  "startsAt": "2026-06-20T18:00:00.000Z",
  "confirmRuleViolations": false,
  "patrols": [
    {
      "name": "Streife 1",
      "callSign": "S-1",
      "assignment": "Patrol",
      "notes": "Innenstadt",
      "memberIds": ["officer-id-1", "officer-id-2"]
    }
  ]
}
```

- Maximal 30 Streifen pro Board
- Maximal drei Officers pro Streife
- Ein Officer darf nur einer Streife zugewiesen sein
- Solo-Streifen oder mehrere Rookies erfordern `confirmRuleViolations: true`

### `DELETE /api/patrol-boards/{id}` 🔒 `patrol-board:manage`
Löscht das Board einschließlich aller Streifen und Besatzungszuordnungen.

---

## Admin

### `GET /api/audit-logs` 🔒 `logs:view`
Vollständiges Protokoll aller Mutationen.

### `GET /api/stats` 🔒 `dashboard:view`
Aggregierte Statistiken.

### `GET /api/exports` 🔒 `exports:view`
Daten-Exporte.

### `GET /api/badge-blacklist` 🔒 `ranks:manage`
Dienstnummern-Blacklist.

### `POST /api/badge-blacklist` 🔒 `ranks:manage`
```json
{ "badgeNumber": "0001", "reason": "Reserviert" }
```

---

## Users

### `GET /api/users` 🔒 `users:manage`
Alle Benutzer (lokal + Discord-only).

### `GET /api/users/by-discord/{discordId}` 🔒 _beliebiger authentifizierter User_
Liefert User-Infos + effektive Permissions für eine Discord-Snowflake. Nützlich, um vorab zu prüfen, welche Rechte ein User hat, bevor man ihn via `X-Discord-Id` Header an einen Request hängt.

```bash
curl https://deine-domain/api/users/by-discord/123456789012345678 \
  -H "Authorization: Bearer lspd_…"
```

```json
{
  "id": "ckabc",
  "discordId": "123456789012345678",
  "username": "erika",
  "displayName": "Erika Musterfrau",
  "discordUsername": "erika",
  "discordGlobalName": "Erika",
  "avatarUrl": "https://cdn.discordapp.com/avatars/…",
  "lastLoginAt": "2026-06-17T10:30:00.000Z",
  "groups": [{ "id": "g1", "name": "HR-Team" }],
  "permissions": ["officers:view", "calendar:manage", "hr:view", "hr:manage"]
}
```

> Liefert `404`, wenn kein User mit dieser Discord-ID existiert. Kein `users:manage` nötig — nur irgendeine gültige Auth.

### `GET /api/user-groups` 🔒 `groups:manage`

### `POST /api/user-groups` 🔒 `groups:manage`
```json
{ "name": "HR-Team", "description": "...", "permissions": ["hr:manage"] }
```

### `PATCH /api/user-groups/{id}` 🔒 `groups:manage`

### `DELETE /api/user-groups/{id}` 🔒 `groups:manage`

---

## API Tokens

### `GET /api/api-tokens` 🔒 `groups:manage`
Liefert die eigenen Tokens + das konfigurierte Limit.

```json
{
  "maxPerUser": 10,
  "tokens": [
    { "id": "...", "name": "Discord-Bot", "prefix": "lspd_…", "scopes": [], "...": "..." }
  ]
}
```

### `POST /api/api-tokens` 🔒 `groups:manage`
Erstellt einen neuen Token. **Admin-only:** Mit `userId` kann der Token für einen anderen Benutzer angelegt werden.

```json
{
  "name": "Discord-Bot",
  "scopes": ["officers:view"],
  "expiresAt": "2026-12-31T23:59:59.000Z",
  "userId": "ck..."  // optional, nur für Admins
}
```

Response (201):
```json
{
  "id": "ck...",
  "name": "Discord-Bot",
  "prefix": "lspd_p4A8xKz",
  "plaintext": "lspd_p4A8xKzQ2mN7vR3jH9wT5yL1cV8bF0dG2nS6hX",
  "scopes": ["officers:view"],
  "expiresAt": "2026-12-31T23:59:59.000Z",
  "ownerUserId": "ck...",
  "maxPerUser": 10,
  "currentCount": 3
}
```

> ⚠️ `plaintext` ist **NUR DIESE EINE ANTWORT** sichtbar. Sicher speichern!

### `GET /api/api-tokens/{id}` 🔒 `groups:manage`
Token-Details inkl. Recent-Usage-Logs.

### `DELETE /api/api-tokens/{id}` 🔒 `groups:manage`
Soft-Revoke. Mit `?hard=1` wird der Token endgültig gelöscht.

```json
{ "reason": "Vom Benutzer widerrufen" }
```

### `GET /api/api-tokens/settings` 🔒 `groups:manage`
Liefert das aktuelle Token-Limit pro Benutzer.

### `PATCH /api/api-tokens/settings` 🔒 `ADMIN`
Ändert das Token-Limit. Werte: `"unlimited"`, `0`, `-1` für unbegrenzt, oder positive Ganzzahl.

```json
{ "maxPerUser": "unlimited" }
```

---

## Public

### `GET /api/health` (kein Auth)
Health-Check. Liefert `{ "status": "ok" }`.

### `GET /api/public/officers` (kein Auth)
Öffentlich abrufbare Officer-Liste (nur aktive).

---

## CORS

Die Public API reflektiert **jeden Origin**. Da Authentifizierung über Bearer-Tokens läuft, ist der Origin kein Sicherheitskontext — wer ein gültiges Token hat, darf von überall zugreifen.

## Versionierung

Aktuelle Version: **1.0.0**. Breaking Changes werden über eine neue Major-Version (`/api/v2/`) angekündigt.

## Code-Beispiele

### JavaScript / TypeScript
```ts
const res = await fetch('https://deine-domain/api/officers', {
  headers: { Authorization: `Bearer ${process.env.LSPD_TOKEN}` },
})
const { data } = await res.json()
console.log(data)
```

### Python
```python
import os, requests
headers = {"Authorization": f"Bearer {os.environ['LSPD_TOKEN']}"}
res = requests.get("https://deine-domain/api/officers", headers=headers)
print(res.json())
```

### Go
```go
req, _ := http.NewRequest("GET", "https://deine-domain/api/officers", nil)
req.Header.Set("Authorization", "Bearer "+os.Getenv("LSPD_TOKEN"))
res, _ := http.DefaultClient.Do(req)
defer res.Body.Close()
io.Copy(os.Stdout, res.Body)
```

---

## Fehlerbehebung

| Problem | Lösung |
| :-- | :-- |
| `401 Unauthorized` | Token vergessen, abgelaufen oder widerrufen → neuen Token erstellen |
| `403 Forbidden` | Token-Scopes decken die Aktion nicht ab → Scopes anpassen oder Admin-Token nutzen |
| `409 Conflict` | Eindeutigkeits-Konflikt (z. B. Dienstnummer bereits vergeben) |
| CORS-Fehler im Browser | `Authorization: Bearer …` muss gesetzt sein, Cookies allein reichen für Cross-Origin nicht |

## Lizenz & Support

LSPD HR Dashboard · MIT · [github.com/Eministar/lspd-hr](https://github.com/Eministar/lspd-hr)
