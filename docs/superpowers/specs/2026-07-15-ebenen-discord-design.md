# Design: Ebenen (Rang-basierte Discord-Rollen)

**Datum:** 2026-07-15
**Status:** Approved (pending spec review)

## Ziel

Eine **Ebene** ist eine Discord-Rolle, die ein Officer automatisch erhält, wenn er
einen von mehreren zugewiesenen Rängen hat. Beispiel: Ebene „Führungsebene" mit
den Rängen Lieutenant, Captain, Commander → jeder Officer mit einem dieser Ränge
bekommt die Discord-Rolle „Führungsebene".

Die Rolle wird **voll gemanaged**: hinzugefügt wenn der Rang passt, und wieder
entfernt, sobald der Officer keinen passenden Rang mehr hat (z. B. nach
Degradierung) — analog zum bestehenden Verhalten von Rang-/Unit-/Ausbildungs-Rollen.

## Entscheidungen (aus Brainstorming)

- **Auslöser:** Nur Ränge (keine Units/Ausbildungen).
- **Speicherung:** Eigene DB-Tabelle (Prisma-Modell), nicht SystemSetting-JSON.
- **UI-Ort:** Admin → Settings, Discord-Bereich (bei den anderen Rollen-Mappings).
- **Auto-Entfernen:** Ja, voll gemanaged.
- **Kardinalität:** Ein Rang gehört zu **genau einer** Ebene (rankId global unique).

## 1. Datenmodell (Prisma)

```prisma
model Tier {
  id            String     @id @default(cuid())
  name          String     @unique
  discordRoleId String?    // Discord-Snowflake der Ebenen-Rolle
  sortOrder     Int        @default(0)
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  ranks         TierRank[]
}

model TierRank {
  tierId String
  rankId String @unique   // ein Rang = genau eine Ebene
  tier   Tier   @relation(fields: [tierId], references: [id], onDelete: Cascade)
  rank   Rank   @relation(fields: [rankId], references: [id], onDelete: Cascade)

  @@id([tierId, rankId])
  @@index([rankId])
}
```

Ergänzung an `Rank`: Back-Relation `tierRanks TierRank[]`.

Angewendet via `prisma db push` (rein additiv, nicht destruktiv — konsistent mit
dem bestehenden Schema-Workflow).

## 2. Sync-Logik (`src/lib/discord-integration.ts`)

Ebenen werden in `getDiscordConfig()` einmalig aus der DB geladen und an die
`DiscordConfig` gehängt, damit die bestehenden synchronen Funktionen weiter
`config`-basiert bleiben:

```ts
// DiscordConfig ergänzen:
tiers: { discordRoleId: string; rankIds: string[] }[]
```

- **`desiredRoleIds(officer, config)`**: für jede Ebene, deren `rankIds` den
  `officer.rankId` enthält, wird `discordRoleId` zu den Soll-Rollen hinzugefügt.
- **`managedDiscordRoleIds(config)`**: alle Ebenen-`discordRoleId` werden
  aufgenommen → werden beim Sync auch wieder entfernt, wenn nicht mehr zutreffend.

Da beide Funktionen `config`-basiert sind, laufen alle bestehenden Sync-Pfade
(Beförderung, Full-Sync, periodischer Sync) **ohne weitere Änderungen** mit.

## 3. API

- **`GET /api/discord/tiers`** — Liste aller Ebenen inkl. zugewiesener Ränge.
- **`POST /api/discord/tiers`** — Ebene anlegen/aktualisieren (Name, discordRoleId,
  rankIds). Validierung: rankId darf nicht bereits einer anderen Ebene zugeordnet
  sein (global unique).
- **`DELETE /api/discord/tiers/[id]`** — Ebene löschen.
- Nach jedem Schreibvorgang: `queueAllOfficerRoleSync(...)` mit stale-Rollen-
  Handling auslösen (analog `src/app/api/discord/config/route.ts:112-114`), damit
  Änderungen sofort auf Discord greifen und entfernte Ebenen-Rollen aufgeräumt
  werden.
- **Berechtigung:** analog `ranks:manage`.

## 4. UI

Neuer Abschnitt **„Ebenen"** in Admin → Settings, im Discord-Bereich bei den
Rollen-Mappings (`src/app/(dashboard)/admin/settings/page.tsx`):

- Liste der Ebenen (nach `sortOrder`).
- Pro Ebene: Name, Discord-Rollen-Dropdown (aus `roles`), Multi-Select der Ränge
  (aus `ranks`).
- Bereits anderweitig belegte Ränge werden ausgegraut/gesperrt (ein Rang = eine
  Ebene).
- Hinzufügen / Löschen von Ebenen.

## Testing

- Unit-Test für `desiredRoleIds`: Officer mit Rang in Ebene → Ebenen-Rolle in
  Soll-Set; Officer ohne passenden Rang → nicht enthalten; TERMINATED → leer.
- Unit-Test für `managedDiscordRoleIds`: Ebenen-Rollen enthalten.
- API-Validierung: doppelte rankId-Zuweisung wird abgelehnt.

## Offene Punkte (außerhalb dieser Spec)

- Separate, vom Nutzer genannte Beobachtung: „ich schreibe was und der Text geht
  direkt raus" (Tests-/HR-Bereich, Auto-Update). Wird nach den Ebenen separat
  betrachtet.
