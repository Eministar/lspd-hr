/**
 * Anzeige-Label (semver + Status). Bei Release `package.json` `"version"` anpassen.
 */
export const APP_VERSION_LABEL = '0.1.3'

/** Kurzes Build-Kürzel (Git-SHA, CI-Id, …). */
export function releaseBuildShort(): string {
  const bid =
    typeof process.env.NEXT_PUBLIC_BUILD_ID === 'string' ? process.env.NEXT_PUBLIC_BUILD_ID.trim() : ''
  if (!bid) return 'local'
  if (bid === 'local') return 'local'
  if (bid.length <= 10) return bid
  return `${bid.slice(0, 10)}…`
}
