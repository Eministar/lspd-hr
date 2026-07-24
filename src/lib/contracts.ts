// Bewusst ohne Node-Imports: diese Datei wird auch von Client-Komponenten
// genutzt (Status-Labels, Feldtypen, Validierung der Eingaben im Formular).
// Die Token-Erzeugung liegt deshalb in `contract-service.ts`.

export const CONTRACT_STATUSES = ['DRAFT', 'SENT', 'SIGNED', 'DECLINED', 'CANCELLED'] as const
export type ContractStatusValue = (typeof CONTRACT_STATUSES)[number]

export const CONTRACT_FIELD_TYPES = [
  'SHORT_TEXT',
  'LONG_TEXT',
  'DATE',
  'CHECKBOX',
  'SIGNATURE',
] as const
export type ContractFieldTypeValue = (typeof CONTRACT_FIELD_TYPES)[number]

export const CONTRACT_STATUS_META: Record<
  ContractStatusValue,
  { label: string; shortLabel: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' }
> = {
  DRAFT: { label: 'Entwurf', shortLabel: 'Entwurf', variant: 'default' },
  SENT: { label: 'Versendet – wartet auf Unterschrift', shortLabel: 'Offen', variant: 'warning' },
  SIGNED: { label: 'Unterschrieben', shortLabel: 'Unterschrieben', variant: 'success' },
  DECLINED: { label: 'Abgelehnt', shortLabel: 'Abgelehnt', variant: 'danger' },
  CANCELLED: { label: 'Zurückgezogen', shortLabel: 'Zurückgezogen', variant: 'default' },
}

export const CONTRACT_FIELD_TYPE_LABELS: Record<ContractFieldTypeValue, string> = {
  SHORT_TEXT: 'Kurzes Textfeld',
  LONG_TEXT: 'Mehrzeiliges Textfeld',
  DATE: 'Datum',
  CHECKBOX: 'Bestätigung (Häkchen)',
  SIGNATURE: 'Unterschrift',
}

export interface ContractField {
  id: string
  type: ContractFieldTypeValue
  label: string
  description?: string | null
  placeholder?: string | null
  required: boolean
  sortOrder: number
}

/** Eine einzelne Regelung im Vertrag — wird als „§ n Titel“ gesetzt. */
export interface ContractClause {
  id: string
  title: string
  body: string
  sortOrder: number
}

/** Ausstellungsort auf jedem Vertrag — bewusst fest, nicht konfigurierbar. */
export const CONTRACT_PLACE = 'Nerowood'

/** Werte, die der Unterzeichner einträgt. Checkbox → boolean, sonst Text. */
export type ContractValues = Record<string, string | boolean>

export { normalizeLinkToken } from '@/lib/link-tokens'

export function isContractStatus(value: unknown): value is ContractStatusValue {
  return typeof value === 'string' && (CONTRACT_STATUSES as readonly string[]).includes(value)
}

function isContractFieldType(value: unknown): value is ContractFieldTypeValue {
  return typeof value === 'string' && (CONTRACT_FIELD_TYPES as readonly string[]).includes(value)
}

export function cleanContractText(value: unknown, maxLength = 191) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

export function cleanContractLongText(value: unknown, maxLength = 20000) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

function slugifyFieldId(value: string, fallback: string) {
  const slug = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)

  return slug || fallback
}

function sanitizeContractField(raw: unknown, index: number): ContractField | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const input = raw as Record<string, unknown>

  const label = cleanContractText(input.label, 200)
  if (!label) return null

  const type = isContractFieldType(input.type) ? input.type : 'SHORT_TEXT'

  return {
    id: slugifyFieldId(cleanContractText(input.id, 80) || label, `feld_${index + 1}`),
    type,
    label,
    description: cleanContractText(input.description, 400) || null,
    placeholder: cleanContractText(input.placeholder, 120) || null,
    // Unterschriftsfelder sind immer Pflicht — ein Vertrag ohne Unterschrift
    // wäre sonst „unterschrieben“, ohne dass jemand unterschrieben hat.
    required: type === 'SIGNATURE' ? true : input.required !== false,
    sortOrder: index,
  }
}

