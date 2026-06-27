# Leitstellen- und Streifenboard-System

Diese Dokumentation beschreibt das aktuell im FiveM-MDT implementierte Leitstellen- und Streifensystem. Sie dient als technische Grundlage für die Umsetzung und Darstellung im LSPD-HR-Dashboard.

## 1. Systemübersicht

Das System besteht aus drei zusammenhängenden Bereichen:

1. Streifenverwaltung
2. Leitstellenverwaltung
3. Synchronisierung mit dem LSPD-HR-Dashboard

Die Live-Daten werden aktuell im Arbeitsspeicher der FiveM-Resource gehalten. Das HR-Dashboard erhält über seine Patrol-Board-API eine gespiegelte Version der aktiven Streifen.

FiveM ist dabei die führende Datenquelle:

```text
FiveM-Live-State
        |
        v
Vollständige Patrol-Board-Synchronisierung
        |
        v
LSPD-HR-Dashboard
```

Direkte Änderungen am synchronisierten Board im Dashboard werden beim nächsten FiveM-Sync überschrieben.

## 2. Scopes und Fraktionen

Streifen und Leitstellen sind in voneinander getrennte Organisationsbereiche, sogenannte Scopes, unterteilt.

### 2.1 Streifen-Scopes

```lua
Config.PatrolScope = {
    ['police']    = 'sapd',
    ['bcso']      = 'sapd',
    ['fib']       = 'fib',
    ['ambulance'] = 'medic',
    ['fjd']       = 'fjd',
}
```

### 2.2 Leitstellen-Scopes

```lua
Config.LeitstelleScope = {
    ['police']    = 'sapd',
    ['bcso']      = 'sapd',
    ['fib']       = 'fib',
    ['ambulance'] = 'medic',
    ['fjd']       = 'fjd',
}
```

### 2.3 Verfügbare Scopes

| Scope | Bezeichnung |
|---|---|
| `sapd` | LSPD/SAPD |
| `fib` | FIB |
| `medic` | Rettungsdienst |
| `fjd` | FJD |

### 2.4 Scope-Regeln

- Eine Streife gehört immer genau einem Scope.
- Spieler sehen nur Streifen ihres eigenen Scopes.
- Pro Scope kann maximal eine Leitstelle aktiv sein.
- Spieler können nur Streifen ihres eigenen Scopes beitreten.
- Eine Leitstelle kann nur Streifen ihres eigenen Scopes verwalten.
- Leitstellennachrichten werden nur an Streifen des eigenen Scopes gesendet.
- Dispatches können nur Streifen des eigenen Scopes zugewiesen werden.

Für die aktuelle Dashboard-Synchronisierung wird ein einzelner Scope konfiguriert:

```lua
Config.Dashboard.Scope = 'sapd'
```

## 3. Datenmodell einer Streife

Eine lokale FiveM-Streife besitzt folgende Struktur:

```json
{
  "id": 1,
  "scope": "sapd",
  "designation": "Adam",
  "number": "01",
  "name": "Adam-01",
  "members": [
    {
      "id": 42,
      "name": "Max Mustermann",
      "grade": 5,
      "jobName": "police"
    }
  ],
  "status": 1,
  "createdAt": 1781980000,
  "assignedDispatchId": null,
  "noMinCrew": false,
  "detectiveMode": false,
  "airMode": false
}
```

### 3.1 Felder

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | Number | Interne, laufende FiveM-Streifen-ID |
| `scope` | String | Zuständiger Organisationsbereich |
| `designation` | String | Funkrufbezeichnung, beispielsweise `Adam` |
| `number` | String | Zweistellige laufende Nummer |
| `name` | String | Vollständiger Rufname, beispielsweise `Adam-01` |
| `members` | Array | Aktuelle Besatzung |
| `status` | Number | Live-Status zwischen 1 und 8 |
| `createdAt` | Number | Unix-Zeitstempel der Erstellung |
| `assignedDispatchId` | Number oder `null` | Zugewiesener Einsatz |
| `noMinCrew` | Boolean | Deaktiviert die Mindestbesatzungsprüfung |
| `detectiveMode` | Boolean | Manueller Detective-Modus |
| `airMode` | Boolean | Manueller Air-Modus |

Die Streifen-ID ist nur für die aktuelle Laufzeit der FiveM-Resource stabil. Für eine bidirektionale Dashboard-Integration wäre eine dauerhaft gespeicherte UUID erforderlich.

## 4. Datenmodell eines Streifenmitglieds

```json
{
  "id": 42,
  "name": "Max Mustermann",
  "grade": 5,
  "jobName": "police"
}
```

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | Number | Aktuelle FiveM-Server-ID |
| `name` | String | IC-Name des Spielers |
| `grade` | Number | Nullbasierter ESX-Jobgrade |
| `jobName` | String | ESX-Jobname |

Die FiveM-Server-ID ist nicht dauerhaft und darf im Dashboard nicht als stabile Benutzerkennung gespeichert werden.

> **Wichtig für Zeit-Tracking:** Das Mitglieds-Objekt enthält aktuell **keine** stabile Kennung (kein `identifier`, kein `discord`). Für ein zuverlässiges Streifenzeit-Tracking pro Officer muss beim Erstellen/Beitreten zusätzlich eine stabile ID am Mitglied gespeichert werden (siehe Abschnitt 33). Empfohlen: ESX-`identifier` (license) **und** Discord-ID.

