/**
 * OpenAPI 3.1 Specification für die LSPD HR Public API.
 *
 * Diese Spec ist manuell kuratiert (nicht auto-generiert), damit die Docs
 * wirklich gut sind: aussagekräftige Beschreibungen, Beispiele, Fehlerszenarien.
 *
 * Wenn du Endpoints änderst: bitte auch hier spiegeln.
 */

import { PERMISSIONS } from './permissions'

export const API_VERSION = '1.0.0'
export const API_BASE_PATH = '/api'

export interface ParamSpec {
  name: string
  in: 'path' | 'query' | 'header'
  required?: boolean
  description: string
  schema: { type: string; enum?: string[]; format?: string; example?: unknown }
}

export interface FieldSpec {
  name: string
  type: string
  required: boolean
  description: string
  example?: unknown
  enumValues?: string[]
}

export interface EndpointSpec {
  id: string
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  path: string
  summary: string
  description?: string
  category: string
  scope?: string
  body?: { description: string; fields: FieldSpec[] }
  params?: ParamSpec[]
  responseFields?: FieldSpec[]
  responseExample?: unknown
  exampleRequest?: string
  notes?: string[]
}

export const ENDPOINTS: EndpointSpec[] = [
  // ============ Officers ============
  {
    id: 'list-officers',
    method: 'GET',
    path: '/officers',
    category: 'Officers',
    summary: 'Officers auflisten',
    description:
      'Liefert alle Officers (ausgenommen `TERMINATED` standardmäßig). Unterstützt Volltextsuche und Filter. Liefert zusätzlich das Flag, ob der Officer in der Discord-Gilde ist.',
    scope: 'officers:view',
    params: [
      { name: 'search', in: 'query', description: 'Volltextsuche (Vor-/Nachname, Dienstnummer, Discord-ID).', schema: { type: 'string' } },
      { name: 'status', in: 'query', description: 'Status-Filter (ACTIVE, AWAY, INACTIVE, TERMINATED).', schema: { type: 'string', enum: ['ACTIVE', 'AWAY', 'INACTIVE', 'TERMINATED'] } },
      { name: 'rankId', in: 'query', description: 'Filter auf Rang-ID.', schema: { type: 'string' } },
    ],
    responseFields: [
      { name: 'id', type: 'string', required: true, description: 'Officer-ID' },
      { name: 'badgeNumber', type: 'string', required: true, description: 'Dienstnummer' },
      { name: 'firstName', type: 'string', required: true, description: 'Vorname' },
      { name: 'lastName', type: 'string', required: true, description: 'Nachname' },
      { name: 'rank', type: 'Rank', required: true, description: 'Aktueller Rang (eingebettet)' },
      { name: 'status', type: 'OfficerStatus', required: true, description: 'Status' },
      { name: 'discordId', type: 'string | null', required: true, description: 'Discord-Snowflake' },
      { name: 'unit', type: 'string | null', required: true, description: 'Primäre Unit' },
      { name: 'units', type: 'string[]', required: false, description: 'Alle zugewiesenen Units' },
      { name: 'flag', type: 'OfficerFlag | null', required: true, description: 'Optionales Flag' },
      { name: 'discordMember.inGuild', type: 'boolean', required: false, description: 'Ob der Officer aktuell in der Discord-Gilde ist' },
      { name: 'trainings', type: 'OfficerTraining[]', required: false, description: 'Ausbildungsstatus' },
    ],
  },
  {
    id: 'create-officer',
    method: 'POST',
    path: '/officers',
    category: 'Officers',
    summary: 'Officer anlegen',
    description:
      'Legt einen neuen Officer an. Wenn keine `badgeNumber` übergeben wird, wird automatisch die nächste freie Nummer im Bereich des Rangs vergeben.',
    scope: 'officers:write',
    body: {
      description: 'Officer-Daten',
      fields: [
        { name: 'firstName', type: 'string', required: true, description: 'Vorname' },
        { name: 'lastName', type: 'string', required: true, description: 'Nachname' },
        { name: 'rankId', type: 'string', required: true, description: 'Rang-ID' },
        { name: 'badgeNumber', type: 'string', required: false, description: 'Dienstnummer (optional, sonst automatisch)' },
        { name: 'discordId', type: 'string', required: false, description: 'Discord-Snowflake' },
        { name: 'unit', type: 'string', required: false, description: 'Primäre Unit (Legacy)' },
        { name: 'units', type: 'string[]', required: false, description: 'Unit-Keys' },
        { name: 'flag', type: 'OfficerFlag', required: false, description: 'RED, ORANGE, YELLOW, BLUE', enumValues: ['RED', 'ORANGE', 'YELLOW', 'BLUE'] },
        { name: 'status', type: 'OfficerStatus', required: false, description: 'Default: ACTIVE' },
        { name: 'notes', type: 'string', required: false, description: 'Interne Notizen' },
        { name: 'hireDate', type: 'string', required: false, description: 'Einstellungsdatum (ISO-8601)' },
      ],
    },
    responseExample: { id: 'ckxxx', badgeNumber: '1234', firstName: 'Max', lastName: 'Muster', rank: { id: 'r1', name: 'Officer I' } },
    notes: [
      'Löst automatisch eine Discord-Statusaktualisierung und einen "Neuer Beitritt"-Event aus.',
      'Erstellt OfficerTraining-Rows für alle Trainings, die der neue Rang erfüllt.',
    ],
  },
  {
    id: 'get-officer',
    method: 'GET',
    path: '/officers/{id}',
    category: 'Officers',
    summary: 'Officer abrufen',
    description: 'Liefert einen einzelnen Officer inkl. Rang und Ausbildungen.',
    scope: 'officers:view',
    params: [{ name: 'id', in: 'path', required: true, description: 'Officer-ID', schema: { type: 'string' } }],
  },
  {
    id: 'update-officer',
    method: 'PATCH',
    path: '/officers/{id}',
    category: 'Officers',
    summary: 'Officer aktualisieren',
    description: 'Aktualisiert Felder eines Officers. Nur die übermittelten Felder werden geändert.',
    scope: 'officers:write',
    params: [{ name: 'id', in: 'path', required: true, description: 'Officer-ID', schema: { type: 'string' } }],
  },
  {
    id: 'delete-officer',
    method: 'DELETE',
    path: '/officers/{id}',
    category: 'Officers',
    summary: 'Officer löschen',
    description: 'Löscht einen Officer (Hard-Delete). Empfohlen ist `POST /terminations` für saubere Kündigungen.',
    scope: 'officers:delete',
    params: [{ name: 'id', in: 'path', required: true, description: 'Officer-ID', schema: { type: 'string' } }],
  },
  {
    id: 'officer-timeline',
    method: 'GET',
    path: '/officers/{id}/timeline',
    category: 'Officers',
    summary: 'Officer-Timeline',
    description: 'Vollständige Historie: Beförderungen, Kündigungen, Notizen, Audit-Logs.',
    scope: 'officers:view',
    params: [{ name: 'id', in: 'path', required: true, description: 'Officer-ID', schema: { type: 'string' } }],
  },
  {
    id: 'officer-trainings',
    method: 'GET',
    path: '/officers/{id}/trainings',
    category: 'Trainings',
    summary: 'Ausbildungen eines Officers',
    description: 'Liefert alle Ausbildungen inkl. Status (completed).',
    scope: 'officers:view',
    params: [{ name: 'id', in: 'path', required: true, description: 'Officer-ID', schema: { type: 'string' } }],
  },
  {
    id: 'update-officer-trainings',
    method: 'PUT',
    path: '/officers/{id}/trainings',
    category: 'Trainings',
    summary: 'Ausbildungen setzen',
    description: 'Überschreibt den Ausbildungsstatus eines Officers.',
    scope: 'officer-trainings:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Officer-ID', schema: { type: 'string' } }],
    body: {
      description: 'Trainings-Update',
      fields: [
        { name: 'trainings', type: 'Array<{ trainingId: string, completed: boolean }>', required: true, description: 'Vollständige Liste der Ausbildungen' },
      ],
    },
  },
  {
    id: 'move-officer',
    method: 'POST',
    path: '/officers/{id}/move',
    category: 'Officers',
    summary: 'Officer in Unit verschieben',
    description: 'Setzt die primäre Unit eines Officers.',
    scope: 'officers:write',
    params: [{ name: 'id', in: 'path', required: true, description: 'Officer-ID', schema: { type: 'string' } }],
    body: {
      description: 'Move-Operation',
      fields: [
        { name: 'unitKey', type: 'string', required: true, description: 'Unit-Key' },
      ],
    },
  },

  // ============ Ranks ============
  {
    id: 'list-ranks',
    method: 'GET',
    path: '/ranks',
    category: 'Ranks',
    summary: 'Ränge auflisten',
    description: 'Alle Ränge sortiert nach `sortOrder`.',
    scope: 'ranks:view',
  },
  {
    id: 'create-rank',
    method: 'POST',
    path: '/ranks',
    category: 'Ranks',
    summary: 'Rang anlegen',
    description: 'Erstellt einen neuen Rang.',
    scope: 'ranks:manage',
    body: {
      description: 'Rang-Daten',
      fields: [
        { name: 'name', type: 'string', required: true, description: 'Anzeigename (eindeutig)' },
        { name: 'sortOrder', type: 'integer', required: true, description: 'Sortierung (kleinere Zahl = niedriger)' },
        { name: 'color', type: 'string', required: false, description: 'Hex-Farbe (Default: #3B82F6)' },
        { name: 'badgeMin', type: 'integer', required: false, description: 'Inklusive Untergrenze für Dienstnummern' },
        { name: 'badgeMax', type: 'integer', required: false, description: 'Inklusive Obergrenze' },
      ],
    },
  },
  {
    id: 'update-rank',
    method: 'PATCH',
    path: '/ranks/{id}',
    category: 'Ranks',
    summary: 'Rang aktualisieren',
    scope: 'ranks:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Rang-ID', schema: { type: 'string' } }],
  },
  {
    id: 'delete-rank',
    method: 'DELETE',
    path: '/ranks/{id}',
    category: 'Ranks',
    summary: 'Rang löschen',
    scope: 'ranks:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Rang-ID', schema: { type: 'string' } }],
  },

  // ============ Trainings ============
  {
    id: 'list-trainings',
    method: 'GET',
    path: '/trainings',
    category: 'Trainings',
    summary: 'Ausbildungen auflisten',
    description: 'Alle verfügbaren Ausbildungen mit Mindest-Rang.',
    scope: 'trainings:view',
  },
  {
    id: 'create-training',
    method: 'POST',
    path: '/trainings',
    category: 'Trainings',
    summary: 'Ausbildung anlegen',
    scope: 'trainings:manage',
    body: {
      description: 'Ausbildung',
      fields: [
        { name: 'key', type: 'string', required: true, description: 'Stabiler Schlüssel' },
        { name: 'label', type: 'string', required: true, description: 'Anzeigename' },
        { name: 'sortOrder', type: 'integer', required: false, description: 'Sortierung' },
        { name: 'minRankId', type: 'string', required: false, description: 'Mindest-Rang-ID' },
      ],
    },
  },
  {
    id: 'update-training',
    method: 'PATCH',
    path: '/trainings/{id}',
    category: 'Trainings',
    summary: 'Ausbildung aktualisieren',
    scope: 'trainings:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Ausbildungs-ID', schema: { type: 'string' } }],
  },
  {
    id: 'delete-training',
    method: 'DELETE',
    path: '/trainings/{id}',
    category: 'Trainings',
    summary: 'Ausbildung löschen',
    scope: 'trainings:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Ausbildungs-ID', schema: { type: 'string' } }],
  },

  // ============ Units ============
  {
    id: 'list-units',
    method: 'GET',
    path: '/units',
    category: 'Units',
    summary: 'Units auflisten',
    scope: 'units:view',
  },
  {
    id: 'create-unit',
    method: 'POST',
    path: '/units',
    category: 'Units',
    summary: 'Unit anlegen',
    scope: 'units:manage',
    body: {
      description: 'Unit',
      fields: [
        { name: 'key', type: 'string', required: true, description: 'Stabiler Schlüssel' },
        { name: 'name', type: 'string', required: true, description: 'Anzeigename' },
        { name: 'color', type: 'string', required: false, description: 'Hex-Farbe' },
        { name: 'sortOrder', type: 'integer', required: false, description: 'Sortierung' },
      ],
    },
  },
  {
    id: 'update-unit',
    method: 'PATCH',
    path: '/units/{id}',
    category: 'Units',
    summary: 'Unit aktualisieren',
    scope: 'units:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Unit-ID', schema: { type: 'string' } }],
  },
  {
    id: 'delete-unit',
    method: 'DELETE',
    path: '/units/{id}',
    category: 'Units',
    summary: 'Unit löschen',
    scope: 'units:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Unit-ID', schema: { type: 'string' } }],
  },

  // ============ Sanctions ============
  {
    id: 'create-sanction',
    method: 'POST',
    path: '/sanctions',
    category: 'Sanctions',
    summary: 'Sanktion ausstellen',
    description:
      'Stellt eine neue Sanktion aus. Die Frist berechnet sich aus `deadlineDays`. Discord-Statusaktualisierung erfolgt automatisch.',
    scope: 'sanctions:manage',
    body: {
      description: 'Sanktion',
      fields: [
        { name: 'officerId', type: 'string', required: true, description: 'Officer-ID' },
        { name: 'reason', type: 'string', required: true, description: 'Begründung' },
        { name: 'penalGrade', type: 'string', required: true, description: 'Penal Grade (z. B. A, B, C, D, E, F)', enumValues: ['A', 'B', 'C', 'D', 'E', 'F'] },
        { name: 'deadlineDays', type: 'integer', required: true, description: 'Frist in Tagen (1–365)' },
      ],
    },
  },
  {
    id: 'update-sanction',
    method: 'PATCH',
    path: '/sanctions/{id}',
    category: 'Sanctions',
    summary: 'Sanktion aktualisieren',
    description: 'Status ändern (z. B. PAID, ESCALATED).',
    scope: 'sanctions:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Sanktion-ID', schema: { type: 'string' } }],
  },

  // ============ Promotions / Demotions ============
  {
    id: 'list-promotions',
    method: 'GET',
    path: '/promotions',
    category: 'Promotions',
    summary: 'Beförderungs-Historie',
    description: 'Alle Beförderungen in der Historie (Pagination optional).',
    scope: 'rank-changes:view',
  },
  {
    id: 'list-rank-change-lists',
    method: 'GET',
    path: '/rank-change-lists',
    category: 'Promotions',
    summary: 'Beförderungs-/Degradierungslisten',
    description: 'Drafts und abgeschlossene Listen.',
    scope: 'rank-changes:view',
  },
  {
    id: 'create-rank-change-list',
    method: 'POST',
    path: '/rank-change-lists',
    category: 'Promotions',
    summary: 'Liste erstellen',
    description: 'Erstellt eine neue Beförderungs- oder Degradierungsliste (Draft).',
    scope: 'rank-changes:manage',
    body: {
      description: 'Liste',
      fields: [
        { name: 'name', type: 'string', required: true, description: 'Name der Liste' },
        { name: 'description', type: 'string', required: false, description: 'Beschreibung' },
        { name: 'type', type: 'string', required: true, description: 'PROMOTION oder DEMOTION', enumValues: ['PROMOTION', 'DEMOTION'] },
      ],
    },
  },
  {
    id: 'add-rank-change-entry',
    method: 'POST',
    path: '/rank-change-lists/{id}/entries',
    category: 'Promotions',
    summary: 'Eintrag zur Liste hinzufügen',
    scope: 'rank-changes:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Listen-ID', schema: { type: 'string' } }],
    body: {
      description: 'Eintrag',
      fields: [
        { name: 'officerId', type: 'string', required: true, description: 'Officer-ID' },
        { name: 'proposedRankId', type: 'string', required: true, description: 'Neuer Rang' },
        { name: 'newBadgeNumber', type: 'string', required: false, description: 'Neue Dienstnummer (optional)' },
        { name: 'note', type: 'string', required: false, description: 'Notiz' },
      ],
    },
  },
  {
    id: 'execute-rank-change-list',
    method: 'POST',
    path: '/rank-change-lists/{id}/execute',
    category: 'Promotions',
    summary: 'Liste ausführen',
    description: 'Führt alle Einträge der Liste aus — Beförderungen werden in `PromotionLog` geschrieben.',
    scope: 'rank-change-lists:execute',
    params: [{ name: 'id', in: 'path', required: true, description: 'Listen-ID', schema: { type: 'string' } }],
  },
  {
    id: 'undo-rank-change-entry',
    method: 'POST',
    path: '/rank-change-lists/{id}/entries/{entryId}/undo',
    category: 'Promotions',
    summary: 'Eintrag rückgängig',
    description: 'Macht eine bereits ausgeführte Beförderung/Degradierung rückgängig.',
    scope: 'rank-change-lists:execute',
    params: [
      { name: 'id', in: 'path', required: true, description: 'Listen-ID', schema: { type: 'string' } },
      { name: 'entryId', in: 'path', required: true, description: 'Eintrags-ID', schema: { type: 'string' } },
    ],
  },

  // ============ Terminations ============
  {
    id: 'list-terminations',
    method: 'GET',
    path: '/terminations',
    category: 'Terminations',
    summary: 'Kündigungen auflisten',
    scope: 'terminations:view',
  },
  {
    id: 'create-termination',
    method: 'POST',
    path: '/terminations',
    category: 'Terminations',
    summary: 'Officer kündigen',
    description: 'Setzt Officer auf `TERMINATED` und schreibt einen Termination-Eintrag.',
    scope: 'terminations:manage',
    body: {
      description: 'Kündigung',
      fields: [
        { name: 'officerId', type: 'string', required: true, description: 'Officer-ID' },
        { name: 'reason', type: 'string', required: true, description: 'Kündigungsgrund' },
      ],
    },
  },

  // ============ Probations ============
  {
    id: 'list-probations',
    method: 'GET',
    path: '/probations',
    category: 'Probations',
    summary: 'Probezeiten auflisten',
    scope: 'probations:view',
  },
  {
    id: 'create-probation',
    method: 'POST',
    path: '/probations',
    category: 'Probations',
    summary: 'Probezeit anlegen',
    scope: 'probations:manage',
  },
  {
    id: 'update-probation',
    method: 'PATCH',
    path: '/probations/{id}',
    category: 'Probations',
    summary: 'Probezeit aktualisieren / entscheiden',
    description: 'Setzt Status (PASSED / FAILED / EXTENDED) und optional `resultNote`.',
    scope: 'probations:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Probezeit-ID', schema: { type: 'string' } }],
  },

  // ============ Calendar ============
  {
    id: 'list-calendar-events',
    method: 'GET',
    path: '/calendar-events',
    category: 'Calendar',
    summary: 'Kalender-Events auflisten',
    scope: 'calendar:view',
  },
  {
    id: 'create-calendar-event',
    method: 'POST',
    path: '/calendar-events',
    category: 'Calendar',
    summary: 'Kalender-Event anlegen',
    scope: 'calendar:manage',
  },
  {
    id: 'update-calendar-event',
    method: 'PATCH',
    path: '/calendar-events/{id}',
    category: 'Calendar',
    summary: 'Kalender-Event aktualisieren',
    scope: 'calendar:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Event-ID', schema: { type: 'string' } }],
  },
  {
    id: 'delete-calendar-event',
    method: 'DELETE',
    path: '/calendar-events/{id}',
    category: 'Calendar',
    summary: 'Kalender-Event löschen',
    scope: 'calendar:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Event-ID', schema: { type: 'string' } }],
  },

  // ============ Duty Times ============
  {
    id: 'list-duty-times',
    method: 'GET',
    path: '/duty-times',
    category: 'Duty Times',
    summary: 'Dienstzeiten auflisten',
    description: 'Aktive und vergangene Dienst-Shifts.',
    scope: 'duty-times:view',
  },
  {
    id: 'duty-time-discord-message',
    method: 'POST',
    path: '/duty-times/discord-message',
    category: 'Duty Times',
    summary: 'Discord-Message triggern',
    description: 'Löst eine Discord-Aktualisierungs-Message für eine Dienst-Session aus.',
    scope: 'duty-times:manage',
  },

  // ============ Absences ============
  {
    id: 'list-absences',
    method: 'GET',
    path: '/absences',
    category: 'Absences',
    summary: 'Abwesenheiten auflisten',
    scope: 'officers:view',
  },
  {
    id: 'create-absence',
    method: 'POST',
    path: '/absences',
    category: 'Absences',
    summary: 'Abwesenheit anlegen',
    scope: 'officers:write',
  },
  {
    id: 'update-absence',
    method: 'PATCH',
    path: '/absences/{id}',
    category: 'Absences',
    summary: 'Abwesenheit aktualisieren',
    scope: 'officers:write',
    params: [{ name: 'id', in: 'path', required: true, description: 'Abwesenheits-ID', schema: { type: 'string' } }],
  },
  {
    id: 'delete-absence',
    method: 'DELETE',
    path: '/absences/{id}',
    category: 'Absences',
    summary: 'Abwesenheit löschen',
    scope: 'officers:write',
    params: [{ name: 'id', in: 'path', required: true, description: 'Abwesenheits-ID', schema: { type: 'string' } }],
  },

  // ============ Notes ============
  {
    id: 'list-notes',
    method: 'GET',
    path: '/notes',
    category: 'Notes',
    summary: 'Notizen auflisten',
    scope: 'notes:view',
  },
  {
    id: 'create-note',
    method: 'POST',
    path: '/notes',
    category: 'Notes',
    summary: 'Notiz anlegen',
    scope: 'notes:manage',
  },
  {
    id: 'update-note',
    method: 'PATCH',
    path: '/notes/{id}',
    category: 'Notes',
    summary: 'Notiz aktualisieren',
    scope: 'notes:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Notiz-ID', schema: { type: 'string' } }],
  },
  {
    id: 'delete-note',
    method: 'DELETE',
    path: '/notes/{id}',
    category: 'Notes',
    summary: 'Notiz löschen',
    scope: 'notes:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Notiz-ID', schema: { type: 'string' } }],
  },

  // ============ Tasks ============
  {
    id: 'list-task-lists',
    method: 'GET',
    path: '/task-lists',
    category: 'Tasks',
    summary: 'Task-Listen auflisten',
    scope: 'academy:view',
  },
  {
    id: 'create-task-list',
    method: 'POST',
    path: '/task-lists',
    category: 'Tasks',
    summary: 'Task-Liste anlegen',
    scope: 'academy:manage',
  },
  {
    id: 'list-tasks',
    method: 'GET',
    path: '/task-lists/{id}/tasks',
    category: 'Tasks',
    summary: 'Tasks einer Liste',
    scope: 'academy:view',
    params: [{ name: 'id', in: 'path', required: true, description: 'Task-Listen-ID', schema: { type: 'string' } }],
  },
  {
    id: 'create-task',
    method: 'POST',
    path: '/task-lists/{id}/tasks',
    category: 'Tasks',
    summary: 'Task anlegen',
    scope: 'academy:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Task-Listen-ID', schema: { type: 'string' } }],
  },
  {
    id: 'update-task',
    method: 'PATCH',
    path: '/tasks/{id}',
    category: 'Tasks',
    summary: 'Task aktualisieren',
    scope: 'academy:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Task-ID', schema: { type: 'string' } }],
  },
  {
    id: 'delete-task',
    method: 'DELETE',
    path: '/tasks/{id}',
    category: 'Tasks',
    summary: 'Task löschen',
    scope: 'academy:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Task-ID', schema: { type: 'string' } }],
  },
  {
    id: 'assign-task',
    method: 'POST',
    path: '/tasks/{id}/assignees',
    category: 'Tasks',
    summary: 'Task zuweisen',
    scope: 'academy:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Task-ID', schema: { type: 'string' } }],
    body: { description: 'Assignee', fields: [{ name: 'officerId', type: 'string', required: true, description: 'Officer-ID' }] },
  },

  // ============ SRU ============
  {
    id: 'list-sru-folders',
    method: 'GET',
    path: '/sru/folders',
    category: 'SRU',
    summary: 'SRU-Ordner auflisten',
    scope: 'sru:view',
  },
  {
    id: 'create-sru-folder',
    method: 'POST',
    path: '/sru/folders',
    category: 'SRU',
    summary: 'SRU-Ordner anlegen',
    scope: 'sru:manage',
  },
  {
    id: 'list-sru-documents',
    method: 'GET',
    path: '/sru/documents',
    category: 'SRU',
    summary: 'SRU-Dokumente auflisten',
    scope: 'sru:view',
  },
  {
    id: 'create-sru-document',
    method: 'POST',
    path: '/sru/documents',
    category: 'SRU',
    summary: 'SRU-Dokument anlegen',
    scope: 'sru:manage',
  },
  {
    id: 'update-sru-document',
    method: 'PATCH',
    path: '/sru/documents/{id}',
    category: 'SRU',
    summary: 'SRU-Dokument aktualisieren',
    scope: 'sru:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Dokument-ID', schema: { type: 'string' } }],
  },
  {
    id: 'delete-sru-document',
    method: 'DELETE',
    path: '/sru/documents/{id}',
    category: 'SRU',
    summary: 'SRU-Dokument löschen',
    scope: 'sru:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Dokument-ID', schema: { type: 'string' } }],
  },

  // ============ Patrol Board ============
  {
    id: 'list-patrol-boards',
    method: 'GET',
    path: '/patrol-boards',
    category: 'Patrol Board',
    summary: 'Streifenboards auflisten',
    scope: 'patrol-board:view',
  },
  {
    id: 'create-patrol-board',
    method: 'POST',
    path: '/patrol-boards',
    category: 'Patrol Board',
    summary: 'Streifenboard anlegen',
    scope: 'patrol-board:manage',
  },
  {
    id: 'update-patrol-board',
    method: 'PATCH',
    path: '/patrol-boards/{id}',
    category: 'Patrol Board',
    summary: 'Streifenboard aktualisieren',
    scope: 'patrol-board:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Board-ID', schema: { type: 'string' } }],
  },

  // ============ Admin / Misc ============
  {
    id: 'list-badge-blacklist',
    method: 'GET',
    path: '/badge-blacklist',
    category: 'Admin',
    summary: 'Dienstnummern-Blacklist',
    scope: 'ranks:manage',
  },
  {
    id: 'add-badge-blacklist',
    method: 'POST',
    path: '/badge-blacklist',
    category: 'Admin',
    summary: 'Dienstnummer blacklisten',
    scope: 'ranks:manage',
  },
  {
    id: 'audit-logs',
    method: 'GET',
    path: '/audit-logs',
    category: 'Admin',
    summary: 'Audit-Logs',
    description: 'Vollständiges Protokoll aller Mutationen. Für externe Systeme empfohlen.',
    scope: 'logs:view',
  },
  {
    id: 'stats',
    method: 'GET',
    path: '/stats',
    category: 'Admin',
    summary: 'Kennzahlen',
    description: 'Aggregierte Statistiken für das Dashboard.',
    scope: 'dashboard:view',
  },
  {
    id: 'exports',
    method: 'GET',
    path: '/exports',
    category: 'Admin',
    summary: 'Daten-Exporte',
    scope: 'exports:view',
  },

  // ============ User Groups & Users ============
  {
    id: 'list-user-groups',
    method: 'GET',
    path: '/user-groups',
    category: 'Users',
    summary: 'Benutzergruppen auflisten',
    scope: 'groups:manage',
  },
  {
    id: 'create-user-group',
    method: 'POST',
    path: '/user-groups',
    category: 'Users',
    summary: 'Benutzergruppe anlegen',
    scope: 'groups:manage',
  },
  {
    id: 'update-user-group',
    method: 'PATCH',
    path: '/user-groups/{id}',
    category: 'Users',
    summary: 'Benutzergruppe aktualisieren',
    scope: 'groups:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Gruppen-ID', schema: { type: 'string' } }],
  },
  {
    id: 'delete-user-group',
    method: 'DELETE',
    path: '/user-groups/{id}',
    category: 'Users',
    summary: 'Benutzergruppe löschen',
    scope: 'groups:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Gruppen-ID', schema: { type: 'string' } }],
  },
  {
    id: 'list-users',
    method: 'GET',
    path: '/users',
    category: 'Users',
    summary: 'Benutzer auflisten',
    scope: 'users:manage',
  },
  {
    id: 'lookup-user-by-discord',
    method: 'GET',
    path: '/users/by-discord/{discordId}',
    category: 'Users',
    summary: 'Benutzer per Discord-ID nachschlagen',
    description:
      'Liefert User-Infos + effektive Permissions für eine Discord-Snowflake. ' +
      'Nützlich, um vorab zu prüfen, welche Rechte ein User hat, bevor man ihn via ' +
      '`X-Discord-Id` Header an einen Request hängt.',
    params: [
      {
        name: 'discordId',
        in: 'path',
        required: true,
        description: 'Discord-Snowflake (17–22 Ziffern)',
        schema: { type: 'string', example: '123456789012345678' },
      },
    ],
    responseFields: [
      { name: 'id', type: 'string', required: true, description: 'User-ID' },
      { name: 'discordId', type: 'string', required: true, description: 'Discord-Snowflake' },
      { name: 'username', type: 'string', required: true, description: 'Username' },
      { name: 'displayName', type: 'string', required: true, description: 'Anzeigename' },
      { name: 'discordUsername', type: 'string', required: false, description: 'Aktueller Discord-Username' },
      { name: 'discordGlobalName', type: 'string', required: false, description: 'Discord Global-Name' },
      { name: 'avatarUrl', type: 'string', required: false, description: 'Discord-Avatar-URL' },
      { name: 'lastLoginAt', type: 'string | null', required: false, description: 'Letzter Login' },
      { name: 'groups', type: 'Array<{ id, name }>', required: true, description: 'Benutzergruppen' },
      { name: 'permissions', type: 'Permission[]', required: true, description: 'Effektive Permissions (expandiert implizite Rechte)' },
    ],
    notes: [
      'Auth: jeder authentifizierte Aufrufer (Cookie oder Bearer-Token) — keine zusätzliche Permission nötig.',
      'Liefert `404`, wenn kein User mit dieser Discord-ID existiert.',
    ],
  },
  {
    id: 'discord-id-impersonation',
    method: 'GET',
    path: '/officers',
    category: 'Auth',
    summary: '🔀 Discord-ID-Impersonation (X-Discord-Id Header)',
    description:
      'Wenn ein API-Token-Request den `X-Discord-Id` Header trägt, werden die ' +
      'effektiven Rechte auf die **Schnittmenge** aus Token-Scopes und den Rechten ' +
      'des impersonierten Users beschränkt. Der User-Audit-Log-Eintrag zeigt den ' +
      'impersonierten User als Aktor; die `details` enthalten zusätzlich Token-Name ' +
      'und Discord-ID des Aufrufers.\n\n' +
      '**Sicherheit:** Die effektiven Rechte sind `min(Token-Scopes, User-Permissions)`. ' +
      'Ein Token kann also nie mehr Rechte ausüben, als der impersonierte User tatsächlich hat. ' +
      'Umgekehrt werden Rechte, die der User hat, aber der Token nicht, ebenfalls blockiert.',
    notes: [
      'Funktioniert nur, wenn ein gültiger Bearer-Token + `X-Discord-Id` Header gesetzt sind.',
      'Wenn die Discord-ID im Dashboard unbekannt ist, gibt der Server `401` zurück.',
      'Kombiniere mit `GET /api/users/by-discord/{discordId}`, um vorab die effektiven Rechte zu prüfen.',
    ],
  },

  // ============ API Tokens ============
  {
    id: 'list-api-tokens',
    method: 'GET',
    path: '/api-tokens',
    category: 'API Tokens',
    summary: 'Eigene API-Tokens auflisten',
    description: 'Liefert alle Tokens, die du erstellt hast.',
    scope: 'groups:manage',
  },
  {
    id: 'create-api-token',
    method: 'POST',
    path: '/api-tokens',
    category: 'API Tokens',
    summary: 'API-Token erstellen',
    description:
      'Erstellt einen neuen API-Token. Der Klartext-Token wird EINMALIG im Response zurückgegeben — sicher speichern!',
    scope: 'groups:manage',
    body: {
      description: 'Token-Konfiguration',
      fields: [
        { name: 'name', type: 'string', required: true, description: 'Anzeigename' },
        { name: 'scopes', type: 'Permission[]', required: false, description: 'Berechtigungs-Whitelist (leer = alle eigenen Rechte)' },
        { name: 'expiresAt', type: 'string', required: false, description: 'Ablaufdatum (ISO-8601)' },
      ],
    },
    responseFields: [
      { name: 'plaintext', type: 'string', required: true, description: 'Klartext-Token — NUR DIESE EINE ANTWORT enthält ihn!' },
      { name: 'id', type: 'string', required: true, description: 'Token-ID' },
      { name: 'prefix', type: 'string', required: true, description: 'Erste Zeichen zur Identifikation' },
    ],
  },
  {
    id: 'revoke-api-token',
    method: 'DELETE',
    path: '/api-tokens/{id}',
    category: 'API Tokens',
    summary: 'Token widerrufen',
    description: 'Soft-Revoke: Token bleibt in der DB, ist aber ungültig. Mit `?hard=1` wird er endgültig gelöscht.',
    scope: 'groups:manage',
    params: [{ name: 'id', in: 'path', required: true, description: 'Token-ID', schema: { type: 'string' } }],
  },

  // ============ Public ============
  {
    id: 'public-officers',
    method: 'GET',
    path: '/public/officers',
    category: 'Public',
    summary: 'Public Officer-Liste',
    description: 'Öffentlich abrufbar (kein Auth nötig). Liefert nur aktive Officers für die Public-Ansicht.',
  },
  {
    id: 'health',
    method: 'GET',
    path: '/health',
    category: 'Public',
    summary: 'Health-Check',
    description: 'Liefert `{ status: "ok" }` — ideal für Monitoring & Uptime-Checks.',
  },
]

