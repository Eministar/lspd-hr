import { z } from 'zod'

export const createOfficerSchema = z.object({
  badgeNumber: z.string().min(1, 'Dienstnummer ist erforderlich'),
  firstName: z.string().min(1, 'Vorname ist erforderlich'),
  lastName: z.string().min(1, 'Nachname ist erforderlich'),
  rankId: z.string().min(1, 'Rang ist erforderlich'),
  discordId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  hireDate: z.string().optional(),
  status: z.enum(['ACTIVE', 'AWAY', 'INACTIVE', 'TERMINATED']).optional(),
})

export const updateOfficerSchema = createOfficerSchema.partial()

export const updateTrainingsSchema = z.object({
  trainings: z.array(z.object({
    trainingId: z.string(),
    completed: z.boolean(),
  }))
})
