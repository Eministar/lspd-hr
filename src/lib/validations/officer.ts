import { z } from 'zod'

export const OFFICER_FLAG_VALUES = ['RED', 'ORANGE', 'YELLOW'] as const

export type OfficerFlagValue = (typeof OFFICER_FLAG_VALUES)[number]

export const createOfficerSchema = z.object({
  badgeNumber: z.string().min(1, 'Dienstnummer ist erforderlich'),
  firstName: z.string().min(1, 'Vorname ist erforderlich'),
  lastName: z.string().min(1, 'Nachname ist erforderlich'),
  rankId: z.string().min(1, 'Rang ist erforderlich'),
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