Die dauerhafte Zuordnung erfolgt über die Discord-ID:

```text
FiveM-Spieler
    |
    v
GetPlayerIdentifiers
    |
    v
discord:123456789012345678
    |
    v
GET /api/officers
    |
    v
Officer mit passender discordId
    |
    v
Dashboard officer.id
```

## 5. Streife erstellen

Ein Spieler kann eine neue Streife erstellen, wenn:

- sein Job einen Patrol-Scope besitzt,
- er den erforderlichen Mindestgrad erreicht,
- er noch keiner anderen Streife angehört.

Der Standard-Mindestgrad ist:

```lua
Config.PatrolCreateMinGrade = 1
```

ESX-Grade sind nullbasiert. Grade `1` entspricht daher Rang 2.

Jobabhängige Ausnahmen können konfiguriert werden:

```lua
Config.PatrolCreateMinGradePerJob = {
    ['fjd'] = 0,
}
```

### 5.1 Ablauf

1. Der Server prüft Job, Scope und Rang.
2. Der Server prüft, ob der Spieler bereits einer Streife angehört.
3. Eine neue lokale Streifen-ID wird erzeugt.
4. Der Spieler wird als erstes Mitglied eingetragen.
5. Die passende Funkrufbezeichnung wird berechnet.
6. Die nächste freie Nummer wird vergeben.
7. Der Startstatus wird auf `1` gesetzt.
8. Die Streife wird an alle Spieler des Scopes übertragen.
9. Die Dashboard-Synchronisierung wird ausgelöst.

## 6. Streifenbezeichnungen

Der Funkrufname wird automatisch anhand des Scopes, der Besatzung und der Ränge ermittelt.

### 6.1 SAPD/LSPD

| Bezeichnung | `auto`-Typ | Bedingung |
|---|---|---|
| `William` | `anySupervisor` | Mindestens ein Mitglied ab Grade 6 |
| `Lincoln` | `threeMan` | Genau drei Mitglieder ohne Supervisor |
| `Adam` | `twoMan` | Genau zwei Mitglieder ohne Supervisor |
| `David` | `detective` | Manueller Detective-Modus (per Funkgerät); Supervisor-Schwelle Grade 5 |
| `Air` | `air` | Manueller Air-Modus (per Funkgerät); ausführender Spieler ab Grade 4 |

Die Reihenfolge der Auswertung in `CalcDesignation` ist: `gradeRange` (nur FJD) → `anySupervisor` → bei 3 Mitgliedern `threeMan`/`twoThreeMan`/`twoPlus` → bei 2 Mitgliedern `twoMan`/`twoThreeMan`/`twoPlus` → bei 1 Mitglied `oneMan` → `default`/Fallback. `detective` und `air` werden nie automatisch vergeben, sondern nur manuell über das Funkgerät gesetzt.

Beispiele:

```text
Adam-01
Adam-02
William-01
Lincoln-01
David-01
Air-01
```

### 6.2 FIB

| Bezeichnung | Bedingung |
|---|---|
| `William` | Mindestens ein Mitglied ab Grade 9 |
| `David` | Zwei bis drei Mitglieder |
| `Air` | Manueller Air-Modus ab Grade 3 |

### 6.3 Rettungsdienst

| Bezeichnung | Bedingung |
|---|---|
| `Edward` | Mindestens zwei Mitglieder |
| `Sam` | Einzelbesetzung |

### 6.4 FJD

Die Bezeichnung richtet sich nach dem höchsten Mitgliedsrang:

| Bezeichnung | ESX-Grade |
|---|---|
| `Justice` | 0 bis 13 |
| `Sentinal` | 14 bis 21 |
| `Prime` | 22 bis 26 |

### 6.5 Nummernvergabe

Die Nummer wird pro Scope und Bezeichnung vergeben.

Wenn `Adam-01` und `Adam-03` existieren, wird als nächste freie Bezeichnung `Adam-02` verwendet.

Die vollständige Bezeichnung setzt sich folgendermaßen zusammen:

```text
{designation}-{number}
```

## 7. Besatzungsregeln

Die maximale Besatzung beträgt aktuell drei Mitglieder:

```lua
Config.PatrolMaxSize = {
    sapd = 3,
    fib = 3,
    medic = 3,
    fjd = 3,
}
```

Ein Spieler kann nur einer Streife gleichzeitig angehören.

### 7.1 Prüfung beim Beitritt

- Der Spieler ist noch in keiner Streife.
- Die Zielstreife existiert.
- Die Zielstreife ist noch nicht voll.
- Der Spieler gehört zum gleichen Scope.

Nach jeder Besatzungsänderung wird die Funkrufbezeichnung neu berechnet.

Dadurch kann beispielsweise eine `Adam`-Streife nach dem Beitritt eines Supervisors automatisch zu einer `William`-Streife werden.

## 8. Solo-Streifen und Mindestbesatzung

Eine Streife muss grundsätzlich mindestens zwei Mitglieder besitzen. Ist sie zu schwach besetzt, läuft eine Gnadenfrist; danach wird sie automatisch aufgelöst:

```lua
Config.PatrolMinCrewDelay = 180000  -- 3 Minuten
```

### 8.1 Token-basierte Mindestbesatzungsprüfung (aktuelle Implementierung)

