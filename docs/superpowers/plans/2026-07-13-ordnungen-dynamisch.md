# Ordnungen & Kategorien dynamisch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ordnungen und ihre Kategorien werden vollständig in der DB gehalten und über die Dashboard-UI (inline auf `/ordnungen`) angelegt, bearbeitet und gelöscht — kein hardcodiertes `config.json`/`.md` und kein festes `categories`-Array mehr.

**Architecture:** Zwei neue Prisma-Modelle (`OrdnungCategory`, `Ordnung`) mit Markdown-Inhalt in der DB. CRUD über REST-Routen unter `/api/ordnungen`, geschützt durch neues Recht `ordnungen:manage`; Ansehen bleibt offen für jeden eingeloggten User. Bestehende Ordnungen werden einmalig aus `ordnungen/config.json` + `.md` importiert (Slugs bleiben stabil). Frontend: Übersichtsseite liest aus der DB und zeigt Manage-Buttons + Editor-Modals für berechtigte User.

**Tech Stack:** Next.js (App Router, Server + Client Components), Prisma 7 (MariaDB-Adapter), lucide-react, bestehende UI-Bausteine (`Modal`, `Select`, `ColorField`, `useFetch`, `useApi`, `useToast`, `renderMarkdown`).

## Global Constraints

- **Kein Test-Framework im Projekt** — es gibt kein `test`-Script, kein vitest/jest. Verifikation erfolgt pro Task über `npx tsc --noEmit`, `npm run lint` und einen manuellen Smoke-Test im laufenden `npm run dev`. Es werden KEINE Test-Dateien erfunden.
- **Schema-Rollout via `npx prisma db push`**, NICHT `migrate deploy` (Projekt-Konvention, siehe Memory `schema-applied-via-db-push`). `db push` braucht eine gültige `DATABASE_URL`.
- **API-Antworten** immer über `success()` / `error()` aus `@/lib/api-response` (Shape `{ success, data }` bzw. `{ success, error }`).
- **Auth in Routen** nach dem Muster aus `src/app/api/units/route.ts`: `requirePermission('...')` (Lesen) bzw. `requireAuth(['ADMIN'], ['...'])` (Schreiben), mit dem dortigen try/catch-Mapping (`Unauthorized`→401, `Forbidden`→403).
- **Prisma-Client** in Routen: `import { prisma } from '@/lib/prisma'`.
- **Slugs bestehender Ordnungen bleiben unverändert**: `dienstordnung`, `sanktionskatalog`, `hr-dienstordnung`.
- **Commits** am Ende jedes Tasks; Commit-Message endet mit:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

- `prisma/schema.prisma` — **Modify**: neue Modelle `OrdnungCategory`, `Ordnung`; Gegen-Relation an `User`.
- `src/lib/permissions.ts` — **Modify**: `ordnungen:manage` in `PERMISSIONS` + `PERMISSION_LABELS`.
- `src/lib/ordnungen-icons.ts` — **Create**: kuratierte lucide-Icon-Map + Helper (von Übersicht, Einzelseite, Editor gemeinsam genutzt).
- `src/lib/ordnungen.ts` — **Modify**: DB-Typen (`OrdnungDTO`, `OrdnungCategoryDTO`, `OrdnungenPayload`) statt Datei-Config; alte `normalizeOrdnungConfigs` entfernen.
- `prisma/seed.ts` — **Modify**: einmaliger Import bestehender Ordnungen/Kategorien (guarded).
- `src/app/api/ordnungen/route.ts` — **Create**: `GET` (Kategorien + Ordnungen) & `POST` (neue Ordnung).
- `src/app/api/ordnungen/[id]/route.ts` — **Create**: `PUT`, `DELETE` einer Ordnung.
- `src/app/api/ordnungen/categories/route.ts` — **Create**: `POST` (neue Kategorie).
- `src/app/api/ordnungen/categories/[id]/route.ts` — **Create**: `PUT`, `DELETE` einer Kategorie.
- `src/app/api/ordnungen/config/route.ts` — **Delete**: alte Datei-Config-Route.
- `src/app/(dashboard)/ordnungen/[id]/page.tsx` — **Modify**: Ordnung per Prisma über Slug laden.
- `src/app/(dashboard)/ordnungen/page.tsx` — **Modify**: Kategorien + Ordnungen aus DB; Manage-Buttons.
- `src/components/ordnungen/ordnungen-manager.tsx` — **Create**: Client-Komponente mit Editor-/Kategorie-Modals (Anlegen/Bearbeiten/Löschen).

---

## Task 1: Prisma-Modelle + Permission

**Files:**
- Modify: `prisma/schema.prisma` (neue Modelle am Ende; Gegen-Relation an `User` im `model User`-Block bei den übrigen Relationen, ~Zeile 195)
- Modify: `src/lib/permissions.ts` (PERMISSIONS-Array + PERMISSION_LABELS)

**Interfaces:**
- Produces: Prisma-Modelle `OrdnungCategory` (Felder: `id, key, label, description?, icon, color, sortOrder, createdAt, updatedAt`) und `Ordnung` (Felder: `id, slug, title, description, buttonLabel, icon, content, categoryId, category, sortOrder, createdById, createdBy, createdAt, updatedAt`). Permission-String `'ordnungen:manage'`.

- [ ] **Step 1: Modelle ans Ende von `prisma/schema.prisma` anhängen**

```prisma
model OrdnungCategory {
  id          String   @id @default(cuid())
  key         String   @unique
  label       String
  description String?  @db.Text
  icon        String   @default("Library")
  color       String   @default("#4a8fd8")
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  ordnungen   Ordnung[]
}

model Ordnung {
  id          String   @id @default(cuid())
  slug        String   @unique
  title       String
  description String   @db.Text
  buttonLabel String
  icon        String   @default("FileText")
  content     String   @db.Text
  categoryId  String
  category    OrdnungCategory @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  sortOrder   Int      @default(0)
  createdById String?
  createdBy   User?    @relation("OrdnungCreator", fields: [createdById], references: [id], onDelete: SetNull)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([categoryId])
}
```

