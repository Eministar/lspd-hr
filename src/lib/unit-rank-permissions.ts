import { prisma } from './prisma'

const RANK_PERMISSION_DEFAULTS_SETTING = 'units.rankPermissionDefaults.v1'

/**
 * Einmalige Vorbelegung der Unterrang-Rechte: Nur HR Leitung und HR Stv. Leitung
 * dürfen kündigen. Läuft genau einmal (Marker in SystemSetting); danach gelten
 * ausschließlich die im Admin-Bereich gepflegten Unterrang-Rechte.
 */
/**
 * Der Deploy (start.js) führt keine Prisma-Migrationen aus. Fehlt die Spalte
 * `Unit.rankPermissions`, schlägt jede Unit-Abfrage fehl (z. B. /api/auth/me → 500).
 * Daher wird sie hier idempotent nachgezogen (entspricht Migration 20261105_unit_rank_permissions).
 */
async function ensureRankPermissionsColumn() {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
    "SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Unit' AND COLUMN_NAME = 'rankPermissions'",
  )
  if (Number(rows[0]?.count ?? 0) > 0) return
  await prisma.$executeRawUnsafe('ALTER TABLE `Unit` ADD COLUMN `rankPermissions` JSON NULL')
}

async function applyRankPermissionDefaults() {
  await ensureRankPermissionsColumn()

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