Die Prüfung ist **nicht** ein einmaliger Timer beim Erstellen, sondern wird nach **jeder** Mitglieder-Änderung neu bewertet (`UpdateCrewTimer`). Aufrufer sind: Streife erstellen, beitreten, verlassen und Disconnect.

Ablauf von `UpdateCrewTimer(patrol)`:

1. Hat die Streife **≥ 2 Mitglieder** oder ist sie ausgenommen (`noMinCrew`/solo-berechtigtes Mitglied), wird ein evtl. laufender Auflöse-Timer per **Token** entwertet und die Funktion bricht ab. Eine 2-Mann-Streife kann dadurch **nie** durch diese Regel aufgelöst werden.
2. Ist sie **zu schwach besetzt**, wird der `crewToken` der Streife erhöht und ein neuer Thread mit `Wait(Config.PatrolMinCrewDelay)` gestartet.
3. Nach Ablauf löst der Thread die Streife nur auf, wenn der `crewToken` noch identisch ist **und** die Streife weiterhin < 2 Mitglieder hat **und** nicht ausgenommen ist.

Dadurch bekommt ein 2 → 1-Fall (Aussteigen/Disconnect) automatisch wieder die volle Gnadenzeit, und ein 1 → 2-Fall (Beitritt) bricht den laufenden Timer sofort ab.

Beim Auflösen wird an den Scope gesendet:

```json
{ "id": 7, "reason": "crew" }
```

`reason = "crew"` kennzeichnet die automatische Auflösung wegen Unterbesetzung (für Dashboard-Audit relevant).

### 8.2 Solo-Berechtigungen (Ausnahmen)

Eine Streife wird über `noMinCrew` von der Prüfung ausgenommen. `noMinCrew` ist `true`, wenn die Bezeichnung Solo erlaubt (z. B. Rettungsdienst `Sam`, `noMinCrew = true`) **oder** mindestens ein Mitglied solo-berechtigt ist.

Solo-Berechtigung eines Mitglieds (`MemberCanSoloPatrol`):

```lua
-- Jobs, die IMMER (jeder Rang) solo dürfen:
Config.PatrolSoloAlwaysJobs = {
    ['ambulance'] = true,
    ['fjd']       = true,
}

-- Globaler Mindest-Grade für Solo (greift, wenn kein Per-Job-Wert gesetzt ist):
Config.PatrolSoloMinGrade = 9

-- Per-Job-Override (hat Vorrang vor dem globalen Wert):
Config.PatrolSoloMinGradePerJob = {
    ['police'] = 12,
    ['fib']    = 12,
}
```

Auswertung pro Mitglied:

1. Ist der Job in `PatrolSoloAlwaysJobs` → solo-berechtigt (jeder Rang).
2. Sonst gilt der Per-Job-Grade aus `PatrolSoloMinGradePerJob`, andernfalls `PatrolSoloMinGrade`. Erreicht der Grade diese Schwelle, ist das Mitglied solo-berechtigt.

Praktisch heißt das aktuell:

| Job | Solo erlaubt ab |
|---|---|
| `ambulance` | jeder Rang |
| `fjd` | jeder Rang |
| `police` | Grade 12 |
| `fib` | Grade 12 |
| `bcso` | Grade 9 (globaler Standard) |

Das Ergebnis wird im Feld `noMinCrew` gespeichert:

```json
{ "noMinCrew": true }
```

## 9. Streifenstatus

Jede Streife besitzt einen Status zwischen 1 und 8.

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

Ein Streifenmitglied kann den Status der eigenen Streife verändern.

Die aktive Leitstelle kann den Status jeder Streife ihres Scopes verändern.

### 9.1 Sprechwunsch

Wird Status `5` gesetzt, erhält die aktive Leitstelle eine Benachrichtigung:

```text
Sprechwunsch von Streife Adam-01
```

Übermittelt werden:

- Streifenname
- Name des auslösenden Mitglieds
- Uhrzeit

## 10. Streife verlassen

Ein Mitglied kann seine aktuelle Streife verlassen.

Danach:

1. Das Mitglied wird aus der Besatzung entfernt.
2. Die Streifenbezeichnung wird neu berechnet.
3. Sind keine Mitglieder mehr vorhanden, wird die Streife gelöscht.
4. Die Änderung wird an alle Clients des Scopes übertragen.
5. Das Dashboard-Streifenboard wird synchronisiert.

## 11. Streife auflösen

Eine Streife darf aufgelöst werden durch:

- ein Mitglied dieser Streife,
- die aktive Leitstelle des Scopes.

Beim Auflösen wird die vollständige Streife aus dem Live-State entfernt.

Die Änderung wird an alle Clients übertragen und anschließend mit dem Dashboard synchronisiert.

## 12. Leitstellenmodell

Pro Scope existiert maximal eine aktive Leitstelle.

```json
{
  "id": 42,
  "name": "Max Mustermann",
  "jobName": "police"
}
```

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | Number | FiveM-Server-ID |
| `name` | String | IC-Name |
| `jobName` | String | ESX-Jobname |

Der Zustand wird serverseitig ungefähr so gespeichert:

```lua
leitstelleOccupants = {
    sapd = {
        id = 42,
        name = 'Max Mustermann',
        jobName = 'police',
    }
}
```

## 13. Leitstelle übernehmen

Ein berechtigter Spieler kann die Leitstelle übernehmen, wenn sie aktuell frei ist.