- [ ] **Step 2: Gegen-Relation im `model User`-Block ergänzen**

Bei den übrigen `@relation`-Feldern (z.B. direkt nach `pressReleasesUpdated ...`) einfügen:

```prisma
  ordnungenCreated         Ordnung[]             @relation("OrdnungCreator")
```

- [ ] **Step 3: Permission registrieren — `src/lib/permissions.ts`**

Im `PERMISSIONS`-Array (z.B. nach `'settings:manage',`) hinzufügen:

```ts
  'ordnungen:manage',
```

Und in `PERMISSION_LABELS` (passend dazu):

```ts
  'ordnungen:manage': 'Ordnungen verwalten',
```

- [ ] **Step 4: Schema pushen + Client generieren**

Run: `npx prisma db push && npx prisma generate`
Expected: „Your database is now in sync with your Prisma schema." und erfolgreicher Client-Generate ohne Fehler.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler (insb. `PERMISSION_LABELS` bleibt vollständig, da `Record<Permission, string>`).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/lib/permissions.ts
git commit -m "$(printf 'feat(ordnungen): add Ordnung/OrdnungCategory models and ordnungen:manage permission\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: Shared Icon-Map + DB-Typen

**Files:**
- Create: `src/lib/ordnungen-icons.ts`
- Modify: `src/lib/ordnungen.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  - `ORDNUNG_ICON_NAMES: string[]`, `ordnungIcon(name: string): LucideIcon` aus `ordnungen-icons.ts`.
  - Typen aus `ordnungen.ts`: `OrdnungDTO`, `OrdnungCategoryDTO`, `OrdnungenPayload`.

- [ ] **Step 1: `src/lib/ordnungen-icons.ts` anlegen**

```ts
import {
  ScrollText, FileText, BookOpen, Scale, Briefcase, Library, Shield, Gavel,
  ClipboardList, Users, Siren, Plane, Search, TriangleAlert, Landmark, FileCheck,
  type LucideIcon,
} from 'lucide-react'

/** Kuratierte Icon-Auswahl für Ordnungen & Kategorien. Nur diese Namen sind gültig. */
export const ORDNUNG_ICONS: Record<string, LucideIcon> = {
  ScrollText, FileText, BookOpen, Scale, Briefcase, Library, Shield, Gavel,
  ClipboardList, Users, Siren, Plane, Search, TriangleAlert, Landmark, FileCheck,
}

export const ORDNUNG_ICON_NAMES = Object.keys(ORDNUNG_ICONS)

export function ordnungIcon(name: string): LucideIcon {
  return ORDNUNG_ICONS[name] ?? FileText
}
```

- [ ] **Step 2: `src/lib/ordnungen.ts` komplett ersetzen**

```ts
export interface OrdnungCategoryDTO {
  id: string
  key: string
  label: string
  description: string | null
  icon: string
  color: string
  sortOrder: number
}

export interface OrdnungDTO {
  id: string
  slug: string
  title: string
  description: string
  buttonLabel: string
  icon: string
  categoryId: string
  sortOrder: number
}

export interface OrdnungenPayload {
  categories: OrdnungCategoryDTO[]
  ordnungen: OrdnungDTO[]
}
```

- [ ] **Step 3: Typecheck (erwartet: Fehler in Altconsumern)**

Run: `npx tsc --noEmit`
Expected: FAIL — Referenzen auf entferntes `normalizeOrdnungConfigs` / `OrdnungConfig` in `src/app/api/ordnungen/config/route.ts` und `src/app/(dashboard)/ordnungen/[id]/page.tsx`. Diese werden in Task 4/5/8 ersetzt; hier bewusst noch nicht grün.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ordnungen-icons.ts src/lib/ordnungen.ts
git commit -m "$(printf 'feat(ordnungen): add shared icon map and DB DTO types\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Kategorie-API

**Files:**
- Create: `src/app/api/ordnungen/categories/route.ts`
- Create: `src/app/api/ordnungen/categories/[id]/route.ts`

**Interfaces:**
- Consumes: `prisma`, `requireAuth`, `success/error/unauthorized`, `ORDNUNG_ICONS`.
- Produces:
  - `POST /api/ordnungen/categories` → erstellt Kategorie, 201 mit Kategorie-Objekt.
  - `PUT /api/ordnungen/categories/[id]` → aktualisiert; `DELETE` → 409 falls Ordnungen zugeordnet.

- [ ] **Step 1: `src/app/api/ordnungen/categories/route.ts` anlegen**

```ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { isUniqueConstraintError } from '@/lib/prisma-errors'
import { ORDNUNG_ICONS } from '@/lib/ordnungen-icons'

function slugify(input: string) {
  return input.trim().toLowerCase().normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['ADMIN'], ['ordnungen:manage'])
    const body = await req.json()

    const label = typeof body.label === 'string' ? body.label.trim() : ''
    if (!label) return error('Bezeichnung ist erforderlich')

    const key = typeof body.key === 'string' && body.key.trim() ? slugify(body.key) : slugify(label)
    if (!key) return error('Bezeichnung ergibt keinen gültigen Key')

    const icon = typeof body.icon === 'string' && body.icon in ORDNUNG_ICONS ? body.icon : 'Library'
    const color = typeof body.color === 'string' && body.color ? body.color : '#4a8fd8'

    const category = await prisma.ordnungCategory.create({
      data: {
        key,
        label,
        description: typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null,
        icon,
        color,
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
      },
    })

    return success(category, 201)
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) return error('Kategorie existiert bereits')
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
```

- [ ] **Step 2: `src/app/api/ordnungen/categories/[id]/route.ts` anlegen**

```ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { isUniqueConstraintError } from '@/lib/prisma-errors'
import { ORDNUNG_ICONS } from '@/lib/ordnungen-icons'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['ADMIN'], ['ordnungen:manage'])
    const { id } = await params
    const body = await req.json()

    const data: Record<string, unknown> = {}
    if (typeof body.label === 'string' && body.label.trim()) data.label = body.label.trim()
    if (typeof body.description === 'string') data.description = body.description.trim() || null
    if (typeof body.icon === 'string' && body.icon in ORDNUNG_ICONS) data.icon = body.icon
    if (typeof body.color === 'string' && body.color) data.color = body.color
    if (typeof body.sortOrder === 'number') data.sortOrder = body.sortOrder

    const category = await prisma.ordnungCategory.update({ where: { id }, data })
    return success(category)
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) return error('Kategorie existiert bereits')
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    if (msg.includes('Record to update not found')) return notFound('Kategorie')
    return error(msg, 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['ADMIN'], ['ordnungen:manage'])
    const { id } = await params

    const count = await prisma.ordnung.count({ where: { categoryId: id } })
    if (count > 0) return error('Kategorie enthält noch Ordnungen und kann nicht gelöscht werden', 409)

    await prisma.ordnungCategory.delete({ where: { id } })
    return success({ id })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    if (msg.includes('Record to delete does not exist')) return notFound('Kategorie')
    return error(msg, 500)
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: Keine neuen Fehler in diesen beiden Dateien (Altfehler aus Task 2 bestehen noch bis Task 5/8).

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: keine Fehler in den neuen Dateien.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ordnungen/categories
git commit -m "$(printf 'feat(ordnungen): add category CRUD API\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: Ordnungen-API (Liste + CRUD)

