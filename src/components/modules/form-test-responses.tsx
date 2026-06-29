'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, BarChart3, CheckCircle2, Clipboard, Save, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { useToast } from '@/components/ui/toast'
import { cn, formatDateTime } from '@/lib/utils'

type ModuleKey = 'ACADEMY' | 'HR' | 'SRU' | 'AIR_SUPPORT' | 'DETECTIVE'
type FormTestStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
type FormTestKind = 'TEST' | 'SURVEY'
type QuestionType = 'SHORT_TEXT' | 'LONG_TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'SCALE'

interface QuestionOptions {
  choices?: string[]
  correct?: string[]
  min?: number
  max?: number
  minLabel?: string
  maxLabel?: string
}

interface FormQuestion {
  id?: string
  type: QuestionType
  title: string
  description: string | null
  required: boolean
  options: QuestionOptions | null
  points: number
  sortOrder: number
}

interface FormAnswer {
  id: string
  questionId: string
  value: Record<string, unknown>
  question: FormQuestion
}

interface FormResponse {
  id: string
  respondentName: string
  respondent: { id: string; displayName: string; username: string; discordId: string | null } | null
  score: number | null
  maxScore: number
  reviewNote: string | null
  reviewedAt: string | null
  reviewedBy: { id: string; displayName: string } | null
  submittedAt: string
  answers: FormAnswer[]
}

interface ResponsesPayload {
  test: {
    id: string
    module: ModuleKey
    title: string
    kind: FormTestKind
    status: FormTestStatus
    anonymousResponses: boolean
    questions: FormQuestion[]
  }
  responses: FormResponse[]
}

const STATUS_META: Record<FormTestStatus, { label: string; variant: 'default' | 'success' | 'warning' }> = {
  DRAFT: { label: 'Entwurf', variant: 'warning' },
  ACTIVE: { label: 'Aktiv', variant: 'success' },
  ARCHIVED: { label: 'Archiv', variant: 'default' },
}

const KIND_META: Record<FormTestKind, { label: string; variant: 'info' | 'warning' }> = {
  TEST: { label: 'Test', variant: 'warning' },
  SURVEY: { label: 'Umfrage', variant: 'info' },
}

function modulePath(module: ModuleKey) {
  if (module === 'ACADEMY') return '/academy'
  if (module === 'HR') return '/hr'
  if (module === 'SRU') return '/sru'
  if (module === 'AIR_SUPPORT') return '/air-support'
  if (module === 'DETECTIVE') return '/detective'
  return '/'
}

function responseScore(response: Pick<FormResponse, 'score' | 'maxScore'>) {
  if (response.maxScore <= 0) return 'Ohne Punkte'
  return `${response.score ?? '-'} / ${response.maxScore}`
}

function answerText(answer: FormAnswer) {
  const value = answer.value
  if (typeof value.text === 'string' && value.text.trim()) return value.text
  if (typeof value.selected === 'string' && value.selected.trim()) return value.selected
  if (Array.isArray(value.selected) && value.selected.length > 0) return value.selected.join(', ')
  if (typeof value.value === 'number') return String(value.value)
  return 'Keine Antwort'
}

function selectedValues(answer: FormAnswer | undefined) {
  if (!answer) return []
  if (typeof answer.value.selected === 'string') return [answer.value.selected]
  if (Array.isArray(answer.value.selected)) return answer.value.selected.map(String)
  return []
}

function correctValues(question: FormQuestion) {
  return question.options?.correct ?? []
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="glass-panel-elevated flex items-center gap-3 rounded-[12px] border border-white/[0.04] px-4 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#d4af37]/15 text-[#d4af37]">{icon}</div>
      <div>
        <p className="text-[20px] font-semibold leading-tight text-white tabular-nums">{value}</p>
        <p className="mt-0.5 text-[11px] text-[#8ea4bd]">{label}</p>
      </div>
    </div>
  )
}