/**
 * Baut ein OpenAPI-3.1-konformes Spec-Objekt aus der Endpoint-Liste.
 */
export function buildOpenApiSpec(serverUrl: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'LSPD HR Dashboard API',
      version: API_VERSION,
      description:
        'Vollständige Public API für das LSPD HR Dashboard. Alle Dashboard-Funktionen sind programmatisch verfügbar. Authentifizierung via Bearer-Token (siehe "Authentication").',
      contact: { name: 'LSPD HR' },
    },
    servers: [{ url: serverUrl, description: 'Aktueller Server' }],
    tags: Array.from(new Set(ENDPOINTS.map((e) => e.category))).map((name) => ({ name })),
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'lspd_<opaque>',
          description:
            'Bearer-Token mit Prefix `lspd_`. Erstelle Tokens unter `/admin/api-tokens` im Dashboard.',
        },
        DiscordImpersonation: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Discord-Id',
          description:
            'OPTIONAL: Discord-Snowflake des Users, als der gehandelt werden soll. ' +
            'Nur in Kombination mit BearerAuth wirksam. Die effektiven Rechte ergeben ' +
            'sich aus der Schnittmenge der Token-Scopes und der Rechte des impersonierten Users. ' +
            'Siehe Sektion „Auth → Discord-ID-Impersonation" für Details.',
        },
      },
      schemas: buildComponentSchemas(),
    },
    security: [{ BearerAuth: [] }],
    paths: buildOpenApiPaths(),
  }
}

