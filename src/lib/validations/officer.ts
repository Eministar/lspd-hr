import { z } from 'zod'

export const OFFICER_FLAG_VALUES = ['RED', 'ORANGE', 'YELLOW'] as const

export type OfficerFlagValue = (typeof OFFICER_FLAG_VALUES)[number]

/** Discord Snowflake-Ziffernkette (ohne Bot; nur Speicher auf dem Officer). */
export const discordIdSchema = z
  .union([z.string(), z.literal(''), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined
    if (v === null) return null
    const s = String(v).trim()
    return s === '' ? null : s
  })
  .refine((v) => v === undefined || v === null || /^\d{17,22}$/.test(v), {
    message: 'Discord-ID: 17–22 Ziffern (Snowflake)',
  })

export const createOfficerSchema = z.object({
  badgeNumber: z.string().min(1, 'Dienstnummer ist erforderlich'),
  firstName: z.string().min(1, 'Vorname ist erforderlich'),
  lastName: z.string().min(1, 'Nachname ist erforderlich'),
  rankId: z.string().min(1, 'Rang ist erforderlich'),
  discordId: discordIdSchema,
  notes: z.string().optional().nullable(),
  hireDate: z.string().optional(),
  status: z.enum(['ACTIVE', 'AWAY', 'INACTIVE', 'TERMINATED']).optional(),
  unit: z.string().trim().min(1).nullable().optional(),
  flag: z.enum(OFFICER_FLAG_VALUES).nullable().optional(),
})

export const updateOfficerSchema = createOfficerSchema.partial()

export const updateTrainingsSchema = z.object({
  trainings: z.array(z.object({
    trainingId: z.string(),
    completed: z.boolean(),
  }))
})
