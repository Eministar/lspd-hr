# Ordnungen & Richtlinien System

Dieses System ermöglicht es, zentral mehrere Dienstordnungen und Richtlinien zu verwalten.

## Struktur

```
ordnungen/
├── config.json              # Konfiguration aller Ordnungen
├── sanktionskatalog.md      # Sanktionskatalog (Beispiel)
├── hr-dienstordnung.md      # HR-Dienstordnung (Beispiel)
└── [weitere Ordnungen].md   # Neue Ordnungen hier hinzufügen
```

## Eine neue Ordnung hinzufügen

1. **Markdown-Datei erstellen** in `/ordnungen/` z.B. `dienstordnung-sru.md`
2. **In `config.json` eintragen:**

```json
{
  "id": "sru-dienstordnung",
  "title": "SRU Dienstordnung",
  "description": "Richtlinien für die Special Response Unit",
  "category": "HR",
  "buttonLabel": "SRU-Ordnung",
  "file": "dienstordnung-sru.md",
  "icon": "FileText"
}
```

### Icon-Optionen
- `ScrollText` - Für Kataloge und Listen
- `FileText` - Für Ordnungen und Richtlinien
- (weitere können in `src/app/(dashboard)/ordnungen/page.tsx` hinzugefügt werden)

### Kategorien
Derzeit nur `"HR"`. Neue Kategorien in `src/app/(dashboard)/ordnungen/page.tsx` im `categories`-Array hinzufügen.

## Zugriff

- **Übersicht:** `/ordnungen`
- **Einzelne Ordnung:** `/ordnungen/{id}` (z.B. `/ordnungen/sanktionskatalog`)
- **Von HR-Seite:** Links im Header

## Technische Details

- **Frontend:** `/src/app/(dashboard)/ordnungen/` - Next.js Pages und Components
- **API:** `/src/app/api/ordnungen/config` - Lädt die Konfiguration
- **Server-Side Rendering:** Markdown wird beim Build in HTML konvertiert
- **Markdown-Rendering:** Nutzt `renderMarkdown()` aus `/src/lib/markdown.ts`

## Alte Sanktionskatalog-URL

`/hr/sanktionskatalog` leitet automatisch zu `/ordnungen/sanktionskatalog` weiter.

