import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().min(1, 'Benutzername ist erforderlich'),
  password: z.string().min(1, 'Passwort ist erforderlich'),
})

export const createUserSchema = z.object({
  username: z.string().min(3, 'Benutzername muss mindestens 3 Zeichen haben'),
  password: z.string().min(6, 'Passwort muss mindestens 6 Zeichen haben'),
  displayName: z.string().min(1, 'Anzeigename ist erforderlich'),
  role: z.enum(['ADMIN', 'HR', 'LEADERSHIP', 'READONLY']),
  groupId: z.string().nullable().optional(),
})
