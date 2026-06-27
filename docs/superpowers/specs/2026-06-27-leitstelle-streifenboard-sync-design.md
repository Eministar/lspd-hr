# Leitstellen- & Streifenboard-Sync — Design

**Datum:** 2026-06-27
**Quelle:** `LEITSTELLE-STREIFENBOARD-SYSTEM.md` (FiveM-MDT-Spezifikation)

## Ziel

Das alte manuelle Streifenboard (Drag-&-Drop, manuelles Anlegen) wird durch ein
**read-only Live-Board** ersetzt, das ausschließlich von FiveM über eine
vollständige Sync-API gespeist wird. Zusätzlich wird die **Streifenzeit pro
Officer** erfasst und im Dashboard ausgewertet.

## Entscheidungen (vom User bestätigt)

- **Single-Scope**, Label **LSPD** (nicht „SAPD"). `scope` wird als String
  gespeichert wie von FiveM geliefert; das Board ist effektiv ein Scope.
- **Altes Board komplett ersetzen** → Frontend read-only, kein manuelles
  Anlegen/Bearbeiten/Drag-&-Drop mehr. FiveM ist alleinige Datenquelle.
- **FiveM sendet fertige Sessions** (joinedAt/leftAt/duration/endReason). Das
  Dashboard speichert und aggregiert serverseitig.
- **Leitstellen-Inhaber-Anzeige:** ja (kleines `DispatchCenterState`-Modell).
- **Leaderboard-Endpoint:** ja, sofort.

## Datenhoheit

FiveM verwaltet den Live-State. Das Dashboard empfängt über API-Token
(`Authorization: Bearer lspd_…` + `X-Discord-Id`-Impersonation — bereits
vorhanden) und zeigt nur an. Der einzige Schreibpfad ist die Sync-API; das
synchronisierte Board ist im Dashboard schreibgeschützt (Spec §30).

## Schema-Änderungen (Prisma, Anwendung via `prisma db push`)

### `PatrolUnit` erweitern
Neue, optionale Felder (additiv, kein Datenverlust):
- `status Int?` — Live-Status 1–8 (Spec §9)
- `scope String?` — Organisationsbereich
- `assignedDispatchId Int?` — zugewiesener Einsatz

`name`, `callSign`, `assignment`, `notes`, `members`, `sortOrder` bleiben
unverändert. Full-Replace-Semantik des `PATCH` bleibt erhalten.

### Neu: `PatrolSession` (Streifenzeit pro Officer)
```
id                String   @id @default(cuid())
externalId        String?  @unique   // FiveM-Session-ID → idempotentes Re-Senden
officerId         String?            // per discordId aufgelöst; null = (noch) kein Match
officer           Officer? @relation(...)
officerDiscordId  String?
officerName       String
scope             String
patrolName        String
designationAtJoin String?
gradeAtJoin       Int?
joinedAt          DateTime
leftAt            DateTime?
durationSeconds   Int
endReason         String             // leave | disband | crew | disconnect | server_shutdown
createdAt         DateTime @default(now())

@@index([officerId]) @@index([joinedAt]) @@index([scope])
```
Officer-Auflösung per `officerDiscordId` (analog `Officer.discordId @unique`).
Findet sich kein Officer, wird die Session trotzdem mit `officerId = null`
gespeichert (nachziehbar), zählt aber erst nach Verknüpfung in die Aggregation.

### Neu: `DispatchCenterState` (Leitstellen-Inhaber)
```
scope      String   @id
officerId  String?
officer    Officer? @relation(...)
occupiedAt DateTime?
updatedAt  DateTime @updatedAt
```
Nur Anzeige „Leitstelle besetzt von X" / „frei".

## Sync-API (Schreibpfad — Token + `patrol-board:manage`)

| Methode/Pfad | Zweck |
|---|---|
| `GET /api/patrol-boards` | aktives Board laden (bestehend) |
| `POST /api/patrol-boards` | Board anlegen falls keins existiert (bestehend) |
| `PATCH /api/patrol-boards/{id}` | **erweitern**: Full-Replace nimmt jetzt zusätzlich `status`, `scope`, `assignedDispatchId` pro Streife an |
| `POST /api/patrol-sessions` | eine Streifen-Session aufnehmen |
| `POST /api/patrol-sessions/batch` | `{ sessions: [...] }`; unmatched werden übersprungen |
| `PUT /api/dispatch-centers/{scope}/occupant` | Leitstelle besetzen |
| `DELETE /api/dispatch-centers/{scope}/occupant` | Leitstelle freigeben |

**Session-Ingest-Verhalten:**
- Officer per `officerDiscordId` auflösen.
- `externalId` → Upsert (Re-Senden erzeugt keine Doppelzählung; Spec §33.6 B).
- Batch-Antwort: `{ created, updated, skipped, total }`.
- Validierung an der Grenze: Pflichtfelder, `durationSeconds >= 0`,
  `endReason` ∈ erlaubter Menge, Datumsparsing.

## Lese-API & Aggregation (Lesen — `patrol-board:view` / `officers:view`)

- `GET /api/officers/{officerId}/patrol-time?from&to`
  → `{ officerId, totalSeconds, sessionCount, last7DaysSeconds, lastSessionAt, byScope }`
  (serverseitig aggregiert, nicht in FiveM).
- `GET /api/patrol-time/leaderboard?scope&from&to&limit`
  → Rangliste `[{ officerId, officer{…}, totalSeconds, sessionCount }]`.

## Frontend (read-only)

- **Streifenboard-Page** (`src/app/(dashboard)/patrol-board/page.tsx`):
  Drag-&-Drop, Create-/Edit-/Delete-Controls entfernen. Reine Live-Anzeige:
  Streifen, Besatzung, Status-Badge (1–8), ggf. Dispatch-Hinweis,
  Leitstellen-Inhaber-Banner. Sichtbarer „Live von FiveM · read-only"-Hinweis.
- **Officer-Detail:** Karte „Streifenzeit" (Gesamt, letzte 7 Tage, letzte
  Session) — Daten aus `GET /api/officers/{id}/patrol-time`.
- Optionale Leaderboard-Ansicht auf dem Board oder als eigener Abschnitt.

## Permissions

Kein neues Permission nötig:
- Schreiben (Sync) → `patrol-board:manage` (Token-Scope; Spec §31.1 verlangt
  zusätzlich `officers:view` für die Officer-Zuordnung).
- Lesen (Board, Streifenzeit, Leaderboard) → `patrol-board:view` bzw.
  `officers:view`.

## Streifenzeit vs. Dienstzeit (Spec §34)

Strikt getrennt: Streifenzeit = nur Streifen-Mitgliedschaft (`PatrolSession`).
Die bestehende Dienstzeit-Erfassung (`DutyTimeSession`) bleibt unangetastet und
wird getrennt ausgewiesen.

## Nicht im Scope (YAGNI)

- Bidirektionale Bearbeitung vom Dashboard aus.
- Stabile Streifen-UUIDs / Konflikterkennung / Webhooks (Spec §29).
- Leitstellen-Nachrichten/Dispatch-Zuweisung vom Dashboard aus (FiveM-seitig).
- Reine On/Off-Duty-Dienstzeit über dieses Modul (separat vorhanden).
