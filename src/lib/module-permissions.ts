import { requirePermission } from '@/lib/auth'
import type { Permission } from '@/lib/permissions'

export const TASK_MODULES = ['ACADEMY', 'HR', 'SRU', 'INTERNAL_AFFAIRS', 'AIR_SUPPORT'] as const
export type TaskModuleKey = (typeof TASK_MODULES)[number]

const MODULE_PERMISSION: Record<TaskModuleKey, { view: Permission; manage: Permission }> = {
  ACADEMY: { view: 'academy:view', manage: 'academy:manage' },
  HR: { view: 'hr:view', manage: 'hr:manage' },
  SRU: { view: 'sru:view', manage: 'sru:manage' },
  INTERNAL_AFFAIRS: { view: 'internal-affairs:view', manage: 'internal-affairs:manage' },
  AIR_SUPPORT: { view: 'air-support:view', manage: 'air-support:manage' },
}

export function isTaskModule(value: unknown): value is TaskModuleKey {
  return typeof value === 'string' && (TASK_MODULES as readonly string[]).includes(value)
}

export function taskModuleOrNull(value: unknown) {
  return isTaskModule(value) ? value : null
}

export async function requireTaskModuleView(module: unknown) {
  return requirePermission(isTaskModule(module) ? MODULE_PERMISSION[module].view : 'calendar:view')
}

export async function requireTaskModuleManage(module: unknown) {
  if (!isTaskModule(module)) throw new Error('Forbidden')
  return requirePermission(MODULE_PERMISSION[module].manage)
}

export async function requireCalendarModuleView(module: unknown) {
  return requirePermission(isTaskModule(module) ? MODULE_PERMISSION[module].view : 'calendar:view')
}

export async function requireCalendarModuleManage(module: unknown) {
  return requirePermission(isTaskModule(module) ? MODULE_PERMISSION[module].manage : 'calendar:manage')
}