### 13.1 Ablauf

1. Scope des Spielers bestimmen.
2. Prüfen, ob der Job des Spielers einen Leitstellen-Scope besitzt.
3. Prüfen, ob die Leitstelle bereits besetzt ist.
4. Spieler als Leitstelleninhaber eintragen.
5. Neuen Leitstellenstatus an alle Spieler des Scopes senden.
6. Aktuelle Streifenliste an die Leitstelle senden.
7. Dashboard-Synchronisierung mit der Discord-ID der Leitstelle auslösen.
8. Aktion im Server-Logging protokollieren.

### 13.2 UI-Zustände

```text
Leitstelle ist frei
Du bist die Leitstelle
Leitstelle ist besetzt von Max Mustermann
```

## 14. Leitstelle verlassen

Nur der aktuelle Leitstelleninhaber kann sich ausstempeln.

Beim Verlassen:

- wird der Leitstellenplatz freigegeben,
- erhalten alle Spieler des Scopes den neuen Status,
- werden die aktiven Leitstellenfunktionen im UI deaktiviert.

Wenn der Leitstelleninhaber den Server verlässt, wird der Platz automatisch freigegeben.

## 15. Manuelle Leitstellenrechte

Neben der aktiven Leitstellenposition existieren manuell vergebene Leitstellenrechte.

Diese Rechte steuern, ob ein Spieler die Leitstellen-App im MDT sehen und öffnen darf.

Ein entsprechend hochrangiger Spieler kann:

- nahe Spieler des eigenen Jobs auflisten,
- Leitstellenrechte vergeben,
- Leitstellenrechte wieder entziehen.

Manuelle Leitstellenrechte bedeuten nicht automatisch, dass der Spieler die aktive Leitstelle ist.

Sie erlauben nur den Zugriff auf die Leitstellen-App. Die aktive Position muss weiterhin über das Einstempeln übernommen werden.

## 16. Funktionen der aktiven Leitstelle

Die aktive Leitstelle kann:

- alle aktiven Streifen des Scopes sehen,
- die vollständige Besatzung jeder Streife sehen,
- den Status einer Streife verändern,
- Streifen auflösen,
- Nachrichten an einzelne Streifen senden,
- Nachrichten an alle Streifen senden,
- aktive Dispatches einzelnen Streifen zuweisen,
- aktive Dispatches allen verfügbaren Streifen zuweisen.

Alle Aktionen sind auf den eigenen Scope begrenzt.

## 17. Leitstellennachrichten

Die Leitstelle kann Textnachrichten mit maximal 300 Zeichen versenden.

Mögliche Ziele:

- eine bestimmte Streife,
- alle Streifen des Scopes.

Beispiel:

```json
{
  "message": "Alle Einheiten zur Mission Row Police Station.",
  "sender": "Max Mustermann",
  "scope": "sapd",
  "time": "21:42"
}
```

Jedes Mitglied der Zielstreife erhält:

- eine akustische Benachrichtigung,
- ein Leitstellen-Popup,
- die Nachricht,
- den Absender,
- die Uhrzeit.

Im aktuellen UI existiert ein clientseitiger Sendecooldown von zehn Sekunden.

## 18. Dispatch-Zuweisung

Die Leitstelle kann einen aktiven Dispatch einer oder mehreren Streifen zuweisen.

Nicht zuweisbar sind aktuell Streifen mit:

- Status 3: Anfahrt zum Einsatzort
- Status 4: Ankunft am Einsatzort

Bei erfolgreicher Zuweisung wird die Dispatch-ID an der Streife gespeichert:

```json
{
  "assignedDispatchId": 123
}
```

Die Mitglieder erhalten automatisch:

- den Dispatch,
- die Zielkoordinaten,
- gegebenenfalls einen Wegpunkt,
- eine Leitstellenbenachrichtigung.

Beispiel:

```text
Leitstelle: Einsatz "#123 Raubalarm" wurde Streife Adam-01 zugeteilt.
```

Bei einer Zuweisung an alle werden ausschließlich aktuell zuweisbare Streifen berücksichtigt.

## 19. Dashboard-Authentifizierung

Jeder Dashboard-Aufruf verwendet einen Bearer-Token und Discord-ID-Impersonation:

```http
Authorization: Bearer lspd_TOKEN
X-Discord-Id: 123456789012345678
Accept: application/json
Content-Type: application/json
```

Die effektiven Rechte entsprechen der Schnittmenge aus:

```text
Token-Scopes ∩ Rechte des impersonierten Dashboard-Users
```

Ein Token kann dadurch nie mehr Rechte ausüben, als der impersonierte User besitzt. Rechte, die der User besitzt, aber der Token nicht enthält, können ebenfalls nicht verwendet werden.

## 20. Dashboard-User und Rechte prüfen

Vor der Synchronisierung wird der Dashboard-User anhand seiner Discord-ID geprüft:

```http
GET /api/users/by-discord/{discordId}
```

Benötigte Rechte:

```text
officers:view
patrol-board:manage
```

Ohne diese Rechte findet keine Synchronisierung statt.

### 20.1 Mögliche Fehler

| HTTP-Status | Bedeutung |
|---:|---|
| 401 | Token ungültig, abgelaufen oder Dashboard-User unbekannt |
| 403 | Token oder User besitzt nicht alle benötigten Rechte |
| 404 | Dashboard-User oder Board nicht gefunden |
| 500 | Interner Fehler der Dashboard-API |

