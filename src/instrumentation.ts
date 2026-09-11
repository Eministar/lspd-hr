/**
 * Wird von Next genau einmal pro Serverprozess ausgeführt — der richtige Ort
 * für Hintergrundaufgaben, die nicht an eine einzelne Anfrage hängen.
 */
export async function register() {
  // Läuft auch für die Edge-Runtime; dort gibt es weder Dateisystem noch Cron.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { ensureStandbySyncScheduler } = await import('./lib/standby-sync-job')
  ensureStandbySyncScheduler()
}
