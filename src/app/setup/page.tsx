'use client'

import Image from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Radio,
  Server,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type Guild = {
  id: string
  name: string
  iconUrl: string | null
  owner?: boolean
  approximateMemberCount?: number
}

type DiscordRole = {
  id: string
  name: string
  color: number
  position: number
  managed: boolean
}

type DiscordChannel = {
  id: string
  name: string
  type: number
  position: number
}

type DiscordPreview = {
  bot: { id: string; username: string; displayName: string; avatarUrl: string }
  application: { id: string; name: string; iconUrl: string | null; publicKey: string }
  guilds: Guild[]
  selectedGuild: Guild | null
  roles: DiscordRole[]
  channels: DiscordChannel[]
}

type DatabaseResult = { databaseName: string; version: string; durationMs: number }

const steps = [
  { label: 'Willkommen', short: 'Start', icon: Sparkles },
  { label: 'Datenbank', short: 'Datenbank', icon: Database },
  { label: 'Discord Bot', short: 'Bot', icon: Bot },
  { label: 'Server & Zugriff', short: 'Zugriff', icon: ShieldCheck },
  { label: 'Bereit', short: 'Fertig', icon: CheckCircle2 },
]

function inputClass(valid?: boolean) {
  return [
    'h-12 w-full rounded-xl border bg-surface px-4 text-[13px] text-label outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-label-4',
    valid === true
      ? 'border-green/27 shadow-[0_0_0_3px_rgba(50,215,75,0.07)]'
      : 'border-line focus:border-gold/80 focus:ring-[3px] focus:ring-gold/25',
  ].join(' ')
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <label className="text-[11px] font-semibold text-label-2">{children}</label>
      {hint && <span className="text-[11px] text-label-3">{hint}</span>}
    </div>
  )
}

