# Tägliche Vollsicherungen

Der Node-Server aktiviert die Sicherung automatisch über `src/instrumentation.ts`, unabhängig von einer Standby-Datenbank. Beim Start wird eine fehlende Sicherung nachgeholt. Anschließend prüft der Job zu jeder vollen Stunde: pro Kalendertag in Europe/Berlin wird einmal erfolgreich gesichert; Fehler werden zur nächsten vollen Stunde erneut versucht. Der Server muss dafür laufen. Bei ausgeschaltetem Server wird nach dem nächsten Start nachgeholt; eine externe Zeitplanung ist für Sicherungen während App-Ausfällen erforderlich.

## Inhalt und Aufbewahrung

- Alle Prisma-Modelle einschließlich Einstellungen, Berechtigungen, Beziehungen, Historie und Failover-Journal. Neue Modelle sind automatisch enthalten.
- Alle lokalen Dateien aus `UPLOAD_DIR` (Standard `uploads/`), einschließlich Unterverzeichnissen.
- Persistenter Zustand aus `FAILOVER_STATE_DIR` (Standard `.failover/`), ohne laufende Locks und temporäre Dateien.
- Vorhandene `.env*`-Dateien, Prisma-Schema, Paketmanifest/Lockfile sowie Start- und IIS-Konfiguration. Nur als Umgebungsvariablen gesetzte Secrets müssen zusätzlich über die Hosting-Plattform gesichert werden.

Die Anwendung sichert ihre aktive Datenbank, im Notbetrieb also Standby. Der Standby-Sync exportiert weiterhin ausdrücklich die Hauptdatenbank.

Standardziel: `.backup/daily/`, konfigurierbar über `BACKUP_DIR`. Dort bleiben 40 tägliche Sicherungen erhalten. Manuelle Backups und Standby-Sync verwenden separat `.backup/` mit ebenfalls 40 Ständen. Ein Stand besteht aus `db-<Zeitstempel>.json` und dem danebenliegenden Ordner `db-<Zeitstempel>.json.files`. **Immer beides zusammen aufbewahren.** `latest.json` verweist im Manifest auf den passenden Dateienordner.

Tabellen werden in einer konsistenten Repeatable-Read-Transaktion gelesen. Datei- und Tabellenfehler brechen die Veröffentlichung ab; die letzte erfolgreiche Sicherung bleibt bestehen. Dateien werden anschließend kopiert und erhalten SHA-256-Prüfsummen. Datenbank und Dateisystem sind keine gemeinsame atomare Momentaufnahme; für eine strikt zeitgleiche Wiederherstellung sollten Schreibzugriffe während eines geplanten Sicherungsfensters pausieren.

Backups enthalten vertrauliche Konfiguration und gehören auf ein privates, dauerhaftes Laufwerk außerhalb des Webroots. Ein lokales Backup schützt nicht gegen den Verlust des gesamten Datenträgers: Das vollständige Backup-Verzeichnis zusätzlich auf einen unabhängigen Sicherungsspeicher replizieren. Quellcode wird weiterhin in Git versioniert; Abhängigkeiten und Build-Caches werden nicht kopiert.

## Prüfen und Wiederherstellen

```powershell
npx tsx scripts/verify-backup.ts --file=.backup/daily/latest.json
npx tsx scripts/verify-backup.ts --file=.backup/daily/latest.json --extract=C:/Recovery/lspd-files
```

Das Extraktionsziel darf noch nicht existieren. Die Prüfung erkennt fehlende/veränderte Dateien und unzulässige Pfade. Nach der Prüfung werden Uploads, Konfiguration und Failover-Dateien in Unterordner extrahiert. Bei einer Wiederherstellung den Server anhalten, die Dateien den konfigurierten Zielverzeichnissen zuordnen und benötigte Umgebungsvariablen der Hosting-Plattform wiederherstellen.

Datenbank zuerst auf ein kompatibles Schema bringen, dann den Snapshot gezielt einspielen. Dieser Befehl **überschreibt die Zieldatenbank**:

```powershell
npx tsx prisma/restore.ts --file=.backup/daily/latest.json --target=primary --yes-overwrite-primary
```

Für vollständige Notfallwiederherstellung kann `--include-journal` ergänzt werden. Im normalen Standby-Sync bleibt das Journal unberührt. Ein Format-3-Snapshot wird einschließlich seiner Dateien vor Beginn des Datenbank-Restores geprüft. Alte Format-1/2-Snapshots bleiben lesbar, enthalten aber keine Dateisicherung.

Administratoren mit `settings:manage` sehen den Tagesstatus in der Kopfzeile. Der letzte Versuch, Erfolg und Fehler liegen in `.backup/daily-status.json`. Bei mehreren Serverprozessen mit gemeinsamem Backup-Verzeichnis verhindert ein Dateilock parallele tägliche Läufe.

Tests: `npx tsx --test scripts/backup.test.ts`.