Die effektiven Rechte werden standardmäßig für 60 Sekunden pro Discord-ID gecacht:

```lua
Config.Dashboard.PermissionCacheMs = 60000
```

## 21. Dashboard-Officer-Zuordnung

FiveM-Spieler werden über ihre Discord-ID mit Dashboard-Officers verknüpft.

Die Officer-Liste wird folgendermaßen geladen:

```http
GET /api/officers
Authorization: Bearer lspd_TOKEN
X-Discord-Id: 123456789012345678
```

Aus der Antwort wird eine Zuordnung erstellt:

```json
{
  "123456789012345678": "officer-id-1",
  "987654321098765432": "officer-id-2"
}
```

Ein Spieler wird nur in das Dashboard-Board übernommen, wenn:

- eine Discord-ID vorhanden ist,
- im Dashboard ein Officer mit dieser Discord-ID existiert,
- der Officer über `GET /api/officers` geliefert wird.

Spieler ohne passenden Dashboard-Officer werden übersprungen.

Die Officer-Zuordnung wird standardmäßig fünf Minuten gecacht:

```lua
Config.Dashboard.OfficerCacheMs = 300000
```

## 22. Patrol-Board-Synchronisierung

### 22.1 Aktives Board laden

```http
GET /api/patrol-boards
```

Erwartete Antwort:

```json
{
  "success": true,
  "data": {
    "activeBoard": {
      "id": "board-id"
    }
  }
}
```

### 22.2 Board erstellen

Existiert kein aktives Board, wird ein neues Board erstellt:

```http
POST /api/patrol-boards
```

```json
{
  "title": "Live-Streifen (FiveM)"
}
```

### 22.3 Vollständigen Zustand übertragen

Der vollständige Zustand wird anschließend atomar übertragen:

```http
PATCH /api/patrol-boards/{id}
```

```json
{
  "patrols": [
    {
      "name": "Adam-01",
      "callSign": "Adam-01",
      "assignment": "Status 1 — Einsatzbereit auf Funk",
      "memberIds": [
        "officer-id-1",
        "officer-id-2"
      ]
    }
  ],
  "confirmRuleViolations": true
}
```

Das Board wird vollständig ersetzt. Die übertragene Liste darf im Dashboard nicht lediglich an bestehende Einträge angehängt werden.

## 23. Mapping von FiveM zum Dashboard

| FiveM | Dashboard Patrol Board |
|---|---|
| `patrol.name` | `name` |
| `patrol.name` | `callSign` |
| Status-ID und Statusbezeichnung | `assignment` |
| Discord-ID des Mitglieds | Suche nach Dashboard-Officer |
| Dashboard-Officer-ID | `memberIds[]` |

Beispiel:

```json
{
  "name": "William-01",
  "callSign": "William-01",
  "assignment": "Status 3 — Anfahrt zum Einsatzort",
  "memberIds": [
    "cm123-officer",
    "cm456-officer"
  ]
}
```

## 24. API-Limits

Das Dashboard-Patrol-Board besitzt folgende dokumentierte Limits:

- maximal 30 Streifen pro Board,
- maximal drei Officers pro Streife,
- ein Officer darf nur einmal im Board vorkommen.

Streifen mit mehr als drei Mitgliedern würden in Blöcke aufgeteilt:

```text
Adam-01 (1/2)
Adam-01 (2/2)
```

Die aktuelle FiveM-Konfiguration erlaubt bereits maximal drei Mitglieder pro Streife. Eine Aufteilung ist deshalb normalerweise nicht notwendig, bleibt aber als Sicherheitsmechanismus bestehen.

## 25. Synchronisierungszeitpunkte

Ein Dashboard-Sync wird ausgelöst bei:

- Erstellen einer Streife,
- Beitritt zu einer Streife,
- Verlassen einer Streife,
- Auflösen einer Streife,
- Statusänderung durch ein Streifenmitglied,
- Statusänderung durch die Leitstelle,
- Dispatch-Zuweisung,
- Änderung des Detective-Modus,
- Änderung des Air-Modus,
- automatischer Auflösung wegen fehlender Mindestbesatzung,
- Disconnect eines Streifenmitglieds,
- Übernahme der Leitstelle.

Änderungen werden standardmäßig für 1,5 Sekunden gebündelt:

```lua
Config.Dashboard.SyncDebounceMs = 1500
```

Zusätzlich erfolgt alle 60 Sekunden ein vollständiger Sicherheitsabgleich:

```lua
Config.Dashboard.PeriodicSyncMs = 60000
```

## 26. API-Audit-Aktor

Für API-Aufrufe wird möglichst der Spieler verwendet, der die Änderung ausgelöst hat.

| Aktion | Verwendete `X-Discord-Id` |
|---|---|
| Spieler erstellt Streife | Discord-ID des Spielers |
| Spieler tritt Streife bei | Discord-ID des Spielers |
| Spieler verlässt Streife | Discord-ID des Spielers |
| Mitglied setzt Status | Discord-ID des Mitglieds |
| Leitstelle setzt Status | Discord-ID der Leitstelle |
| Leitstelle löst Streife auf | Discord-ID der Leitstelle |
| Leitstelle weist Einsatz zu | Discord-ID der Leitstelle |
| Leitstelle übernimmt Position | Discord-ID der Leitstelle |

