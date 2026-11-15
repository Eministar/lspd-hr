# Discord-Rettung ohne Datenbank

Start im Projektordner (Node 22, vorhandene npm-Abhängigkeiten):

```powershell
npm run discord:recover
```

Das Skript liest `DISCORD_BOT_TOKEN` und `DISCORD_GUILD_ID` aus der Umgebung,
`.env.local` oder `.env` (in dieser Priorität); `LSPD_`-Varianten funktionieren ebenfalls.
Nur einen Bot-Token verwenden. Es benötigt keine Datenbank und startet keine App-Synchronisation.
Die normale App erst nach Prüfung der wiederhergestellten Daten synchronisieren:
Der bestehende Clip-Sync kann Channels für nicht vorhandene Officer löschen.

Der Bot benötigt Zugriff auf die gewünschten Channels, View Channel und Read Message History.
Server Members Intent und Message Content Intent im Developer Portal aktivieren.
Manage Threads ermöglicht zusätzliche private Threads; View Audit Log ermöglicht das Audit-Protokoll.
Fehlende Rechte werden protokolliert; andere Channels werden weiter gesichert.

```powershell
npm run discord:recover -- --guild 123456789012345678
npm run discord:recover -- --out D:\Discord-Rettung\lauf-1
```

Standardziel: `.backup/discord-recovery/<Zeitpunkt>/` (bereits Git-ignoriert).
Ein vorhandener Lauf wird nicht überschrieben. Bei Abbruch bleiben bereits geschriebene
JSONL-Seiten und Dateien erhalten; erneut starten erzeugt einen neuen vollständigen Lauf.
Bei hartem Prozessabbruch kann der Abschlussbericht fehlen. `.partial`-Dateien sind nicht vollständig.
Kein Größen-/Nachrichtenlimit; ausreichend Speicher für Videos vorsehen.
Dateidownloads werden ausgelassen und als `ATTACHMENT_FAILED` mit `DISK_RESERVE`
gemeldet, wenn laut freiem Speicher und angegebener Dateigröße weniger als 1 GiB Reserve bliebe.
`--skip-attachments` speichert nur Attachment-Metadaten/URLs und meldet dies als Lücke.

## Ergebnisse

`analysis-*/` enthält zusätzlich getrennte JSONL-Dateien für Personalinfo, Abmeldungen,
Ausbildungen, Rangwechsel, Sanktionen, Kündigungen, Dienstzeiten, Units, Verträge,
Bewerbungen, Probezeiten und Clips. Extrahierte Felder (z. B. Von/Bis/Grund) behalten
den Originaltext und den Quellenlink. Beiträge ehemaliger Mitglieder werden ebenfalls
ausgewertet. Die Kategorien sind Suchhilfen und können sich überschneiden.
Vorhandene Sicherungen lassen sich ohne erneute Discord-Abfragen auswerten:

```powershell
node scripts/analyze-discord-recovery.mjs .backup/discord-recovery/ZEITPUNKT
```

- `REPORT.md`, `report.json`, `issues.jsonl`: tatsächliche Zähler und Lücken mit Fehlercodes.
- `members.jsonl`, `roles.json`, `channels.json`, Thread-Dateien: unveränderte Discord-Daten.
- `officer-candidates.json`: Discord-ID, Rollen, Dienstnummer/Name aus Nickname, Sperrmarker;
  Rang-/Ausbildungsvorschläge über exakte Namensgleichheit mit dem Projekt-Seed.
- `clip-channels.json`: ursprüngliche Officer-ID aus `lspd-officer-clips:` und mögliche Besitzer
  aus individuellen Zugriffsrechten. Mehrere Berechtigte werden nicht automatisch zu Besitzern erklärt.
- `messages/*.jsonl`: vollständige API-Nachrichten mit Embeds, Komponenten, Links und Anhängen.
- `message-evidence.jsonl`: lesbare Nachrichtentexte mit Autor, Zeitpunkt und Discord-Quelllink,
  darunter HR-Meldungen zu Ausbildungen, Beförderungen, Sanktionen, Abmeldungen und Verträgen.
- `attachments/`, `attachments.jsonl`: heruntergeladene Discord-Dateien und Quellenzuordnung.
- `channel-coverage.json`: Nachrichtenanzahl und Paginierungsstatus je Channel.
- `model-coverage.json`: jedes Prisma-Modell mit Wiederherstellungsstatus.

