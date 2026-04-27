import { z } from 'zod'

export const OFFICER_UNIT_VALUES = [
  'HR_LEITUNG',
  'HR_TRAINEE',
  'HR_OFFICER',
  'ACADEMY',
  'SRU',
] as const

export type OfficerUnitValue = (typeof OFFICER_UNIT_VALUES)[number]

export const OFFICER_FLAG_VALUES = ['RED', 'ORANGE', 'YELLOW'] as const

export type OfficerFlagValue = (typeof OFFICER_FLAG_VALUES)[number]

export const createOfficerSchema = z.object({
  badgeNumber: z.string().min(1, 'Dienstnummer ist erforderlich'),
  firstName: z.string().min(1, 'Vorname ist erforderlich'),
  lastName: z.string().min(1, 'Nachname ist erforderlich'),
  rankId: z.string().min(1, 'Rang ist erforderlich'),
  discordId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  hireDate: z.string().optional(),
  status: z.enum(['ACTIVE', 'AWAY', 'INACTIVE', 'TERMINATED']).optional(),
  unit: z.enum(OFFICER_UNIT_VALUES).nullable().optional(),
  flag: z.enum(OFFICER_FLAG_VALUES).nullable().optional(),
})

export const updateOfficerSchema = createOfficerSchema.partial()

export const updateTrainingsSchema = z.object({
  trainings: z.array(z.object({
    trainingId: z.string(),
    completed: z.boolean(),
  }))
})
