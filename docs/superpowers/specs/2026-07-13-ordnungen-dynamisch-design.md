# Design: Ordnungen & Kategorien dynamisch (DB-backed)

**Datum:** 2026-07-13
**Status:** Genehmigt
**Scope:** Baustelle 1 von 3 (danach: Units als Rechte-Träger, Auto-Deploy)

## Ziel

Ordnungen und ihre Kategorien sind aktuell hardcoded: Inhalte liegen als `.md`-Dateien
+ `ordnungen/config.json` auf der Platte, die Kategorien (`Allgemein`, `HR`) und der
`iconMap` sind fest im `page.tsx` codiert. Ziel: Ordnungen **und** Kategorien
vollständig über die Dashboard-UI anlegen/bearbeiten/löschen, gespeichert in der DB.

## Entscheidungen (aus Brainstorming)

- **Speicherung:** Voll in der DB inkl. Markdown-Inhalt, Bearbeitung über UI-Editor.
- **Zugriff:** Neues Recht `ordnungen:manage` zum Bearbeiten; Ansehen für jeden
  eingeloggten User (wie bisher).
- **Verwaltungs-UI:** Inline auf `/ordnungen` (Buttons erscheinen bei `ordnungen:manage`).
- **Icons:** Kuratierter Picker (kein Freitext), damit Rendering nie auf unbekanntes Icon läuft.

## 1. Datenmodell (Prisma)

Zwei neue Modelle. Rollout via `prisma db push` (Projekt-Konvention, nicht `migrate deploy`).

```prisma
model OrdnungCategory {
  id          String   @id @default(cuid())
  key         String   @unique          // slug, z.B. "hr"
  label       String                    // "Human Resources"
  description String?  @db.Text
  icon        String   @default("Library")   // lucide-Name
  color       String   @default("#4a8fd8")    // Akzentfarbe
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  ordnungen   Ordnung[]
}

model Ordnung {
  id          String   @id @default(cuid())
  slug        String   @unique          // URL /ordnungen/{slug}
  title       String
  description String   @db.Text
  buttonLabel String
  icon        String   @default("FileText")   // lucide-Name
  content     String   @db.Text          // Markdown
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

`User` bekommt die Gegen-Relation `ordnungenCreated Ordnung[] @relation("OrdnungCreator")`.

## 2. Datenübernahme (einmalig)

Import-Step in `prisma/seed.ts` (und/oder `scripts/initialize-database.js`): Wenn noch
keine Ordnungen in der DB sind, werden die bestehenden aus `ordnungen/config.json` +
den referenzierten `.md`-Dateien eingelesen und angelegt.

- **Slugs bleiben gleich** (`dienstordnung`, `sanktionskatalog`, `hr-dienstordnung`) →
  bestehende Links und der `/hr/sanktionskatalog`-Redirect funktionieren weiter.
- Kategorien `Allgemein` + `HR` werden mit ihren jetzigen Farben/Icons/Beschreibungen
  aus dem bisherigen `categories`-Array angelegt.
- Der `ordnungen/`-Ordner bleibt als Quelle liegen, wird zur Laufzeit aber nicht mehr gelesen.

## 3. Permission

Neues Recht `ordnungen:manage` in `src/lib/permissions.ts`:
- In `PERMISSIONS`-Array + `PERMISSION_LABELS` (Label z.B. „Ordnungen verwalten").
- Kein View-Recht — Ansehen bleibt für jeden eingeloggten User offen.
- Schreib-Endpunkte prüfen `ordnungen:manage`.

## 4. API (`/api/ordnungen/...`)

- `GET /api/ordnungen` → Liste (Ordnungen inkl. Kategorie-Infos), löst altes
  `/api/ordnungen/config` ab.
- `POST /api/ordnungen` · `PUT /api/ordnungen/[id]` · `DELETE /api/ordnungen/[id]`
  → geschützt mit `ordnungen:manage`.
- `GET /api/ordnungen/categories` · `POST` · `PUT /api/ordnungen/categories/[id]` ·
  `DELETE /api/ordnungen/categories/[id]` → geschützt mit `ordnungen:manage`.
- Kategorie mit noch zugeordneten Ordnungen ist nicht löschbar (Restrict → 409 mit
  klarer Meldung).
- Slug-Eindeutigkeit serverseitig prüfen; Slug beim Anlegen aus Titel generieren,
  editierbar.

## 5. Frontend

- **Übersicht `/ordnungen`** (`src/app/(dashboard)/ordnungen/page.tsx`): Kategorien
  kommen aus der DB statt aus hartem `categories`-Array. Für User mit `ordnungen:manage`
  erscheinen inline: „Neue Ordnung", „Neue Kategorie" sowie Bearbeiten/Löschen an jeder
  Karte bzw. Sektion.
- **Editor:** Wiederverwendung des Markdown-Editor-Patterns aus
  `src/components/modules/module-documents.tsx` (edit/split/preview + Toolbar) in einem
  Modal/Panel. Felder: Titel, Beschreibung, Button-Label, Kategorie (Select), Icon
  (Picker), Inhalt (Markdown).
- **Einzelseite `/ordnungen/[id]`**: lädt per Prisma über den Slug statt aus dem
  Dateisystem; Rendering via bestehendem `renderMarkdown()` bleibt unverändert.
- **Icons:** Kuratierte lucide-Auswahl (~12–16 Icons) als Picker; ein `iconMap` deckt
  genau diese Auswahl ab (statt heute nur `ScrollText`/`FileText`). Kategorie-Farbe über
  vorhandene `src/components/ui/color-field.tsx`.

## 6. Aufräumen

- `src/lib/ordnungen.ts` (`OrdnungConfig` / `normalizeOrdnungConfigs`) wird auf die
  DB-Typen umgestellt (oder durch DB-Query-Helper ersetzt).
- Hardcodiertes `categories`-Array und starrer `iconMap` in `page.tsx` entfallen.
- Alte `/api/ordnungen/config`-Route entfernen oder auf `GET /api/ordnungen` umbiegen.

## Nicht in Scope (YAGNI)

- Sichtbarkeit/Rechte pro einzelner Ordnung (kommt evtl. mit Baustelle 2 „Units").
- Drag & Drop Sortierung (sortOrder existiert im Modell, UI dafür später bei Bedarf).
- Versionierung/Historie der Ordnungs-Inhalte.
