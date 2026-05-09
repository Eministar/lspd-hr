import { prisma } from './prisma'

interface AuditLogParams {
  action: string
  userId: string | null | undefined
  officerId?: string
  oldValue?: string
  newValue?: string
  details?: string
}

export async function createAuditLog(params: AuditLogParams) {
  return prisma.auditLog.create({
    data: {
      action: params.action,
      userId: params.userId || null,
      officerId: params.officerId || null,
      oldValue: params.oldValue || null,
      newValue: params.newValue || null,
      details: params.details || null,
    }
  })
}
