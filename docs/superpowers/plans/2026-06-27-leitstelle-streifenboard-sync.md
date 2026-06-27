# Leitstellen- & Streifenboard-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das alte manuelle Streifenboard durch ein read-only Live-Board ersetzen, das von FiveM über eine vollständige Sync-API gespeist wird, plus Streifenzeit-Tracking pro Officer.

**Architecture:** FiveM ist alleinige Datenquelle und schreibt über API-Token (Bearer + `X-Discord-Id`-Impersonation, bereits vorhanden) per Full-Replace-PATCH und Session-Ingest-Endpoints. Das Dashboard speichert/aggregiert serverseitig und zeigt alles read-only an. Neue Prisma-Modelle: `PatrolSession`, `DispatchCenterState`; `PatrolUnit` wird um `status`/`scope`/`assignedDispatchId` erweitert.

**Tech Stack:** Next.js 16 (App Router, Route Handlers), Prisma 7 + MariaDB, TypeScript, React 19, Tailwind. Schema-Anwendung via `prisma db push` (nicht `migrate`).

## Global Constraints

- Schema-Änderungen IMMER via `prisma db push` anwenden, nie `migrate deploy`. Nur additive/optionale Felder → kein `--accept-data-loss` nötig.
- Kein Unit-Test-Framework im Projekt. Verifikation pro Task: `npx tsc --noEmit`, `npx eslint <geänderte dateien>`, und für Endpoints manuelle curl-Smoketests (Server via `npm run dev`).
- Alle API-Routes folgen dem bestehenden Muster: `requireAuth`/`requirePermission` aus `@/lib/auth`, Antworten über `success`/`error`/`unauthorized`/`notFound`/`forbidden` aus `@/lib/api-response`, catch-Block mappt `'Unauthorized'→401`, `'Forbidden'→403`, sonst 500.
- Discord-Snowflake-Regex projektweit: `/^\d{17,22}$/`.
- Officer-Auflösung erfolgt über `Officer.discordId` (`@unique`).
- Schreibpfad-Permission: `patrol-board:manage`. Lesepfad: `patrol-board:view` bzw. `officers:view`.
- Audit-Logs über `createAuditLog` aus `@/lib/audit` wo bestehende Routes es tun.
- Commit-Messages enden mit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: Schema — PatrolUnit erweitern, PatrolSession & DispatchCenterState anlegen

**Files:**
- Modify: `prisma/schema.prisma` (PatrolUnit ~612-627, Officer ~226-261)
- Modify: `prisma/schema.prisma` (neue Modelle nach PatrolAssignment ~640)

**Interfaces:**
- Produces: Prisma-Modelle `PatrolSession`, `DispatchCenterState`; `PatrolUnit.status/scope/assignedDispatchId`; Officer-Relationen `patrolSessions`, `dispatchCenters`.

- [ ] **Step 1: PatrolUnit um Felder erweitern**

In `model PatrolUnit` nach `notes` einfügen:
```prisma
  status     Int?
  scope      String?
  assignedDispatchId Int?
```

- [ ] **Step 2: Officer-Back-Relationen ergänzen**

In `model Officer` nach `patrolAssignments PatrolAssignment[] @relation("PatrolAssigned")` einfügen:
```prisma
  patrolSessions  PatrolSession[]   @relation("PatrolSessionOfficer")
  dispatchCenters DispatchCenterState[] @relation("DispatchCenterOfficer")
```

- [ ] **Step 3: Neue Modelle nach `model PatrolAssignment { … }` anhängen**

```prisma
model PatrolSession {
  id                String    @id @default(cuid())
  /// FiveM-Session-ID → idempotentes Re-Senden (Upsert-Schlüssel). null = kein Dedupe.
  externalId        String?   @unique
  /// Per officerDiscordId aufgelöst; null = (noch) kein passender Officer.
  officerId         String?
  officer           Officer?  @relation("PatrolSessionOfficer", fields: [officerId], references: [id], onDelete: SetNull)
  officerDiscordId  String?
  officerName       String
  scope             String
  patrolName        String
  designationAtJoin String?
  gradeAtJoin       Int?
  joinedAt          DateTime
  leftAt            DateTime?
  durationSeconds   Int
  /// leave | disband | crew | disconnect | server_shutdown
  endReason         String
  createdAt         DateTime  @default(now())

  @@index([officerId])
  @@index([joinedAt])
  @@index([scope])
  @@index([officerDiscordId])
}

model DispatchCenterState {
  scope      String    @id
  officerId  String?
  officer    Officer?  @relation("DispatchCenterOfficer", fields: [officerId], references: [id], onDelete: SetNull)
  occupiedAt DateTime?
  updatedAt  DateTime  @updatedAt
}
```

