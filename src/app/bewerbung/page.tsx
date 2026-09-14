'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { BadgeCheck, CheckCircle2, ClipboardList, LogOut, MessageCircle, Send, ShieldCheck, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { fieldClass } from '@/components/ui/input'
import { PageLoader } from '@/components/ui/loading'
import { useAuth } from '@/context/auth-context'
import { useApi } from '@/hooks/use-api'
import { useFetch } from '@/hooks/use-fetch'
import { useToast } from '@/components/ui/toast'
import { cn, formatDateTime } from '@/lib/utils'
import {
  DEFAULT_APPLICATION_FORM_TITLE,
  JOB_APPLICATION_STATUS_META,
  applicationAnswerText,
  type ApplicationQuestion,
  type JobApplicationStatusValue,
} from '@/lib/job-applications'

interface PortalApplicationAnswer {
  id: string
  questionId: string
  questionTitle: string
  questionType: string
  value: Record<string, unknown>
  sortOrder: number
}

interface PortalApplication {
  id: string
  caseNumber: string | null
  status: JobApplicationStatusValue
  statusText: string
  submittedAt: string
  updatedAt: string
  reviewedAt: string | null
  answers: PortalApplicationAnswer[]
}

interface PortalPayload {
  user: {
    id: string
    username: string
    displayName: string
    discordId: string | null
    avatarUrl: string | null
  }
  formTitle: string
  questions: ApplicationQuestion[]
  application: PortalApplication | null
}

function startDiscordLogin() {
  window.location.href = '/api/auth/discord/login?mode=application&remember=1'
}