**Files:**
- Create: `src/app/api/ordnungen/route.ts`
- Create: `src/app/api/ordnungen/[id]/route.ts`

**Interfaces:**
- Consumes: `prisma`, `requireAuth`, `requireAuthContext`/`requirePermission`, `ORDNUNG_ICONS`, `OrdnungenPayload`.
- Produces:
  - `GET /api/ordnungen` → `{ categories: OrdnungCategoryDTO[], ordnungen: OrdnungDTO[] }` (jeder eingeloggte User).
  - `POST /api/ordnungen` → neue Ordnung (201).
  - `PUT /api/ordnungen/[id]`, `DELETE /api/ordnungen/[id]`.

- [ ] **Step 1: `src/app/api/ordnungen/route.ts` anlegen**

```ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuthContext, getCurrentUser } from '@/lib/auth'
import { success, error, unauthorized } from '@/lib/api-response'
import { isUniqueConstraintError } from '@/lib/prisma-errors'
import { ORDNUNG_ICONS } from '@/lib/ordnungen-icons'

function slugify(input: string) {
  return input.trim().toLowerCase().normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Ansehen: jeder eingeloggte User (keine spezielle Permission).
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const [categories, ordnungen] = await Promise.all([
    prisma.ordnungCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] }),
    prisma.ordnung.findMany({ orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }] }),
  ])

  return success({
    categories: categories.map((c) => ({
      id: c.id, key: c.key, label: c.label, description: c.description,
      icon: c.icon, color: c.color, sortOrder: c.sortOrder,
    })),
    ordnungen: ordnungen.map((o) => ({
      id: o.id, slug: o.slug, title: o.title, description: o.description,
      buttonLabel: o.buttonLabel, icon: o.icon, categoryId: o.categoryId, sortOrder: o.sortOrder,
    })),
  })
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuthContext('ordnungen:manage')
    const body = await req.json()

    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return error('Titel ist erforderlich')
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId : ''
    if (!categoryId) return error('Kategorie ist erforderlich')

    const category = await prisma.ordnungCategory.findUnique({ where: { id: categoryId } })
    if (!category) return error('Kategorie nicht gefunden', 400)

    const slug = typeof body.slug === 'string' && body.slug.trim() ? slugify(body.slug) : slugify(title)
    if (!slug) return error('Titel ergibt keinen gültigen Slug')

    const icon = typeof body.icon === 'string' && body.icon in ORDNUNG_ICONS ? body.icon : 'FileText'

    const ordnung = await prisma.ordnung.create({
      data: {
        slug,
        title,
        description: typeof body.description === 'string' ? body.description.trim() : '',
        buttonLabel: typeof body.buttonLabel === 'string' && body.buttonLabel.trim() ? body.buttonLabel.trim() : title,
        icon,
        content: typeof body.content === 'string' ? body.content : '',
        categoryId,
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
        createdById: user.id,
      },
    })

    return success(ordnung, 201)
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) return error('Eine Ordnung mit diesem Slug existiert bereits')
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
```

> **Hinweis:** `requireAuthContext(permission)` gibt `{ user, ... }` zurück (siehe `src/lib/auth.ts:343`) und wirft `Unauthorized`/`Forbidden`. Falls die Rückgabe-Property nicht `user` heißt, beim Implementieren an `auth.ts` verifizieren und anpassen.

- [ ] **Step 2: `src/app/api/ordnungen/[id]/route.ts` anlegen**

```ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { success, error, unauthorized, notFound } from '@/lib/api-response'
import { isUniqueConstraintError } from '@/lib/prisma-errors'
import { ORDNUNG_ICONS } from '@/lib/ordnungen-icons'

function slugify(input: string) {
  return input.trim().toLowerCase().normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['ADMIN'], ['ordnungen:manage'])
    const { id } = await params
    const body = await req.json()

    const data: Record<string, unknown> = {}
    if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()
    if (typeof body.description === 'string') data.description = body.description.trim()
    if (typeof body.buttonLabel === 'string' && body.buttonLabel.trim()) data.buttonLabel = body.buttonLabel.trim()
    if (typeof body.icon === 'string' && body.icon in ORDNUNG_ICONS) data.icon = body.icon
    if (typeof body.content === 'string') data.content = body.content
    if (typeof body.slug === 'string' && body.slug.trim()) data.slug = slugify(body.slug)
    if (typeof body.sortOrder === 'number') data.sortOrder = body.sortOrder
    if (typeof body.categoryId === 'string' && body.categoryId) {
      const category = await prisma.ordnungCategory.findUnique({ where: { id: body.categoryId } })
      if (!category) return error('Kategorie nicht gefunden', 400)
      data.categoryId = body.categoryId
    }

    const ordnung = await prisma.ordnung.update({ where: { id }, data })
    return success(ordnung)
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) return error('Eine Ordnung mit diesem Slug existiert bereits')
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    if (msg.includes('Record to update not found')) return notFound('Ordnung')
    return error(msg, 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['ADMIN'], ['ordnungen:manage'])
    const { id } = await params
    await prisma.ordnung.delete({ where: { id } })
    return success({ id })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    if (msg.includes('Record to delete does not exist')) return notFound('Ordnung')
    return error(msg, 500)
  }
}
```

