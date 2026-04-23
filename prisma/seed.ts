import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import bcrypt from 'bcryptjs'
import path from 'path'

const dbPath = path.resolve(__dirname, 'dev.db')
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding database...')

  const passwordHash = await bcrypt.hash('admin123', 12)
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash,
      displayName: 'Administrator',
      role: 'ADMIN',
    },
  })
  console.log('Admin user created:', admin.username)

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
    await prisma.rank.upsert({
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
    await prisma.training.upsert({
      where: { key: training.key },
      update: { label: training.label, sortOrder: training.sortOrder },
      create: training,
    })
  }
  console.log('Trainings created:', trainings.length)

  const allRanks = await prisma.rank.findMany({ orderBy: { sortOrder: 'asc' } })
  const allTrainings = await prisma.training.findMany()

  const rookieRank = allRanks.find(r => r.name === 'Rookie')
  const officer1Rank = allRanks.find(r => r.name === 'Officer 1')
  const officer2Rank = allRanks.find(r => r.name === 'Officer 2')
  const seniorRank = allRanks.find(r => r.name === 'Senior Officer')
  const sgt1Rank = allRanks.find(r => r.name === 'Sergeant 1')

  if (rookieRank && officer1Rank && officer2Rank && seniorRank && sgt1Rank) {
    const sampleOfficers = [
      { badgeNumber: '101', firstName: 'Max', lastName: 'Müller', rankId: sgt1Rank.id, status: 'ACTIVE' as const },
      { badgeNumber: '102', firstName: 'Sarah', lastName: 'Schmidt', rankId: seniorRank.id, status: 'ACTIVE' as const },
      { badgeNumber: '201', firstName: 'Tom', lastName: 'Weber', rankId: officer2Rank.id, status: 'ACTIVE' as const },
      { badgeNumber: '202', firstName: 'Lisa', lastName: 'Fischer', rankId: officer2Rank.id, status: 'AWAY' as const },
      { badgeNumber: '301', firstName: 'Jan', lastName: 'Wagner', rankId: officer1Rank.id, status: 'ACTIVE' as const },
      { badgeNumber: '302', firstName: 'Anna', lastName: 'Becker', rankId: officer1Rank.id, status: 'ACTIVE' as const },
      { badgeNumber: '401', firstName: 'Felix', lastName: 'Hoffmann', rankId: rookieRank.id, status: 'ACTIVE' as const },
      { badgeNumber: '402', firstName: 'Marie', lastName: 'Schulz', rankId: rookieRank.id, status: 'INACTIVE' as const },
    ]

    for (const data of sampleOfficers) {
      const officer = await prisma.officer.upsert({
        where: { badgeNumber: data.badgeNumber },
        update: {},
        create: {
          ...data,
          hireDate: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
        },
      })

      for (const training of allTrainings) {
        await prisma.officerTraining.upsert({
          where: { officerId_trainingId: { officerId: officer.id, trainingId: training.id } },
          update: {},
          create: {
            officerId: officer.id,
            trainingId: training.id,
            completed: Math.random() > 0.4,
          },
        })
      }
    }
    console.log('Sample officers created:', sampleOfficers.length)
  }

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