function InlineMessage({ tone, children }: { tone: 'success' | 'error' | 'info'; children: React.ReactNode }) {
  const styles = {
    success: 'border-green/12 bg-green/[0.07] text-green',
    error: 'border-red/12 bg-red/[0.07] text-red',
    info: 'border-cyan/12 bg-cyan/[0.06] text-cyan',
  }
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? CircleAlert : Radio
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[12px] leading-5 ${styles[tone]}`}>
      <Icon size={15} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  busy,
  type = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  busy?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      whileTap={disabled || busy ? undefined : { scale: 0.98 }}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gold px-5 text-[12.5px] font-bold text-ink transition-[filter,opacity] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
    >
      {busy && <LoaderCircle size={15} className="animate-spin" />}
      {children}
    </motion.button>
  )
}

function SecondaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-[12.5px] font-semibold text-label-2 transition-colors hover:border-line-strong hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </motion.button>
  )
}

export default function SetupPage() {
  const reducedMotion = useReducedMotion()
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [databaseUrl, setDatabaseUrl] = useState('')
  const [databaseResult, setDatabaseResult] = useState<DatabaseResult | null>(null)
  const [testedDatabaseUrl, setTestedDatabaseUrl] = useState('')
  const [botToken, setBotToken] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [showBotToken, setShowBotToken] = useState(false)
  const [showClientSecret, setShowClientSecret] = useState(false)
  const [discord, setDiscord] = useState<DiscordPreview | null>(null)
  const [testedBotToken, setTestedBotToken] = useState('')
  const [guildId, setGuildId] = useState('')
  const [adminRoleIds, setAdminRoleIds] = useState<string[]>([])
  const [siteUrl, setSiteUrl] = useState('')
  const [announcementsChannelId, setAnnouncementsChannelId] = useState('')
  const [sanctionsChannelId, setSanctionsChannelId] = useState('')
  const [busy, setBusy] = useState<'database' | 'discord' | 'guild' | 'complete' | null>(null)
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    setSiteUrl(window.location.origin)
  }, [])

  const databaseValid = Boolean(databaseResult && testedDatabaseUrl === databaseUrl.trim())
  const discordValid = Boolean(discord && testedBotToken === botToken.trim())
  const selectedGuild = discord?.selectedGuild?.id === guildId
    ? discord.selectedGuild
    : discord?.guilds.find((guild) => guild.id === guildId) ?? null
  const selectedRoles = useMemo(
    () => discord?.roles.filter((role) => adminRoleIds.includes(role.id)) ?? [],
    [adminRoleIds, discord?.roles],
  )

  const canContinue = [
    true,
    databaseValid,
    discordValid && clientSecret.trim().length >= 16,
    Boolean(guildId && selectedGuild && adminRoleIds.length > 0 && /^https?:\/\//.test(siteUrl)),
    true,
  ][step]

  const goTo = (nextStep: number) => {
    setDirection(nextStep > step ? 1 : -1)
    setError('')
    setStep(Math.max(0, Math.min(steps.length - 1, nextStep)))
  }

  const parseResponse = async <T,>(response: Response): Promise<T> => {
    const payload = await response.json()
    if (!response.ok || !payload.success) throw new Error(payload.error || 'Die Anfrage ist fehlgeschlagen.')
    return payload.data as T
  }

  const testDatabase = async () => {
    setBusy('database')
    setError('')
    setDatabaseResult(null)
    try {
      const result = await parseResponse<DatabaseResult>(await fetch('/api/setup/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ databaseUrl }),
      }))
      setDatabaseResult(result)
      setTestedDatabaseUrl(databaseUrl.trim())
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Datenbank konnte nicht verbunden werden.')
    } finally {
      setBusy(null)
    }
  }

  const loadDiscord = async (selectedGuildId?: string) => {
    setBusy(selectedGuildId ? 'guild' : 'discord')
    setError('')
    try {
      const result = await parseResponse<DiscordPreview>(await fetch('/api/setup/discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken, guildId: selectedGuildId || undefined }),
      }))
      setDiscord(result)
      setTestedBotToken(botToken.trim())
      if (!selectedGuildId && result.guilds.length === 1) {
        setGuildId(result.guilds[0].id)
        await loadDiscord(result.guilds[0].id)
        return
      }
      if (selectedGuildId) {
        setGuildId(selectedGuildId)
        setAdminRoleIds([])
        setAnnouncementsChannelId('')
        setSanctionsChannelId('')
      }
    } catch (requestError) {
      if (!selectedGuildId) {
        setDiscord(null)
        setTestedBotToken('')
      }
      setError(requestError instanceof Error ? requestError.message : 'Discord konnte nicht geladen werden.')
    } finally {
      setBusy(null)
    }
  }

  const finishSetup = async () => {
    if (!discord || !selectedGuild) return
    setBusy('complete')
    setError('')
    try {
      await parseResponse(await fetch('/api/setup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          databaseUrl,
          botToken,
          clientSecret,
          applicationId: discord.application.id,
          publicKey: discord.application.publicKey,
          guildId,
          adminRoleIds,
          siteUrl,
          announcementsChannelId,
          sanctionsChannelId,
        }),
      }))
      setCompleted(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Einrichtung konnte nicht abgeschlossen werden.')
    } finally {
      setBusy(null)
    }
  }

  const toggleRole = (roleId: string) => {
    setAdminRoleIds((current) => current.includes(roleId)
      ? current.filter((id) => id !== roleId)
      : [...current, roleId])
  }

  const motionVariants = {
    enter: (travel: number) => reducedMotion
      ? { opacity: 0 }
      : { opacity: 0, x: travel * 28, filter: 'blur(4px)' },
    center: { opacity: 1, x: 0, filter: 'blur(0px)' },
    exit: (travel: number) => reducedMotion
      ? { opacity: 0 }
      : { opacity: 0, x: travel * -22, filter: 'blur(3px)' },
  }

  const renderStep = () => {
    if (step === 0) {
      return (
        <div className="flex min-h-[440px] flex-col justify-center py-8">
          <div className="mb-7 inline-flex h-16 w-16 items-center justify-center rounded-[20px] border border-gold/25 bg-gold/[0.08] text-gold shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]">
            <Sparkles size={26} strokeWidth={1.7} />
          </div>
          <p className="mb-3 text-[11px] font-bold text-gold">Ersteinrichtung</p>
          <h1 className="max-w-[620px] text-[32px] font-semibold leading-[1.12] tracking-[-0.035em] text-label sm:text-[40px]">
            Willkommen in deinem neuen Department Dashboard.
          </h1>
          <p className="mt-5 max-w-[600px] text-[14px] leading-7 text-label-2">
            Wir verbinden jetzt Datenbank und Discord, laden deinen Bot live und richten den ersten geschützten Zugang ein. Die Zugangsdaten bleiben dabei ausschließlich auf diesem Server.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              [Database, 'Datenbank prüfen', 'Verbindung und Schema'],
              [Bot, 'Bot erkennen', 'Profil und Server live'],
              [ShieldCheck, 'Zugriff sichern', 'Admin-Rolle festlegen'],
            ].map(([Icon, title, description]) => {
              const StepIcon = Icon as typeof Database
              return (
                <div key={String(title)} className="rounded-2xl border border-line bg-surface p-4">
                  <StepIcon size={17} className="mb-3 text-gold" />
                  <p className="text-[12.5px] font-semibold text-label">{String(title)}</p>
                  <p className="mt-1 text-[11px] text-label-3">{String(description)}</p>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    if (step === 1) {
      return (
        <div className="py-3">
          <div className="mb-7">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan/12 bg-cyan/[0.07] text-cyan">
              <Database size={21} />
            </div>
            <h2 className="text-[25px] font-semibold tracking-[-0.025em] text-label">Datenbank verbinden</h2>
            <p className="mt-2 max-w-xl text-[13px] leading-6 text-label-2">MySQL oder MariaDB wird geprüft. Das Schema wird erst beim finalen Abschluss eingerichtet.</p>
          </div>

          <div>
            <FieldLabel hint="MySQL / MariaDB">Datenbank-URL</FieldLabel>
            <div className="relative">
              <Database size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-label-3" />
              <input
                value={databaseUrl}
                onChange={(event) => {
                  setDatabaseUrl(event.target.value)
                  setDatabaseResult(null)
                  setError('')
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && databaseUrl.trim() && !busy) void testDatabase()
                }}
                className={`${inputClass(databaseValid)} pl-11 font-mono text-[12px]`}
                placeholder="mysql://benutzer:passwort@host:3306/lspd_hr"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={() => void testDatabase()} busy={busy === 'database'} disabled={!databaseUrl.trim()}>
              Verbindung testen
            </PrimaryButton>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-label-3"><LockKeyhole size={12} /> Wird nicht an den Browser zurückgesendet</span>
          </div>

          <div className="mt-5">
            {databaseResult && databaseValid && (
              <InlineMessage tone="success">
                <strong className="font-semibold">{databaseResult.databaseName}</strong> ist erreichbar · {databaseResult.version} · {databaseResult.durationMs} ms
              </InlineMessage>
            )}
            {error && <InlineMessage tone="error">{error}</InlineMessage>}
          </div>
        </div>
      )
    }

    if (step === 2) {
      return (
        <div className="py-3">
          <div className="mb-7">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue/15 bg-blue/[0.09] text-blue">
              <Bot size={22} />
            </div>
            <h2 className="text-[25px] font-semibold tracking-[-0.025em] text-label">Discord Bot koppeln</h2>
            <p className="mt-2 max-w-xl text-[13px] leading-6 text-label-2">Nach der Prüfung laden wir Bot-Profil, Anwendung und alle verbundenen Server automatisch.</p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FieldLabel hint="Developer Portal → Bot">Bot-Token</FieldLabel>
              <div className="relative">
                <KeyRound size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-label-3" />
                <input
                  type={showBotToken ? 'text' : 'password'}
                  value={botToken}
                  onChange={(event) => {
                    setBotToken(event.target.value)
                    setDiscord(null)
                    setTestedBotToken('')
                    setError('')
                  }}
                  className={`${inputClass(discordValid)} pl-11 pr-12 font-mono text-[12px]`}
                  placeholder="Discord Bot-Token einfügen"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowBotToken((visible) => !visible)}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-label-3 transition-colors hover:bg-surface-3 hover:text-label"
                  aria-label={showBotToken ? 'Token ausblenden' : 'Token anzeigen'}
                >
                  {showBotToken ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="sm:col-span-2">
              <PrimaryButton onClick={() => void loadDiscord()} busy={busy === 'discord'} disabled={!botToken.trim()}>
                Bot prüfen und laden
              </PrimaryButton>
            </div>

            {discord && discordValid && (
              <div className="sm:col-span-2 flex items-center gap-4 rounded-2xl border border-green/12 bg-green/[0.055] p-4">
                <Image src={discord.bot.avatarUrl} alt="" width={48} height={48} className="h-12 w-12 rounded-[12px] bg-surface-2 object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[14px] font-semibold text-label">{discord.bot.displayName}</p>
                    <span className="rounded-md bg-blue/20 px-1.5 py-0.5 text-[11px] font-semibold text-blue">Bot</span>
                  </div>
                  <p className="mt-1 text-[11px] text-label-3">Verifiziert · {discord.guilds.length} Server gefunden · App {discord.application.id}</p>
                </div>
                <CheckCircle2 size={20} className="shrink-0 text-green" />
              </div>
            )}

            <div className="sm:col-span-2">
              <FieldLabel hint="Developer Portal → OAuth2">Client Secret</FieldLabel>
              <div className="relative">
                <LockKeyhole size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-label-3" />
                <input
                  type={showClientSecret ? 'text' : 'password'}
                  value={clientSecret}
                  onChange={(event) => setClientSecret(event.target.value)}
                  className={`${inputClass(clientSecret.trim().length >= 16)} pl-11 pr-12 font-mono text-[12px]`}
                  placeholder="OAuth2 Client Secret"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowClientSecret((visible) => !visible)}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-label-3 transition-colors hover:bg-surface-3 hover:text-label"
                  aria-label={showClientSecret ? 'Secret ausblenden' : 'Secret anzeigen'}
                >
                  {showClientSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {error && <InlineMessage tone="error">{error}</InlineMessage>}
            <InlineMessage tone="info">Aktiviere im Discord Developer Portal unter <strong className="font-semibold">Bot → Privileged Gateway Intents</strong> den Server Members Intent für die automatische Rollensynchronisierung.</InlineMessage>
          </div>
        </div>
      )
    }

    if (step === 3) {
      return (
        <div className="py-3">
          <div className="mb-7">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-gold/20 bg-gold/[0.07] text-gold">
              <ShieldCheck size={22} />
            </div>
            <h2 className="text-[25px] font-semibold tracking-[-0.025em] text-label">Server und Zugriff</h2>
            <p className="mt-2 max-w-xl text-[13px] leading-6 text-label-2">Wähle den Department-Server und mindestens eine Rolle, die den ersten Vollzugriff erhält.</p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FieldLabel>{busy === 'guild' ? 'Server wird geladen …' : 'Discord-Server'}</FieldLabel>
              <div className="relative">
                <Server size={15} className="absolute left-4 top-1/2 z-10 -translate-y-1/2 text-label-3" />
                <select
                  value={guildId}
                  disabled={busy === 'guild'}
                  onChange={(event) => void loadDiscord(event.target.value)}
                  className={`${inputClass(Boolean(selectedGuild))} appearance-none pl-11 pr-11`}
                >
                  <option value="">Server auswählen</option>
                  {discord?.guilds.map((guild) => <option key={guild.id} value={guild.id}>{guild.name}</option>)}
                </select>
                {busy === 'guild'
                  ? <LoaderCircle size={15} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-gold" />
                  : <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-label-3" />}
              </div>
            </div>

            {selectedGuild && discord?.roles.length ? (
              <div className="sm:col-span-2">
                <FieldLabel hint={`${adminRoleIds.length} ausgewählt`}>Administrator-Rollen</FieldLabel>
                <div className="max-h-[190px] overflow-y-auto rounded-2xl border border-line bg-surface p-2">
                  {discord.roles.map((role) => {
                    const active = adminRoleIds.includes(role.id)
                    const roleColor = role.color ? `#${role.color.toString(16).padStart(6, '0')}` : '#aab3bf'
                    return (
                      <button
                        type="button"
                        key={role.id}
                        onClick={() => toggleRole(role.id)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${active ? 'bg-gold/10' : 'hover:bg-surface-2'}`}
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: roleColor }} />
                        <span className={`flex-1 truncate text-[12.5px] ${active ? 'font-semibold text-label' : 'text-label-2'}`}>{role.name}</span>
                        {role.managed && <span className="text-[11px] text-label-4">Bot-Rolle</span>}
                        <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${active ? 'border-gold bg-gold text-ink' : 'border-line text-transparent'}`}>
                          <Check size={12} strokeWidth={3} />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <div className="sm:col-span-2">
              <FieldLabel hint="Für Discord OAuth">Öffentliche Website-URL</FieldLabel>
              <input value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} className={inputClass(/^https?:\/\//.test(siteUrl))} placeholder="https://dashboard.example.de" />
              <p className="mt-2 text-[11px] leading-5 text-label-3">OAuth Redirect: <span className="font-mono text-label-3">{siteUrl.replace(/\/$/, '') || 'https://…'}/api/auth/discord/callback</span></p>
            </div>

            <div>
              <FieldLabel hint="Optional">Ankündigungen</FieldLabel>
              <select value={announcementsChannelId} onChange={(event) => setAnnouncementsChannelId(event.target.value)} className={`${inputClass()} appearance-none`}>
                <option value="">Später festlegen</option>
                {discord?.channels.map((channel) => <option key={channel.id} value={channel.id}># {channel.name}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel hint="Optional">Sanktionen</FieldLabel>
              <select value={sanctionsChannelId} onChange={(event) => setSanctionsChannelId(event.target.value)} className={`${inputClass()} appearance-none`}>
                <option value="">Später festlegen</option>
                {discord?.channels.map((channel) => <option key={channel.id} value={channel.id}># {channel.name}</option>)}
              </select>
            </div>
          </div>

          {error && <div className="mt-5"><InlineMessage tone="error">{error}</InlineMessage></div>}
        </div>
      )
    }

    return (
      <div className="py-3">
        <div className="mb-7">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-green/12 bg-green/[0.07] text-green">
            <CheckCircle2 size={22} />
          </div>
          <h2 className="text-[25px] font-semibold tracking-[-0.025em] text-label">Bereit zum Einrichten</h2>
          <p className="mt-2 max-w-xl text-[13px] leading-6 text-label-2">Ein letzter Blick – danach werden Schema und geschützte Server-Konfiguration angelegt.</p>
        </div>

        <div className="space-y-3">
          {[
            { icon: Database, title: databaseResult?.databaseName || 'Datenbank', value: databaseResult?.version || 'Verbindung geprüft', tone: '#64d2ff' },
            { icon: Bot, title: discord?.bot.displayName || 'Discord Bot', value: discord?.application.name || 'Anwendung geprüft', tone: '#a9b1ff', image: discord?.bot.avatarUrl },
            { icon: Server, title: selectedGuild?.name || 'Discord-Server', value: `${selectedRoles.map((role) => role.name).join(', ') || adminRoleIds.length + ' Admin-Rolle(n)'}`, tone: '#e2c24f' },
            { icon: LockKeyhole, title: 'Öffentliche URL', value: siteUrl, tone: '#8ce8c5' },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div key={item.title} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5">
                {item.image ? (
                  <Image src={item.image} alt="" width={38} height={38} className="h-[38px] w-[38px] rounded-xl object-cover" />
                ) : (
                  <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-surface-2" style={{ color: item.tone }}><Icon size={17} /></div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-label">{item.title}</p>
                  <p className="mt-0.5 truncate text-[11px] text-label-3">{item.value}</p>
                </div>
                <CheckCircle2 size={16} className="shrink-0 text-green" />
              </div>
            )
          })}
        </div>

        <div className="mt-5">
          <InlineMessage tone="info">Die bestehende Datenbank wird nicht zurückgesetzt. Prisma gleicht ausschließlich das benötigte Schema ab; bei riskanten Änderungen bricht die Einrichtung ab.</InlineMessage>
        </div>
        {error && <div className="mt-3"><InlineMessage tone="error">{error}</InlineMessage></div>}
      </div>
    )
  }

  const progress = completed ? 1 : step / (steps.length - 1)

  return (
    <main className="relative min-h-screen overflow-hidden bg-canvas text-label">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(100,210,255,0.07),transparent_27%),radial-gradient(circle_at_88%_82%,rgba(212,175,55,0.075),transparent_30%)]" />
        <div className="absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,.13)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.13)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />
        <div className="absolute left-[8%] top-[12%] h-48 w-48 rounded-full border border-gold/10" />
        <div className="absolute left-[8%] top-[12%] h-32 w-32 translate-x-8 translate-y-8 rounded-full border border-cyan/6" />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center p-3 sm:p-6 lg:p-10">
        <div className="grid w-full max-w-[1120px] overflow-hidden rounded-[28px] border border-white/[0.075] bg-surface shadow-[0_30px_100px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.045)] backdrop-blur-2xl lg:grid-cols-[300px_1fr]">
          <aside className="relative border-b border-line bg-surface p-6 lg:border-b-0 lg:border-r lg:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-[12px] border border-gold/25 bg-surface-2">
                <Image src="/shield.webp" alt="LSPD" width={42} height={42} className="rounded-full" priority />
              </div>
              <div>
                <p className="text-[13.5px] font-semibold text-label">LSPD Department</p>
                <p className="mt-0.5 text-[11px] font-bold text-gold/80">System Setup</p>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-4 lg:mt-12 lg:block">
              <div className="relative h-[74px] w-[74px] shrink-0 lg:h-[104px] lg:w-[104px]">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
                  <circle cx="50" cy="50" r="43" fill="none" stroke="rgba(35,69,104,.65)" strokeWidth="5" />
                  <motion.circle
                    cx="50"
                    cy="50"
                    r="43"
                    fill="none"
                    stroke="#d4af37"
                    strokeLinecap="round"
                    strokeWidth="5"
                    pathLength="1"
                    strokeDasharray="1"
                    strokeDashoffset="1"
                    animate={{ strokeDashoffset: 1 - progress }}
                    transition={reducedMotion ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.45 }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-[15px] font-semibold text-label lg:text-[19px]">{completed ? '✓' : `${step + 1}/${steps.length}`}</div>
              </div>
              <div className="min-w-0 lg:mt-5">
                <p className="text-[11px] font-bold text-label-3">Fortschritt</p>
                <p className="mt-1 truncate text-[13px] font-semibold text-label">{completed ? 'Einsatzbereit' : steps[step].label}</p>
              </div>
            </div>

            <div className="mt-8 hidden space-y-1.5 lg:block">
              {steps.map((item, index) => {
                const Icon = item.icon
                const current = index === step && !completed
                const done = index < step || completed
                return (
                  <div key={item.label} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${current ? 'bg-surface-2' : ''}`}>
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg border ${done ? 'border-green/15 bg-green/10 text-green' : current ? 'border-gold/30 bg-gold/10 text-gold' : 'border-line text-label-4'}`}>
                      {done ? <Check size={13} strokeWidth={2.7} /> : <Icon size={13} />}
                    </div>
                    <span className={`text-[11.5px] ${current ? 'font-semibold text-label' : done ? 'text-label-2' : 'text-label-4'}`}>{item.label}</span>
                  </div>
                )
              })}
            </div>

            <div className="absolute bottom-7 left-8 right-8 hidden rounded-xl border border-line bg-surface p-3 lg:block">
              <div className="flex items-center gap-2 text-[11px] font-medium text-label-2"><LockKeyhole size={13} className="text-gold" /> Lokale Server-Konfiguration</div>
            </div>
          </aside>

          <section className="flex min-h-[640px] flex-col p-5 sm:p-8 lg:p-10">
            {completed ? (
              <motion.div
                initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-1 flex-col items-center justify-center py-10 text-center"
              >
                <div className="relative mb-7 flex h-24 w-24 items-center justify-center rounded-[30px] border border-green/15 bg-green/[0.08] text-green shadow-[0_0_60px_rgba(50,215,75,0.09)]">
                  <CheckCircle2 size={42} strokeWidth={1.6} />
                </div>
                <p className="mb-3 text-[11px] font-bold text-green">Einrichtung abgeschlossen</p>
                <h1 className="max-w-lg text-[31px] font-semibold leading-tight tracking-[-0.035em] text-label">Das Department Dashboard ist einsatzbereit.</h1>
                <p className="mt-4 max-w-md text-[13px] leading-6 text-label-2">Datenbank, Discord Bot und der erste Admin-Zugang sind eingerichtet. Nach dem Login kannst du Ränge, Ausbildungen und weitere Rollen konfigurieren.</p>
                <div className="mt-8">
                  <PrimaryButton onClick={() => window.location.assign('/login')}>Zum Discord-Login <ArrowRight size={15} /></PrimaryButton>
                </div>
                <p className="mt-5 max-w-sm text-[11px] leading-5 text-label-4">Bei einem selbst betriebenen Bot-Gateway verbindet sich der Bot spätestens nach dem nächsten Prozess-Neustart dauerhaft.</p>
              </motion.div>
            ) : (
              <>
                <div className="mb-5 flex items-center justify-between lg:hidden">
                  <p className="text-[11px] font-bold text-label-3">{steps[step].short}</p>
                  <div className="flex gap-1.5">{steps.map((item, index) => <span key={item.label} className={`h-1.5 rounded-full transition-all ${index === step ? 'w-6 bg-gold' : index < step ? 'w-1.5 bg-green' : 'w-1.5 bg-surface-3'}`} />)}</div>
                </div>

                <div className="relative flex-1 overflow-hidden">
                  <AnimatePresence mode="wait" custom={direction} initial={false}>
                    <motion.div
                      key={step}
                      custom={direction}
                      variants={motionVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={reducedMotion ? { duration: 0.12 } : { type: 'spring', bounce: 0, duration: 0.38 }}
                    >
                      {renderStep()}
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div className="mt-7 flex items-center justify-between gap-3 border-t border-line pt-5">
                  {step > 0 ? (
                    <SecondaryButton onClick={() => goTo(step - 1)} disabled={Boolean(busy)}><ArrowLeft size={14} /> Zurück</SecondaryButton>
                  ) : <span />}

                  {step < steps.length - 1 ? (
                    <PrimaryButton onClick={() => goTo(step + 1)} disabled={!canContinue || Boolean(busy)}>Weiter <ArrowRight size={14} /></PrimaryButton>
                  ) : (
                    <PrimaryButton onClick={() => void finishSetup()} busy={busy === 'complete'} disabled={!canContinue}>Dashboard einrichten <ShieldCheck size={15} /></PrimaryButton>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