export default function ApplicationPortalPage() {
  const { user, loading: authLoading, refreshUser } = useAuth()
  const { execute } = useApi()
  const { addToast } = useToast()
  const { data, loading, error, refetch } = useFetch<PortalPayload>(!authLoading && user ? '/api/applications/me' : null)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [formOpen, setFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loginError, setLoginError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setLoginError(params.get('error') ?? '')
  }, [])

  const questions = useMemo(() => data?.questions ?? [], [data?.questions])
  const formTitle = data?.formTitle ?? DEFAULT_APPLICATION_FORM_TITLE
  const application = data?.application ?? null

  useEffect(() => {
    if (!data?.user || questions.length === 0) return

    setAnswers((current) => {
      let changed = false
      const next = { ...current }

      questions.forEach((question) => {
        if (question.options?.autoFill === 'DISCORD_ID' && next[question.id] !== data.user.discordId) {
          next[question.id] = data.user.discordId ?? ''
          changed = true
        }
      })

      return changed ? next : current
    })
  }, [data?.user, questions])

  const answeredRequired = useMemo(() => {
    if (questions.length === 0) return false
    return questions.every((question) => {
      if (!question.required) return true
      const value = answers[question.id]
      if (Array.isArray(value)) return value.length > 0
      return value !== undefined && value !== null && String(value).trim() !== ''
    })
  }, [answers, questions])

  const setAnswer = (questionId: string, value: unknown) => {
    setAnswers((current) => ({ ...current, [questionId]: value }))
  }

  const logout = async () => {
    await fetch('/api/auth/login', { method: 'DELETE' }).catch(() => undefined)
    await refreshUser().catch(() => undefined)
    window.location.href = '/bewerbung'
  }

  const submitApplication = async () => {
    setSubmitting(true)
    try {
      await execute('/api/applications', {
        method: 'POST',
        body: JSON.stringify({ answers }),
      })
      addToast({ type: 'success', title: 'Bewerbung eingereicht' })
      setFormOpen(false)
      setAnswers({})
      // Der Anzeigename trägt jetzt das Aktenzeichen — ohne refreshUser zeigt
      // die Kopfzeile weiter den alten Namen.
      await Promise.all([refetch(), refreshUser().catch(() => undefined)])
    } catch (e) {
      addToast({ type: 'error', title: 'Bewerbung konnte nicht gespeichert werden', message: e instanceof Error ? e.message : '' })
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading) return <PageLoader />

  return (
    <main className="min-h-screen bg-canvas text-label">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 border-b border-line pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <Image src="/shield.webp" alt="LSPD" width={36} height={36} priority />
            <div className="min-w-0 leading-tight">
              <p className="text-[15px] font-semibold tracking-[-0.01em] text-label">LSPD Bewerberportal</p>
              <p className="mt-0.5 truncate text-[12.5px] text-label-3">
                Discord Anmeldung
              </p>
            </div>
          </div>
          {user && (
            <button
              type="button"
              onClick={logout}
              className="inline-flex h-8 items-center gap-2 rounded-[8px] px-3 text-[13px] font-medium text-label-2 transition-colors hover:bg-white/[0.06] hover:text-label"
            >
              <LogOut size={14} strokeWidth={1.75} />
              Abmelden
            </button>
          )}
        </header>

        <div className="flex flex-1 items-center py-8">
          {!user ? (
            <section className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-5 lg:grid-cols-[1fr_360px] lg:items-center">
              <div className="min-w-0">
                <p className="mb-3 text-[14px] font-medium text-gold-bright">Bewerbung</p>
                <h1 className="max-w-2xl text-[30px] font-bold leading-[1.1] tracking-[-0.035em] text-label sm:text-[40px]">
                  Melde dich mit Discord an und reiche deine Bewerbung ein.
                </h1>
                <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-label-2">
                  Dieses Portal zeigt nur deine eigene Bewerbung und den aktuellen Status. Interne HR-Inhalte bleiben außerhalb dieses Bereichs.
                </p>
              </div>

              <div className="rounded-[16px] border border-line bg-surface p-5">
                <div className="mb-5 flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo/20 text-indigo">
                    <MessageCircle size={19} strokeWidth={1.9} />
                  </div>
                  <div>
                    <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-label">Discord-Konto verbinden</h2>
                    <p className="mt-1 text-[13px] leading-relaxed text-label-2">
                      Zugriff erhältst du mit der konfigurierten Bewerberrolle.
                    </p>
                  </div>
                </div>
                {loginError && (
                  <div role="alert" className="mb-4 rounded-[10px] bg-red/12 px-3.5 py-2.5 text-[13px] text-red">
                    {loginError}
                  </div>
                )}
                <Button type="button" size="lg" className="h-11 w-full" onClick={startDiscordLogin}>
                  <ShieldCheck size={16} strokeWidth={2} />
                  Mit Discord anmelden
                </Button>
              </div>
            </section>
          ) : loading ? (
            <PageLoader />
          ) : error || !data ? (
            <section className="mx-auto w-full max-w-xl rounded-[16px] bg-red/10 p-6 text-center">
              <ClipboardList size={28} className="mx-auto mb-3 text-red" />
              <h1 className="text-[17px] font-semibold text-label">Bewerberportal nicht verfügbar</h1>
              <p className="mt-2 text-[13px] leading-5 text-red">{error ?? 'Die Daten konnten nicht geladen werden.'}</p>
            </section>
          ) : application ? (
            <ApplicationStatusView application={application} user={data.user} />
          ) : formOpen ? (
            <ApplicationForm
              formTitle={formTitle}
              questions={questions}
              answers={answers}
              submitting={submitting}
              answeredRequired={answeredRequired}
              onAnswer={setAnswer}
              onBack={() => setFormOpen(false)}
              onSubmit={submitApplication}
            />
          ) : (
            <ApplicationOpenView formTitle={formTitle} user={data.user} onOpen={() => setFormOpen(true)} />
          )}
        </div>
      </div>
    </main>
  )
}

function ApplicationOpenView({
  formTitle,
  user,
  onOpen,
}: {
  formTitle: string
  user: PortalPayload['user']
  onOpen: () => void
}) {
  return (
    <section className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-5 lg:grid-cols-[1fr_340px] lg:items-center">
      <div>
        <p className="mb-3 text-[14px] font-medium text-gold-bright">{formTitle}</p>
        <h1 className="max-w-2xl text-[30px] font-bold leading-[1.1] tracking-[-0.035em] text-label sm:text-[38px]">
          Bewerbung öffnen für {user.displayName}
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-label-2">
          Du beantwortest die Fragen einmal. Danach siehst du hier live den Status deiner Bewerbung.
        </p>
        <Button type="button" size="lg" className="mt-6" onClick={onOpen}>
          <ClipboardList size={16} />
          Bewerbung öffnen
        </Button>
      </div>

      <AccountPanel user={user} />
    </section>
  )
}