Bei automatischen Synchronisierungen wird in folgender Reihenfolge nach einem Aktor gesucht:

1. letzter gültiger Aktor des Scopes,
2. aktive Leitstelle,
3. verbundenes Streifenmitglied.

Ohne verbundenen Spieler mit gültiger Discord-ID wird kein impersonierter API-Aufruf ausgeführt.

## 27. Empfohlenes Dashboard-Datenmodell

### 27.1 Patrol Board

```ts
interface PatrolBoard {
  id: string;
  title: string;
  startsAt: string;
  active: boolean;
  patrols: Patrol[];
  createdAt: string;
  updatedAt: string;
}
```

### 27.2 Patrol

```ts
interface Patrol {
  id: string;
  boardId: string;
  name: string;
  callSign: string;
  assignment: string | null;
  status?: number;
  scope?: string;
  assignedDispatchId?: number | null;
  members: PatrolMember[];
  sortOrder: number;
}
```

### 27.3 Patrol Member

```ts
interface PatrolMember {
  officerId: string;
  officer: {
    id: string;
    firstName: string;
    lastName: string;
    badgeNumber: string | null;
    discordId: string | null;
    rank?: {
      id: string;
      name: string;
    };
  };
}
```

### 27.4 Leitstellenzustand

Die aktuelle Patrol-Board-API dokumentiert kein eigenes Leitstellenmodell. Für eine native Dashboard-Umsetzung wird folgende zusätzliche Entität empfohlen:

```ts
interface DispatchCenterState {
  scope: 'sapd' | 'fib' | 'medic' | 'fjd';
  officerId: string | null;
  occupiedAt: string | null;
  updatedAt: string;
}
```

## 28. Empfohlene zusätzliche Dashboard-Endpoints

Die bestehende API deckt das Streifenboard ab, aber nicht den vollständigen Live-Leitstellenzustand.

Für eine bidirektionale Integration wären folgende Endpoints sinnvoll.

### 28.1 Leitstelle

```http
GET /api/dispatch-centers/{scope}
PUT /api/dispatch-centers/{scope}/occupant
DELETE /api/dispatch-centers/{scope}/occupant
```

Beispiel:

```json
{
  "officerId": "officer-id",
  "occupiedAt": "2026-06-21T19:30:00.000Z"
}
```

### 28.2 Streifenstatus

```http
PATCH /api/patrol-boards/{boardId}/patrols/{patrolId}/status
```

```json
{
  "status": 3
}
```

### 28.3 Dispatch-Zuweisung

```http
PATCH /api/patrol-boards/{boardId}/patrols/{patrolId}/dispatch
```

```json
{
  "dispatchId": 123
}
```

### 28.4 Leitstellennachrichten

```http
POST /api/dispatch-centers/{scope}/messages
```

```json
{
  "patrolIds": [
    "patrol-id-1"
  ],
  "message": "Zurück zur Wache."
}
```

## 29. Architektur für eine bidirektionale Integration

Aktuell gilt:

```text
FiveM verwaltet den Live-State.
Das Dashboard zeigt den synchronisierten Zustand.
```

Wenn das Dashboard zukünftig ebenfalls Änderungen vornehmen soll, werden zusätzliche Mechanismen benötigt:

- dauerhaft stabile Streifen-IDs,
- persistenter Leitstellenzustand,
- Versionsnummer oder `updatedAt`,
- Konflikterkennung,
- Webhooks, WebSocket oder Polling,
- klar definierte Datenhoheit,
- Schutz vor Synchronisierungsschleifen,
- Audit-Logs für Dashboard- und FiveM-Aktionen.

Eine mögliche Architektur:

```text
FiveM
  | \
  |  \ Statusänderung
  |   v
  | Dashboard-API
  |   |
  |   v
  | Event/Webhook
  |   |
  v   v
Live-State-Abgleich
```

Jede Mutation sollte mindestens folgende Metadaten besitzen:

```json
{
  "source": "fivem",
  "actorDiscordId": "123456789012345678",
  "version": 17,
  "updatedAt": "2026-06-21T19:30:00.000Z"
}
```

## 30. Aktuelle Datenhoheit

Für den aktuellen Entwicklungsstand sollte folgende Regel gelten:

> FiveM verwaltet Streifen, Besatzungen, Status, Dispatch-Zuweisungen und die aktive Leitstelle. Das Dashboard zeigt den synchronisierten Zustand an und dient als Übersichts-, Verwaltungs- und Audit-Oberfläche.

Solange keine bidirektionalen Endpoints und keine Konflikterkennung existieren, sollte das synchronisierte Live-Board im Dashboard als schreibgeschützt behandelt werden.

## 31. Dashboard-Konfiguration in FiveM

```lua
Config.Dashboard = {
    Enabled = false,
    Debug = true,
    BaseUrl = 'https://dein-dashboard.tld',
    Token = 'lspd_DEIN_API_TOKEN',
    Scope = 'sapd',
    BoardTitle = 'Live-Streifen (FiveM)',
    SyncDebounceMs = 1500,
    PeriodicSyncMs = 60000,
    OfficerCacheMs = 300000,
    PermissionCacheMs = 60000,
}
```

### 31.1 Benötigte Token-Scopes

```text
officers:view
patrol-board:manage
```

Der impersonierte Dashboard-User benötigt dieselben Rechte.