- [ ] **Step 3: Typecheck + Lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: keine Fehler in den neuen Ordnungen-Routen (Altfehler in `config/route.ts` + `[id]/page.tsx` bestehen bis Task 5/8).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ordnungen/route.ts src/app/api/ordnungen/[id]/route.ts
git commit -m "$(printf 'feat(ordnungen): add ordnungen list + CRUD API\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: Import bestehender Ordnungen (Seed) + Einzelseite auf DB umstellen

**Files:**
- Modify: `prisma/seed.ts` (Import-Funktion + Aufruf in `main()`)
- Modify: `src/app/(dashboard)/ordnungen/[id]/page.tsx`

**Interfaces:**
- Consumes: `prisma`, `ordnungIcon`, bestehende `.md`-Dateien + `ordnungen/config.json`.
- Produces: befüllte Tabellen `OrdnungCategory` (`allgemein`, `hr`) + `Ordnung` (`dienstordnung`, `sanktionskatalog`, `hr-dienstordnung`). Einzelseite rendert Ordnung aus DB.

- [ ] **Step 1: Import-Funktion in `prisma/seed.ts` ergänzen**

Oben bei den Imports ergänzen:

```ts
import { promises as fs } from 'node:fs'
import path from 'node:path'
```

Vor `main()` einfügen:

```ts
const SEED_ORDNUNG_CATEGORIES = [
  { key: 'allgemein', label: 'Allgemein', description: 'Allgemeine Dienstordnungen und verbindliche Richtlinien', icon: 'Scale', color: '#4a8fd8', sortOrder: 0 },
  { key: 'hr', label: 'Human Resources', description: 'Richtlinien und Verfahren für die HR-Abteilung', icon: 'Briefcase', color: '#d4af37', sortOrder: 1 },
]
// Mapping der alten config.json-Kategorien auf die neuen Kategorie-Keys.
const LEGACY_CATEGORY_KEY: Record<string, string> = { Allgemein: 'allgemein', HR: 'hr' }

async function importOrdnungen() {
  const existing = await prisma.ordnung.count()
  if (existing > 0) {
    console.log('Ordnungen bereits vorhanden — Import übersprungen.')
    return
  }

  // Kategorien anlegen (idempotent per key).
  const catIdByKey: Record<string, string> = {}
  for (const c of SEED_ORDNUNG_CATEGORIES) {
    const cat = await prisma.ordnungCategory.upsert({
      where: { key: c.key },
      update: {},
      create: c,
    })
    catIdByKey[c.key] = cat.id
  }

  const dir = path.join(process.cwd(), 'ordnungen')
  const configRaw = await fs.readFile(path.join(dir, 'config.json'), 'utf8')
  const parsed = JSON.parse(configRaw)
  const entries: any[] = Array.isArray(parsed?.ordnungen) ? parsed.ordnungen : []

  let sort = 0
  for (const e of entries) {
    const categoryKey = LEGACY_CATEGORY_KEY[e.category] ?? 'allgemein'
    const content = await fs.readFile(path.join(dir, e.file), 'utf8')
    await prisma.ordnung.create({
      data: {
        slug: e.id,
        title: e.title,
        description: e.description ?? '',
        buttonLabel: e.buttonLabel ?? e.title,
        icon: typeof e.icon === 'string' ? e.icon : 'FileText',
        content,
        categoryId: catIdByKey[categoryKey],
        sortOrder: sort++,
      },
    })
    console.log(`  importiert: ${e.id}`)
  }
  console.log(`Ordnungen-Import fertig (${entries.length}).`)
}
```

In `main()`, am Ende vor dem abschließenden Log/Return, aufrufen:

```ts
  await importOrdnungen()
```

- [ ] **Step 2: Seed ausführen**

Run: `npx tsx prisma/seed.ts`
Expected: Ausgabe „importiert: dienstordnung / sanktionskatalog / hr-dienstordnung" und „Ordnungen-Import fertig (3)."

- [ ] **Step 3: Verifizieren in der DB**

Run: `npx prisma studio` (oder ein kurzes `npx tsx -e`-Skript), prüfen: 2 Kategorien, 3 Ordnungen, Slugs korrekt.

- [ ] **Step 4: `src/app/(dashboard)/ordnungen/[id]/page.tsx` — `loadOrdnung` auf Prisma umstellen**

Ersetze die `fs`/`path`/`normalizeOrdnungConfigs`-Importe und `loadOrdnung` durch:

```tsx
import Link from 'next/link'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { renderMarkdown } from '@/lib/markdown'
import { prisma } from '@/lib/prisma'

async function loadOrdnung(slug: string) {
  try {
    const ordnung = await prisma.ordnung.findUnique({ where: { slug } })
    if (!ordnung) return { config: null, html: null, error: 'Ordnung nicht gefunden' }
    return {
      config: { title: ordnung.title, description: ordnung.description },
      html: renderMarkdown(ordnung.content),
      error: null,
    }
  } catch (error) {
    return {
      config: null,
      html: null,
      error: error instanceof Error ? error.message : 'Fehler beim Laden der Ordnung',
    }
  }
}
```

Der restliche JSX-Teil (Fehler-View + `<article dangerouslySetInnerHTML>`) bleibt unverändert; `config.title` / `config.description` existieren weiterhin.

- [ ] **Step 5: Typecheck + Smoke-Test**

Run: `npx tsc --noEmit`
Expected: `[id]/page.tsx` ist jetzt fehlerfrei (Rest-Altfehler nur noch in `config/route.ts`, behoben in Task 8).