function buildComponentSchemas() {
  return {
    Officer: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        badgeNumber: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        rank: { $ref: '#/components/schemas/Rank' },
        status: { type: 'string', enum: ['ACTIVE', 'AWAY', 'INACTIVE', 'TERMINATED'] },
        discordId: { type: ['string', 'null'] },
        unit: { type: ['string', 'null'] },
        flag: { type: ['string', 'null'], enum: ['RED', 'ORANGE', 'YELLOW', 'BLUE', null] },
      },
    },
    Rank: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        sortOrder: { type: 'integer' },
        color: { type: 'string' },
      },
    },
    Sanction: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        officerId: { type: ['string', 'null'] },
        reason: { type: 'string' },
        penalGrade: { type: 'string' },
        fineAmount: { type: ['integer', 'null'] },
        penalty: { type: ['string', 'null'] },
        status: { type: 'string', enum: ['OPEN', 'PAID', 'ESCALATED'] },
        dueAt: { type: ['string', 'null'], format: 'date-time' },
      },
    },
    ApiToken: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        prefix: { type: 'string' },
        scopes: { type: 'array', items: { type: 'string' } },
        expiresAt: { type: ['string', 'null'], format: 'date-time' },
        revokedAt: { type: ['string', 'null'], format: 'date-time' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    Error: {
      type: 'object',
      properties: {
        success: { type: 'boolean', enum: [false] },
        error: { type: 'string' },
      },
      required: ['success', 'error'],
    },
    Success: {
      type: 'object',
      properties: {
        success: { type: 'boolean', enum: [true] },
        data: {},
      },
      required: ['success'],
    },
  }
}