- [ ] **Step 4: Schema validieren & pushen**

Run: `npx prisma validate && npm run db:push`
Expected: „The database is now in sync with your Prisma schema." (db:push macht zuerst Backup, dann `prisma db push`). Falls Prompt zu Datenverlust erscheint → abbrechen, Felder sind alle optional, dürfte nicht auftreten.

- [ ] **Step 5: Client generieren**

Run: `npx prisma generate`
Expected: „Generated Prisma Client".

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): add PatrolSession, DispatchCenterState, patrol status/scope/dispatch fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: PATCH/GET Patrol-Board um status/scope/assignedDispatchId erweitern

**Files:**
- Modify: `src/app/api/patrol-boards/[id]/route.ts` (PatrolPayload ~30, normalizePatrols ~64, tx.create ~177)
- Modify: `src/app/api/patrol-boards/route.ts` (boardInclude bleibt; nichts Pflicht, aber select der patrol-Felder prüfen)

**Interfaces:**
- Consumes: Task 1 Felder `PatrolUnit.status/scope/assignedDispatchId`.
- Produces: PATCH akzeptiert pro Streife optional `status`, `scope`, `assignedDispatchId`; werden persistiert und im Board-GET zurückgegeben (Prisma liefert sie automatisch, da kein restriktives `select` auf PatrolUnit existiert — `include.members` lässt übrige Skalarfelder durch).

- [ ] **Step 1: PatrolPayload-Typ erweitern**

In `src/app/api/patrol-boards/[id]/route.ts`, `type PatrolPayload`:
```ts
type PatrolPayload = {
  name?: unknown
  callSign?: unknown
  assignment?: unknown
  notes?: unknown
  memberIds?: unknown
  status?: unknown
  scope?: unknown
  assignedDispatchId?: unknown
}
```

- [ ] **Step 2: Helper für Int-Parsing oben neben `stringOrNull` ergänzen**

```ts
function intOrNull(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.trunc(n)
  }
  return null
}
```

- [ ] **Step 3: normalizePatrols um die Felder erweitern**

Im return-Objekt von `normalizePatrols`:
```ts
    return {
      name,
      callSign: stringOrNull(patrol.callSign),
      assignment: stringOrNull(patrol.assignment),
      notes: stringOrNull(patrol.notes),
      memberIds,
      sortOrder: index,
      status: intOrNull(patrol.status),
      scope: stringOrNull(patrol.scope),
      assignedDispatchId: intOrNull(patrol.assignedDispatchId),
    }
```

- [ ] **Step 4: tx-create um die Felder erweitern**

In der `tx.patrolBoard.update` → `patrols.create.map`:
```ts
            create: patrols.map((patrol) => ({
              name: patrol.name,
              callSign: patrol.callSign,
              assignment: patrol.assignment,
              notes: patrol.notes,
              sortOrder: patrol.sortOrder,
              status: patrol.status,
              scope: patrol.scope,
              assignedDispatchId: patrol.assignedDispatchId,
              members: {
                create: patrol.memberIds.map((officerId, memberIndex) => ({
                  officerId,
                  sortOrder: memberIndex,
                })),
              },
            })),
```

- [ ] **Step 5: Typprüfung**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/patrol-boards/[id]/route.ts
git commit -m "feat(patrol-board): accept status/scope/assignedDispatchId in full-replace sync

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Patrol-Session-Service (`src/lib/patrol-sessions.ts`)

**Files:**
- Create: `src/lib/patrol-sessions.ts`

**Interfaces:**
- Consumes: Prisma `PatrolSession`, `Officer.discordId`.
- Produces:
  - `type SessionInput = { externalId?: string|null; officerDiscordId?: string|null; officerName?: string; scope?: string; patrolName?: string; designationAtJoin?: string|null; gradeAtJoin?: number|null; joinedAt?: string; leftAt?: string|null; durationSeconds?: number; endReason?: string }`
  - `END_REASONS: readonly string[]`
  - `async function ingestSession(input: SessionInput): Promise<{ status: 'created'|'updated'|'invalid'; error?: string; id?: string }>`
  - `async function resolveOfficerIdByDiscord(discordId: string|null|undefined): Promise<string|null>`

- [ ] **Step 1: Datei anlegen**