Dann `npm run dev`, im Browser `/ordnungen/dienstordnung` öffnen → Inhalt wird gerendert.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts "src/app/(dashboard)/ordnungen/[id]/page.tsx"
git commit -m "$(printf 'feat(ordnungen): import existing ordnungen into DB and load detail page from DB\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 6: Übersichtsseite aus der DB (read-only)

**Files:**
- Modify: `src/app/(dashboard)/ordnungen/page.tsx`

**Interfaces:**
- Consumes: `GET /api/ordnungen` (`OrdnungenPayload`), `ordnungIcon`, `useFetch`.
- Produces: Übersicht, die Kategorien + Ordnungen aus der DB gruppiert. Noch KEINE Manage-Buttons (Task 7).

- [ ] **Step 1: `page.tsx` umbauen — hardcodierte `categories`/`iconMap` entfernen**

Kernänderungen (das bestehende Layout/Styling der Karten bleibt erhalten):
- Fetch: `const { data } = useFetch<OrdnungenPayload>('/api/ordnungen')`.
- Kategorien-Quelle: `data?.categories ?? []` (sortiert bereits vom Server), statt des festen Arrays.
- Pro Kategorie filtern: `data?.ordnungen.filter((o) => o.categoryId === category.id)`.
- Icons via `ordnungIcon(name)` statt festem `iconMap`.
- Akzentfarbe/Ring aus `category.color` ableiten (z.B. `color`, und für Soft/Ring per `rgba` bzw. mit Opacity-Suffix `${color}24` / `${color}59`).

Konkrete Datei:

```tsx
'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Library } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { useFetch } from '@/hooks/use-fetch'
import { ordnungIcon } from '@/lib/ordnungen-icons'
import type { OrdnungenPayload } from '@/lib/ordnungen'

function OrdnungCardSkeleton() {
  return (
    <div className="flex items-start gap-4 p-5 glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/40">
      <div className="w-12 h-12 rounded-[10px] bg-[#0f2340] animate-pulse shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-3.5 w-2/5 rounded bg-[#0f2340] animate-pulse" />
        <div className="h-2.5 w-4/5 rounded bg-[#0f2340]/70 animate-pulse" />
        <div className="h-2.5 w-3/5 rounded bg-[#0f2340]/70 animate-pulse" />
      </div>
    </div>
  )
}

export default function OrdnungenPage() {
  const { data } = useFetch<OrdnungenPayload>('/api/ordnungen')
  const isLoading = data === undefined
  const categories = data?.categories ?? []
  const ordnungen = data?.ordnungen ?? []
  const total = ordnungen.length

  return (
    <div className="max-w-6xl mx-auto pb-6">
      <PageHeader
        title="Ordnungen & Richtlinien"
        description="Zentrale Sammlung aller relevanten Dienstordnungen und Richtlinien"
      />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative overflow-hidden glass-panel-elevated rounded-[16px] border border-[#1e3a5c]/50 p-6 mb-8"
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(74,143,216,0.18), transparent 70%)' }}
        />
        <div className="relative flex items-center gap-4">
          <div className="flex items-center justify-center w-14 h-14 rounded-[14px] bg-gradient-to-br from-[#142d52] to-[#0b1c34] border border-[#234568]/60 text-[#7fb2e8] shrink-0 shadow-[0_4px_16px_rgba(0,0,0,0.25)]">
            <Library size={26} strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-[#f0f5fb]">Regelwerk-Bibliothek</h2>
            <p className="text-[13px] text-[#8ea4bd] mt-0.5">
              {isLoading ? 'Lade Ordnungen …' : `${total} Dokumente in ${categories.length} Bereichen`}
            </p>
          </div>
        </div>
      </motion.div>

      {categories.map((category, catIdx) => {
        const categoryOrdnungen = ordnungen.filter((o) => o.categoryId === category.id)
        if (!isLoading && categoryOrdnungen.length === 0) return null

        const accent = category.color
        const accentSoft = `${accent}24`
        const ring = `${accent}59`
        const CategoryIcon = ordnungIcon(category.icon)

        return (
          <div key={category.id} className="mb-9">
            <div className="flex items-center gap-2.5 mb-4">
              <span
                className="flex items-center justify-center w-7 h-7 rounded-[8px] shrink-0"
                style={{ background: accentSoft, color: accent }}
              >
                <CategoryIcon size={15} strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-[15px] font-semibold text-[#f0f5fb]">{category.label}</h2>
                  {!isLoading && (
                    <span
                      className="text-[11px] font-medium px-1.5 py-0.5 rounded-full"
                      style={{ background: accentSoft, color: accent }}
                    >
                      {categoryOrdnungen.length}
                    </span>
                  )}
                </div>
                {category.description && (
                  <p className="text-[12.5px] text-[#7e93ab] leading-tight">{category.description}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {isLoading
                ? Array.from({ length: 2 }).map((_, i) => <OrdnungCardSkeleton key={i} />)
                : categoryOrdnungen.map((ordnung, idx) => {
                    const Icon = ordnungIcon(ordnung.icon)
                    return (
                      <motion.div
                        key={ordnung.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: catIdx * 0.06 + idx * 0.05 }}
                      >
                        <Link
                          href={`/ordnungen/${ordnung.slug}`}
                          className="group relative flex items-start gap-4 p-5 glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/40 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--accent-ring)] hover:bg-[#0f2340]/40 hover:shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
                          style={{ '--accent-ring': ring, '--accent': accent } as React.CSSProperties}
                        >
                          <span
                            className="absolute left-0 top-5 bottom-5 w-[3px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ background: accent }}
                          />
                          <div
                            className="flex items-center justify-center w-12 h-12 rounded-[10px] shrink-0 transition-transform duration-200 group-hover:scale-[1.05]"
                            style={{ background: accentSoft, color: accent }}
                          >
                            <Icon size={20} strokeWidth={1.75} />
                          </div>
                          <div className="flex-1 min-w-0 pt-0.5">
                            <h3 className="text-[14px] font-semibold text-[#eef3f9] group-hover:text-[#fff] transition-colors">
                              {ordnung.title}
                            </h3>
                            <p className="text-[12.5px] text-[#8194a9] mt-1 leading-relaxed line-clamp-2">
                              {ordnung.description}
                            </p>
                            <span className="inline-flex items-center gap-1 mt-2.5 text-[12px] font-medium text-[#6a8fb8] group-hover:text-[var(--accent)] transition-colors">
                              Öffnen
                              <ArrowRight size={13} strokeWidth={2.25} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                            </span>
                          </div>
                        </Link>
                      </motion.div>
                    )
                  })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + Smoke-Test**

Run: `npx tsc --noEmit`
Expected: `page.tsx` fehlerfrei.

`npm run dev` → `/ordnungen` zeigt beide Kategorien mit ihren Ordnungen, Icons + Farben korrekt.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/ordnungen/page.tsx"
git commit -m "$(printf 'feat(ordnungen): render overview from DB, drop hardcoded categories\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 7: Inline-Verwaltung (Manager-Komponente mit Editor + Kategorie-Modals)

**Files:**
- Create: `src/components/ordnungen/ordnungen-manager.tsx`
- Modify: `src/app/(dashboard)/ordnungen/page.tsx` (Manager einbinden, Manage-Buttons)

**Interfaces:**
- Consumes: `useAuth` (`user.permissions`), `useApi`, `useToast`, `Modal`, `Select`, `ColorField`, `Input`/`Textarea`, `ORDNUNG_ICON_NAMES`, `ordnungIcon`, `renderMarkdown`, `OrdnungenPayload`.
- Produces: Client-Komponente `OrdnungenManager` mit Props `{ payload: OrdnungenPayload; canManage: boolean; onChanged: () => void }`, rendert Toolbar-Buttons + Modals.

- [ ] **Step 1: `useFetch` in `page.tsx` um `refetch` erweitern und Manager einbinden**

In `page.tsx`:
- `const { data, refetch } = useFetch<OrdnungenPayload>('/api/ordnungen')`
- `import { useAuth } from '@/context/auth-context'` und `const { user } = useAuth()`
- `const canManage = !!user?.permissions.includes('ordnungen:manage')`
- Unter dem Hero (vor der Kategorie-Schleife) einbinden:

```tsx
{data && (
  <OrdnungenManager payload={data} canManage={canManage} onChanged={refetch} />
)}
```

- Import ergänzen: `import { OrdnungenManager } from '@/components/ordnungen/ordnungen-manager'`

Der Manager rendert die globalen Aktionen („Neue Ordnung", „Neue Kategorie") und hält die Modals. (Edit/Delete-Buttons pro Karte: siehe Step 3.)

- [ ] **Step 2: `src/components/ordnungen/ordnungen-manager.tsx` anlegen**

```tsx
'use client'

