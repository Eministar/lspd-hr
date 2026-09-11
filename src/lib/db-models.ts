// Bewusst relativ statt über den @-Alias: diese Datei wird auch von den
// tsx-Skripten unter prisma/ geladen, die keine tsconfig-Pfade auflösen.
import { Prisma } from '../generated/prisma/client'

/**
 * Zentrale Modell-Liste für Backup, Restore und Journal.
 *
 * Bewusst aus dem DMMF des generierten Clients abgeleitet statt von Hand
 * gepflegt: die alte handgeschriebene Tabelle in `prisma/backup.ts` kannte nur
 * 32 der 68 Modelle, wodurch neu hinzugekommene Bereiche (Klagen, Formulare,
 * SRU, Verträge …) stillschweigend nicht gesichert wurden. Über das DMMF ist
 * jedes Modell automatisch dabei, sobald es im Schema steht.
 */

/** Das Journal selbst gehört nie in ein Backup und wird nie zurückgespielt. */
export const JOURNAL_MODEL = 'FailoverJournalEntry'

/** Alle Modellnamen des Schemas in Schema-Reihenfolge, ohne das Journal. */
export const DATA_MODEL_NAMES: string[] = Prisma.dmmf.datamodel.models
  .map((model) => model.name)
  .filter((name) => name !== JOURNAL_MODEL)

export type FindManyDelegate = { findMany: (args?: unknown) => Promise<unknown[]> }
export type WriteDelegate = {
  createMany: (args: { data: unknown[]; skipDuplicates?: boolean }) => Promise<{ count: number }>
  deleteMany: (args?: unknown) => Promise<{ count: number }>
}

/**
 * Prisma-Delegate zu einem Modellnamen.
 *
 * Je nach Generator-Version heißt der Delegate `userGroup` oder `usergroup`;
 * beide Schreibweisen werden probiert (gleiches Motiv wie die Alias-Tabelle in
 * `prisma.ts`). Gibt `null` zurück, wenn das Modell im Client fehlt.
 */
export function resolveDelegate<T>(client: unknown, modelName: string): T | null {
  const record = client as Record<string, unknown>
  const camel = modelName.charAt(0).toLowerCase() + modelName.slice(1)
  for (const key of [camel, modelName.toLowerCase()]) {
    const delegate = record[key]
    if (delegate && typeof delegate === 'object') return delegate as T
  }
  return null
}

/** Tabellenname in der Datenbank (das Schema nutzt durchgehend den Modellnamen). */
export function tableName(modelName: string): string {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === modelName)
  return model?.dbName || modelName
}