function AccountPanel({ user }: { user: PortalPayload['user'] }) {
  return (
    <aside className="rounded-[16px] border border-line bg-surface p-5">
      <div className="flex items-center gap-3">
        {user.avatarUrl ? (
          <span
            className="h-12 w-12 shrink-0 rounded-full bg-cover bg-center ring-1 ring-white/10"
            style={{ backgroundImage: `url(${user.avatarUrl})` }}
            aria-label={user.displayName}
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-4 text-[16px] font-semibold text-label">
            {user.displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-label">{user.displayName}</p>
          <p className="mt-0.5 truncate text-[11.5px] text-label-3">
            {user.discordId ? `Discord-ID ${user.discordId}` : user.username}
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-[12px] bg-white/[0.04] p-3.5">
        <div className="flex items-start gap-2.5">
          <UserRound size={16} className="mt-0.5 shrink-0 text-label-3" strokeWidth={1.75} />
          <p className="text-[12.5px] leading-5 text-label-2">
            Dein Discord-Account wird nur zur Zuordnung deiner Bewerbung genutzt.
          </p>
        </div>
      </div>
    </aside>
  )
}

function ApplicationStatusView({ application, user }: { application: PortalApplication; user: PortalPayload['user'] }) {
  const meta = JOB_APPLICATION_STATUS_META[application.status]

  return (
    <section className="mx-auto w-full max-w-4xl space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="rounded-[16px] border border-line bg-surface p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge variant={meta.variant}>{meta.label}</Badge>
            <span className="text-[12px] text-label-3">Aktualisiert {formatDateTime(application.updatedAt)}</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-green/14 text-green">
              <CheckCircle2 size={25} />
            </div>
            <div className="min-w-0">
              <h1 className="text-[22px] font-semibold leading-tight text-label">Deine Bewerbung ist eingereicht</h1>
              <p className="mt-2 text-[14px] leading-6 text-label">{application.statusText}</p>
              {application.caseNumber && (
                <div className="mt-4 rounded-[12px] bg-gold/10 px-4 py-3">
                  <p className="text-[13px] font-medium text-gold-bright">
                    Dein Aktenzeichen
                  </p>
                  <p className="mt-1 font-mono text-[22px] font-semibold tabular-nums text-label">
                    {application.caseNumber}
                  </p>
                  <p className="mt-1.5 text-[12px] leading-5 text-gold-bright">
                    Nenne dieses Aktenzeichen bei jeder Rückfrage. Dein Name wurde dafür auf
                    „{application.caseNumber} | Vorname Nachname“ umgestellt.
                  </p>
                </div>
              )}
              <p className="mt-3 text-[12.5px] text-label-2">Eingereicht {formatDateTime(application.submittedAt)}</p>
            </div>
          </div>
        </div>
        <AccountPanel user={user} />
      </div>

      <section className="rounded-[16px] border border-line bg-surface p-5">
        <div className="mb-3 flex items-center gap-2">
          <BadgeCheck size={17} className="text-label-3" strokeWidth={1.75} />
          <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-label">Deine Antworten</h2>
        </div>
        <div className="space-y-3">
          {application.answers.map((answer, index) => (
            <div key={answer.id} className="rounded-[12px] border border-line bg-surface p-3">
              <div className="mb-1.5 flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-[11px] font-semibold tabular-nums text-label-2">
                  {index + 1}
                </span>
                <p className="text-[12.5px] font-semibold text-label">{answer.questionTitle}</p>
              </div>
              <p className="whitespace-pre-wrap pl-7 text-[12.5px] leading-5 text-label-2">{applicationAnswerText(answer)}</p>
            </div>
          ))}
        </div>
      </section>
    </section>
  )
}

function ApplicationForm({
  formTitle,
  questions,
  answers,
  submitting,
  answeredRequired,
  onAnswer,
  onBack,
  onSubmit,
}: {
  formTitle: string
  questions: ApplicationQuestion[]
  answers: Record<string, unknown>
  submitting: boolean
  answeredRequired: boolean
  onAnswer: (questionId: string, value: unknown) => void
  onBack: () => void
  onSubmit: () => void
}) {
  return (
    <section className="mx-auto w-full max-w-3xl">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[14px] font-medium text-gold-bright">{formTitle}</p>
          <h1 className="text-[22px] font-semibold text-label">Fragen beantworten</h1>
          <p className="mt-1 text-[13px] leading-5 text-label-2">Fülle alle Pflichtfragen aus und sende deine Bewerbung ab.</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onBack} disabled={submitting}>
          Zurück
        </Button>
      </div>

      <div className="space-y-4">
        {questions.map((question, index) => (
          <Fragment key={question.id}>
            {question.section && question.section !== questions[index - 1]?.section && (
              <div className="pt-2">
                <p className="border-b border-line pb-2 text-[13px] font-semibold text-label-2">
                  {question.section}
                </p>
              </div>
            )}
            <QuestionField
              index={index}
              question={question}
              value={answers[question.id]}
              onChange={(value) => onAnswer(question.id, value)}
            />
          </Fragment>
        ))}
      </div>

      <div className="lspd-popover sticky bottom-4 mt-5 rounded-[14px] p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 pl-1 text-[13px] tabular-nums text-label-2">
            <ClipboardList size={16} className="text-label-3" strokeWidth={1.75} />
            {questions.length} Frage(n)
          </div>
          <Button type="button" onClick={onSubmit} loading={submitting} disabled={!answeredRequired}>
            <Send size={14} />
            Bewerbung absenden
          </Button>
        </div>
      </div>
    </section>
  )
}

function QuestionField({
  index,
  question,
  value,
  onChange,
}: {
  index: number
  question: ApplicationQuestion
  value: unknown
  onChange: (value: unknown) => void
}) {
  return (
    <section className="rounded-[12px] border border-line bg-surface p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-[12px] font-semibold tabular-nums text-label-2">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[14px] font-semibold text-label">{question.title}</h2>
            {question.required && <Badge variant="warning">Pflicht</Badge>}
          </div>
          {question.description && <p className="mt-1 text-[12.5px] leading-5 text-label-2">{question.description}</p>}
        </div>
      </div>
      <QuestionInput question={question} value={value} onChange={onChange} />
    </section>
  )
}

function QuestionInput({ question, value, onChange }: { question: ApplicationQuestion; value: unknown; onChange: (value: unknown) => void }) {
  const readOnly = Boolean(question.options?.readOnly || question.options?.autoFill)

  if (question.type === 'SHORT_TEXT') {
    return (
      <input
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={readOnly}
        className={cn(fieldClass, 'h-[34px] px-3', readOnly && 'cursor-not-allowed text-label-3 hover:border-line-strong')}
        placeholder={readOnly ? 'Wird automatisch ermittelt' : 'Antwort eingeben'}
      />
    )
  }

  if (question.type === 'LONG_TEXT') {
    return (
      <textarea
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        className={cn(fieldClass, 'resize-none px-3 py-2 leading-relaxed')}
        placeholder="Antwort eingeben"
      />
    )
  }

  if (question.type === 'SINGLE_CHOICE') {
    const selected = typeof value === 'string' ? value : ''
    return (
      <div className="space-y-2">
        {(question.options?.choices ?? []).map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => onChange(choice)}
            className={cn(
              'flex w-full items-center gap-2 rounded-[10px] border px-3 py-2.5 text-left text-[13px] transition-colors',
              selected === choice
                ? 'border-gold/60 bg-gold/12 text-label'
                : 'border-line bg-white/[0.03] text-label hover:bg-white/[0.06]',
            )}
          >
            <span
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                selected === choice ? 'border-gold bg-gold' : 'border-line-strong bg-white/[0.04]',
              )}
            >
              {selected === choice && <span className="h-1.5 w-1.5 rounded-full bg-ink" />}
            </span>
            {choice}
          </button>
        ))}
      </div>
    )
  }

  if (question.type === 'MULTIPLE_CHOICE') {
    const selected = Array.isArray(value) ? value.map(String) : []
    const toggle = (choice: string) => {
      onChange(selected.includes(choice) ? selected.filter((item) => item !== choice) : [...selected, choice])
    }
    return (
      <div className="space-y-2">
        {(question.options?.choices ?? []).map((choice) => (
          <Checkbox
            key={choice}
            checked={selected.includes(choice)}
            onCheckedChange={() => toggle(choice)}
            label={choice}
            className="rounded-[10px] border border-line bg-white/[0.03] px-3 py-2.5 transition-colors hover:bg-white/[0.06]"
          />
        ))}
      </div>
    )
  }

  const min = question.options?.min ?? 1
  const max = question.options?.max ?? 5
  const scale = Array.from({ length: Math.max(1, max - min + 1) }, (_, idx) => min + idx)
  const selected = typeof value === 'number' ? value : Number(value)

  return (
    <div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(scale.length, 10)}, minmax(0, 1fr))` }}>
        {scale.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            className={cn(
              'h-10 rounded-[9px] border text-[13.5px] font-semibold tabular-nums transition-[background-color,border-color,color,scale] duration-150 active:scale-95',
              selected === item
                ? 'border-gold bg-gold text-ink'
                : 'border-line bg-white/[0.03] text-label-2 hover:bg-white/[0.06] hover:text-label',
            )}
          >
            {item}
          </button>
        ))}
      </div>
      {(question.options?.minLabel || question.options?.maxLabel) && (
        <div className="mt-2 flex justify-between gap-4 text-[11.5px] text-label-3">
          <span>{question.options?.minLabel}</span>
          <span>{question.options?.maxLabel}</span>
        </div>
      )}
    </div>
  )
}