import { useState } from 'react'
import { Plus, FolderPlus } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { ColorField } from '@/components/ui/color-field'
import { useApi } from '@/hooks/use-api'
import { useToast } from '@/components/ui/toast'
import { renderMarkdown } from '@/lib/markdown'
import { ORDNUNG_ICON_NAMES, ordnungIcon } from '@/lib/ordnungen-icons'
import type { OrdnungDTO, OrdnungCategoryDTO, OrdnungenPayload } from '@/lib/ordnungen'

interface Props {
  payload: OrdnungenPayload
  canManage: boolean
  onChanged: () => void
  editOrdnung?: OrdnungDTO & { content?: string } | null
}

const EMPTY_ORDNUNG = { title: '', description: '', buttonLabel: '', icon: 'FileText', content: '', categoryId: '' }
const EMPTY_CATEGORY = { label: '', description: '', icon: 'Library', color: '#4a8fd8' }

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1.5">
      {ORDNUNG_ICON_NAMES.map((name) => {
        const Icon = ordnungIcon(name)
        const active = name === value
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            className={`flex items-center justify-center h-9 rounded-[8px] border transition-colors ${active ? 'border-[#4a8fd8] bg-[#4a8fd8]/15 text-[#7fb2e8]' : 'border-[#1e3a5c]/50 text-[#8194a9] hover:border-[#2d5279]'}`}
            title={name}
          >
            <Icon size={16} strokeWidth={1.75} />
          </button>
        )
      })}
    </div>
  )
}

