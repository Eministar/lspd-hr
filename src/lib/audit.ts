import { prisma } from './prisma'

interface AuditLogParams {
  action: string
  userId: string
  officerId?: string
  oldValue?: string
  newValue?: string
  details?: string
}

export async function createAuditLog(params: AuditLogParams) {
  return prisma.auditLog.create({
    data: {
      action: params.action,
      userId: params.userId,
      officerId: params.officerId || null,
      oldValue: params.oldValue || null,
      newValue: params.newValue || null,
      details: params.details || null,
    }
  })
}
