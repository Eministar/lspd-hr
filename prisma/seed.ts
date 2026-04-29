// @ts-nocheck
import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import bcrypt from 'bcryptjs'
import { PERMISSIONS } from '../src/lib/permissions'

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

type UpsertDelegate = {
  upsert: (args: unknown) => Promise<unknown>
}

function getUpsertDelegate(names: readonly string[]): UpsertDelegate {
  const client = prisma as unknown as Record<string, UpsertDelegate | undefined>
  const delegate = names.map((name) => client[name]).find(Boolean)
  if (!delegate) {
    throw new Error(`Prisma-Delegate nicht gefunden: ${names.join(' / ')}`)
  }
  return delegate
}

async function main() {
  console.log('Seeding database...')

  const groups = [
    { name: 'Administration', description: 'Voller Zugriff auf alle Bereiche.', permissions: [...PERMISSIONS] },
    {
      name: 'HR',
      description: 'Personalverwaltung, Aufgaben, Kündigungen und Rangänderungen.',
      permissions: [
        'officers:write',
        'terminations:manage',
        'rank-changes:manage',
        'tasks:manage',
        'notes:manage',
        'logs:view',
      ],
    },
    {
      name: 'Führungsebene',
      description: 'Aufgaben, Notizen und Protokolle.',
      permissions: ['tasks:manage', 'notes:manage', 'logs:view'],
    },
  ]

  let adminGroup: { id: string } | null = null
  for (const group of groups) {
    const savedGroup = await getUpsertDelegate(['userGroup', 'usergroup']).upsert({
      where: { name: group.name },
      update: { description: group.description, permissions: group.permissions },
      create: group,
    }) as { id: string }
    if (group.name === 'Administration') adminGroup = savedGroup
  }
  console.log('User groups created:', groups.length)

  if (!adminGroup) throw new Error('Administrationsgruppe konnte nicht erstellt werden')

  const passwordHash = await bcrypt.hash('admin123', 12)
  const admin = await getUpsertDelegate(['user']).upsert({
    where: { username: 'admin' },
    update: { groupId: adminGroup.id },
    create: {
      username: 'admin',
      passwordHash,
      displayName: 'Administrator',
      groupId: adminGroup.id,
    },
  }) as { username: string }
  console.log('Admin user created:', admin.username)

  const units = [
    { key: 'HR_LEITUNG', name: 'HR Leitung', sortOrder: 1, color: '#7c3aed' },
    { key: 'HR_TRAINEE', name: 'HR Trainee', sortOrder: 2, color: '#3b82f6' },
    { key: 'HR_OFFICER', name: 'HR Officer', sortOrder: 3, color: '#06b6d4' },
    { key: 'ACADEMY', name: 'Academy', sortOrder: 4, color: '#d4af37' },
    { key: 'SRU', name: 'SRU', sortOrder: 5, color: '#dc2626' },
  ]

  for (const unit of units) {
    await getUpsertDelegate(['unit']).upsert({
      where: { key: unit.key },
      update: { name: unit.name, sortOrder: unit.sortOrder, color: unit.color, active: true },
      create: unit,
    })
  }
  console.log('Units created:', units.length)

  const ranks = [
    { name: 'Chief of Police', sortOrder: 1, color: '#DC2626' },
    { name: 'Assistant Chief of Police', sortOrder: 2, color: '#EA580C' },
    { name: 'Deputy Chief of Police', sortOrder: 3, color: '#D97706' },
    { name: 'Commander of Organisation', sortOrder: 4, color: '#CA8A04' },
    { name: 'Commander of Operation', sortOrder: 5, color: '#65A30D' },
    { name: 'Captain of LSPD', sortOrder: 6, color: '#16A34A' },
    { name: 'Lieutenant 2', sortOrder: 7, color: '#0D9488' },
    { name: 'Lieutenant 1', sortOrder: 8, color: '#0891B2' },
    { name: 'Sergeant 2', sortOrder: 9, color: '#2563EB' },
    { name: 'Sergeant 1', sortOrder: 10, color: '#4F46E5' },
    { name: 'Senior Officer', sortOrder: 11, color: '#7C3AED' },
    { name: 'Officer 3', sortOrder: 12, color: '#9333EA' },
    { name: 'Officer 2', sortOrder: 13, color: '#A855F7' },
    { name: 'Officer 1', sortOrder: 14, color: '#C084FC' },
    { name: 'Rookie', sortOrder: 15, color: '#6B7280' },
  ]

  for (const rank of ranks) {
    await getUpsertDelegate(['rank']).upsert({
      where: { name: rank.name },
      update: { sortOrder: rank.sortOrder, color: rank.color },
      create: rank,
    })
  }
  console.log('Ranks created:', ranks.length)

  const trainings = [
    { key: 'erste_hilfe', label: 'Erste Hilfe', sortOrder: 1 },
    { key: 'grundausbildung', label: 'Grundausbildung', sortOrder: 2 },
    { key: 'tablet', label: 'Tablet', sortOrder: 3 },
    { key: 'langwaffe', label: 'Langwaffe', sortOrder: 4 },
    { key: 'einsatzleitung', label: 'Einsatzleitung', sortOrder: 5 },
    { key: 'verhandlung', label: 'Verhandlungsführung', sortOrder: 6 },
  ]

  for (const training of trainings) {
    await getUpsertDelegate(['training']).upsert({
      where: { key: training.key },
      update: { label: training.label, sortOrder: training.sortOrder },
      create: training,
    })
  }
  console.log('Trainings created:', trainings.length)

  console.log('Seeding completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