export function OrdnungenManager({ payload, canManage, onChanged }: Props) {
  const { execute } = useApi()
  const { addToast } = useToast()

  const [ordnungModalOpen, setOrdnungModalOpen] = useState(false)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [ordnungForm, setOrdnungForm] = useState({ ...EMPTY_ORDNUNG })
  const [categoryForm, setCategoryForm] = useState({ ...EMPTY_CATEGORY })
  const [saving, setSaving] = useState(false)

  if (!canManage) return null

  const categoryOptions = payload.categories.map((c) => ({ value: c.id, label: c.label }))

  function openNewOrdnung() {
    setEditingId(null)
    setOrdnungForm({ ...EMPTY_ORDNUNG, categoryId: payload.categories[0]?.id ?? '' })
    setOrdnungModalOpen(true)
  }

  async function saveOrdnung() {
    if (!ordnungForm.title.trim()) { addToast({ type: 'error', title: 'Titel fehlt' }); return }
    if (!ordnungForm.categoryId) { addToast({ type: 'error', title: 'Kategorie fehlt' }); return }
    setSaving(true)
    try {
      const url = editingId ? `/api/ordnungen/${editingId}` : '/api/ordnungen'
      await execute(url, { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(ordnungForm) })
      addToast({ type: 'success', title: editingId ? 'Ordnung gespeichert' : 'Ordnung erstellt' })
      setOrdnungModalOpen(false)
      onChanged()
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Fehler beim Speichern' })
    } finally {
      setSaving(false)
    }
  }

  async function saveCategory() {
    if (!categoryForm.label.trim()) { addToast({ type: 'error', title: 'Bezeichnung fehlt' }); return }
    setSaving(true)
    try {
      await execute('/api/ordnungen/categories', { method: 'POST', body: JSON.stringify(categoryForm) })
      addToast({ type: 'success', title: 'Kategorie erstellt' })
      setCategoryModalOpen(false)
      setCategoryForm({ ...EMPTY_CATEGORY })
      onChanged()
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Fehler beim Speichern' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-6 flex flex-wrap gap-2">
      <button
        onClick={openNewOrdnung}
        className="inline-flex h-[34px] items-center gap-1.5 rounded-[8px] bg-[#17375f] px-3 text-[12.5px] font-medium text-[#edf4fb] hover:bg-[#1e4675] transition-colors"
      >
        <Plus size={15} strokeWidth={2} /> Neue Ordnung
      </button>
      <button
        onClick={() => { setCategoryForm({ ...EMPTY_CATEGORY }); setCategoryModalOpen(true) }}
        className="inline-flex h-[34px] items-center gap-1.5 rounded-[8px] bg-[#102542] px-3 text-[12.5px] font-medium text-[#edf4fb] hover:bg-[#17375f] transition-colors"
      >
        <FolderPlus size={15} strokeWidth={2} /> Neue Kategorie
      </button>

      {/* Ordnung-Editor */}
      <Modal open={ordnungModalOpen} onClose={() => setOrdnungModalOpen(false)} title={editingId ? 'Ordnung bearbeiten' : 'Neue Ordnung'} size="lg">
        <div className="space-y-3">
          <input
            value={ordnungForm.title}
            onChange={(e) => setOrdnungForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Titel"
            className="w-full h-9 rounded-[8px] bg-[#0b1c34] border border-[#1e3a5c]/60 px-3 text-[13px] text-[#edf4fb]"
          />
          <input
            value={ordnungForm.description}
            onChange={(e) => setOrdnungForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Kurzbeschreibung"
            className="w-full h-9 rounded-[8px] bg-[#0b1c34] border border-[#1e3a5c]/60 px-3 text-[13px] text-[#edf4fb]"
          />
          <input
            value={ordnungForm.buttonLabel}
            onChange={(e) => setOrdnungForm((f) => ({ ...f, buttonLabel: e.target.value }))}
            placeholder="Button-Label (optional, sonst = Titel)"
            className="w-full h-9 rounded-[8px] bg-[#0b1c34] border border-[#1e3a5c]/60 px-3 text-[13px] text-[#edf4fb]"
          />
          <Select
            options={categoryOptions}
            value={ordnungForm.categoryId}
            onValueChange={(v) => setOrdnungForm((f) => ({ ...f, categoryId: v }))}
            placeholder="Kategorie wählen"
          />
          <div>
            <p className="text-[12px] text-[#8194a9] mb-1.5">Icon</p>
            <IconPicker value={ordnungForm.icon} onChange={(v) => setOrdnungForm((f) => ({ ...f, icon: v }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <textarea
              value={ordnungForm.content}
              onChange={(e) => setOrdnungForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Markdown-Inhalt …"
              className="h-64 rounded-[8px] bg-[#0b1c34] border border-[#1e3a5c]/60 p-3 text-[12.5px] font-mono text-[#edf4fb] resize-none"
            />
            <div
              className="markdown-document h-64 overflow-auto rounded-[8px] bg-[#0b1c34]/50 border border-[#1e3a5c]/40 p-3 text-[12.5px]"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(ordnungForm.content) }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setOrdnungModalOpen(false)} className="h-9 px-3 rounded-[8px] bg-[#102542] text-[12.5px] text-[#cdd8e6]">Abbrechen</button>
            <button disabled={saving} onClick={saveOrdnung} className="h-9 px-4 rounded-[8px] bg-[#17375f] text-[12.5px] text-[#edf4fb] disabled:opacity-50">Speichern</button>
          </div>
        </div>
      </Modal>

      {/* Kategorie-Modal */}
      <Modal open={categoryModalOpen} onClose={() => setCategoryModalOpen(false)} title="Neue Kategorie" size="md">
        <div className="space-y-3">
          <input
            value={categoryForm.label}
            onChange={(e) => setCategoryForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Bezeichnung"
            className="w-full h-9 rounded-[8px] bg-[#0b1c34] border border-[#1e3a5c]/60 px-3 text-[13px] text-[#edf4fb]"
          />
          <input
            value={categoryForm.description}
            onChange={(e) => setCategoryForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Beschreibung (optional)"
            className="w-full h-9 rounded-[8px] bg-[#0b1c34] border border-[#1e3a5c]/60 px-3 text-[13px] text-[#edf4fb]"
          />
          <div>
            <p className="text-[12px] text-[#8194a9] mb-1.5">Icon</p>
            <IconPicker value={categoryForm.icon} onChange={(v) => setCategoryForm((f) => ({ ...f, icon: v }))} />
          </div>
          <div>
            <p className="text-[12px] text-[#8194a9] mb-1.5">Farbe</p>
            <ColorField value={categoryForm.color} onChange={(v) => setCategoryForm((f) => ({ ...f, color: v }))} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setCategoryModalOpen(false)} className="h-9 px-3 rounded-[8px] bg-[#102542] text-[12.5px] text-[#cdd8e6]">Abbrechen</button>
            <button disabled={saving} onClick={saveCategory} className="h-9 px-4 rounded-[8px] bg-[#17375f] text-[12.5px] text-[#edf4fb] disabled:opacity-50">Erstellen</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
```

> **Verifikations-Hinweis beim Implementieren:** Props von `Modal` (`size`-Werte an `src/components/ui/modal.tsx` prüfen — Plan nutzt `md`/`lg`), `Select` (`placeholder`, `onValueChange`) und `ColorField` (`value`/`onChange`) an den echten Signaturen abgleichen. `addToast` erwartet `{ type: 'success'|'error'|'warning'|'info', title }` (KEIN `description`-Feld) — im Plan bereits so verwendet. Die Editor-Split-Ansicht spiegelt bewusst das Muster aus `module-documents.tsx` (Textarea links, `renderMarkdown`-Preview rechts).

- [ ] **Step 3: Edit/Delete pro Ordnung ermöglichen**

Damit Bearbeiten die vorhandenen Inhalte lädt (die Liste `OrdnungDTO` enthält kein `content`), beim Klick auf „Bearbeiten" den Inhalt nachladen: `GET`-Route für Einzel-Ordnung ist nicht nötig — der Manager kann `content` über einen leichten Fetch holen. Ergänze in `route.ts` (`/api/ordnungen/[id]`) eine `GET`-Methode, die die volle Ordnung inkl. `content` zurückgibt (geschützt mit `ordnungen:manage`):

```ts
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['ADMIN'], ['ordnungen:manage'])
    const { id } = await params
    const ordnung = await prisma.ordnung.findUnique({ where: { id } })
    if (!ordnung) return notFound('Ordnung')
    return success(ordnung)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }
}
```

In `page.tsx`: an jeder Ordnungs-Karte (nur wenn `canManage`) kleine Edit-/Delete-Buttons rendern. Edit ruft eine vom Manager exponierte Funktion. Praktikabelste Umsetzung: State „welche Ordnung wird bearbeitet" in `page.tsx` halten und dem Manager als gesteuerte Props übergeben — ODER die Karten-Aktionen direkt in `page.tsx` implementieren:

```tsx
// in page.tsx, innerhalb der Karte (nur canManage):
{canManage && (
  <div className="absolute right-2 top-2 flex gap-1">
    <button
      onClick={async (e) => {
        e.preventDefault()
        const full = await fetch(`/api/ordnungen/${ordnung.id}`, { cache: 'no-store' }).then((r) => r.json())
        if (full?.success) startEdit(full.data)
      }}
      className="h-7 w-7 grid place-items-center rounded-[7px] bg-[#0b1c34]/80 text-[#8194a9] hover:text-[#edf4fb]"
    >✎</button>
    <button
      onClick={async (e) => {
        e.preventDefault()
        if (!confirm(`„${ordnung.title}" wirklich löschen?`)) return
        await fetch(`/api/ordnungen/${ordnung.id}`, { method: 'DELETE' })
        refetch()
      }}
      className="h-7 w-7 grid place-items-center rounded-[7px] bg-[#0b1c34]/80 text-[#8194a9] hover:text-[#ff6b6b]"
    >🗑</button>
  </div>
)}
```

Dazu im Manager `editOrdnung`-Handling: expose eine `startEdit(ordnung)`-Funktion via gemeinsamem State. Einfachste Variante: `OrdnungenManager` bekommt zusätzlichen State-Lift — hebe `ordnungModalOpen`, `editingId`, `ordnungForm` nach `page.tsx` und übergib Setter. Beim Implementieren die simpelste funktionierende Verdrahtung wählen; Kern ist: Edit befüllt das Formular (inkl. `content`), Speichern nutzt `PUT`, Löschen `DELETE`, danach `refetch()`.

- [ ] **Step 4: Typecheck + Lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: keine Fehler.

- [ ] **Step 5: Smoke-Test (manuell, `npm run dev`)**

- Als User MIT `ordnungen:manage`: „Neue Kategorie" anlegen → erscheint. „Neue Ordnung" mit Markdown + Icon + Kategorie anlegen → erscheint in der Sektion, Split-Preview funktioniert.
- Ordnung bearbeiten → Inhalt lädt vor, Änderung speichert. Öffnen der Ordnung zeigt aktualisierten Inhalt.
- Ordnung löschen → verschwindet. Kategorie mit Ordnungen löschen (falls DELETE-UI vorhanden) → 409-Meldung.
- Als User OHNE `ordnungen:manage`: keine Manage-Buttons sichtbar, Ansehen funktioniert.

- [ ] **Step 6: Commit**

```bash
git add src/components/ordnungen/ordnungen-manager.tsx "src/app/(dashboard)/ordnungen/page.tsx" src/app/api/ordnungen/[id]/route.ts
git commit -m "$(printf 'feat(ordnungen): inline create/edit/delete UI for ordnungen and categories\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 8: Cleanup + Full Build

**Files:**
- Delete: `src/app/api/ordnungen/config/route.ts`
- Grep: verbliebene Referenzen auf `normalizeOrdnungConfigs`, `OrdnungConfig`, `/api/ordnungen/config`

**Interfaces:**
- Consumes: nichts.
- Produces: sauberer Build ohne tote Datei-Config-Pfade.

- [ ] **Step 1: Alte Route löschen**

```bash
git rm src/app/api/ordnungen/config/route.ts
```

- [ ] **Step 2: Nach Restreferenzen suchen**

Run: `grep -rn "normalizeOrdnungConfigs\|OrdnungConfig\|ordnungen/config" src/`
Expected: keine Treffer mehr. Falls doch → auf DB-Typen/`/api/ordnungen` umstellen.

- [ ] **Step 3: Voller Build**

Run: `npm run build`
Expected: „Compiled successfully" — kein Fehler zu fehlenden Modulen/Typen.

- [ ] **Step 4: Lint gesamt**

Run: `npm run lint`
Expected: keine Fehler.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(printf 'chore(ordnungen): remove file-based config route and dead types\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Self-Review Notes (vom Plan-Autor)

- **Spec-Abdeckung:** Datenmodell (T1), Import bestehender Daten + stabile Slugs (T5), Permission `ordnungen:manage` (T1), API inkl. Kategorie-Löschschutz 409 (T3/T4), Übersicht aus DB ohne hardcodierte Arrays (T6), Editor + Icon-Picker + Farbe (T7), Einzelseite aus DB (T5), Cleanup `ordnungen.ts`/config-Route (T2/T8). Alle Spec-Punkte haben einen Task.
- **Bewusst offen gelassen für Implementierungs-Zeitpunkt** (an echten Signaturen zu verifizieren, Hinweise stehen im Plan): exakte Rückgabe-Property von `requireAuthContext`, `addToast`-Variant-Feldname, `Modal`/`Select`/`ColorField`-Props. Das sind lokale Anpassungen an bestehende, im Repo vorhandene APIs — keine offenen Design-Fragen.
- **YAGNI:** keine Drag&Drop-Sortierung, keine Ordnungs-Versionierung, keine Sichtbarkeit pro Ordnung (kommt ggf. mit Baustelle „Units").
