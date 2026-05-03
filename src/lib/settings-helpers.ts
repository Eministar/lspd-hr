import { prisma } from '@/lib/prisma'

export async function getBadgePrefix(): Promise<string> {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'badgePrefix' } })
  return row?.value?.trim() || ''
}

export async function getOrgName(): Promise<string> {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'orgName' } })
  return row?.value?.trim() || 'LSPD'
}
