'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, ClipboardCheck, FileQuestion, Send } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { PageLoader } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { useFetch } from '@/hooks/use-fetch'
import { useApi } from '@/hooks/use-api'
import { useToast } from '@/components/ui/toast'
import { cn, formatDateTime } from '@/lib/utils'

type QuestionType = 'SHORT_TEXT' | 'LONG_TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'SCALE'

interface QuestionOptions {
  choices?: string[]
  min?: number
  max?: number
  minLabel?: string
  maxLabel?: string
}

interface FormQuestion {
  id: string
  type: QuestionType
  title: string
  description: string | null
  required: boolean
  options: QuestionOptions | null
  points: number
  sortOrder: number
}

interface ExistingResponse {
  id: string
  submittedAt: string
  score: number | null
  maxScore: number
}

interface FormLinkPayload {
  id: string
  title: string
  description: string | null
  module: string
  questions: FormQuestion[]
  existingResponse: ExistingResponse | null
}

function paramToken(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? ''
}

export default function FormTestLinkPage() {
  const params = useParams<{ token: string | string[] }>()
  const token = paramToken(params.token)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [submitting, setSubmitting] = useState(false)
  const { data, loading, refetch } = useFetch<FormLinkPayload>(token ? `/api/form-links/${token}` : null)
  const { execute } = useApi()
  const { addToast } = useToast()

  const answeredRequired = useMemo(() => {
    if (!data) return false
    return data.questions.every((question) => {
      if (!question.required) return true
      const value = answers[question.id]
      if (Array.isArray(value)) return value.length > 0
      return value !== undefined && value !== null && String(value).trim() !== ''
    })
  }, [answers, data])

  const setAnswer = (questionId: string, value: unknown) => {
    setAnswers((current) => ({ ...current, [questionId]: value }))
  }

  const submit = async () => {
    if (!data) return
    setSubmitting(true)
    try {
      await execute(`/api/form-links/${token}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers }),
      })
      addToast({ type: 'success', title: 'Abgabe gespeichert' })
      await refetch()
    } catch (e) {
      addToast({ type: 'error', title: 'Abgabe fehlgeschlagen', message: e instanceof Error ? e.message : '' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <PageLoader />

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/45 py-16 text-center">
          <FileQuestion size={30} className="mx-auto mb-3 text-[#4a6585]" />
          <p className="text-[14px] font-semibold text-white">Test nicht verfügbar</p>
          <p className="mt-1 text-[12.5px] text-[#8ea4bd]">Der Link ist ungültig, archiviert oder nicht aktiv.</p>
        </div>
      </div>
    )
  }

  if (data.existingResponse) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={data.title} description={data.description ?? undefined} eyebrow="Test abgegeben" />
        <div className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/45 p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[14px] bg-[#123026] text-[#86efac]">
            <CheckCircle2 size={28} />
          </div>
          <h2 className="text-[17px] font-semibold text-white">Deine Abgabe wurde gespeichert</h2>
          <p className="mt-2 text-[13px] text-[#8ea4bd]">
            Abgegeben am {formatDateTime(data.existingResponse.submittedAt)}
          </p>
          {data.existingResponse.maxScore > 0 && (
            <Badge className="mt-4" variant="success">
              {data.existingResponse.score ?? '-'} / {data.existingResponse.maxScore} Punkte
            </Badge>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={data.title}
        description={data.description ?? undefined}
        eyebrow="Testformular"
      />

      <div className="space-y-4">
        {data.questions.map((question, index) => (
          <QuestionField
            key={question.id}
            index={index}
            question={question}
            value={answers[question.id]}
            onChange={(value) => setAnswer(question.id, value)}
          />
        ))}
      </div>

      <div className="sticky bottom-0 mt-5 rounded-[14px] border border-[#1e3a5c]/45 bg-[#061426]/90 p-3 backdrop-blur-md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-[12.5px] text-[#8ea4bd]">
            <ClipboardCheck size={15} className="text-[#d4af37]" />
            {data.questions.length} Frage(n)
          </div>
          <Button onClick={submit} loading={submitting} disabled={!answeredRequired}>
            <Send size={14} />
            Abgeben
          </Button>
        </div>
      </div>
    </div>
  )
}

function QuestionField({
  index,
  question,
  value,
  onChange,
}: {
  index: number
  question: FormQuestion
  value: unknown
  onChange: (value: unknown) => void
}) {
  return (
    <section className="glass-panel-elevated rounded-[14px] border border-[#1e3a5c]/45 p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#102542] text-[11.5px] font-semibold text-[#d4af37]">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[14px] font-semibold text-white">{question.title}</h2>
            {question.required && <Badge variant="warning">Pflicht</Badge>}
            {question.points > 0 && <Badge>{question.points} Punkte</Badge>}
          </div>
          {question.description && <p className="mt-1 text-[12.5px] leading-5 text-[#8ea4bd]">{question.description}</p>}
        </div>
      </div>
      <QuestionInput question={question} value={value} onChange={onChange} />
    </section>
  )
}

function QuestionInput({ question, value, onChange }: { question: FormQuestion; value: unknown; onChange: (value: unknown) => void }) {
  if (question.type === 'SHORT_TEXT') {
    return (
      <input
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        className="h-[38px] w-full rounded-[9px] border border-[#18385f]/70 bg-[#0a1a33]/60 px-3 text-[13.5px] text-[#edf4fb] outline-none transition-colors placeholder:text-[#4a6585] focus:border-[#d4af37]"
        placeholder="Antwort eingeben"
      />
    )
  }

  if (question.type === 'LONG_TEXT') {
    return (
      <textarea
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        className="w-full resize-none rounded-[9px] border border-[#18385f]/70 bg-[#0a1a33]/60 px-3 py-2.5 text-[13.5px] text-[#edf4fb] outline-none transition-colors placeholder:text-[#4a6585] focus:border-[#d4af37]"
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
                ? 'border-[#d4af37]/45 bg-[#d4af37]/12 text-white'
                : 'border-[#18385f]/60 bg-[#0a1a33]/45 text-[#dbe6f3] hover:border-[#234568]',
            )}
          >
            <span className={cn('h-3.5 w-3.5 rounded-full border', selected === choice ? 'border-[#d4af37] bg-[#d4af37]' : 'border-[#4a6585]')} />
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
            className="rounded-[10px] border border-[#18385f]/60 bg-[#0a1a33]/45 px-3 py-2.5 hover:border-[#234568]"
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
              'h-10 rounded-[9px] border text-[13px] font-semibold transition-colors',
              selected === item
                ? 'border-[#d4af37]/45 bg-[#d4af37]/16 text-[#d4af37]'
                : 'border-[#18385f]/60 bg-[#0a1a33]/45 text-[#9fb0c4] hover:border-[#234568]',
            )}
          >
            {item}
          </button>
        ))}
      </div>
      {(question.options?.minLabel || question.options?.maxLabel) && (
        <div className="mt-2 flex justify-between gap-4 text-[11.5px] text-[#6b8299]">
          <span>{question.options?.minLabel}</span>
          <span>{question.options?.maxLabel}</span>
        </div>
      )}
    </div>
  )
}
