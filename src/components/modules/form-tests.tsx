'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  CheckCircle2,
  Clipboard,
  Copy,
  ExternalLink,
  FileQuestion,
  GripVertical,
  Link2,
  MoveDown,
  MoveUp,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { useToast } from '@/components/ui/toast'
import { cn, formatDateTime } from '@/lib/utils'

type ModuleKey = 'ACADEMY' | 'HR' | 'SRU' | 'AIR_SUPPORT' | 'DETECTIVE'
type FormTestStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
type QuestionType = 'SHORT_TEXT' | 'LONG_TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'SCALE'
type ViewMode = 'editor' | 'responses'

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

interface FormTest {
  id: string
  module: ModuleKey
  title: string
  description: string | null
  status: FormTestStatus
  shareToken: string
  createdAt: string
  updatedAt: string
  createdBy: { id: string; displayName: string } | null
  questions: FormQuestion[]
  _count: { responses: number; questions: number }
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
    title: string
    status: FormTestStatus
    questions: FormQuestion[]
  }
  responses: FormResponse[]
}

interface FormTestsProps {
  module: ModuleKey
  title: string
  description: string
  canManage: boolean
}

const STATUS_META: Record<FormTestStatus, { label: string; variant: 'default' | 'success' | 'warning'; action: string }> = {
  DRAFT: { label: 'Entwurf', variant: 'warning', action: 'Aktivieren' },
  ACTIVE: { label: 'Aktiv', variant: 'success', action: 'Deaktivieren' },
  ARCHIVED: { label: 'Archiv', variant: 'default', action: 'Reaktivieren' },
}

const QUESTION_TYPE_OPTIONS = [
  { value: 'SHORT_TEXT', label: 'Kurzantwort' },
  { value: 'LONG_TEXT', label: 'Langtext' },
  { value: 'SINGLE_CHOICE', label: 'Eine Auswahl' },
  { value: 'MULTIPLE_CHOICE', label: 'Mehrfachauswahl' },
  { value: 'SCALE', label: 'Skala' },
]

const EMPTY_CREATE_FORM = { title: '', description: '' }

function createEmptyQuestion(): FormQuestion {
  return {
    id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: 'LONG_TEXT',
    title: '',
    description: null,
    required: true,
    options: null,
    points: 0,
    sortOrder: 0,
  }
}

function defaultOptions(type: QuestionType): QuestionOptions | null {
  if (type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE') return { choices: ['Option 1', 'Option 2'], correct: [] }
  if (type === 'SCALE') return { min: 1, max: 5, minLabel: '', maxLabel: '' }
  return null
}

function normalizeQuestions(questions: FormQuestion[]) {
  return questions.map((question, index) => ({
    ...question,
    sortOrder: index,
    points: Number.isFinite(Number(question.points)) ? Math.max(0, Math.round(Number(question.points))) : 0,
    description: question.description?.trim() || null,
    options: defaultedOptions(question),
  }))
}

function defaultedOptions(question: FormQuestion): QuestionOptions | null {
  if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') {
    const choices = (question.options?.choices ?? []).map((choice) => choice.trim()).filter(Boolean)
    const correct = (question.options?.correct ?? []).filter((choice) => choices.includes(choice))
    return { choices, correct }
  }
  if (question.type === 'SCALE') {
    const min = Number(question.options?.min ?? 1)
    const max = Number(question.options?.max ?? 5)
    return {
      min: Number.isFinite(min) ? Math.round(min) : 1,
      max: Number.isFinite(max) ? Math.max(Math.round(max), Math.round(min) + 1) : 5,
      minLabel: question.options?.minLabel?.trim() ?? '',
      maxLabel: question.options?.maxLabel?.trim() ?? '',
    }
  }
  return null
}

function testLink(shareToken: string) {
  if (typeof window === 'undefined') return `/form-tests/${shareToken}`
  return `${window.location.origin}/form-tests/${shareToken}`
}

function statusNext(status: FormTestStatus): FormTestStatus {
  if (status === 'ACTIVE') return 'DRAFT'
  if (status === 'ARCHIVED') return 'DRAFT'
  return 'ACTIVE'
}

function responseScore(response: Pick<FormResponse, 'score' | 'maxScore'>) {
  if (response.maxScore <= 0) return 'Ohne Punkte'
  return `${response.score ?? '-'} / ${response.maxScore}`
}

