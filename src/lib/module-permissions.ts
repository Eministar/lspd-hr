import { requireAuth, requirePermission } from '@/lib/auth'

export function isSruModule(module: unknown) {
  return module === 'SRU'
}

export async function requireTaskModuleView(module: unknown) {
  return requirePermission(isSruModule(module) ? 'sru:view' : 'tasks:view')
}

export async function requireTaskModuleManage(module: unknown) {
  if (isSruModule(module)) return requirePermission('sru:manage')
  return requireAuth(['ADMIN', 'HR', 'LEADERSHIP'], ['tasks:manage'])
}

export async function requireCalendarModuleView(module: unknown) {
  return requirePermission(isSruModule(module) ? 'sru:view' : 'calendar:view')
}

export async function requireCalendarModuleManage(module: unknown) {
  return requirePermission(isSruModule(module) ? 'sru:manage' : 'calendar:manage')
}
