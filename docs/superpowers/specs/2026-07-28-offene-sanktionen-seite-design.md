# Seite „Offene Sanktionen"

**Datum:** 2026-07-28
**Status:** Genehmigt

## Ziel

Eine zentrale Seite, auf der jeder Officer alle Sanktionen des Departments einsehen
und filtern kann. Verwaltungsaktionen (bezahlt, verdoppeln, bearbeiten, löschen)
bleiben Trägern von `sanctions:manage` vorbehalten.

Bisher sind Sanktionen ausschließlich auf der Personalakte eines einzelnen Officers
sichtbar (`/officers/[id]`). Es gibt keinen Überblick darüber, welche Sanktionen
departmentweit offen sind.

## Zugriffsmodell

| Aktion | Voraussetzung |
| --- | --- |
| Seite `/sanktionen` öffnen, Liste lesen, filtern | Eingeloggt (kein Permission) |
| Als bezahlt markieren, verdoppeln, bearbeiten, löschen | `sanctions:manage` |

Es wird **kein** neues Permission eingeführt. `GET /api/sanctions` nutzt
`requireAuth()` ohne Rollen/Permissions — jeder authentifizierte Nutzer darf lesen.
Die bestehenden `POST`/`PATCH`/`DELETE`-Routen bleiben unverändert auf
`sanctions:manage`.

Bewusst akzeptiert: der Freitext-Grund einer Sanktion ist damit für jeden Officer
lesbar.

## Architektur

Client-seitige Filterung, analog zu `/terminations` und `/notes`:
`GET /api/sanctions` liefert die Liste, die Seite filtert in `useMemo`. Kein
Roundtrip pro Filterklick, kein neuer Query-Param-Vertrag. Serverseitig auf die
1000 neuesten Sanktionen begrenzt; wird das Limit erreicht, weist die UI darauf hin.

Server-seitige Filterung wurde verworfen: sie skaliert besser, löst aber ein
Mengenproblem, das das Department nicht hat, und bräuchte deutlich mehr Code.

### Komponenten

**`src/components/sanctions/sanction-card.tsx`** (neu)
Die `SanctionCard` steckt heute in `officers/[id]/page.tsx` (~1750 Zeilen) und wird
für die neue Seite gebraucht. Sie zieht mitsamt ihren Helfern in ein eigenes Modul:

- `SanctionCard` — Karte inkl. optionaler Aktionsleiste
- `SanctionRecord` — Typ
- `sanctionStatusLabel`, `sanctionStatusClass`, `sanctionDueLabel`

Neu gegenüber der bisherigen Fassung: eine optionale `officer`-Prop. Ist sie gesetzt,
zeigt die Karte eine Kopfzeile mit Name, Dienstnummer und Rang, verlinkt auf
`/officers/[id]`. Auf der Personalakte bleibt sie leer — dort ist der Officer klar.

Abhängigkeiten: `@/lib/sanction-catalog`, `@/lib/utils`, `@/components/ui/button`.
Kein Datenzugriff, keine Mutationen — alle Aktionen laufen über Callbacks.

**`src/app/(dashboard)/officers/[id]/page.tsx`** (Refactor)
Importiert `SanctionCard` und die Helfer aus dem neuen Modul, lokale Definitionen
entfallen. Verhalten unverändert.

**`GET /api/sanctions`** (neu, in bestehender `route.ts`)
`requireAuth()`, `orderBy: { createdAt: 'desc' }`, `take: 1000`. Include: Officer
(id, Name, Dienstnummer, Status, Rang) und `issuedBy.displayName`. Die
Snapshot-Felder `previous*` werden mitgeliefert, damit gelöschte Officers weiterhin
mit Namen erscheinen.

**`src/app/(dashboard)/sanktionen/page.tsx`** (neu)
Client-Component. Filterleiste über der Liste:

- Freitextsuche über Name, Dienstnummer, Rang und Grund
- Penal Grade (Alle, I–V)
- Status (Offen — Vorauswahl, Bezahlt, Nicht bezahlt/verdoppelt, Alle)
- Ausgestellt von (Optionen aus den geladenen Daten)
- Frist (Alle, überfällig, läuft in 24h ab, in 7 Tagen, ohne Frist) — nur bei offenen
  Sanktionen sinnvoll, greift daher nur auf Status `OPEN`

Kopfzeile mit Kennzahlen: offene Sanktionen, davon überfällig, offene Summe in $.
Mit `sanctions:manage` je Karte: „Als bezahlt markieren", „Bearbeiten",
„Verdoppeln" (nur bei offenen), „Löschen" (mit Bestätigungsdialog). Ohne das Recht
erscheint keine Aktionsleiste.

Anlegen neuer Sanktionen bleibt auf der Personalakte — dort ist der Officer-Bezug
gesetzt.

**`src/components/layout/sidebar.tsx`**
Eintrag „Sanktionen" in `mainNav` nach „Kündigungen", Icon `Gavel`, ohne
`permission`-Feld.

**`src/lib/openapi-spec.ts`**
`GET /sanctions` als Endpoint ohne `scope` ergänzen.

## Fehlerbehandlung

- Ladefehler: `useFetch` liefert `error`, die Seite zeigt eine Fehlermeldung statt der Liste.
- Mutationsfehler: Toast mit Servermeldung, danach `refetch()` — wie auf der Personalakte.
- Nicht eingeloggt: das Dashboard-Layout leitet bereits auf `/login`.
- Officer gelöscht (`officerId = null`): Karte zeigt die `previous*`-Snapshotdaten,
  ohne Link.

## Verifikation

- `npx tsc --noEmit` und `npm run lint` laufen sauber durch.
- Personalakte eines Officers mit Sanktionen zeigt Karten und Aktionen unverändert.
- `/sanktionen` als Nutzer ohne `sanctions:manage`: Liste und Filter sichtbar,
  keine Aktionsknöpfe.
- Mit `sanctions:manage`: bezahlt markieren, verdoppeln, bearbeiten und löschen
  wirken und aktualisieren die Liste.