```ts
import { prisma } from './prisma'

export const END_REASONS = ['leave', 'disband', 'crew', 'disconnect', 'server_shutdown'] as const
const DISCORD_SNOWFLAKE = /^\d{17,22}$/

export type SessionInput = {
  externalId?: string | null
  officerDiscordId?: string | null
  officerName?: string
  scope?: string
  patrolName?: string
  designationAtJoin?: string | null
  gradeAtJoin?: number | null
  joinedAt?: string
  leftAt?: string | null
  durationSeconds?: number
  endReason?: string
}

export async function resolveOfficerIdByDiscord(discordId: string | null | undefined): Promise<string | null> {
  const id = discordId?.trim()
  if (!id || !DISCORD_SNOWFLAKE.test(id)) return null
  const officer = await prisma.officer.findUnique({ where: { discordId: id }, select: { id: true } })
  return officer?.id ?? null
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function ingestSession(
  input: SessionInput,
): Promise<{ status: 'created' | 'updated' | 'invalid'; error?: string; id?: string }> {
  const officerName = typeof input.officerName === 'string' ? input.officerName.trim() : ''
  const scope = typeof input.scope === 'string' ? input.scope.trim() : ''
  const patrolName = typeof input.patrolName === 'string' ? input.patrolName.trim() : ''
  const endReason = typeof input.endReason === 'string' ? input.endReason.trim() : ''
  const joinedAt = parseDate(input.joinedAt)
  const leftAt = input.leftAt == null ? null : parseDate(input.leftAt)
  const duration = typeof input.durationSeconds === 'number' && Number.isFinite(input.durationSeconds)
    ? Math.trunc(input.durationSeconds)
    : NaN

  if (!officerName) return { status: 'invalid', error: 'officerName fehlt' }
  if (!scope) return { status: 'invalid', error: 'scope fehlt' }
  if (!patrolName) return { status: 'invalid', error: 'patrolName fehlt' }
  if (!joinedAt) return { status: 'invalid', error: 'joinedAt ungültig' }
  if (!Number.isFinite(duration) || duration < 0) return { status: 'invalid', error: 'durationSeconds ungültig' }
  if (!(END_REASONS as readonly string[]).includes(endReason)) {
    return { status: 'invalid', error: `endReason muss eins von ${END_REASONS.join(', ')} sein` }
  }

  const officerId = await resolveOfficerIdByDiscord(input.officerDiscordId)
  const gradeAtJoin = typeof input.gradeAtJoin === 'number' && Number.isFinite(input.gradeAtJoin)
    ? Math.trunc(input.gradeAtJoin)
    : null
  const externalId = typeof input.externalId === 'string' && input.externalId.trim() ? input.externalId.trim() : null

  const data = {
    officerId,
    officerDiscordId: input.officerDiscordId?.trim() || null,
    officerName,
    scope,
    patrolName,
    designationAtJoin: typeof input.designationAtJoin === 'string' && input.designationAtJoin.trim()
      ? input.designationAtJoin.trim()
      : null,
    gradeAtJoin,
    joinedAt,
    leftAt,
    durationSeconds: duration,
    endReason,
  }

  if (externalId) {
    const existing = await prisma.patrolSession.findUnique({ where: { externalId }, select: { id: true } })
    const row = await prisma.patrolSession.upsert({
      where: { externalId },
      create: { externalId, ...data },
      update: data,
      select: { id: true },
    })
    return { status: existing ? 'updated' : 'created', id: row.id }
  }

  const row = await prisma.patrolSession.create({ data, select: { id: true } })
  return { status: 'created', id: row.id }
}
```

- [ ] **Step 2: Typprüfung**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/lib/patrol-sessions.ts
git commit -m "feat(patrol-sessions): add session ingest service with discord resolution and idempotent upsert

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Session-Ingest-Endpoints (single + batch)

**Files:**
- Create: `src/app/api/patrol-sessions/route.ts`
- Create: `src/app/api/patrol-sessions/batch/route.ts`

**Interfaces:**
- Consumes: `ingestSession`, `SessionInput` aus Task 3.
- Produces: `POST /api/patrol-sessions` → `success({ id })` (201) bzw. 400 bei invalid; `POST /api/patrol-sessions/batch` → `success({ created, updated, skipped, total })`.

- [ ] **Step 1: Single-Endpoint anlegen**

```ts
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { ingestSession, type SessionInput } from '@/lib/patrol-sessions'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['ADMIN', 'HR', 'LEADERSHIP'], ['patrol-board:manage'])
    const body = (await req.json()) as SessionInput
    const result = await ingestSession(body)
    if (result.status === 'invalid') return error(result.error ?? 'Ungültige Session', 400)
    return success({ id: result.id, status: result.status }, result.status === 'created' ? 201 : 200)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
```

- [ ] **Step 2: Batch-Endpoint anlegen**

