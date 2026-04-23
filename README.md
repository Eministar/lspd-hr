# LSPD HR Dashboard

Modernes Personalverwaltungs-Dashboard für das Los Santos Police Department (RP-System).

## Tech Stack

- **Frontend:** Next.js 16 mit App Router
- **Sprache:** TypeScript
- **Styling:** Tailwind CSS 4
- **Datenbank:** PostgreSQL
- **ORM:** Prisma 7
- **Auth:** JWT (Cookie-basiert)
- **UI:** Radix UI, Framer Motion, Lucide Icons

## Setup

### Voraussetzungen

- Node.js 18+
- PostgreSQL Server

### Installation

```bash
# Dependencies installieren
npm install

# .env Datei erstellen
cp .env.example .env
# DATABASE_URL und JWT_SECRET in .env anpassen

# Prisma Client generieren
npm run db:generate

# Datenbank erstellen und Tabellen anlegen
npm run db:push

# Seed-Daten einfügen (Admin-User, Ränge, Ausbildungen, Beispiel-Officers)
npm run db:seed

# Entwicklungsserver starten
npm run dev
```

### Standard-Login

- **Benutzername:** `admin`
- **Passwort:** `admin123`

## Features

- **Dashboard** mit Statistiken und Rangverteilung
- **Officers-Liste** mit Ranggruppierung, Suche, Filter, Inline-Checkboxen
- **Officer-Verwaltung** (Erstellen, Bearbeiten, Kündigen, Löschen, Reaktivieren)
- **Beförderungssystem** mit Historie
- **Kündigungsverwaltung** mit Wiedereinstellung
- **Notizen-System** (global und mitarbeiterbezogen)
- **Admin-Panel** (Ränge, Ausbildungen, Benutzer, Einstellungen)
- **Audit-Log** für alle Aktionen
- **Rollen-System** (Admin, HR, Führungsebene, Read Only)
- **Dark/Light Mode** Umschaltung
- **Responsive Design**

## Scripts

| Script | Beschreibung |
|---|---|
| `npm run dev` | Entwicklungsserver starten |
| `npm run build` | Produktions-Build erstellen |
| `npm run db:generate` | Prisma Client generieren |
| `npm run db:push` | Schema zur Datenbank pushen |
| `npm run db:seed` | Seed-Daten einfügen |
| `npm run db:studio` | Prisma Studio öffnen |
| `npm run db:setup` | DB Push + Seed (Ersteinrichtung) |