function buildOpenApiPaths(): Record<string, Record<string, unknown>> {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const ep of ENDPOINTS) {
    if (!paths[ep.path]) paths[ep.path] = {}
    const parameters = (ep.params ?? []).map((p) => ({
      name: p.name,
      in: p.in,
      required: p.required ?? false,
      description: p.description,
      schema: p.schema,
    }))

    const requestBody = ep.body
      ? {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ep.body.fields.filter((f) => f.required).map((f) => f.name), properties: Object.fromEntries(ep.body.fields.map((f) => [f.name, fieldToSchema(f)])) },
              description: ep.body.description,
            },
          },
        }
      : undefined

    const successSchema = ep.responseFields && ep.responseFields.length > 0
      ? {
          type: 'object',
          required: ep.responseFields.filter((f) => f.required).map((f) => f.name),
          properties: Object.fromEntries(ep.responseFields.map((f) => [f.name, fieldToSchema(f)])),
        }
      : undefined

    paths[ep.path][ep.method.toLowerCase()] = {
      tags: [ep.category],
      summary: ep.summary,
      description: ep.description + (ep.notes ? '\n\n**Hinweise:**\n' + ep.notes.map((n) => `- ${n}`).join('\n') : ''),
      operationId: ep.id,
      parameters,
      requestBody,
      responses: {
        '200': { description: 'OK', content: { 'application/json': { schema: successSchema ?? { $ref: '#/components/schemas/Success' } } } },
        '201': { description: 'Created', content: { 'application/json': { schema: successSchema ?? { $ref: '#/components/schemas/Success' } } } },
        '400': { description: 'Bad Request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        '403': { description: 'Forbidden — fehlende Scopes', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        '404': { description: 'Not Found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        '500': { description: 'Server Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    }
  }
  return paths
}

function fieldToSchema(f: FieldSpec): Record<string, unknown> {
  if (f.enumValues) return { type: f.type, enum: f.enumValues, description: f.description }
  return { type: f.type, description: f.description, example: f.example }
}

export const ALL_SCOPES = PERMISSIONS