### 31.2 Aktivierung

Für die Aktivierung müssen mindestens folgende Werte gesetzt werden:

```lua
Config.Dashboard.Enabled = true
Config.Dashboard.BaseUrl = 'https://dashboard-domain.tld'
Config.Dashboard.Token = 'lspd_...'
```

Die `BaseUrl` wird ohne abschließenden Slash angegeben.

## 32. Zusammenfassung des Dashboard-Verhaltens

Das Dashboard sollte für die aktuelle Integration:

1. das aktive Patrol Board liefern,
2. bei Bedarf ein neues Board erstellen,
3. vollständige Patrol-Board-Updates atomar verarbeiten,
4. Officers anhand ihrer Discord-ID bereitstellen,
5. die Rechte des impersonierten Users prüfen,
6. Audit-Einträge mit dem impersonierten User als Aktor erzeugen,
7. Token-Name und aufrufende Discord-ID in den Audit-Details speichern,
8. maximal drei Officers pro Streife erlauben,
9. doppelte Officer-Zuweisungen verhindern,
10. synchronisierte FiveM-Live-Daten zunächst als schreibgeschützt behandeln.

## 33. Streifenzeit-Tracking pro Officer

Dieser Abschnitt beschreibt, wie sich die **Streifenzeit pro Officer** erfassen und an ein Dashboard übertragen lässt. Es ist eine Erweiterung — der aktuelle Code akkumuliert **noch keine** Zeiten; er sendet nur den Live-Zustand des Boards.

### 33.1 Grundidee

„Streifenzeit" eines Officers = die Summe aller Zeitspannen, in denen er **Mitglied einer Streife** war. Eine Zeitspanne (Session) beginnt, wenn ein Officer Mitglied einer Streife wird, und endet, wenn er es nicht mehr ist.

```text
Mitglied wird hinzugefügt  -> Session START (joinedAt = os.time())
Mitglied wird entfernt     -> Session ENDE  (leftAt   = os.time(), dauer = leftAt - joinedAt)
```

### 33.2 Auslöser (Start/Stop) — exakte Code-Stellen

Alle relevanten Ein-/Austritte laufen in `server/server.lua` über genau diese Pfade:

| Ereignis | Net-Event / Handler | Wirkung auf Mitgliedschaft |
|---|---|---|
| Streife erstellen | `nerov_mdt:server:createPatrol` | Ersteller wird 1. Mitglied → **START** |
| Streife beitreten | `nerov_mdt:server:joinPatrol` | neues Mitglied → **START** |
| Streife verlassen | `nerov_mdt:server:leavePatrol` → `PatrolLeave(src)` | Mitglied entfernt → **STOP** |
| Streife auflösen | `nerov_mdt:server:disbandPatrol` | alle Mitglieder entfernt → **STOP für alle** |
| Auto-Auflösung (Crew) | `UpdateCrewTimer` → `patrolRemoved {reason="crew"}` | alle Mitglieder entfernt → **STOP für alle** |
| Disconnect | `AddEventHandler('playerDropped', …)` | Mitglied entfernt → **STOP** |

> Hinweis: Es gibt zusätzlich die Exports `FunkLeavePatrol(playerId)` und Funk-/Detective-/Air-Funktionen. Detective-/Air-Modus ändern nur die Bezeichnung, **nicht** die Mitgliedschaft — sie starten/stoppen also keine Session.

### 33.3 Stabile Officer-Kennung beschaffen

Das Mitglieds-Objekt (`{ id, name, grade, jobName }`) hat keine stabile ID. Beim Eintragen eines Mitglieds zusätzlich erfassen:

```lua
local xp = ESX.GetPlayerFromId(src)
local member = {
    id         = src,
    name       = xp.getName(),
    grade      = xp.getJob().grade,
    jobName    = xp.getJob().name,
    identifier = xp.getIdentifier(),   -- stabile ESX-ID (license:...)
    discord    = GetDiscordId(src),    -- für Dashboard-Officer-Zuordnung
    joinedAt   = os.time(),            -- Session-Start
}
```

`GetDiscordId(src)` existiert bereits (im Dashboard-Block) und liest die Discord-ID aus `GetPlayerIdentifiers`. Für eine projektweite Nutzung sollte die Funktion nach oben gezogen (modulweit verfügbar) werden.

### 33.4 Datenmodell einer Streifen-Session

```json
{
  "sessionId": "uuid-oder-autoincrement",
  "officerIdentifier": "license:abc123",
  "officerDiscordId": "123456789012345678",
  "officerName": "Max Mustermann",
  "scope": "sapd",
  "patrolId": 7,
  "patrolName": "Adam-01",
  "designationAtJoin": "Adam",
  "gradeAtJoin": 5,
  "joinedAt": "2026-06-27T19:30:00.000Z",
  "leftAt": "2026-06-27T20:15:00.000Z",
  "durationSeconds": 2700,
  "endReason": "leave"
}
```

`endReason` ∈ `leave` | `disband` | `crew` | `disconnect` | `server_shutdown`.

### 33.5 FiveM-seitige Akkumulation (empfohlene Umsetzung)

