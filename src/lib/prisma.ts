import { PrismaClient } from '@/generated/prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

function createPrismaClient() {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) {
    throw new Error(
      '[Prisma] DATABASE_URL fehlt oder ist leer. .env im Projektroot prüfen und den Node-Prozess neu starten.',
    )
  }
  const adapter = new PrismaMariaDb(url)
  return new PrismaClient({ adapter })
}

/** Ein Client pro Node-Prozess (auch in Production), damit keine Verbindungsfluten entstehen. */
export const prisma = globalForPrisma.prisma ?? (globalForPrisma.prisma = createPrismaClient())
