import { prisma } from './prisma'

const RANK_PERMISSION_DEFAULTS_SETTING = 'units.rankPermissionDefaults.v1'

/**
 * Einmalige Vorbelegung der Unterrang-Rechte: Nur HR Leitung und HR Stv. Leitung
 * dürfen kündigen. Läuft genau einmal (Marker in SystemSetting); danach gelten
 * ausschließlich die im Admin-Bereich gepflegten Unterrang-Rechte.
 */
async function applyRankPermissionDefaults() {
  const marker = await prisma.systemSetting.findUnique({
    where: { key: RANK_PERMISSION_DEFAULTS_SETTING },
    select: { id: true },
  })
  if (marker) return

  await prisma.unit.updateMany({
    where: { key: { in: ['HR_LEITUNG', 'HR_STV_LEITUNG'] } },
    data: { rankPermissions: ['terminations:manage'] },
  })

  await prisma.systemSetting.upsert({
    where: { key: RANK_PERMISSION_DEFAULTS_SETTING },
    create: { key: RANK_PERMISSION_DEFAULTS_SETTING, value: new Date().toISOString() },
    update: {},
  })
}

let rankPermissionDefaultsPromise: Promise<void> | null = null

export async function ensureRankPermissionDefaults() {
  rankPermissionDefaultsPromise ??= applyRankPermissionDefaults().catch((error) => {
    rankPermissionDefaultsPromise = null
    throw error
  })
  await rankPermissionDefaultsPromise
}