Das Skript schreibt weder auf Discord noch in die Datenbank. Nicknames können gekürzt/veraltet
sein; Rollen-Mappings lagen in der verlorenen DB. Rohrollen bleiben deshalb vollständig erhalten.
Keine automatischen Schlussfolgerungen über Einstellungsdatum, Ausbildungsdatum, inaktive
Mitglieder oder fehlende Ausbildungen. Historische Nachrichten sind Belege, keine automatisch
validierten DB-Einträge. Original-IDs, Beziehungen und nicht veröffentlichte Daten bleiben offen.
Externe Clip-Links werden gesichert, deren Videodateien nicht heruntergeladen.

## Fehlercodes

`DISCORD_READ_FAILED`: API-Aufruf fehlgeschlagen, inklusive HTTP-/Discord-Code.
`MESSAGE_CONTENT_UNVERIFIED`: Vollständigkeit der Nachrichteninhalte nicht bestätigt.
`ATTACHMENT_FAILED` / `ATTACHMENT_SKIPPED`: Datei nicht lokal gesichert.
`ATTACHMENT_SIZE_VARIANT`: CDN-Datei gespeichert, Größe weicht von Discord-Metadaten ab;
Discord kann Bilder in einem anderen Format liefern. Gelieferte Größe und Content-Type stehen im Manifest.
`PAGINATION_STALLED`: unvollständige Paginierung.
`ROLE_MAPPING_REVIEW` / `IDENTITY_REVIEW`: Zuordnung muss geprüft werden.
`HISTORY_NOT_COMPLETE`: gelöschte/unerreichbare Historie und externe Dateien.
`DB_ONLY_DATA` / `DB_RECORDS_NOT_RECONSTRUCTED`: DB-Inhalte nicht verlässlich wiederhergestellt.
`RUN_FAILED`: Lauf vorzeitig beendet; vorhandene Rohdaten bleiben erhalten.

API-Grundlagen: [Mitglieder](https://docs.discord.com/developers/resources/guild#list-guild-members),
[Nachrichten](https://docs.discord.com/developers/resources/message#get-channel-messages),
[Threads](https://docs.discord.com/developers/resources/channel#list-public-archived-threads).

## Datenbank-Nachtrag aus Discord

`scripts/import-discord-recovery.mjs` ergänzt eine bereits aus dem vollständigen
DB-Backup wiederhergestellte Datenbank. Es verwendet die damaligen Rollen-Mappings,
vertrauenswürdige Bot-Nachrichten nach dem Backup-Zeitpunkt, aktuelle Mitglieder,
Clip-IDs und Namensänderungen aus dem Audit-Protokoll. Zugangsdaten kommen aus
`DATABASE_URL` in der Umgebung bzw. `.env`; kein automatischer Standby-Wechsel.

```powershell
npm run discord:import -- --snapshot .backup/DB-BACKUP.json --recovery .backup/discord-recovery/ZEITPUNKT --out .backup/import-pruefung
```

Ohne `--apply` wird ausschließlich ein lokaler Plan geschrieben. Mit `--apply`
werden zuvor alle Tabellen lokal gesichert und anschließend die Änderungen in
einer Datenbanktransaktion übernommen. Die stabilen Discord-Nachrichten-IDs verhindern
doppelte Historieneinträge beim erneuten Import. Parallel geänderte Officer-Zeilen
brechen die Transaktion ab. Keine Discord-Schreibzugriffe werden ausgelöst.

Die Anwendung kann selbst nach einem Restore automatische Änderungen ausführen.
Beim Wiederherstellen großer Altbestände sollten solche Prozesse für den geplanten
Wartungszeitraum angehalten werden. Das Importscript selbst startet sie nicht.

Abmeldungen ohne expliziten Beginn verwenden die Nachrichtenzeit und sind durch
`source=discord-recovery-start-inferred` gekennzeichnet. Aktueller Rang, Nickname und
personengebundener Clip-Channel können eine erneute aktive Mitgliedschaft belegen;
solche Statusableitungen stehen im Plan unter `STATUS_FROM_CURRENT_DISCORD`.
Unaufgelöste Ereignisse bleiben als Notizen mit Quellenlink erhalten. Ein Vermerk
über einen unterschriebenen Vertrag ersetzt kein fehlendes Vertragsdokument.
Die Dateien `plan.json` und `result.json` enthalten alle offenen Zuordnungen.
