# Migration der bestehenden Units

Die SQL-Migration `prisma/migrations/20260827_group_existing_units/migration.sql`
erstellt Unitgruppen für die bereits vorhandenen Units und verknüpft die bekannten Basis-,
Rang-, Team- und Test-Units über `groupId` inklusive Standard-Sortierung (`sortOrder`).
Die bestehenden Unit- und Officer-Datensätze werden nicht gelöscht oder neu angelegt;
direkte Benutzerzuweisungen bleiben dadurch unverändert erhalten.

Die Gruppen erscheinen mit ihren vorhandenen Fachmodulen in der Navigation.
Leitungs-Unterunits werden für HR, Academy, SRU, Air Support, Detective und
Internal Affairs als `isLeadership` markiert und können dadurch die gemeinsame
Leitungsrolle der Gruppe synchronisieren.

Die SQL-Befehle sind idempotent: `INSERT IGNORE` für Gruppen und bedingte `UPDATE`s
für Units, sodass manuelle Anpassungen nicht überschrieben werden.

## Ausführung

Die SQL-Datei kann direkt über die Datenbankverwaltung (z.B. phpMyAdmin, MySQL CLI oder Plesk)
ausgeführt werden:

```sql
source prisma/migrations/20260827_group_existing_units/migration.sql
```