```ts
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { ingestSession, type SessionInput } from '@/lib/patrol-sessions'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['ADMIN', 'HR', 'LEADERSHIP'], ['patrol-board:manage'])
    const body = await req.json()
    const sessions: SessionInput[] = Array.isArray(body?.sessions) ? body.sessions : []
    if (sessions.length === 0) return error('sessions[] ist erforderlich', 400)
    if (sessions.length > 500) return error('Maximal 500 Sessions pro Batch', 400)

    let created = 0
    let updated = 0
    let skipped = 0
    for (const input of sessions) {
      const result = await ingestSession(input)
      if (result.status === 'created') created++
      else if (result.status === 'updated') updated++
      else skipped++
    }
    return success({ created, updated, skipped, total: sessions.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
```

- [ ] **Step 3: Typprüfung**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Smoketest (Server läuft via `npm run dev`, gültiger Token + Discord-ID eines existierenden Officers)**

```bash
curl -s -X POST http://localhost:3000/api/patrol-sessions \
  -H "Authorization: Bearer lspd_DEIN_TOKEN" -H "X-Discord-Id: 123456789012345678" \
  -H "Content-Type: application/json" \
  -d '{"externalId":"sess-1","officerDiscordId":"123456789012345678","officerName":"Max Mustermann","scope":"lspd","patrolName":"Adam-01","joinedAt":"2026-06-27T19:30:00.000Z","leftAt":"2026-06-27T20:15:00.000Z","durationSeconds":2700,"endReason":"leave"}'
```
Expected: `{"success":true,"data":{"id":"…","status":"created"}}`. Zweiter identischer Call → `"status":"updated"` (kein Duplikat).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/patrol-sessions
git commit -m "feat(api): add patrol-session ingest endpoints (single + batch)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Streifenzeit-Aggregation + Lese-Endpoints

**Files:**
- Create: `src/lib/patrol-time.ts`
- Create: `src/app/api/officers/[id]/patrol-time/route.ts`
- Create: `src/app/api/patrol-time/leaderboard/route.ts`

**Interfaces:**
- Consumes: Prisma `PatrolSession`.
- Produces:
  - `async function officerPatrolTime(officerId: string, from?: Date|null, to?: Date|null): Promise<{ officerId: string; totalSeconds: number; sessionCount: number; last7DaysSeconds: number; lastSessionAt: string|null; byScope: Record<string, number> }>`
  - `async function patrolLeaderboard(opts: { scope?: string|null; from?: Date|null; to?: Date|null; limit: number }): Promise<Array<{ officerId: string; officer: { id: string; firstName: string; lastName: string; badgeNumber: string } | null; totalSeconds: number; sessionCount: number }>>`
  - `GET /api/officers/{id}/patrol-time?from&to`, `GET /api/patrol-time/leaderboard?scope&from&to&limit`

- [ ] **Step 1: Aggregations-Service anlegen**

```ts
import { prisma } from './prisma'

function parseRange(from?: Date | null, to?: Date | null) {
  const where: { gte?: Date; lte?: Date } = {}
  if (from) where.gte = from
  if (to) where.lte = to
  return Object.keys(where).length ? where : undefined
}

export async function officerPatrolTime(officerId: string, from?: Date | null, to?: Date | null) {
  const joinedAt = parseRange(from, to)
  const sessions = await prisma.patrolSession.findMany({
    where: { officerId, ...(joinedAt ? { joinedAt } : {}) },
    select: { durationSeconds: true, scope: true, joinedAt: true },
  })
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  let totalSeconds = 0
  let last7DaysSeconds = 0
  let lastSessionAt: Date | null = null
  const byScope: Record<string, number> = {}
  for (const s of sessions) {
    totalSeconds += s.durationSeconds
    byScope[s.scope] = (byScope[s.scope] ?? 0) + s.durationSeconds
    if (s.joinedAt >= sevenDaysAgo) last7DaysSeconds += s.durationSeconds
    if (!lastSessionAt || s.joinedAt > lastSessionAt) lastSessionAt = s.joinedAt
  }
  return {
    officerId,
    totalSeconds,
    sessionCount: sessions.length,
    last7DaysSeconds,
    lastSessionAt: lastSessionAt ? lastSessionAt.toISOString() : null,
    byScope,
  }
}

export async function patrolLeaderboard(opts: { scope?: string | null; from?: Date | null; to?: Date | null; limit: number }) {
  const joinedAt = parseRange(opts.from, opts.to)
  const grouped = await prisma.patrolSession.groupBy({
    by: ['officerId'],
    where: {
      officerId: { not: null },
      ...(opts.scope ? { scope: opts.scope } : {}),
      ...(joinedAt ? { joinedAt } : {}),
    },
    _sum: { durationSeconds: true },
    _count: { _all: true },
    orderBy: { _sum: { durationSeconds: 'desc' } },
    take: opts.limit,
  })
  const officerIds = grouped.map((g) => g.officerId).filter((id): id is string => !!id)
  const officers = officerIds.length
    ? await prisma.officer.findMany({
        where: { id: { in: officerIds } },
        select: { id: true, firstName: true, lastName: true, badgeNumber: true },
      })
    : []
  const byId = new Map(officers.map((o) => [o.id, o]))
  return grouped.map((g) => ({
    officerId: g.officerId as string,
    officer: g.officerId ? byId.get(g.officerId) ?? null : null,
    totalSeconds: g._sum.durationSeconds ?? 0,
    sessionCount: g._count._all,
  }))
}
```