function answerText(answer: FormAnswer) {
  const value = answer.value
  if (typeof value.text === 'string') return value.text
  if (typeof value.selected === 'string') return value.selected
  if (Array.isArray(value.selected)) return value.selected.join(', ')
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

export function FormTests({ module, title, description, canManage }: FormTestsProps) {
  const [showArchived, setShowArchived] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('editor')
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM)
  const [draft, setDraft] = useState<FormTest | null>(null)
  const [draftDirty, setDraftDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const { addToast } = useToast()
  const { execute } = useApi()
  const { data: tests, loading, refetch } = useFetch<FormTest[]>(`/api/form-tests?module=${module}${showArchived ? '&archived=true' : ''}`)

  const selected = useMemo(() => tests?.find((test) => test.id === selectedId) ?? tests?.[0] ?? null, [selectedId, tests])
  const canEditQuestions = canManage && !!selected && selected._count.responses === 0

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id)
  }, [selected, selectedId])

  useEffect(() => {
    if (!selected) {
      setDraft(null)
      setDraftDirty(false)
      return
    }
    if (draftDirty && draft?.id === selected.id) return
    setDraft({
      ...selected,
      questions: selected.questions.map((question, index) => ({
        ...question,
        sortOrder: index,
        options: defaultedOptions(question),
      })),
    })
    setDraftDirty(false)
  }, [draft?.id, draftDirty, selected])

  const stats = useMemo(() => {
    const list = tests ?? []
    return {
      total: list.length,
      active: list.filter((test) => test.status === 'ACTIVE').length,
      responses: list.reduce((sum, test) => sum + test._count.responses, 0),
    }
  }, [tests])

  const createTest = async () => {
    const titleValue = createForm.title.trim()
    if (!titleValue) {
      addToast({ type: 'error', title: 'Titel fehlt' })
      return
    }
    setSaving(true)
    try {
      const created = await execute('/api/form-tests', {
        method: 'POST',
        body: JSON.stringify({
          module,
          title: titleValue,
          description: createForm.description,
        }),
      }) as FormTest | null
      addToast({ type: 'success', title: 'Test erstellt' })
      setCreateOpen(false)
      setCreateForm(EMPTY_CREATE_FORM)
      await refetch()
      if (created?.id) setSelectedId(created.id)
    } catch (e) {
      addToast({ type: 'error', title: 'Test konnte nicht erstellt werden', message: e instanceof Error ? e.message : '' })
    } finally {
      setSaving(false)
    }
  }

  const saveDraft = async () => {
    if (!draft) return
    const titleValue = draft.title.trim()
    if (!titleValue) {
      addToast({ type: 'error', title: 'Titel fehlt' })
      return
    }
    setSaving(true)
    try {
      await execute(`/api/form-tests/${draft.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: titleValue,
          description: draft.description,
          status: draft.status,
          ...(canEditQuestions ? { questions: normalizeQuestions(draft.questions) } : {}),
        }),
      })
      addToast({ type: 'success', title: 'Test gespeichert' })
      setDraftDirty(false)
      await refetch()
    } catch (e) {
      addToast({ type: 'error', title: 'Speichern fehlgeschlagen', message: e instanceof Error ? e.message : '' })
    } finally {
      setSaving(false)
    }
  }

  const deleteTest = async () => {
    if (!selected || !confirm(`Test "${selected.title}" wirklich löschen? Alle Abgaben werden mitgelöscht.`)) return
    setSaving(true)
    try {
      await execute(`/api/form-tests/${selected.id}`, { method: 'DELETE' })
      addToast({ type: 'success', title: 'Test gelöscht' })
      setSelectedId(null)
      await refetch()
    } catch (e) {
      addToast({ type: 'error', title: 'Löschen fehlgeschlagen', message: e instanceof Error ? e.message : '' })
    } finally {
      setSaving(false)
    }
  }

  const copyLink = async () => {
    if (!selected) return
    const link = testLink(selected.shareToken)
    await navigator.clipboard.writeText(link)
    addToast({ type: 'success', title: 'Link kopiert' })
  }

  const selectTest = (id: string) => {
    if (draftDirty && selectedId && selectedId !== id && !confirm('Ungespeicherte Änderungen verwerfen?')) return
    setDraftDirty(false)
    setSelectedId(id)
    setViewMode('editor')
  }

  const patchDraft = (patch: Partial<FormTest>) => {
    setDraftDirty(true)
    setDraft((current) => current ? { ...current, ...patch } : current)
  }

  const updateQuestion = (index: number, patch: Partial<FormQuestion>) => {
    setDraftDirty(true)
    setDraft((current) => {
      if (!current) return current
      const questions = current.questions.map((question, questionIndex) => {
        if (questionIndex !== index) return question
        const nextType = patch.type ?? question.type
        return {
          ...question,
          ...patch,
          options: patch.type && patch.type !== question.type ? defaultOptions(nextType) : (patch.options ?? question.options),
        }
      })
      return { ...current, questions }
    })
  }

  const moveQuestion = (index: number, direction: -1 | 1) => {
    setDraftDirty(true)
    setDraft((current) => {
      if (!current) return current
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.questions.length) return current
      const questions = [...current.questions]
      const [item] = questions.splice(index, 1)
      questions.splice(nextIndex, 0, item)
      return { ...current, questions }
    })
  }

  const removeQuestion = (index: number) => {
    setDraftDirty(true)
    setDraft((current) => current ? { ...current, questions: current.questions.filter((_, i) => i !== index) } : current)
  }

  if (loading) return <PageLoader />

  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        description={description}
        action={canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowArchived((value) => !value)}>
              {showArchived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
              {showArchived ? 'Archiv ausblenden' : 'Archiv zeigen'}
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={13} />
              Test erstellen
            </Button>
          </div>
        ) : undefined}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard label="Tests" value={stats.total} icon={<FileQuestion size={16} />} />
        <StatCard label="Aktive Links" value={stats.active} icon={<Link2 size={16} />} />
        <StatCard label="Abgaben" value={stats.responses} icon={<Clipboard size={16} />} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[310px_1fr]">
        <aside className="glass-panel-elevated overflow-hidden rounded-[14px] border border-[#1e3a5c]/45">
          <div className="flex items-center justify-between border-b border-[#18385f]/45 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8ea4bd]">Testablage</p>
            <span className="text-[10.5px] text-[#536b86]">{tests?.length ?? 0}</span>
          </div>
          <div className="max-h-[680px] overflow-y-auto p-1.5">
            {(tests ?? []).length === 0 ? (
              <div className="px-4 py-12 text-center">
                <FileQuestion size={24} className="mx-auto mb-2 text-[#4a6585]" />
                <p className="text-[12.5px] text-[#8ea4bd]">Noch keine Tests vorhanden</p>
              </div>
            ) : (
              tests?.map((test) => (
                <button
                  key={test.id}
                  type="button"
                  onClick={() => selectTest(test.id)}
                  className={cn(
                    'w-full rounded-[9px] border px-3 py-2.5 text-left transition-colors',
                    selected?.id === test.id
                      ? 'border-[#d4af37]/30 bg-[#d4af37]/12'
                      : 'border-transparent hover:bg-[#102542]/60',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <FileQuestion size={15} className="mt-0.5 shrink-0 text-[#d4af37]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-white">{test.title}</p>
                      <p className="mt-0.5 text-[11px] text-[#6b8299]">
                        {test._count.questions} Fragen · {test._count.responses} Abgaben
                      </p>
                    </div>
                    <Badge variant={STATUS_META[test.status].variant}>{STATUS_META[test.status].label}</Badge>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {!draft ? (
          <section className="glass-panel-elevated flex min-h-[520px] flex-col items-center justify-center rounded-[14px] border border-[#1e3a5c]/45 px-6 text-center">
            <FileQuestion size={34} className="mb-3 text-[#4a6585]" />
            <p className="text-[14px] font-semibold text-[#dbe6f3]">Kein Test ausgewählt</p>
            <p className="mt-1 max-w-sm text-[12.5px] leading-5 text-[#8ea4bd]">
              Erstelle einen Test und teile den Link mit eingeloggten Nutzern.
            </p>
          </section>
        ) : (
          <section className="space-y-4">
            <div className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/45 p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS_META[draft.status].variant}>{STATUS_META[draft.status].label}</Badge>
                    <span className="text-[11.5px] text-[#6b8299]">Aktualisiert {formatDateTime(draft.updatedAt)}</span>
                    {selected && selected._count.responses > 0 && (
                      <span className="rounded-full border border-[#234568]/60 bg-[#102542]/70 px-2 py-0.5 text-[11px] text-[#9fb0c4]">
                        Fragen gesperrt nach {selected._count.responses} Abgabe(n)
                      </span>
                    )}
                    {draftDirty && (
                      <span className="rounded-full border border-[#d4af37]/35 bg-[#d4af37]/10 px-2 py-0.5 text-[11px] font-medium text-[#d4af37]">
                        Ungespeichert
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_170px]">
                    <Input
                      label="Titel"
                      value={draft.title}
                      onChange={(event) => patchDraft({ title: event.target.value })}
                      disabled={!canManage}
                    />
                    <Select
                      label="Status"
                      value={draft.status}
                      onValueChange={(value) => patchDraft({ status: value as FormTestStatus })}
                      disabled={!canManage}
                      options={[
                        { value: 'DRAFT', label: 'Entwurf' },
                        { value: 'ACTIVE', label: 'Aktiv' },
                        { value: 'ARCHIVED', label: 'Archiv' },
                      ]}
                    />
                  </div>
                  <Textarea
                    label="Beschreibung"
                    value={draft.description ?? ''}
                    onChange={(event) => patchDraft({ description: event.target.value })}
                    disabled={!canManage}
                    rows={2}
                    className="mt-3"
                  />
                </div>
                {canManage && (
                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    <Button variant="secondary" size="sm" onClick={() => patchDraft({ status: statusNext(draft.status) })}>
                      {STATUS_META[draft.status].action}
                    </Button>
                    <Button variant="outline" size="sm" onClick={copyLink} disabled={draft.status !== 'ACTIVE'}>
                      <Copy size={13} />
                      Link
                    </Button>
                    <Link href={`/form-tests/${draft.shareToken}`} target="_blank">
                      <Button variant="outline" size="sm" type="button">
                        <ExternalLink size={13} />
                        Öffnen
                      </Button>
                    </Link>
                    <Button size="sm" onClick={saveDraft} loading={saving}>
                      <Save size={13} />
                      Speichern
                    </Button>
                    <Button variant="danger" size="sm" onClick={deleteTest} loading={saving}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {canManage && (
              <div className="flex flex-wrap gap-2">
                <ModeButton active={viewMode === 'editor'} onClick={() => setViewMode('editor')} icon={<FileQuestion size={13} />}>
                  Editor
                </ModeButton>
                <ModeButton active={viewMode === 'responses'} onClick={() => setViewMode('responses')} icon={<BarChart3 size={13} />}>
                  Antworten
                </ModeButton>
              </div>
            )}

            {viewMode === 'editor' ? (
              <QuestionEditor
                questions={draft.questions}
                canEdit={canEditQuestions}
                onAdd={() => patchDraft({ questions: [...draft.questions, createEmptyQuestion()] })}
                onChange={updateQuestion}
                onMove={moveQuestion}
                onRemove={removeQuestion}
              />
            ) : (
              <ResponsesView testId={draft.id} />
            )}
          </section>
        )}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Test erstellen">
        <div className="space-y-4">
          <Input
            label="Titel"
            value={createForm.title}
            onChange={(event) => setCreateForm({ ...createForm, title: event.target.value })}
            placeholder="z. B. Bewerbungsgespräch Theorie"
            required
          />
          <Textarea
            label="Beschreibung"
            value={createForm.description}
            onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })}
            rows={3}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>Abbrechen</Button>
            <Button size="sm" onClick={createTest} loading={saving} disabled={!createForm.title.trim()}>
              Erstellen
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
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

function ModeButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-[8px] border px-3 text-[12.5px] font-semibold transition-colors',
        active
          ? 'border-[#d4af37]/45 bg-[#d4af37]/14 text-[#d4af37]'
          : 'border-[#18385f]/60 bg-[#0a1a33]/55 text-[#8ea4bd] hover:border-[#234568] hover:text-white',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function QuestionEditor({
  questions,
  canEdit,
  onAdd,
  onChange,
  onMove,
  onRemove,
}: {
  questions: FormQuestion[]
  canEdit: boolean
  onAdd: () => void
  onChange: (index: number, patch: Partial<FormQuestion>) => void
  onMove: (index: number, direction: -1 | 1) => void
  onRemove: (index: number) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4a6585]">Fragen</p>
        {canEdit && (
          <Button size="sm" variant="secondary" onClick={onAdd}>
            <Plus size={13} />
            Frage
          </Button>
        )}
      </div>

      {questions.length === 0 ? (
        <div className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/45 py-12 text-center">
          <FileQuestion size={24} className="mx-auto mb-2 text-[#4a6585]" />
          <p className="text-[12.5px] text-[#8ea4bd]">Noch keine Fragen angelegt</p>
        </div>
      ) : (
        questions.map((question, index) => (
          <div key={question.id ?? index} className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/45 p-4">
            <div className="mb-3 flex items-center gap-2">
              <GripVertical size={14} className="text-[#4a6585]" />
              <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-[#102542] text-[11px] font-semibold text-[#d4af37]">
                {index + 1}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <button type="button" disabled={!canEdit || index === 0} onClick={() => onMove(index, -1)} className="rounded-[7px] p-1.5 text-[#6b8299] hover:bg-[#102542] hover:text-[#d4af37] disabled:opacity-30">
                  <MoveUp size={13} />
                </button>
                <button type="button" disabled={!canEdit || index === questions.length - 1} onClick={() => onMove(index, 1)} className="rounded-[7px] p-1.5 text-[#6b8299] hover:bg-[#102542] hover:text-[#d4af37] disabled:opacity-30">
                  <MoveDown size={13} />
                </button>
                <button type="button" disabled={!canEdit} onClick={() => onRemove(index)} className="rounded-[7px] p-1.5 text-[#6b8299] hover:bg-[#321218]/40 hover:text-red-400 disabled:opacity-30">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_190px_110px]">
              <Input
                label="Frage"
                value={question.title}
                onChange={(event) => onChange(index, { title: event.target.value })}
                disabled={!canEdit}
                placeholder="Fragetext"
              />
              <Select
                label="Typ"
                value={question.type}
                onValueChange={(value) => onChange(index, { type: value as QuestionType })}
                options={QUESTION_TYPE_OPTIONS}
                disabled={!canEdit}
              />
              <Input
                label="Punkte"
                type="number"
                min={0}
                value={question.points}
                onChange={(event) => onChange(index, { points: Number(event.target.value) })}
                disabled={!canEdit}
              />
            </div>

            <Textarea
              label="Hilfetext"
              value={question.description ?? ''}
              onChange={(event) => onChange(index, { description: event.target.value })}
              disabled={!canEdit}
              rows={2}
              className="mt-3"
            />

            <div className="mt-3">
              <Checkbox
                checked={question.required}
                onCheckedChange={(checked) => onChange(index, { required: checked })}
                label="Pflichtfrage"
                disabled={!canEdit}
              />
            </div>

            {(question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') && (
              <ChoiceOptions question={question} disabled={!canEdit} onChange={(options) => onChange(index, { options })} />
            )}
            {question.type === 'SCALE' && (
              <ScaleOptions question={question} disabled={!canEdit} onChange={(options) => onChange(index, { options })} />
            )}
          </div>
        ))
      )}
    </div>
  )
}

function ChoiceOptions({ question, disabled, onChange }: { question: FormQuestion; disabled: boolean; onChange: (options: QuestionOptions) => void }) {
  const choices = question.options?.choices ?? []
  const correct = question.options?.correct ?? []

  const setChoice = (choiceIndex: number, value: string) => {
    const nextChoices = choices.map((choice, index) => index === choiceIndex ? value : choice)
    onChange({ choices: nextChoices, correct: correct.filter((choice) => nextChoices.includes(choice)) })
  }

  const toggleCorrect = (choice: string) => {
    if (!choice.trim()) return
    if (question.type === 'SINGLE_CHOICE') {
      onChange({ choices, correct: correct[0] === choice ? [] : [choice] })
      return
    }
    onChange({
      choices,
      correct: correct.includes(choice) ? correct.filter((item) => item !== choice) : [...correct, choice],
    })
  }

  return (
    <div className="mt-4 rounded-[12px] border border-[#18385f]/45 bg-[#071a30]/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] font-semibold text-[#9fb0c4]">Antwortoptionen</p>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => onChange({ choices: [...choices, `Option ${choices.length + 1}`], correct })}
        >
          <Plus size={12} />
          Option
        </Button>
      </div>
      <div className="space-y-2">
        {choices.map((choice, index) => (
          <div key={`${choice}-${index}`} className="flex items-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => toggleCorrect(choice)}
              className={cn(
                'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[8px] border text-[11px] font-semibold transition-colors',
                correct.includes(choice)
                  ? 'border-[#34d399]/50 bg-[#123026] text-[#86efac]'
                  : 'border-[#234568]/70 bg-[#0a1a33] text-[#6b8299] hover:text-[#d4af37]',
              )}
              title="Als richtige Antwort markieren"
            >
              <CheckCircle2 size={14} />
            </button>
            <Input
              value={choice}
              onChange={(event) => setChoice(index, event.target.value)}
              disabled={disabled}
              className="h-[34px]"
            />
            <button
              type="button"
              disabled={disabled || choices.length <= 2}
              onClick={() => {
                const nextChoices = choices.filter((_, choiceIndex) => choiceIndex !== index)
                onChange({ choices: nextChoices, correct: correct.filter((item) => nextChoices.includes(item)) })
              }}
              className="rounded-[8px] p-2 text-[#6b8299] hover:bg-[#321218]/40 hover:text-red-400 disabled:opacity-30"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ScaleOptions({ question, disabled, onChange }: { question: FormQuestion; disabled: boolean; onChange: (options: QuestionOptions) => void }) {
  const options = question.options ?? { min: 1, max: 5, minLabel: '', maxLabel: '' }
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 rounded-[12px] border border-[#18385f]/45 bg-[#071a30]/50 p-3 sm:grid-cols-2 lg:grid-cols-4">
      <Input label="Minimum" type="number" value={options.min ?? 1} disabled={disabled} onChange={(event) => onChange({ ...options, min: Number(event.target.value) })} />
      <Input label="Maximum" type="number" value={options.max ?? 5} disabled={disabled} onChange={(event) => onChange({ ...options, max: Number(event.target.value) })} />
      <Input label="Label Minimum" value={options.minLabel ?? ''} disabled={disabled} onChange={(event) => onChange({ ...options, minLabel: event.target.value })} />
      <Input label="Label Maximum" value={options.maxLabel ?? ''} disabled={disabled} onChange={(event) => onChange({ ...options, maxLabel: event.target.value })} />
    </div>
  )
}

function ResponsesView({ testId }: { testId: string }) {
  const { addToast } = useToast()
  const { execute } = useApi()
  const { data, loading, refetch } = useFetch<ResponsesPayload>(`/api/form-tests/${testId}/responses`)
  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(null)
  const [scoreInput, setScoreInput] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const [saving, setSaving] = useState(false)

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

  if (loading) return <PageLoader />

  if (responses.length === 0) {
    return (
      <div className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/45 py-14 text-center">
        <Clipboard size={26} className="mx-auto mb-2 text-[#4a6585]" />
        <p className="text-[13px] text-[#8ea4bd]">Noch keine Abgaben vorhanden</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard label="Abgaben" value={stats.total} icon={<Clipboard size={16} />} />
        <StatCard label="Bewertet" value={stats.reviewed} icon={<CheckCircle2 size={16} />} />
        <StatCard label="Ø Punkte" value={stats.average ?? 0} icon={<BarChart3 size={16} />} />
      </div>

      <QuestionAnalytics questions={data?.test.questions ?? []} responses={responses} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
        <aside className="glass-panel-elevated overflow-hidden rounded-[14px] border border-[#1e3a5c]/45">
          <div className="border-b border-[#18385f]/45 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8ea4bd]">Abgaben</p>
          </div>
          <div className="max-h-[560px] overflow-y-auto p-1.5">
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
                const showCorrect = correct.length > 0
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
                <Input label={`Punkte${selected.maxScore > 0 ? ` von ${selected.maxScore}` : ''}`} type="number" min={0} value={scoreInput} onChange={(event) => setScoreInput(event.target.value)} />
                <Textarea label="Bewertungsnotiz" value={noteInput} onChange={(event) => setNoteInput(event.target.value)} rows={2} />
              </div>
              <div className="mt-3 flex justify-end">
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