1. **Session-Start** in `PatrolCreate` und `joinPatrol`: pro hinzugefügtem Mitglied `joinedAt = os.time()` setzen.
2. **Session-Ende** in `PatrolLeave`, `disbandPatrol`, `UpdateCrewTimer`-Auflösung und `playerDropped`: für jedes entfernte Mitglied `leftAt = os.time()`, `durationSeconds = leftAt - joinedAt` berechnen und einen Session-Datensatz schreiben.
3. **Persistenz**: Session beim Ende in eine DB-Tabelle schreiben (überlebt Resource-Neustarts und Crashes besser als reines Senden). Beispiel:

```sql
CREATE TABLE mdt_patrol_sessions (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  officer_ident    VARCHAR(64)  NOT NULL,
  officer_discord  VARCHAR(32)  NULL,
  officer_name     VARCHAR(128) NOT NULL,
  scope            VARCHAR(16)  NOT NULL,
  patrol_id        INT          NOT NULL,
  patrol_name      VARCHAR(32)  NOT NULL,
  grade_at_join    INT          NOT NULL,
  joined_at        DATETIME     NOT NULL,
  left_at          DATETIME     NULL,
  duration_seconds INT          NULL,
  end_reason       VARCHAR(16)  NULL,
  synced           TINYINT(1)   NOT NULL DEFAULT 0,
  INDEX (officer_ident), INDEX (scope), INDEX (synced)
);
```

4. **Offene Sessions absichern**: Beim Ressourcen-Start alle Sessions mit `left_at IS NULL` als `end_reason='server_shutdown'` schließen (Dauer optional verwerfen oder bis zum letzten bekannten Zeitpunkt kappen), damit ein Crash keine „unendlichen" Sessions hinterlässt:

```lua
AddEventHandler('onResourceStart', function(res)
    if res ~= GetCurrentResourceName() then return end
    MySQL.update.await(
        "UPDATE mdt_patrol_sessions SET left_at=NOW(), end_reason='server_shutdown', "
     .. "duration_seconds=TIMESTAMPDIFF(SECOND, joined_at, NOW()) WHERE left_at IS NULL")
end)
```

### 33.6 Übertragung an das Dashboard

Zwei mögliche Strategien:

**A) Pro Session (sofort beim Ende, empfohlen):**

```http
POST /api/patrol-sessions
Authorization: Bearer lspd_TOKEN
X-Discord-Id: 123456789012345678
Content-Type: application/json
```

```json
{
  "officerDiscordId": "123456789012345678",
  "scope": "sapd",
  "patrolName": "Adam-01",
  "joinedAt": "2026-06-27T19:30:00.000Z",
  "leftAt": "2026-06-27T20:15:00.000Z",
  "durationSeconds": 2700,
  "endReason": "leave"
}
```

Das Dashboard ordnet den Officer per Discord-ID zu (siehe Abschnitt 21) und addiert `durationSeconds` auf das Officer-Konto.

**B) Batch (periodisch, robust gegen Ausfälle):** Alle Sessions mit `synced = 0` gebündelt senden und nach Erfolg auf `synced = 1` setzen. Empfohlenes Intervall analog zum Board-Sync, z. B. 60 s. Dadurch gehen bei kurzzeitig nicht erreichbarem Dashboard keine Zeiten verloren.

```http
POST /api/patrol-sessions/batch
```

```json
{ "sessions": [ { "...": "wie oben" } ] }
```

### 33.7 Aggregation pro Officer (Dashboard-Seite)

Das Dashboard sollte serverseitig aggregieren, nicht FiveM:

```ts
interface OfficerPatrolTime {
  officerId: string;
  totalSeconds: number;        // gesamte Streifenzeit
  sessionCount: number;
  byScope: Record<string, number>;
  last7DaysSeconds: number;
  lastSessionAt: string | null;
}
```

Empfohlene Abfrage-Endpoints:

```http
GET /api/officers/{officerId}/patrol-time?from=...&to=...
GET /api/patrol-time/leaderboard?scope=sapd&from=...&to=...
```

### 33.8 Edge Cases

- **Doppelte Mitgliedschaft unmöglich**: Ein Spieler kann laut `joinPatrol` nur einer Streife gleichzeitig angehören → pro Officer immer höchstens eine offene Session.
- **Bezeichnungswechsel** (Adam → William durch Beitritt): beendet **keine** Session der bereits vorhandenen Mitglieder; nur `patrol_name` der laufenden Streife ändert sich. `designationAtJoin` bleibt der Wert beim Eintritt.
- **Crew-Auto-Auflösung**: erzeugt `endReason="crew"` für alle verbliebenen Mitglieder.
- **Disconnect ohne sauberes Verlassen**: wird über `playerDropped` abgefangen → `endReason="disconnect"`.
- **Jobwechsel im Dienst**: löst aktuell **kein** automatisches Verlassen aus. Soll ein Jobwechsel die Session beenden, muss zusätzlich auf `esx:setJob` (serverseitig) gehört und ggf. `PatrolLeave(src)` aufgerufen werden.

## 34. Trennung: Streifenzeit vs. Dienstzeit

„Streifenzeit" (Abschnitt 33) misst nur die Mitgliedschaft in einer Streife. Eine reine **Dienstzeit** (an/abgemeldet, unabhängig von einer Streife) ist damit nicht abgedeckt und müsste separat über On-/Off-Duty-Events erfasst werden. Für ein Dashboard, das „Zeit pro Officer" zeigt, sollte klar definiert sein, welche der beiden Größen gemeint ist — idealerweise werden beide getrennt erfasst und im Dashboard getrennt ausgewiesen.