- [ ] **Step 2: Officer-Patrol-Time-Endpoint anlegen**

`src/app/api/officers/[id]/patrol-time/route.ts`:
```ts
import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { officerPatrolTime } from '@/lib/patrol-time'

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('officers:view')
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const from = parseDate(searchParams.get('from'))
    const to = parseDate(searchParams.get('to'))
    const result = await officerPatrolTime(id, from, to)
    return success(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
```

- [ ] **Step 3: Leaderboard-Endpoint anlegen**

`src/app/api/patrol-time/leaderboard/route.ts`:
```ts
import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { patrolLeaderboard } from '@/lib/patrol-time'

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission('patrol-board:view')
    const { searchParams } = new URL(req.url)
    const scope = searchParams.get('scope')
    const from = parseDate(searchParams.get('from'))
    const to = parseDate(searchParams.get('to'))
    const limitRaw = Number(searchParams.get('limit') ?? '20')
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100) : 20
    const result = await patrolLeaderboard({ scope, from, to, limit })
    return success(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
```

- [ ] **Step 4: Typprüfung + Smoketest**

Run: `npx tsc --noEmit`
Expected: keine Fehler.
```bash
curl -s "http://localhost:3000/api/patrol-time/leaderboard?limit=5" -H "Authorization: Bearer lspd_DEIN_TOKEN"
```
Expected: `{"success":true,"data":[…]}` (nach Task-4-Smoketest mindestens 1 Eintrag).

- [ ] **Step 5: Commit**

```bash
git add src/lib/patrol-time.ts "src/app/api/officers/[id]/patrol-time" src/app/api/patrol-time
git commit -m "feat(api): add patrol-time aggregation and leaderboard endpoints

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Leitstellen-State (DispatchCenter) Endpoints + Board-GET-Anzeige

**Files:**
- Create: `src/app/api/dispatch-centers/[scope]/occupant/route.ts`
- Modify: `src/app/api/patrol-boards/route.ts` (GET-Response um `dispatchCenters` erweitern)

**Interfaces:**
- Consumes: Prisma `DispatchCenterState`, `resolveOfficerIdByDiscord` aus Task 3.
- Produces:
  - `PUT /api/dispatch-centers/{scope}/occupant` body `{ officerId?, officerDiscordId? }` → `success(state)`
  - `DELETE /api/dispatch-centers/{scope}/occupant` → `success({ scope, officerId: null })`
  - Board-GET liefert zusätzlich `dispatchCenters: [{ scope, occupiedAt, officer{…}|null }]`.

- [ ] **Step 1: Occupant-Endpoint anlegen**

```ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { resolveOfficerIdByDiscord } from '@/lib/patrol-sessions'