export function FormTestResponses({ testId }: { testId: string }) {
  const { addToast } = useToast()
  const { execute } = useApi()
  const { data, loading, error: loadError, refetch } = useFetch<ResponsesPayload>(testId ? `/api/form-tests/${testId}/responses` : null)
  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(null)
  const [scoreInput, setScoreInput] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const responses = useMemo(() => data?.responses ?? [], [data?.responses])
  const selected = responses.find((response) => response.id === selectedResponseId) ?? responses[0] ?? null

  useEffect(() => {
    if (selected && selected.id !== selectedResponseId) setSelectedResponseId(selected.id)
  }, [selected, selectedResponseId])

  useEffect(() => {
    if (!selected) {
      setScoreInput('')
      setNoteInput('')
      return
    }
    setScoreInput(selected.score === null ? '' : String(selected.score))
    setNoteInput(selected.reviewNote ?? '')
  }, [selected])

  const stats = useMemo(() => {
    const scored = responses.filter((response) => response.maxScore > 0 && response.score !== null)
    const average = scored.length > 0
      ? Math.round(scored.reduce((sum, response) => sum + (response.score ?? 0), 0) / scored.length)
      : null
    return {
      total: responses.length,
      reviewed: responses.filter((response) => response.reviewedAt).length,
      average,
    }
  }, [responses])

  const saveReview = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await execute(`/api/form-tests/${testId}/responses/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          score: scoreInput.trim() ? Number(scoreInput) : null,
          reviewNote: noteInput,
        }),
      })
      addToast({ type: 'success', title: 'Bewertung gespeichert' })
      await refetch()
    } catch (e) {
      addToast({ type: 'error', title: 'Bewertung fehlgeschlagen', message: e instanceof Error ? e.message : '' })
    } finally {
      setSaving(false)
    }
  }

  const deleteResponse = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      await execute(`/api/form-tests/${testId}/responses/${selected.id}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'Abgabe gelöscht', message: 'Der Test kann nun wiederholt werden.' })
      setSelectedResponseId(null)
      setConfirmDelete(false)
      await refetch()
    } catch (e) {
      addToast({ type: 'error', title: 'Löschen fehlgeschlagen', message: e instanceof Error ? e.message : '' })
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <PageLoader />

  if (!data) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Abgaben" description="Die Auswertung konnte nicht geladen werden." eyebrow="Auswertung" />
        <div className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/45 py-14 text-center">
          <Clipboard size={26} className="mx-auto mb-2 text-[#4a6585]" />
          <p className="text-[13px] text-[#8ea4bd]">{loadError ?? 'Auswertung nicht verfügbar'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={data.test.title}
        description={data.test.kind === 'SURVEY'
          ? 'Abgaben und Auswertung dieser Umfrage.'
          : 'Abgaben, Punkte und Bewertungsnotizen dieses Tests.'}
        eyebrow={data.test.kind === 'SURVEY' ? 'Umfrage-Auswertung' : 'Test-Auswertung'}
        action={(
          <Link href={modulePath(data.test.module)}>
            <Button variant="secondary" size="sm">
              <ArrowLeft size={13} />
              Zurück
            </Button>
          </Link>
        )}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Badge variant={KIND_META[data.test.kind].variant}>{KIND_META[data.test.kind].label}</Badge>
        <Badge variant={STATUS_META[data.test.status].variant}>{STATUS_META[data.test.status].label}</Badge>
        {data.test.kind === 'SURVEY' && data.test.anonymousResponses && <Badge variant="info">Anonym</Badge>}
      </div>

      {responses.length === 0 ? (
        <div className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/45 py-14 text-center">
          <Clipboard size={26} className="mx-auto mb-2 text-[#4a6585]" />
          <p className="text-[13px] text-[#8ea4bd]">Noch keine Abgaben vorhanden</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <StatCard label="Abgaben" value={stats.total} icon={<Clipboard size={16} />} />
            <StatCard label="Bewertet" value={stats.reviewed} icon={<CheckCircle2 size={16} />} />
            <StatCard label="Ø Punkte" value={stats.average ?? 0} icon={<BarChart3 size={16} />} />
          </div>

          <QuestionAnalytics questions={data.test.questions} responses={responses} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
            <aside className="glass-panel-elevated overflow-hidden rounded-[14px] border border-[#1e3a5c]/45">
              <div className="border-b border-[#18385f]/45 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8ea4bd]">Abgaben</p>
              </div>
              <div className="max-h-[640px] overflow-y-auto p-1.5">
                {responses.map((response) => (
                  <button
                    key={response.id}
                    type="button"
                    onClick={() => setSelectedResponseId(response.id)}
                    className={cn(
                      'w-full rounded-[9px] border px-3 py-2.5 text-left transition-colors',
                      selected?.id === response.id
                        ? 'border-[#d4af37]/30 bg-[#d4af37]/12'
                        : 'border-transparent hover:bg-[#102542]/60',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-white">{response.respondent?.displayName ?? response.respondentName}</p>
                        <p className="mt-0.5 text-[11px] text-[#6b8299]">{formatDateTime(response.submittedAt)}</p>
                      </div>
                      <Badge variant={response.reviewedAt ? 'success' : 'default'}>{responseScore(response)}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            {selected && (
              <section className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/45 p-4">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-[15px] font-semibold text-white">{selected.respondent?.displayName ?? selected.respondentName}</h3>
                    <p className="mt-0.5 text-[12px] text-[#8ea4bd]">Abgegeben {formatDateTime(selected.submittedAt)}</p>
                  </div>
                  <Badge variant={selected.reviewedAt ? 'success' : 'warning'}>
                    {selected.reviewedAt ? `Bewertet von ${selected.reviewedBy?.displayName ?? 'Unbekannt'}` : 'Offen'}
                  </Badge>
                </div>

                <div className="space-y-3">
                  {selected.answers.map((answer, index) => {
                    const correct = correctValues(answer.question)
                    const chosen = selectedValues(answer)
                    const showCorrect = data.test.kind === 'TEST' && correct.length > 0
                    const isCorrect = showCorrect && correct.length === chosen.length && correct.every((value) => chosen.includes(value))
                    return (
                      <div key={answer.id} className="rounded-[12px] border border-[#18385f]/45 bg-[#071a30]/45 p-3">
                        <div className="mb-2 flex items-start gap-2">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-[#102542] text-[10px] font-semibold text-[#d4af37]">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-white">{answer.question.title}</p>
                            <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-5 text-[#dbe6f3]">{answerText(answer)}</p>
                          </div>
                          {showCorrect && (
                            <Badge variant={isCorrect ? 'success' : 'danger'}>{isCorrect ? 'Richtig' : 'Falsch'}</Badge>
                          )}
                        </div>
                        {showCorrect && (
                          <p className="pl-7 text-[11.5px] text-[#8ea4bd]">Richtig: {correct.join(', ')}</p>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="mt-5 rounded-[12px] border border-[#18385f]/45 bg-[#04101f]/50 p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
                    <Input
                      label={`Punkte${selected.maxScore > 0 ? ` von ${selected.maxScore}` : ''}`}
                      type="number"
                      min={0}
                      value={scoreInput}
                      onChange={(event) => setScoreInput(event.target.value)}
                    />
                    <Textarea label="Bewertungsnotiz" value={noteInput} onChange={(event) => setNoteInput(event.target.value)} rows={2} />
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} disabled={saving || deleting}>
                      <Trash2 size={13} />
                      Abgabe löschen
                    </Button>
                    <Button size="sm" onClick={saveReview} loading={saving}>
                      <Save size={13} />
                      Bewertung speichern
                    </Button>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Abgabe löschen" size="sm">
        <div className="space-y-4">
          <div className="flex gap-3 rounded-[12px] border border-[#7f1d1d]/45 bg-[#2a1016]/55 p-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#f87171]/14 text-[#fca5a5]">
              <AlertTriangle size={17} strokeWidth={2} />
            </div>
            <p className="text-[13px] leading-6 text-[#dbe6f3]">
              Abgabe von <span className="font-semibold text-white">{selected?.respondent?.displayName ?? selected?.respondentName}</span> wirklich löschen?
              Die Person kann den {data.test.kind === 'SURVEY' ? 'Fragebogen' : 'Test'} danach erneut ausfüllen. Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Abbrechen
            </Button>
            <Button variant="danger" size="sm" onClick={deleteResponse} loading={deleting}>
              <Trash2 size={13} />
              Abgabe löschen
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function QuestionAnalytics({ questions, responses }: { questions: FormQuestion[]; responses: FormResponse[] }) {
  if (questions.length === 0) return null

  return (
    <section className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/45 p-4">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 size={15} className="text-[#d4af37]" />
        <h3 className="text-[14px] font-semibold text-white">Auswertung</h3>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {questions.map((question) => {
          const answers = responses
            .map((response) => response.answers.find((answer) => answer.questionId === question.id))
            .filter((answer): answer is FormAnswer => Boolean(answer))

          if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') {
            const choices = question.options?.choices ?? []
            const counts = new Map(choices.map((choice) => [choice, 0]))
            for (const answer of answers) {
              for (const selected of selectedValues(answer)) counts.set(selected, (counts.get(selected) ?? 0) + 1)
            }
            const max = Math.max(1, ...Array.from(counts.values()))
            return (
              <div key={question.id} className="rounded-[12px] border border-[#18385f]/45 bg-[#071a30]/45 p-3">
                <p className="mb-2 text-[12.5px] font-semibold text-white">{question.title}</p>
                <div className="space-y-2">
                  {choices.map((choice) => {
                    const count = counts.get(choice) ?? 0
                    return (
                      <div key={choice}>
                        <div className="mb-1 flex justify-between gap-2 text-[11.5px]">
                          <span className="truncate text-[#b7c5d8]">{choice}</span>
                          <span className="text-[#6b8299]">{count}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[#102542]">
                          <div className="h-full rounded-full bg-[#d4af37]" style={{ width: `${Math.round((count / max) * 100)}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          }

          if (question.type === 'SCALE') {
            const values = answers.map((answer) => Number(answer.value.value)).filter(Number.isFinite)
            const average = values.length > 0 ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : '-'
            return (
              <div key={question.id} className="rounded-[12px] border border-[#18385f]/45 bg-[#071a30]/45 p-3">
                <p className="text-[12.5px] font-semibold text-white">{question.title}</p>
                <p className="mt-2 text-[22px] font-semibold text-[#d4af37] tabular-nums">{average}</p>
                <p className="text-[11.5px] text-[#6b8299]">{values.length} Antwort(en)</p>
              </div>
            )
          }

          return (
            <div key={question.id} className="rounded-[12px] border border-[#18385f]/45 bg-[#071a30]/45 p-3">
              <p className="text-[12.5px] font-semibold text-white">{question.title}</p>
              <p className="mt-2 text-[22px] font-semibold text-[#d4af37] tabular-nums">{answers.length}</p>
              <p className="text-[11.5px] text-[#6b8299]">Textantwort(en)</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