export function sanitizeContractFields(value: unknown): ContractField[] {
  if (!Array.isArray(value)) return []
  const seen = new Map<string, number>()

  return value
    .map((item, index) => sanitizeContractField(item, index))
    .filter((field): field is ContractField => Boolean(field))
    .slice(0, 40)
    .map((field, index) => {
      const count = seen.get(field.id) ?? 0
      seen.set(field.id, count + 1)
      return {
        ...field,
        id: count > 0 ? `${field.id}_${count + 1}` : field.id,
        sortOrder: index,
      }
    })
}

/** Liest die in der DB als JSON abgelegten Felder zurück in typisierte Felder. */
export function readContractFields(value: unknown): ContractField[] {
  return sanitizeContractFields(value)
}

function sanitizeContractClause(raw: unknown, index: number): ContractClause | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const input = raw as Record<string, unknown>

  const title = cleanContractText(input.title, 200)
  const body = cleanContractLongText(input.body, 6000)
  if (!title && !body) return null

  return {
    id: slugifyFieldId(cleanContractText(input.id, 80) || title, `regelung_${index + 1}`),
    title: title || `Regelung ${index + 1}`,
    body,
    sortOrder: index,
  }
}

export function sanitizeContractClauses(value: unknown): ContractClause[] {
  if (!Array.isArray(value)) return []
  const seen = new Map<string, number>()

  return value
    .map((item, index) => sanitizeContractClause(item, index))
    .filter((clause): clause is ContractClause => Boolean(clause))
    .slice(0, 60)
    .map((clause, index) => {
      const count = seen.get(clause.id) ?? 0
      seen.set(clause.id, count + 1)
      return {
        ...clause,
        id: count > 0 ? `${clause.id}_${count + 1}` : clause.id,
        sortOrder: index,
      }
    })
}

export function readContractClauses(value: unknown): ContractClause[] {
  return sanitizeContractClauses(value)
}

export function readContractValues(value: unknown): ContractValues {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: ContractValues = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'boolean') out[key] = raw
    else if (typeof raw === 'string') out[key] = raw
    else if (typeof raw === 'number') out[key] = String(raw)
  }
  return out
}

export interface ContractPlaceholderContext {
  firstName: string
  lastName: string
  badgeNumber: string
  rankName: string
  hireDate: Date | string | null
  discordId?: string | null
  units?: string[]
  departmentName?: string
}

export function formatContractDate(value: Date | string | null | undefined) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function replacePlaceholders(text: string, values: Record<string, string>) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key: string) => {
    const normalized = key.toLowerCase()
    return normalized in values ? values[normalized] : match
  })
}

/**
 * Ersetzt die Officer-Platzhalter im Vorlagentext. Läuft einmalig beim Erstellen
 * des Vertrags (Snapshot). `{{datum}}` und `{{ort}}` bleiben absichtlich stehen —
 * die werden erst beim Anzeigen aufgelöst, damit auf dem Dokument immer das
 * aktuelle Datum steht. Unbekannte Platzhalter bleiben ebenfalls sichtbar, damit
 * Tippfehler in der Vorlage auffallen statt still eine Lücke zu hinterlassen.
 */
export function renderContractContent(content: string, context: ContractPlaceholderContext) {
  const fullName = [context.firstName, context.lastName].filter(Boolean).join(' ')

  return replacePlaceholders(content, {
    vorname: context.firstName ?? '',
    nachname: context.lastName ?? '',
    name: fullName,
    dienstnummer: context.badgeNumber ?? '',
    rang: context.rankName ?? '',
    einstellungsdatum: formatContractDate(context.hireDate),
    discord_id: context.discordId ?? '',
    units: (context.units ?? []).join(', '),
    department: context.departmentName ?? 'Los Santos Police Department',
  })
}

/**
 * Zweite Stufe: löst Ort und Datum beim Anzeigen des Dokuments auf. Der Ort ist
 * immer {@link CONTRACT_PLACE}; das Datum ist bei einem unterschriebenen Vertrag
 * das Unterschriftsdatum, sonst der heutige Tag.
 */
