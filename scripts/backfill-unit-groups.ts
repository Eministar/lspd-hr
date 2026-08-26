import 'dotenv/config'

import { Prisma, PrismaClient } from '../src/generated/prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

type GroupBlueprint = {
  key: string
  name: string
  description: string
  color: string
  icon: string
  sortOrder: number
  modules: Prisma.InputJsonValue
  permissions: Prisma.InputJsonValue
  unitKeys: string[]
  leadershipKeys: string[]
}

// Wird erst nach einem vollständig erfolgreichen Lauf gesetzt. Damit bleibt
// der Deploy schnell und führt die einmalige Bestandsmigration nicht bei jedem
// Update erneut aus. Mit `--force` kann ein Admin sie bewusst erneut prüfen.
const BACKFILL_SETTING_KEY = 'migration.unit-groups.v1'

// Diese Zuordnung ist absichtlich nach Unit-Keys statt nach IDs aufgebaut:
// IDs und bestehende Zuweisungen bleiben dadurch vollständig erhalten.
const GROUPS: GroupBlueprint[] = [
  {
    key: 'HUMAN_RESOURCES',
    name: 'Human Resources',
    description: 'HR-Hauptunit und alle HR-Ränge.',
    color: '#7c3aed',
    icon: 'briefcase',
    sortOrder: 20,
    modules: { hr: 'manage' },
    permissions: ['hr:view', 'hr:manage', 'hr-tests:manage'],
    unitKeys: ['HUMAN_RESOURCES', 'HR', 'HR_LEITUNG', 'HR_STV_LEITUNG', 'HR_SUPERVISOR', 'SENIOR_HR_OPERATOR', 'HR_OFFICER', 'HR_TRAINEE'],
    leadershipKeys: ['HR_LEITUNG', 'HR_STV_LEITUNG', 'HR_SUPERVISOR'],
  },
  {
    key: 'ACADEMY',
    name: 'Academy',
    description: 'Recruitment, Training und Ausbilder-Ränge.',
    color: '#d4af37',
    icon: 'graduation-cap',
    sortOrder: 10,
    modules: { academy: 'manage' },
    permissions: ['academy:view', 'academy:manage', 'academy-tests:manage'],
    unitKeys: ['ACADEMY', 'ACADEMY_LEITUNG', 'ACADEMY_STV_LEITUNG', 'RECRUITMENT_TRAINING_SENIOR_AUSBILDER', 'ACADEMY_AUSBILDER', 'RECRUITMENT_TRAINING_MENTOR', 'ACADEMY_TEST_AUSBILDER'],
    leadershipKeys: ['ACADEMY_LEITUNG', 'ACADEMY_STV_LEITUNG'],
  },
  {
    key: 'SRU',
    name: 'Special Response Unit',
    description: 'Taktische Einsatz- und Spezialaufgaben.',
    color: '#dc2626',
    icon: 'shield',
    sortOrder: 40,
    modules: { sru: 'manage' },
    permissions: ['sru:view', 'sru:manage'],
    unitKeys: ['SRU', 'S_R_U', 'S_R_U_LEITUNG', 'S_R_U_STV_LEITUNG', 'S_R_U_SENIOR_OPERATOR', 'S_R_U_OPERATOR', 'S_R_U_TRAINEE', 'S_R_U_TEAM_ALPHA', 'METRO_TEAM_BETA', 'METRO_TEAM_GAMMA'],
    leadershipKeys: ['S_R_U_LEITUNG', 'S_R_U_STV_LEITUNG'],
  },
  {
    key: 'AIR_SUPPORT',
    name: 'Air-Support Division',
    description: 'Luftunterstützung und Flugdienst.',
    color: '#38bdf8',
    icon: 'plane',
    sortOrder: 50,
    modules: { air_support: 'manage' },
    permissions: ['air-support:view', 'air-support:manage'],
    unitKeys: ['AIR_SUPPORT', 'AIR_SUPPORT_DIVISION', 'AIR_SUPPORT_DIVISION_LEITUNG', 'AIR_SUPPORT_DIVISION_MEMBER', 'TEST_AIR_SUPPORT_DIVISION'],
    leadershipKeys: ['AIR_SUPPORT_DIVISION_LEITUNG'],
  },
  {
    key: 'DETECTIVE',
    name: 'Detective Unit',
    description: 'Ermittlungen und Fallbearbeitung.',
    color: '#a78bfa',
    icon: 'fingerprint',
    sortOrder: 60,
    modules: { detective: 'manage' },
    permissions: ['detective:view', 'detective:manage'],
    unitKeys: ['DETECTIVE', 'DETECTIVE_UNIT', 'DETECTIVE_LEITUNG', 'DETECTIVE_STV_LEITUNG', 'DETECTIVE_OFFICER', 'DETECTIVE_TRAINEE'],
    leadershipKeys: ['DETECTIVE_LEITUNG', 'DETECTIVE_STV_LEITUNG'],
  },
  {
    key: 'PRESS',
    name: 'Pressesprecher',
    description: 'Öffentlichkeitsarbeit und Pressemitteilungen.',
    color: '#f59e0b',
    icon: 'newspaper',
    sortOrder: 30,
    modules: { press: 'manage' },
    permissions: ['press:view', 'press:manage'],
    unitKeys: ['PRESS', 'PRESSESPRECHER', 'STREAMER', 'SOCIAL_MEDIA'],
    leadershipKeys: [],
  },
  {
    key: 'INTERNAL_AFFAIRS',
    name: 'Internal Affairs',
    description: 'Interne Ermittlungen und Durchsuchungsakten.',
    color: '#0ea5e9',
    icon: 'search',
    sortOrder: 70,
    modules: { internal_affairs: 'manage' },
    permissions: ['internal-affairs:view', 'internal-affairs:manage'],
    unitKeys: ['INTERNAL_AFFAIRS', 'INTERNAL_AFFAIRS_JUNIOR_AGENT', 'INTERNAL_AFFAIRS_OPERATOR', 'INTERNAL_AFFAIRS_LEITUNG', 'INTERNAL_AFFAIRS_STV_LEITUNG'],
    leadershipKeys: ['INTERNAL_AFFAIRS_LEITUNG', 'INTERNAL_AFFAIRS_STV_LEITUNG'],
  },
  {
    key: 'RECHTSVERTRETUNG',
    name: 'Rechtsvertretung',
    description: 'Rechtliche Vertretung und Beratung.',
    color: '#64748b',
    icon: 'scale',
    sortOrder: 80,
    modules: {},
    permissions: [],
    unitKeys: ['RECHTSVERTRETUNG'],
    leadershipKeys: [],
  },
]

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error('DATABASE_URL fehlt.')

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) })
  const force = process.argv.includes('--force')
  let createdGroups = 0
  let linkedUnits = 0
  let markedLeadership = 0

  try {
    const completed = await prisma.systemSetting.findUnique({
      where: { key: BACKFILL_SETTING_KEY },
      select: { id: true },
    })

    if (completed && !force) {
      console.log('Unitgruppen-Backfill bereits abgeschlossen – nichts zu tun.')
      return
    }

    for (const blueprint of GROUPS) {
      let group = await prisma.unitGroup.findUnique({ where: { key: blueprint.key }, select: { id: true } })
      if (!group) {
        group = await prisma.unitGroup.create({
          data: {
            key: blueprint.key,
            name: blueprint.name,
            description: blueprint.description,
            color: blueprint.color,
            icon: blueprint.icon,
            sortOrder: blueprint.sortOrder,
            active: true,
            showInNavigation: Object.keys(blueprint.modules).length > 0,
            modules: blueprint.modules,
            permissions: blueprint.permissions,
          },
          select: { id: true },
        })
        createdGroups += 1
      }

      // Nur noch nicht gruppierte Units werden verknüpft. Manuelle
      // Zuordnungen anderer Gruppen bleiben damit unangetastet.
      const linked = await prisma.unit.updateMany({
        where: { groupId: null, key: { in: blueprint.unitKeys } },
        data: { groupId: group.id, showInNavigation: false },
      })
      linkedUnits += linked.count

      const leadership = await prisma.unit.updateMany({
        where: { groupId: group.id, key: { in: blueprint.leadershipKeys }, isLeadership: false },
        data: { isLeadership: true },
      })
      markedLeadership += leadership.count
    }

    await prisma.systemSetting.upsert({
      where: { key: BACKFILL_SETTING_KEY },
      create: { key: BACKFILL_SETTING_KEY, value: new Date().toISOString() },
      update: {},
    })
  } finally {
    await prisma.$disconnect()
  }

  console.log(`Unitgruppen: ${createdGroups} erstellt, ${linkedUnits} Units zugeordnet, ${markedLeadership} Leitungs-Units markiert.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
