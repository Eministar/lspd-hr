'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, KeyRound, Copy, Play, ChevronRight, Code2, FileJson, FileText, BookOpen, Lock, Hash, ListOrdered, ArrowLeft, RotateCw, Download } from 'lucide-react'
import { ENDPOINTS, type EndpointSpec } from '@/lib/openapi-spec'
import { cn } from '@/lib/utils'

type Lang = 'curl' | 'js' | 'py' | 'go'

const METHOD_STYLES: Record<string, { bg: string; text: string; ring: string }> = {
  GET:    { bg: 'bg-emerald-500/15', text: 'text-emerald-300', ring: 'ring-emerald-500/30' },
  POST:   { bg: 'bg-sky-500/15',     text: 'text-sky-300',     ring: 'ring-sky-500/30' },
  PATCH:  { bg: 'bg-amber-500/15',   text: 'text-amber-300',   ring: 'ring-amber-500/30' },
  PUT:    { bg: 'bg-violet-500/15',  text: 'text-violet-300',  ring: 'ring-violet-500/30' },
  DELETE: { bg: 'bg-rose-500/15',    text: 'text-rose-300',    ring: 'ring-rose-500/30' },
}

const CATEGORIES = Array.from(new Set(ENDPOINTS.map((e) => e.category)))

export default function DocsPage() {
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState(ENDPOINTS[0]?.id ?? '')
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [baseUrl, setBaseUrl] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined') setBaseUrl(window.location.origin)
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('lspd-docs-token')
    if (stored) setToken(stored)
  }, [])

  useEffect(() => {
    if (token) localStorage.setItem('lspd-docs-token', token)
    else localStorage.removeItem('lspd-docs-token')
  }, [token])

  const filteredEndpoints = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return ENDPOINTS
    return ENDPOINTS.filter((e) =>
      [e.path, e.summary, e.description, e.category, e.method].join(' ').toLowerCase().includes(q),
    )
  }, [search])

  const grouped = useMemo(() => {
    const map = new Map<string, EndpointSpec[]>()
    for (const ep of filteredEndpoints) {
      if (!map.has(ep.category)) map.set(ep.category, [])
      map.get(ep.category)!.push(ep)
    }
    return CATEGORIES
      .filter((c) => map.has(c))
      .map((c) => ({ category: c, endpoints: map.get(c)! }))
  }, [filteredEndpoints])

  const active = ENDPOINTS.find((e) => e.id === activeId) ?? ENDPOINTS[0]

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 min-h-[calc(100vh-2rem)] bg-pattern">
      {/* Top Hero */}
      <div className="border-b border-[#d4af37]/10 bg-gradient-to-b from-[#0a1e38] to-[#06152a]">
        <div className="max-w-[1500px] mx-auto px-6 lg:px-10 py-8">
          <Link href="/" className="inline-flex items-center gap-1.5 text-[12px] text-[#9fb0c4] hover:text-[#d4af37] mb-4">
            <ArrowLeft size={12} /> Zurück zum Dashboard
          </Link>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <BookOpen size={14} className="text-[#d4af37]" />
                <span className="text-[10.5px] font-semibold text-[#d4af37] uppercase tracking-[0.16em]">API v1</span>
              </div>
              <h1 className="text-[28px] sm:text-[32px] font-semibold text-white tracking-[-0.02em] leading-tight">
                LSPD HR Dashboard <span className="text-[#d4af37]">API</span>
              </h1>
              <p className="text-[13.5px] text-[#9fb0c4] mt-2 max-w-2xl leading-relaxed">
                Vollständige Public API. Jede Dashboard-Funktion ist auch programmatisch verfügbar.
                Authentifiziere dich mit einem API-Token via <code className="px-1.5 py-0.5 rounded bg-[#102542] text-[#d4af37] text-[12px]">Authorization: Bearer lspd_…</code>.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px]">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#102542]/70 border border-[#d4af37]/20 text-[#d4af37]">
                  <KeyRound size={11} /> Bearer-Token
                </span>
                <span className="text-[#4a6585]">+</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#102542]/70 border border-[#d4af37]/20 text-[#d4af37]">
                  <Hash size={11} /> X-Discord-Id (optional)
                </span>
                <span className="text-[#4a6585]">→</span>
                <span className="text-[#9fb0c4]">effektive Rechte = Schnittmenge</span>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <a
                href="/api/v1/openapi.md"
                target="_blank"
                rel="noopener noreferrer"
                download
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[8px] bg-[#102542] text-[12.5px] text-[#edf4fb] hover:bg-[#17375f] transition-colors"
                title="Markdown-Dokumentation herunterladen"
              >
                <Download size={13} /> Markdown
              </a>
              <a
                href="/api/v1/openapi.json"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[8px] bg-[#102542] text-[12.5px] text-[#edf4fb] hover:bg-[#17375f] transition-colors"
                title="OpenAPI 3.1 JSON-Spec"
              >
                <FileJson size={13} /> OpenAPI JSON
              </a>
              <a
                href="/api/v1/openapi.yaml"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[8px] bg-[#102542] text-[12.5px] text-[#edf4fb] hover:bg-[#17375f] transition-colors"
                title="OpenAPI 3.1 YAML-Spec"
              >
                <FileText size={13} /> OpenAPI YAML
              </a>
              <a
                href="/admin/api-tokens"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[8px] bg-gradient-to-b from-[#d4af37] to-[#c29d32] text-[12.5px] text-[#071b33] font-semibold hover:from-[#dcba48] hover:to-[#d4af37] transition-colors"
              >
                <KeyRound size={13} /> Token erstellen
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1500px] mx-auto px-6 lg:px-10 py-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto pr-1">
          {/* Search */}
          <div className="relative mb-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a6585]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suche nach Endpoint, Pfad, Tag…"
              className="w-full pl-9 pr-3 py-2 rounded-[8px] bg-[#0a1a33]/60 border border-[#18385f] text-[12.5px] text-[#edf4fb] placeholder:text-[#4a6585] focus:outline-none focus:border-[#d4af37]/40"
            />
          </div>

          {/* Token input */}
          <div className="mb-4 rounded-[10px] bg-[#0a1a33]/60 border border-[#18385f] p-3">
            <p className="text-[10.5px] font-semibold text-[#d4af37] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <KeyRound size={11} /> Try-it-Token
            </p>
            <div className="flex gap-1.5">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="lspd_…"
                className="flex-1 px-2 py-1.5 rounded-[6px] bg-[#061426] border border-[#18385f] text-[11px] font-mono text-[#d4af37] placeholder:text-[#4a6585] focus:outline-none focus:border-[#d4af37]/40"
              />
              <button
                onClick={() => setShowToken((v) => !v)}
                className="px-2 py-1.5 rounded-[6px] bg-[#061426] border border-[#18385f] text-[#9fb0c4] hover:text-[#d4af37] text-[10.5px]"
                title={showToken ? 'Verbergen' : 'Anzeigen'}
              >
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-[10px] text-[#4a6585] mt-1.5 leading-relaxed">
              Wird nur lokal in deinem Browser gespeichert. Verwende einen Test-Token — niemals deinen Haupt-Token.
            </p>
          </div>

          {/* Category nav */}
          <nav className="space-y-3">
            {grouped.map(({ category, endpoints }) => (
              <div key={category}>
                <p className="px-2 mb-1 text-[10px] font-semibold text-[#d4af37]/80 uppercase tracking-[0.1em]">{category}</p>
                <ul className="space-y-0.5">
                  {endpoints.map((ep) => {
                    const isActive = ep.id === activeId
                    const method = METHOD_STYLES[ep.method]
                    return (
                      <li key={ep.id}>
                        <button
                          onClick={() => {
                            setActiveId(ep.id)
                            document.getElementById(`ep-${ep.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }}
                          className={cn(
                            'w-full flex items-center gap-2 px-2 py-1.5 rounded-[6px] text-left text-[11.5px] transition-colors',
                            isActive ? 'bg-[#102542] text-white' : 'text-[#9fb0c4] hover:bg-[#0f2340] hover:text-[#edf4fb]',
                          )}
                        >
                          <span className={cn('font-mono font-bold text-[9px] px-1.5 py-0.5 rounded', method.bg, method.text)}>
                            {ep.method}
                          </span>
                          <code className="font-mono truncate">{ep.path}</code>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
            {grouped.length === 0 && (
              <div className="text-center py-6 text-[12px] text-[#4a6585]">
                Keine Treffer für „{search}“
              </div>
            )}
          </nav>
        </aside>

        {/* Main */}
        <main className="min-w-0">
          <EndpointDetail
            key={active.id}
            endpoint={active}
            baseUrl={baseUrl}
            token={token}
          />
        </main>
      </div>
    </div>
  )
}

function EndpointDetail({
  endpoint,
  baseUrl,
  token,
}: {
  endpoint: EndpointSpec
  baseUrl: string
  token: string
}) {
  const [lang, setLang] = useState<Lang>('curl')
  const [pathParams, setPathParams] = useState<Record<string, string>>({})
  const [queryParams, setQueryParams] = useState<Record<string, string>>({})
  const [body, setBody] = useState<string>('{\n  \n}')
  const [response, setResponse] = useState<{ status: number; body: string; duration: number } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setPathParams({})
    setQueryParams({})
    if (endpoint.body) {
      const example: Record<string, unknown> = {}
      for (const f of endpoint.body.fields) {
        if (f.example !== undefined) example[f.name] = f.example
        else if (f.enumValues && f.enumValues[0]) example[f.name] = f.enumValues[0]
        else if (f.type === 'string') example[f.name] = ''
        else if (f.type === 'integer') example[f.name] = 0
        else if (f.type === 'boolean') example[f.name] = false
      }
      setBody(JSON.stringify(example, null, 2))
    } else {
      setBody('')
    }
    setResponse(null)
  }, [endpoint])

  const interpolatedPath = useMemo(() => {
    let p = endpoint.path
    for (const [k, v] of Object.entries(pathParams)) {
      p = p.replace(`{${k}}`, encodeURIComponent(v || `{${k}}`))
    }
    const queryString = Object.entries(queryParams)
      .filter(([, v]) => v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
    if (queryString) p += `?${queryString}`
    return p
  }, [endpoint.path, pathParams, queryParams])

  const fullUrl = `${baseUrl}${interpolatedPath}`

  const codeSamples = useMemo(() => buildCodeSamples(endpoint, fullUrl, token, body), [endpoint, fullUrl, token, body])

  const runRequest = async () => {
    setLoading(true)
    setResponse(null)
    const t0 = performance.now()
    try {
      const init: RequestInit = { method: endpoint.method, headers: {} }
      const headers = init.headers as Record<string, string>
      if (token) headers['Authorization'] = `Bearer ${token}`
      if (endpoint.body) {
        headers['Content-Type'] = 'application/json'
        init.body = body
      }
      const res = await fetch(fullUrl, init)
      const text = await res.text()
      const duration = Math.round(performance.now() - t0)
      let formatted = text
      try { formatted = JSON.stringify(JSON.parse(text), null, 2) } catch { /* keep raw */ }
      setResponse({ status: res.status, body: formatted, duration })
    } catch (err) {
      setResponse({
        status: 0,
        body: err instanceof Error ? err.message : 'Network error',
        duration: Math.round(performance.now() - t0),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <article id={`ep-${endpoint.id}`} className="space-y-6 scroll-mt-20">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className={cn(
            'font-mono font-bold text-[10px] px-2 py-0.5 rounded ring-1',
            METHOD_STYLES[endpoint.method].bg, METHOD_STYLES[endpoint.method].text, METHOD_STYLES[endpoint.method].ring,
          )}>
            {endpoint.method}
          </span>
          <code className="text-[14px] font-mono text-[#edf4fb]">{endpoint.path}</code>
          {endpoint.scope && <ScopeChip scope={endpoint.scope} />}
        </div>
        <h2 className="text-[20px] font-semibold text-white tracking-[-0.01em]">{endpoint.summary}</h2>
        {endpoint.description && (
          <p className="text-[13px] text-[#9fb0c4] mt-2 leading-relaxed max-w-3xl">{endpoint.description}</p>
        )}
        {endpoint.notes && endpoint.notes.length > 0 && (
          <ul className="mt-3 space-y-1">
            {endpoint.notes.map((n, i) => (
              <li key={i} className="text-[12px] text-[#9fb0c4] flex gap-1.5">
                <ChevronRight size={12} className="text-[#d4af37] mt-0.5 shrink-0" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Path & Query Params */}
      {endpoint.params && endpoint.params.length > 0 && (
        <Section title="Parameter" icon={Hash}>
          <div className="divide-y divide-[#18385f]/50">
            {endpoint.params.map((p) => {
              const value = (p.in === 'path' ? pathParams[p.name] : queryParams[p.name]) ?? ''
              const setter = (v: string) => {
                if (p.in === 'path') setPathParams((s) => ({ ...s, [p.name]: v }))
                else setQueryParams((s) => ({ ...s, [p.name]: v }))
              }
              return (
                <div key={`${p.in}-${p.name}`} className="px-4 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-[12.5px] font-mono text-[#d4af37]">{p.name}</code>
                      <span className="text-[9.5px] font-mono uppercase tracking-wider text-[#4a6585] bg-[#102542] px-1.5 py-0.5 rounded">
                        {p.in}
                      </span>
                      {p.required && <span className="text-[9.5px] font-semibold text-rose-300">required</span>}
                    </div>
                    <p className="text-[12px] text-[#9fb0c4] mt-1">{p.description}</p>
                    {p.schema.enum && (
                      <p className="text-[10.5px] text-[#4a6585] mt-1 font-mono">
                        enum: {p.schema.enum.join(' · ')}
                      </p>
                    )}
                  </div>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    placeholder={p.schema.example ? String(p.schema.example) : (p.schema.type === 'string' ? 'string' : p.schema.type)}
                    className="w-44 px-2 py-1.5 rounded-[6px] bg-[#061426] border border-[#18385f] text-[11.5px] font-mono text-[#edf4fb] placeholder:text-[#4a6585] focus:outline-none focus:border-[#d4af37]/40"
                  />
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* Body */}
      {endpoint.body && (
        <Section title="Request Body" icon={FileJson}>
          <div className="p-4 space-y-3">
            <p className="text-[12px] text-[#9fb0c4]">{endpoint.body.description}</p>
            <div className="rounded-[8px] border border-[#18385f] overflow-hidden">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="bg-[#102542]/40 text-[10px] text-[#9fb0c4] uppercase tracking-wider">
                    <th className="text-left px-3 py-2 font-semibold">Feld</th>
                    <th className="text-left px-3 py-2 font-semibold">Typ</th>
                    <th className="text-left px-3 py-2 font-semibold">Beschreibung</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#18385f]/40">
                  {endpoint.body.fields.map((f) => (
                    <tr key={f.name}>
                      <td className="px-3 py-2 font-mono text-[#d4af37] whitespace-nowrap">
                        {f.name}
                        {f.required && <span className="text-rose-300 ml-1">*</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-[#cbd5e1]">{f.type}</td>
                      <td className="px-3 py-2 text-[#9fb0c4]">
                        {f.description}
                        {f.enumValues && (
                          <div className="mt-1 text-[10px] font-mono text-[#4a6585]">{f.enumValues.join(' · ')}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="rounded-[8px] border border-[#18385f] overflow-hidden group" open>
              <summary className="bg-[#102542]/40 px-3 py-2 cursor-pointer text-[11.5px] text-[#9fb0c4] flex items-center gap-2 select-none">
                <Code2 size={12} /> JSON-Beispiel bearbeiten
              </summary>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                spellCheck={false}
                rows={Math.max(6, body.split('\n').length + 1)}
                className="w-full px-3 py-2.5 bg-[#061426] text-[11.5px] font-mono text-[#edf4fb] focus:outline-none resize-y"
              />
            </details>
          </div>
        </Section>
      )}

      {/* Response */}
      {endpoint.responseFields && endpoint.responseFields.length > 0 && (
        <Section title="Response-Felder" icon={ListOrdered}>
          <div className="p-4">
            <div className="rounded-[8px] border border-[#18385f] overflow-hidden">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="bg-[#102542]/40 text-[10px] text-[#9fb0c4] uppercase tracking-wider">
                    <th className="text-left px-3 py-2 font-semibold">Feld</th>
                    <th className="text-left px-3 py-2 font-semibold">Typ</th>
                    <th className="text-left px-3 py-2 font-semibold">Beschreibung</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#18385f]/40">
                  {endpoint.responseFields.map((f) => (
                    <tr key={f.name}>
                      <td className="px-3 py-2 font-mono text-[#d4af37] whitespace-nowrap">
                        {f.name}
                        {f.required && <span className="text-rose-300 ml-1">*</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-[#cbd5e1]">{f.type}</td>
                      <td className="px-3 py-2 text-[#9fb0c4]">{f.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      )}

      {/* Try it + Code */}
      <Section title="Try it" icon={Play}>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-0 xl:gap-px bg-[#18385f] xl:divide-x-0">
          {/* Request preview */}
          <div className="bg-[#0a1a33]/60 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  'font-mono font-bold text-[10px] px-2 py-0.5 rounded ring-1',
                  METHOD_STYLES[endpoint.method].bg, METHOD_STYLES[endpoint.method].text, METHOD_STYLES[endpoint.method].ring,
                )}>
                  {endpoint.method}
                </span>
                <code className="text-[12px] font-mono text-[#edf4fb] break-all">{interpolatedPath}</code>
              </div>
              <button
                onClick={runRequest}
                disabled={loading || !token}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-gradient-to-b from-[#d4af37] to-[#c29d32] text-[12px] text-[#071b33] font-semibold hover:from-[#dcba48] hover:to-[#d4af37] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title={!token ? 'Token erforderlich' : 'Request ausführen'}
              >
                {loading ? <RotateCw size={12} className="animate-spin" /> : <Play size={12} />}
                Send
              </button>
            </div>
            {!token && (
              <p className="text-[11px] text-amber-300/80 flex items-center gap-1.5">
                <Lock size={11} /> Token in der Sidebar setzen, um Requests auszuführen.
              </p>
            )}
            {response && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className={cn(
                    'font-mono font-bold px-2 py-0.5 rounded',
                    response.status >= 500 ? 'bg-rose-500/20 text-rose-300' :
                    response.status >= 400 ? 'bg-amber-500/20 text-amber-300' :
                    response.status >= 200 ? 'bg-emerald-500/20 text-emerald-300' :
                    'bg-slate-500/20 text-slate-300',
                  )}>
                    {response.status || 'ERR'}
                  </span>
                  <span className="text-[#4a6585]">{response.duration}ms</span>
                </div>
                <pre className="px-3 py-2.5 rounded-[6px] bg-[#061426] border border-[#18385f] text-[11px] font-mono text-[#edf4fb] overflow-x-auto max-h-[400px]">
{response.body}
                </pre>
              </div>
            )}
          </div>

          {/* Code samples */}
          <div className="bg-[#0a1a33]/60 p-4 space-y-2">
            <div className="flex items-center gap-1 mb-2">
              {(['curl', 'js', 'py', 'go'] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={cn(
                    'px-2.5 py-1 rounded-[6px] text-[11px] font-semibold transition-colors',
                    lang === l ? 'bg-[#d4af37] text-[#071b33]' : 'text-[#9fb0c4] hover:bg-[#102542]',
                  )}
                >
                  {l === 'curl' ? 'cURL' : l === 'js' ? 'JavaScript' : l === 'py' ? 'Python' : 'Go'}
                </button>
              ))}
            </div>
            <pre className="relative px-3 py-2.5 rounded-[6px] bg-[#061426] border border-[#18385f] text-[11px] font-mono text-[#cbd5e1] overflow-x-auto leading-relaxed">
              <button
                onClick={() => navigator.clipboard.writeText(codeSamples[lang])}
                className="absolute top-2 right-2 p-1.5 rounded-[5px] bg-[#102542] text-[#9fb0c4] hover:text-[#d4af37] transition-colors"
                title="Kopieren"
              >
                <Copy size={10} />
              </button>
{codeSamples[lang]}
            </pre>
          </div>
        </div>
      </Section>
    </article>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} className="text-[#d4af37]" />
        <h3 className="text-[12px] font-semibold text-[#d4af37] uppercase tracking-[0.1em]">{title}</h3>
      </div>
      <div className="rounded-[12px] bg-[#0a1a33]/40 border border-[#18385f] overflow-hidden">
        {children}
      </div>
    </section>
  )
}

function ScopeChip({ scope }: { scope: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#102542] text-[#9fb0c4] border border-[#18385f]">
      <Lock size={9} /> {scope}
    </span>
  )
}

function buildCodeSamples(ep: EndpointSpec, url: string, token: string, body: string): Record<Lang, string> {
  const auth = token ? `-H "Authorization: Bearer ${token}"` : '-H "Authorization: Bearer $LSPD_TOKEN"'
  const hasBody = !!ep.body
  const showDiscordImpersonation = ep.category === 'Auth'

  const curl = hasBody
    ? `curl -X ${ep.method} "${url}" \\\n  ${auth}${showDiscordImpersonation ? ' \\\n  -H "X-Discord-Id: 123456789012345678"' : ''} \\\n  -H "Content-Type: application/json" \\\n  -d '${body.replace(/'/g, "'\\''")}\'`
    : `curl -X ${ep.method} "${url}" \\\n  ${auth}${showDiscordImpersonation ? ' \\\n  -H "X-Discord-Id: 123456789012345678"' : ''}`

  const js = `const res = await fetch("${url}", {
  method: "${ep.method}",${token ? `\n  headers: { Authorization: "Bearer ${token}"${showDiscordImpersonation ? ', "X-Discord-Id": "123456789012345678"' : ''}${hasBody ? ', "Content-Type": "application/json"' : ''} },` : ''}${hasBody ? `\n  body: JSON.stringify(${body || '{}'}),` : ''}
});
const data = await res.json();
console.log(data);`

  const py = `import requests${token ? '' : ', os'}

headers = {"Authorization": f"Bearer ${token || '${os.environ[\"LSPD_TOKEN\"]}'}"${showDiscordImpersonation ? ', "X-Discord-Id": "123456789012345678"' : ''}}${hasBody ? '\nheaders["Content-Type"] = "application/json"' : ''}
${hasBody ? `payload = ${body || '{}'}\n` : ''}res = requests.${ep.method.toLowerCase()}(
    "${url}",
    headers=headers,${hasBody ? '\n    json=payload,' : ''}
)
print(res.json())`

  const go = `package main

import (
\t"bytes"${hasBody ? '\n\t"encoding/json"' : ''}
\t"fmt"
\t"io"
\t"net/http"
)

func main() {
\t${hasBody ? `payload := []byte(\`${body}\`)\n\t` : ''}req, _ := http.NewRequest("${ep.method}", "${url}", ${hasBody ? 'bytes.NewReader(payload)' : 'nil'})
\treq.Header.Set("Authorization", "Bearer ${token || '$LSPD_TOKEN'}")${showDiscordImpersonation ? '\n\treq.Header.Set("X-Discord-Id", "123456789012345678")' : ''}${hasBody ? '\n\treq.Header.Set("Content-Type", "application/json")' : ''}
\tres, err := http.DefaultClient.Do(req)
\tif err != nil { panic(err) }
\tdefer res.Body.Close()
\tbody, _ := io.ReadAll(res.Body)
\tfmt.Println(string(body))
}`

  return { curl, js, py, go }
}