export function applyContractDatePlaceholders(text: string, date: Date | string | null | undefined) {
  const resolved = date ? new Date(date) : new Date()
  return replacePlaceholders(text, {
    datum: formatContractDate(Number.isNaN(resolved.getTime()) ? new Date() : resolved),
    ort: CONTRACT_PLACE,
  })
}

export function contractPlaceholderHelp() {
  return [
    { token: '{{vorname}}', description: 'Vorname des Officers' },
    { token: '{{nachname}}', description: 'Nachname des Officers' },
    { token: '{{name}}', description: 'Vor- und Nachname' },
    { token: '{{dienstnummer}}', description: 'Dienstnummer' },
    { token: '{{rang}}', description: 'Rang bei Vertragserstellung' },
    { token: '{{einstellungsdatum}}', description: 'Einstellungsdatum' },
    { token: '{{datum}}', description: 'Immer das aktuelle Datum (bzw. Unterschriftsdatum)' },
    { token: '{{ort}}', description: `Ausstellungsort — immer „${CONTRACT_PLACE}“` },
    { token: '{{discord_id}}', description: 'Discord-ID des Officers' },
    { token: '{{units}}', description: 'Zugewiesene Units' },
    { token: '{{department}}', description: 'Name des Departments' },
  ]
}

/**
 * Prüft die Eingaben des Unterzeichners gegen die Felddefinitionen des Vertrags.
 * Gibt bereinigte Werte und Fehlermeldungen zurück.
 */
export function validateContractValues(fields: ContractField[], rawValues: unknown) {
  const input = readContractValues(rawValues)
  const values: ContractValues = {}
  const errors: string[] = []

  for (const field of fields) {
    const raw = input[field.id]

    if (field.type === 'CHECKBOX') {
      const checked = raw === true || raw === 'true'
      values[field.id] = checked
      if (field.required && !checked) errors.push(`„${field.label}“ muss bestätigt werden.`)
      continue
    }

    const maxLength = field.type === 'LONG_TEXT' ? 4000 : 200
    const text = typeof raw === 'string' ? raw.trim().slice(0, maxLength) : ''
    values[field.id] = text

    if (field.required && !text) {
      errors.push(`„${field.label}“ ist erforderlich.`)
      continue
    }

    if (field.type === 'DATE' && text && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      errors.push(`„${field.label}“ braucht ein gültiges Datum.`)
    }

    if (field.type === 'SIGNATURE' && text && text.length < 3) {
      errors.push(`„${field.label}“ muss den vollständigen Namen enthalten.`)
    }
  }

  return { values, errors }
}

/** Das erste Unterschriftsfeld — dessen Wert wird als `signedName` gespeichert. */
export function primarySignatureField(fields: ContractField[]) {
  return fields.find((field) => field.type === 'SIGNATURE') ?? null
}

export const DEFAULT_CONTRACT_TEMPLATE_NAME = 'Arbeitsvertrag'

export const DEFAULT_CONTRACT_TEMPLATE_CONTENT = `Zwischen dem **{{department}}**, vertreten durch die Personalabteilung
(nachfolgend „Department“),

und

**{{name}}**, Discord-ID \`{{discord_id}}\`
(nachfolgend „Mitarbeiter“),

wird der folgende Arbeitsvertrag geschlossen.`

export const DEFAULT_CONTRACT_TEMPLATE_CLOSING = `Mündliche Nebenabreden bestehen nicht. Sollte eine Bestimmung dieses Vertrages
unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.

Mit seiner Unterschrift bestätigt der Mitarbeiter, diesen Vertrag vollständig
gelesen, verstanden und akzeptiert zu haben.`

