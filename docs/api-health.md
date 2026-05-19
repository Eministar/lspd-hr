# API Health Checks

## Endpoint

`GET /api/health`

Der Endpoint ist für externe Monitoring-Tools ohne Dashboard-Login erreichbar. Er gibt keine Secrets, Tokens oder personenbezogenen Discord-IDs aus.

## HTTP-Codes

| HTTP-Code | Bedeutung |
| --- | --- |
| `200` | Alle Checks sind `OK`. |
| `207` | Die App läuft, aber mindestens ein Check ist `DEGRADED` oder `UNCONFIGURED`. |
| `503` | Mindestens ein kritischer Check ist `DOWN`. |

## Antwortformat

```json
{
  "success": true,
  "code": "OK",
  "ok": true,
  "checkedAt": "2026-05-19T12:00:00.000Z",
  "durationMs": 123,
  "checks": [
    {
      "name": "database",
      "code": "OK",
      "ok": true,
      "critical": true,
      "durationMs": 12,
      "message": "Datenbank erreichbar",
      "details": {}
    }
  ]
}
```

## Check-Codes

| Code | Bedeutung |
| --- | --- |
| `OK` | Der Bereich funktioniert. |
| `DEGRADED` | Der Bereich ist erreichbar, aber nicht vollständig sauber. |
| `UNCONFIGURED` | Der Bereich ist technisch erreichbar, aber noch nicht fertig konfiguriert. |
| `DOWN` | Der Bereich ist nicht funktionsfähig oder nicht erreichbar. |

## Enthaltene Checks

### `database`

Prüft die Datenbankverbindung über `prisma.$queryRaw` und liest einfache Counts.

Erwartung:
- Datenbank ist erreichbar.
- Prisma kann Queries ausführen.

Kritisch: ja. Wenn dieser Check `DOWN` ist, antwortet `/api/health` mit `503`.

### `auth.login`

Prüft die Discord-Login-Konfiguration.

Erwartung:
- Discord Client/Application-ID ist gesetzt.
- Discord Client Secret ist gesetzt.
- Guild-ID ist gesetzt.
- Mindestens eine Dashboard-Login-Rolle oder mindestens eine Benutzergruppen-Rolle ist konfiguriert.
- Passwort-Login bleibt deaktiviert.

Kritisch: ja. Wenn dieser Check `DOWN` ist, antwortet `/api/health` mit `503`.

### `duty-times.api`

Prüft die Dienstzeiten-API über denselben Snapshot, den auch `GET /api/duty-times` nutzt.

Erwartung:
- Dienstzeiten-Snapshot kann erzeugt werden.
- Player-Online API ist konfiguriert, wenn Live-Dienstzeiten erwartet werden.
- Player-Online Sync liefert keine Fehler.

Kritisch: nein. Ein Problem hier führt zu `207`, solange Datenbank und Login funktionieren.

### `discord.api`

Prüft die Discord Bot API über das Laden der Guild-Rollen.

Erwartung:
- Discord Bot Token ist gesetzt.
- Guild-ID ist gesetzt.
- Discord API ist erreichbar.
- Nutzbare Rollen können geladen werden.

Kritisch: nein.

### `discord.sync`

Prüft, ob der Discord-Rollensync sinnvoll vorbereitet ist. Der Check startet keinen schreibenden Full-Sync.

Erwartung:
- Es gibt Rollen-Zuordnungen für Mitarbeiter-, Rang-, Ausbildungs- oder Unit-Rollen.
- Aktive Officers mit Discord-ID existieren, damit der Sync etwas zuordnen kann.

Kritisch: nein.

## Relevante Dateien

| Bereich | Datei |
| --- | --- |
| Health Endpoint | `src/app/api/health/route.ts` |
| API-Proxy-Ausnahme | `src/proxy.ts` |
| Discord-Konfiguration | `src/lib/discord-integration.ts` |
| Discord Login | `src/lib/discord-auth.ts` |
| Dienstzeiten Snapshot | `src/lib/duty-times.ts` |
| Player-Online Sync | `src/lib/player-online.ts` |
| Discord Full-Sync API | `src/app/api/discord/full-sync/route.ts` |
| Login API | `src/app/api/auth/login/route.ts` |
| Dienstzeiten API | `src/app/api/duty-times/route.ts` |

## Monitoring-Aufgaben

- `GET /api/health` regelmäßig abfragen.
- `200` als vollständig gesund behandeln.
- `207` als Warnung behandeln und die betroffenen `checks[].message` auswerten.
- `503` als kritisch behandeln.
- Keine automatischen Neustarts nur wegen `UNCONFIGURED` auslösen; zuerst Konfiguration prüfen.
- Für echten Discord-Rollensync weiterhin `POST /api/discord/full-sync` mit eingeloggtem Admin-Kontext nutzen.

## Beispiel

```bash
curl -i https://example.com/api/health
```
