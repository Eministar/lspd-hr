import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { success, unauthorized } from '@/lib/api-response'

const RECENT_WINDOW_DAYS = 30
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktiv',
  AWAY: 'Abgemeldet',
  INACTIVE: 'Inaktiv',
  TERMINATED: 'Gekündigt',
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const recentSince = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const [
    officers,
    ranks,
    trainings,
    totalPromotions,
    recentPromotions,
    recentTerminations,
    recentActivity,
    pinnedNotes,
    draftRankChangeLists,
  ] = await Promise.all([
    prisma.officer.findMany({
      select: {
        id: true,
        badgeNumber: true,
        firstName: true,
        lastName: true,
        rankId: true,
        status: true,
        hireDate: true,
        lastOnline: true,
        updatedAt: true,
        rank: { select: { name: true, color: true, sortOrder: true } },
        trainings: { select: { trainingId: true, completed: true } },
      },
    }),
    prisma.rank.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.training.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.promotionLog.count(),
    prisma.promotionLog.count({
      where: { createdAt: { gte: recentSince } },
    }),
    prisma.termination.count({
      where: { terminatedAt: { gte: recentSince } },
    }),
    prisma.auditLog.findMany({
      include: {
        user: { select: { displayName: true } },
        officer: { select: { id: true, firstName: true, lastName: true, badgeNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.note.findMany({
      where: { pinned: true },
      include: {
        author: { select: { displayName: true } },
        officer: { select: { id: true, firstName: true, lastName: true, badgeNumber: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 3,
    }),
    prisma.rankChangeList.count({ where: { status: 'DRAFT' } }),
  ])

  const totalOfficers = officers.length
  const activeOfficers = officers.filter((officer) => officer.status === 'ACTIVE').length
  const awayOfficers = officers.filter((officer) => officer.status === 'AWAY').length
  const inactiveOfficers = officers.filter((officer) => officer.status === 'INACTIVE').length
  const terminatedOfficers = officers.filter((officer) => officer.status === 'TERMINATED').length
  const currentOfficers = totalOfficers - terminatedOfficers
  const currentOfficerList = officers.filter((officer) => officer.status !== 'TERMINATED')

  const distribution = ranks.map((rank) => ({
    rank: rank.name,
    color: rank.color,
    count: currentOfficerList.filter((officer) => officer.rankId === rank.id).length,
  }))

  const statusDistribution = Object.entries(STATUS_LABELS).map(([status, label]) => ({
    status,
    label,
    count: officers.filter((officer) => officer.status === status).length,
  }))

  const trainingIds = new Set(trainings.map((training) => training.id))
  const totalTrainingAssignments = currentOfficers * trainings.length
  const completedTrainingAssignments = currentOfficerList.reduce((total, officer) => (
    total + officer.trainings.filter((training) => training.completed && trainingIds.has(training.trainingId)).length
  ), 0)
  const trainingCompletionRate = totalTrainingAssignments > 0
    ? Math.round((completedTrainingAssignments / totalTrainingAssignments) * 100)
    : 0

  const trainingBreakdown = trainings.map((training) => {
    const completed = currentOfficerList.filter((officer) => (
      officer.trainings.some((officerTraining) => (
        officerTraining.trainingId === training.id && officerTraining.completed
      ))
    )).length

    return {
      id: training.id,
      label: training.label,
      completed,
      total: currentOfficers,
      percentage: currentOfficers > 0 ? Math.round((completed / currentOfficers) * 100) : 0,
    }
  })

  const attentionOfficers = officers
    .filter((officer) => officer.status === 'AWAY' || officer.status === 'INACTIVE')
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 6)
    .map((officer) => ({
      id: officer.id,
      badgeNumber: officer.badgeNumber,
      firstName: officer.firstName,
      lastName: officer.lastName,
      status: officer.status,
      lastOnline: officer.lastOnline,
      updatedAt: officer.updatedAt,
      rank: officer.rank,
    }))

  const recentHires = [...currentOfficerList]
    .sort((a, b) => b.hireDate.getTime() - a.hireDate.getTime())
    .slice(0, 5)
    .map((officer) => ({
      id: officer.id,
      badgeNumber: officer.badgeNumber,
      firstName: officer.firstName,
      lastName: officer.lastName,
      hireDate: officer.hireDate,
      rank: officer.rank,
    }))

  const readinessRate = currentOfficers > 0 ? Math.round((activeOfficers / currentOfficers) * 100) : 0

  return success({
    totalOfficers,
    activeOfficers,
    awayOfficers,
    inactiveOfficers,
    terminatedOfficers,
    currentOfficers,
    totalPromotions,
    recentPromotions,
    recentTerminations,
    readinessRate,
    totalTrainingAssignments,
    completedTrainingAssignments,
    trainingCompletionRate,
    draftRankChangeLists,
    recentWindowDays: RECENT_WINDOW_DAYS,
    rankDistribution: distribution,
    statusDistribution,
    trainingBreakdown,
    attentionOfficers,
    recentHires,
    recentActivity,
    pinnedNotes,
  })
}
