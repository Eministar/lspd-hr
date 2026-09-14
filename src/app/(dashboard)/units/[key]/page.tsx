import Link from 'next/link'
import { ArrowRight, Eye, Settings2 } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'

import { PageHeader } from '@/components/layout/page-header'
import { UnitIcon } from '@/components/units/unit-icon'
import { getCurrentUser } from '@/lib/auth'
import { getNavigationUnitForUser } from '@/lib/unit-navigation'

export default async function UnitHubPage({ params }: { params: Promise<{ key: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const { key } = await params
  const unit = await getNavigationUnitForUser(user, decodeURIComponent(key))
  if (!unit) notFound()

  return (
    <div className="mx-auto max-w-5xl pb-8">
      <div className="relative mb-7 overflow-hidden rounded-[16px] border border-line bg-surface px-6 py-6 sm:px-8">
        <div className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: unit.color }} />
        <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full opacity-[0.08] blur-2xl" style={{ backgroundColor: unit.color }} />
        <div className="relative flex items-center gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] border bg-surface"
            style={{ color: unit.color, borderColor: `${unit.color}45` }}
          >
            <UnitIcon icon={unit.icon} size={25} strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-[11px] font-bold" style={{ color: unit.color }}>Unit-Arbeitsbereich</p>
            <h1 className="truncate text-[24px] font-semibold tracking-[-0.025em] text-label sm:text-[28px]">{unit.name}</h1>
            {unit.description && <p className="mt-1.5 max-w-2xl text-[12.5px] leading-5 text-label-2">{unit.description}</p>}
          </div>
        </div>
      </div>

      <PageHeader
        eyebrow={`${unit.modules.length} ${unit.modules.length === 1 ? 'Bereich' : 'Bereiche'}`}
        title="Verfügbare Module"
        description="Deine Unit bündelt die Werkzeuge, die du für ihre Aufgaben brauchst."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {unit.modules.map((module) => (
          <Link
            key={module.key}
            href={module.href}
            className="group relative overflow-hidden rounded-[16px] border border-line bg-surface p-5 transition-[border-color,transform,background-color] duration-200 hover:border-gold/30 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-white/[0.06] bg-surface-2 text-gold">
                <UnitIcon icon={module.icon} size={19} strokeWidth={1.9} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-[14px] font-semibold text-label">{module.label}</h2>
                  <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${module.access === 'manage' ? 'bg-gold/12 text-gold' : 'bg-cyan/10 text-cyan'}`}>
                    {module.access === 'manage' ? <Settings2 size={9} /> : <Eye size={9} />}
                    {module.access === 'manage' ? 'Verwalten' : 'Ansehen'}
                  </span>
                </div>
                <p className="mt-2 text-[11.5px] leading-5 text-label-3">{module.description}</p>
              </div>
              <ArrowRight size={15} className="mt-1 shrink-0 text-label-4 transition-transform group-hover:translate-x-0.5 group-hover:text-gold" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