export const DEFAULT_CONTRACT_TEMPLATE_CLAUSES: ContractClause[] = [
  {
    id: 'taetigkeit',
    title: 'Tätigkeit und Dienstgrad',
    body: 'Der Mitarbeiter wird zum {{einstellungsdatum}} im Dienstgrad **{{rang}}** unter der Dienstnummer **{{dienstnummer}}** in den Dienst des Departments aufgenommen. Das Department behält sich vor, dem Mitarbeiter im Rahmen seiner Qualifikation andere zumutbare Aufgaben zu übertragen.',
    sortOrder: 0,
  },
  {
    id: 'dienstpflichten',
    title: 'Dienstpflichten',
    body: '1. Der Mitarbeiter verpflichtet sich, die Dienstordnung, den Sanktionskatalog sowie alle geltenden Gesetze und Anordnungen einzuhalten.\n2. Dienstliche Anweisungen von Vorgesetzten sind unverzüglich zu befolgen.\n3. Der Mitarbeiter tritt seinen Dienst zuverlässig und pünktlich an und meldet Abwesenheiten rechtzeitig über die dafür vorgesehenen Wege.',
    sortOrder: 1,
  },
  {
    id: 'verschwiegenheit',
    title: 'Verschwiegenheit',
    body: 'Der Mitarbeiter verpflichtet sich, über alle dienstlichen Angelegenheiten, insbesondere über laufende Ermittlungen und personenbezogene Daten, Stillschweigen zu bewahren. Diese Pflicht besteht auch nach Beendigung des Dienstverhältnisses fort.',
    sortOrder: 2,
  },
  {
    id: 'ausruestung',
    title: 'Ausrüstung und Dienstwaffe',
    body: 'Die vom Department überlassene Ausrüstung einschließlich der Dienstwaffe bleibt Eigentum des Departments. Sie ist sorgfältig zu behandeln und bei Beendigung des Dienstverhältnisses unverzüglich und vollständig zurückzugeben.',
    sortOrder: 3,
  },
  {
    id: 'probezeit',
    title: 'Probezeit',
    body: 'Die ersten Wochen des Dienstverhältnisses gelten als Probezeit. Während dieser Zeit kann das Dienstverhältnis von beiden Seiten ohne Angabe von Gründen beendet werden.',
    sortOrder: 4,
  },
  {
    id: 'beendigung',
    title: 'Beendigung des Dienstverhältnisses',
    body: 'Das Dienstverhältnis endet durch Kündigung einer der beiden Parteien oder durch Entlassung infolge eines schwerwiegenden Verstoßes gegen die Dienstordnung. Eine fristlose Entlassung bleibt in schweren Fällen vorbehalten.',
    sortOrder: 5,
  },
]

export const DEFAULT_CONTRACT_TEMPLATE_FIELDS: ContractField[] = [
  {
    id: 'ic_name',
    type: 'SHORT_TEXT',
    label: 'Vollständiger Name (IC)',
    description: 'Wie im Personalausweis eingetragen.',
    placeholder: 'Max Mustermann',
    required: true,
    sortOrder: 0,
  },
  {
    id: 'geburtsdatum',
    type: 'DATE',
    label: 'Geburtsdatum (IC)',
    description: null,
    placeholder: null,
    required: true,
    sortOrder: 1,
  },
  {
    id: 'wohnanschrift',
    type: 'SHORT_TEXT',
    label: 'Wohnanschrift',
    description: null,
    placeholder: 'Straße, Ort',
    required: false,
    sortOrder: 2,
  },
  {
    id: 'anmerkungen',
    type: 'LONG_TEXT',
    label: 'Anmerkungen',
    description: 'Optionale Ergänzungen zum Vertrag.',
    placeholder: null,
    required: false,
    sortOrder: 3,
  },
  {
    id: 'dienstordnung_gelesen',
    type: 'CHECKBOX',
    label: 'Ich habe die Dienstordnung gelesen und akzeptiere sie.',
    description: null,
    placeholder: null,
    required: true,
    sortOrder: 4,
  },
  {
    id: 'unterschrift',
    type: 'SIGNATURE',
    label: 'Unterschrift',
    description: 'Tippe deinen vollständigen Namen — das gilt als rechtsverbindliche Unterschrift.',
    placeholder: 'Vor- und Nachname',
    required: true,
    sortOrder: 5,
  },
]
