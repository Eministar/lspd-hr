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

Die SQL-Schritte sind idempotent: Bereits gesetzte `groupId`-Werte und manuell
angelegte Unitgruppen werden nicht überschrieben. Da der produktive Deploy
`prisma db push` verwendet (und damit SQL-Migrationen nicht automatisch
ausführt), startet der Deploy zusätzlich
`npm run db:backfill-unit-groups`. Der Backfill kann bei Bedarf auch manuell
ausgeführt werden. Nicht erkannte oder später hinzugefügte Units können
weiterhin im Unitgruppen-Editor einsortiert werden.

## Einmalig auf einem bestehenden Server ausführen

Nach dem Pull der aktuellen Version:

```bash
npm ci
npm run db:push
npm run db:backfill-unit-groups
```

Der Backfill ist wiederholbar und verknüpft nur Units ohne `groupId`. Die
Migrationstabelle `_prisma_migrations` muss dafür nicht verwendet werden.
`npx prisma migrate deploy` bleibt in diesem Projekt ungeeignet, solange die
historisch fehlgeschlagene Migration `20260509_user_fk_set_null` nicht separat
geprüft und aufgelöst wurde.
