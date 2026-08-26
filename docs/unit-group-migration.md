# Migration der bestehenden Units

Die Migration `20260827_group_existing_units` erstellt Unitgruppen für die
bereits vorhandenen Units und verknüpft die bekannten Basis-, Rang-, Team- und
Test-Units über `groupId`. Die bestehenden Unit- und Officer-Datensätze werden
nicht gelöscht oder neu angelegt; direkte Benutzerzuweisungen bleiben dadurch
unverändert erhalten.

Die Gruppen erscheinen mit ihren vorhandenen Fachmodulen in der Navigation.
Leitungs-Unterunits werden für HR, Academy, SRU, Air Support, Detective und
Internal Affairs als `isLeadership` markiert und können dadurch die gemeinsame
Leitungsrolle der Gruppe synchronisieren.

Die Schritte sind idempotent: Bereits gesetzte `groupId`-Werte und manuell
angelegte Unitgruppen werden nicht überschrieben. Nach einem vollständig
erfolgreichen Lauf wird in `SystemSetting` der Marker
`migration.unit-groups.v1` gespeichert. Bei späteren Deploys prüft das Script
nur diesen Marker und beendet sich sofort; die Bestands-Units werden nicht
erneut durchlaufen. Schlägt der Lauf ab, bleibt der Marker aus und der nächste
Deploy kann sicher fortsetzen.

Da der produktive Deploy `prisma db push` verwendet (und damit SQL-Migrationen
nicht automatisch ausführt), startet der Deploy zusätzlich
`npm run db:backfill-unit-groups`. Nicht erkannte oder später hinzugefügte Units
können weiterhin im Unitgruppen-Editor einsortiert werden.

## Einmalig auf einem bestehenden Server ausführen

Nach dem Pull der aktuellen Version:

```bash
npm ci
npm run db:push
npm run db:backfill-unit-groups
```

Der Backfill ist standardmäßig einmalig. Für eine bewusst erzwungene erneute
Prüfung (z. B. nach einer ergänzten Zuordnung) kann ein Administrator ausführen:

```bash
npm run db:backfill-unit-groups -- --force
```

Auch bei diesem Lauf werden nur Units ohne `groupId` verknüpft. Die
Migrationstabelle `_prisma_migrations` muss dafür nicht verwendet werden.
`npx prisma migrate deploy` bleibt in diesem Projekt ungeeignet, solange die
historisch fehlgeschlagene Migration `20260509_user_fk_set_null` nicht separat
geprüft und aufgelöst wurde.