const occupantInclude = {
  officer: { select: { id: true, firstName: true, lastName: true, badgeNumber: true } },
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ scope: string }> }) {
  try {
    await requireAuth(['ADMIN', 'HR', 'LEADERSHIP'], ['patrol-board:manage'])
    const { scope } = await params
    const body = await req.json().catch(() => ({}))
    let officerId: string | null = typeof body?.officerId === 'string' && body.officerId.trim() ? body.officerId.trim() : null
    if (!officerId) officerId = await resolveOfficerIdByDiscord(body?.officerDiscordId)
    const occupiedAt = body?.occupiedAt ? new Date(String(body.occupiedAt)) : new Date()

    const state = await prisma.dispatchCenterState.upsert({
      where: { scope },
      create: { scope, officerId, occupiedAt: Number.isNaN(occupiedAt.getTime()) ? new Date() : occupiedAt },
      update: { officerId, occupiedAt: Number.isNaN(occupiedAt.getTime()) ? new Date() : occupiedAt },
      include: occupantInclude,
    })
    return success(state)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ scope: string }> }) {
  try {
    await requireAuth(['ADMIN', 'HR', 'LEADERSHIP'], ['patrol-board:manage'])
    const { scope } = await params
    await prisma.dispatchCenterState.upsert({
      where: { scope },
      create: { scope, officerId: null, occupiedAt: null },
      update: { officerId: null, occupiedAt: null },
    })
    return success({ scope, officerId: null })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
```

- [ ] **Step 2: Board-GET um dispatchCenters erweitern**

In `src/app/api/patrol-boards/route.ts` GET: nach dem `Promise.all` um eine dritte Query erweitern und in der Response ergänzen.

`prisma.patrolBoard.findMany(...)` und `getDutyTimesSnapshot()` bleiben; füge im `Promise.all`-Array hinzu:
```ts
      prisma.dispatchCenterState.findMany({
        include: { officer: { select: { id: true, firstName: true, lastName: true, badgeNumber: true } } },
      }),
```
Passe die Destrukturierung an: `const [boards, dutySnapshot, dispatchCenters] = await Promise.all([...])` und ergänze im `return success({ … })`-Objekt: `dispatchCenters,`.

- [ ] **Step 3: Typprüfung + Smoketest**

Run: `npx tsc --noEmit`
Expected: keine Fehler.
```bash
curl -s -X PUT http://localhost:3000/api/dispatch-centers/lspd/occupant \
  -H "Authorization: Bearer lspd_DEIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"officerDiscordId":"123456789012345678"}'
```
Expected: `{"success":true,"data":{"scope":"lspd",…}}`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/dispatch-centers src/app/api/patrol-boards/route.ts
git commit -m "feat(api): add dispatch-center occupant endpoints and expose state in board GET

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Streifenboard-Frontend auf read-only umbauen

**Files:**
- Modify/Rewrite: `src/app/(dashboard)/patrol-board/page.tsx` (aktuell 935 Zeilen, manuelles Drag-&-Drop-Board)

**Interfaces:**
- Consumes: `GET /api/patrol-boards` (jetzt mit `patrols[].status/scope/assignedDispatchId` und `dispatchCenters`), `GET /api/patrol-time/leaderboard`.
- Produces: read-only Live-Ansicht.

Diese Datei ist groß und enthält die gesamte Manage-Logik. **Vorgehen:** Datei zuerst vollständig lesen, dann auf eine read-only-Ansicht reduzieren. Entfernt werden: `@dnd-kit`-Drag-&-Drop, Create-/Edit-/Delete-Handler, Member-Zuweisungs-UI, alle `fetch`-Mutationen (POST/PATCH/DELETE). Behalten/neu: Datenabruf per `GET`, Darstellung von Streifen + Besatzung.

- [ ] **Step 1: Bestehende Datei vollständig lesen**

Run (im Editor): `src/app/(dashboard)/patrol-board/page.tsx` lesen, Datenstruktur (`PatrolBoard`/`Patrol`/`Member`-Typen, Fetch-Hook) identifizieren.

- [ ] **Step 2: Status-Label-Helper ergänzen (oben in der Datei)**

```ts
const STATUS_LABELS: Record<number, string> = {
  1: 'Einsatzbereit auf Funk',
  2: 'Einsatzbereit auf Wache',
  3: 'Anfahrt zum Einsatzort',
  4: 'Ankunft am Einsatzort',
  5: 'Sprechwunsch',
  6: 'Nicht verfügbar',
  7: 'Anfahrt zum Zielort',
  8: 'Ankunft am Zielort',
}
function statusLabel(status: number | null | undefined) {
  return status ? `Status ${status} — ${STATUS_LABELS[status] ?? 'Unbekannt'}` : null
}
function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
```

- [ ] **Step 3: Page-Komponente auf read-only reduzieren**

Ersetze den Manage-Teil durch eine reine Anzeige. Kerngerüst (an bestehende Typen/Styles anpassen):
```tsx
'use client'
import { useEffect, useState } from 'react'

type Member = { id: string; officer: { id: string; firstName: string; lastName: string; badgeNumber: string | null; rank: { name: string; color: string | null }; isRookie?: boolean } }
type Patrol = { id: string; name: string; callSign: string | null; assignment: string | null; status: number | null; scope: string | null; assignedDispatchId: number | null; members: Member[] }
type DispatchCenter = { scope: string; occupiedAt: string | null; officer: { id: string; firstName: string; lastName: string; badgeNumber: string | null } | null }
type Board = { id: string; title: string; patrols: Patrol[] }
type LeaderRow = { officerId: string; officer: { id: string; firstName: string; lastName: string; badgeNumber: string } | null; totalSeconds: number; sessionCount: number }

export default function PatrolBoardPage() {
  const [board, setBoard] = useState<Board | null>(null)
  const [dispatchCenters, setDispatchCenters] = useState<DispatchCenter[]>([])
  const [leaders, setLeaders] = useState<LeaderRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      const [boardRes, lbRes] = await Promise.all([
        fetch('/api/patrol-boards').then((r) => r.json()),
        fetch('/api/patrol-time/leaderboard?limit=10').then((r) => r.json()),
      ])
      if (!active) return
      if (boardRes?.success) {
        setBoard(boardRes.data.activeBoard ?? null)
        setDispatchCenters(boardRes.data.dispatchCenters ?? [])
      }
      if (lbRes?.success) setLeaders(lbRes.data ?? [])
      setLoading(false)
    }
    load()
    const t = setInterval(load, 15000)
    return () => { active = false; clearInterval(t) }
  }, [])

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Lädt…</div>

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Streifenboard (LSPD)</h1>
        <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600">Live von FiveM · read-only</span>
      </div>

      {dispatchCenters.map((dc) => (
        <div key={dc.scope} className="rounded-lg border bg-card p-4 text-sm">
          Leitstelle {dc.scope.toUpperCase()}: {dc.officer
            ? <strong>{dc.officer.firstName} {dc.officer.lastName} (#{dc.officer.badgeNumber})</strong>
            : <span className="text-muted-foreground">frei</span>}
        </div>
      ))}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {board?.patrols.map((p) => (
          <div key={p.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{p.callSign || p.name}</h2>
              {p.assignedDispatchId != null && <span className="text-xs text-red-600">Einsatz #{p.assignedDispatchId}</span>}
            </div>
            {statusLabel(p.status) && <p className="mt-1 text-xs text-muted-foreground">{statusLabel(p.status)}</p>}
            <ul className="mt-3 space-y-1">
              {p.members.map((m) => (
                <li key={m.id} className="text-sm">
                  {m.officer.firstName} {m.officer.lastName}
                  {m.officer.badgeNumber ? ` (#${m.officer.badgeNumber})` : ''}
                  <span className="text-muted-foreground"> · {m.officer.rank.name}</span>
                </li>
              ))}
              {p.members.length === 0 && <li className="text-xs text-muted-foreground">keine Besatzung</li>}
            </ul>
          </div>
        ))}
        {(!board || board.patrols.length === 0) && <p className="text-sm text-muted-foreground">Aktuell keine aktiven Streifen.</p>}
      </div>

      {leaders.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 font-semibold">Streifenzeit — Rangliste</h2>
          <ol className="space-y-1">
            {leaders.map((l, i) => (
              <li key={l.officerId} className="flex justify-between text-sm">
                <span>{i + 1}. {l.officer ? `${l.officer.firstName} ${l.officer.lastName}` : l.officerId}</span>
                <span className="text-muted-foreground">{formatDuration(l.totalSeconds)} · {l.sessionCount} Streifen</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
```
Hinweis: Styling-Klassen an das bestehende Design der Datei angleichen. `@dnd-kit`-Imports entfernen.

- [ ] **Step 4: Build/Typprüfung**

Run: `npx tsc --noEmit && npx eslint "src/app/(dashboard)/patrol-board/page.tsx"`
Expected: keine Fehler/Warnungen.

- [ ] **Step 5: Visuelle Prüfung**

`npm run dev`, `/patrol-board` öffnen: kein Edit/Drag, read-only-Badge sichtbar, Streifen + Status + Leitstelle + Rangliste werden gezeigt.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/patrol-board/page.tsx"
git commit -m "feat(patrol-board): convert board page to read-only live view with status, dispatch center and leaderboard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Officer-Detail — Streifenzeit-Karte

**Files:**
- Modify: `src/app/(dashboard)/officers/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/officers/{id}/patrol-time`.
- Produces: Karte „Streifenzeit" (Gesamt, letzte 7 Tage, letzte Session).

- [ ] **Step 1: Officer-Detail-Page lesen, Stelle für eine zusätzliche Karte/Section finden** (bestehendes Karten-/Grid-Layout identifizieren).

- [ ] **Step 2: Patrol-Time-Fetch + Karte ergänzen**

Innerhalb der Komponente (Client) einen Fetch ergänzen und Karte rendern. Beispiel-Snippet (an Datenfluss/Server- vs. Client-Komponente der Datei anpassen):
```tsx
// State
const [patrolTime, setPatrolTime] = useState<{ totalSeconds: number; last7DaysSeconds: number; sessionCount: number; lastSessionAt: string | null } | null>(null)

useEffect(() => {
  fetch(`/api/officers/${officerId}/patrol-time`).then((r) => r.json()).then((j) => { if (j?.success) setPatrolTime(j.data) })
}, [officerId])

function fmt(seconds: number) {
  const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
```
```tsx
{patrolTime && (
  <div className="rounded-lg border bg-card p-4">
    <h3 className="mb-2 font-semibold">Streifenzeit</h3>
    <dl className="grid grid-cols-2 gap-2 text-sm">
      <div><dt className="text-muted-foreground">Gesamt</dt><dd>{fmt(patrolTime.totalSeconds)}</dd></div>
      <div><dt className="text-muted-foreground">Letzte 7 Tage</dt><dd>{fmt(patrolTime.last7DaysSeconds)}</dd></div>
      <div><dt className="text-muted-foreground">Streifen</dt><dd>{patrolTime.sessionCount}</dd></div>
      <div><dt className="text-muted-foreground">Letzte Streife</dt><dd>{patrolTime.lastSessionAt ? new Date(patrolTime.lastSessionAt).toLocaleDateString('de-DE') : '—'}</dd></div>
    </dl>
  </div>
)}
```
Falls die Page eine Server-Komponente ist: `officerPatrolTime(officerId)` aus `@/lib/patrol-time` direkt serverseitig aufrufen statt fetch.

- [ ] **Step 3: Build/Typprüfung**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/officers/[id]/page.tsx"
git commit -m "feat(officers): show patrol-time card on officer detail page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: OpenAPI-Spec & API-Doku ergänzen

**Files:**
- Modify: `src/lib/openapi-spec.ts`
- Modify: `API.md` (falls dort Endpoints gelistet werden)

**Interfaces:**
- Consumes: alle neuen Endpoints aus Tasks 4–6.
- Produces: dokumentierte Endpoints in der generierten OpenAPI-Ausgabe (`/api/v1/openapi.json|yaml|md`).

- [ ] **Step 1: `openapi-spec.ts` lesen**, Struktur der Path-Einträge verstehen (wie bestehende Patrol-Board-Pfade definiert sind).

- [ ] **Step 2: Pfade ergänzen** im selben Stil wie bestehende Einträge für:
  - `POST /api/patrol-sessions`, `POST /api/patrol-sessions/batch`
  - `GET /api/officers/{id}/patrol-time`
  - `GET /api/patrol-time/leaderboard`
  - `PUT`/`DELETE /api/dispatch-centers/{scope}/occupant`
  - Hinweis bei `PATCH /api/patrol-boards/{id}`: neue optionale Felder `status`, `scope`, `assignedDispatchId`.

- [ ] **Step 3: Build/Typprüfung + Render-Check**

Run: `npx tsc --noEmit`
Expected: keine Fehler.
```bash
curl -s http://localhost:3000/api/v1/openapi.json -H "Authorization: Bearer lspd_DEIN_TOKEN" | grep -c "patrol-sessions"
```
Expected: ≥ 1.

- [ ] **Step 4: Commit**

```bash
git add src/lib/openapi-spec.ts API.md
git commit -m "docs(api): document patrol-session, patrol-time and dispatch-center endpoints

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final Verification

- [ ] `npx tsc --noEmit` — gesamtes Projekt fehlerfrei.
- [ ] `npx eslint .` — keine neuen Fehler.
- [ ] `npm run build` — Build erfolgreich.
- [ ] End-to-End-Smoke: Token-PATCH eines Boards mit `status/scope/assignedDispatchId` → `/patrol-board` zeigt es read-only; Session-POST → Officer-Detail zeigt Streifenzeit; Leaderboard gefüllt; Leitstelle-PUT → Banner zeigt Inhaber.
```
```

## Self-Review

**Spec coverage:**
- Schema (PatrolUnit-Felder, PatrolSession, DispatchCenterState) → Task 1 ✓
- PATCH-Erweiterung status/scope/dispatch → Task 2 ✓
- Session-Ingest single+batch, Officer-Auflösung per Discord, Idempotenz → Tasks 3, 4 ✓
- Aggregation + Leaderboard → Task 5 ✓
- Leitstellen-State + Anzeige → Task 6 ✓
- Read-only Frontend (altes Board ersetzt) → Task 7 ✓
- Officer-Streifenzeit-Karte → Task 8 ✓
- Voll funktionsfähige/dokumentierte Sync-API → Task 9 ✓
- Streifenzeit vs. Dienstzeit getrennt → kein Eingriff in DutyTimeSession ✓

**Placeholder scan:** Backend-Code vollständig. Frontend-Tasks (7/8) verweisen bewusst auf „bestehende Datei lesen", da page.tsx 935 Zeilen hat und an vorhandene Typen/Styles angepasst werden muss — der einzusetzende Code ist vollständig gegeben.

**Type consistency:** `ingestSession`/`SessionInput` (Task 3) ↔ Tasks 4; `officerPatrolTime`/`patrolLeaderboard` (Task 5) ↔ Endpoints; `resolveOfficerIdByDiscord` (Task 3) ↔ Task 6 — Signaturen konsistent.
