import type { PrismaClient } from '../generated/prisma/client'
import type { UserGroupDelegate } from '../generated/prisma/models/UserGroup'

export function userGroupDelegate(client: PrismaClient): UserGroupDelegate {
  return (client as unknown as { userGroup: UserGroupDelegate }).userGroup
}
