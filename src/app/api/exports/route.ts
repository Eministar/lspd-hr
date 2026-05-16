import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { error, unauthorized } from '@/lib/api-response'
import { getDutyTimesSnapshot, formatDuration } from '@/lib/duty-times'
import { formatDate, formatDateTime } from '@/lib/utils'
import { displayBadgeNumber } from '@/lib/badge-number'
import { formatFineAmount, penalGradeLabel } from '@/lib/sanction-catalog'

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function csv(rows: unknown[][]) {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n')
}

function response(body: string, filename: string, contentType: string) {
  return new NextResponse(body, {
    headers: {
      'content-type': `${contentType}; charset=utf-8`,
      'content-disposition': `attachment; filename="${filename}"`,
    },
  })
}

function html(title: string, rows: Array<[string, string]>, sections: Array<{ title: string; rows: string[][] }> = []) {
  const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] ?? char))
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
body{font-family:Arial,sans-serif;color:#111827;margin:32px}
h1{font-size:24px;margin:0 0 20px}
h2{font-size:16px;margin:28px 0 10px}
dl{display:grid;grid-template-columns:180px 1fr;gap:8px 16px}
dt{font-weight:700;color:#374151}
dd{margin:0}
table{border-collapse:collapse;width:100%;font-size:12px}
th,td{border:1px solid #d1d5db;padding:7px;text-align:left;vertical-align:top}
th{background:#f3f4f6}
@media print{body{margin:16mm}.no-print{display:none}}
</style>
</head>
<body>
<button class="no-print" onclick="window.print()">Als PDF drucken</button>
<h1>${esc(title)}</h1>
<dl>${rows.map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>
${sections.map((section) => `<h2>${esc(section.title)}</h2><table>${section.rows.map((row, index) => `<tr>${row.map((cell) => index === 0 ? `<th>${esc(cell)}</th>` : `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</table>`).join('')}
</body>
</html>`
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission('exports:view')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Serverfehler'
    if (msg === 'Unauthorized') return unauthorized()
    if (msg === 'Forbidden') return error('Keine Berechtigung', 403)
    return error(msg, 500)
  }

  const type = req.nextUrl.searchParams.get('type') ?? 'officers'
  const format = req.nextUrl.searchParams.get('format') ?? 'csv'
  const nowLabel = new Date().toISOString().slice(0, 10)

  if (type === 'officers') {
    const officers = await prisma.officer.findMany({
      include: { rank: true },
      orderBy: [{ rank: { sortOrder: 'asc' } }, { badgeNumber: 'asc' }],
    })
    const rows = [
      ['Dienstnummer', 'Name', 'Rang', 'Status', 'Discord-ID', 'Einstellung', 'Letzte Aktivität'],
      ...officers.map((officer) => [
        displayBadgeNumber(officer.badgeNumber),
        `${officer.firstName} ${officer.lastName}`,
        officer.rank.name,
        officer.status,
        officer.discordId ?? '',
        formatDate(officer.hireDate),
        formatDateTime(officer.lastOnline),
      ]),
    ]
    return response(csv(rows), `officers-${nowLabel}.csv`, 'text/csv')
  }

  if (type === 'duty-week') {
    const snapshot = await getDutyTimesSnapshot()
    const rows = [
      ['Dienstnummer', 'Name', 'Rang', 'Status', 'Woche', 'Sessions', 'Letzte Aktivität'],
      ...snapshot.rows.map((row) => [
        displayBadgeNumber(row.badgeNumber),
        `${row.firstName} ${row.lastName}`,
        row.rank.name,
        row.apiStatus,
        formatDuration(row.weekDurationMs),
        row.sessionCount,
        formatDateTime(row.lastSeenAt),
      ]),
    ]
    return response(csv(rows), `dienstzeiten-${nowLabel}.csv`, 'text/csv')
  }

  if (type === 'sanctions') {
    const sanctions = await prisma.sanction.findMany({
      include: { officer: { include: { rank: true } }, issuedBy: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
    })
    const rows = [
      ['Datum', 'Officer', 'Dienstnummer', 'Rang', 'Penal Grade', 'Status', 'Geldstrafe', 'Maßnahme', 'Frist', 'Grund', 'Ausgestellt von'],
      ...sanctions.map((sanction) => [
        formatDateTime(sanction.createdAt),
        sanction.officer ? `${sanction.officer.firstName} ${sanction.officer.lastName}` : `${sanction.previousFirstName ?? ''} ${sanction.previousLastName ?? ''}`.trim(),
        displayBadgeNumber(sanction.officer?.badgeNumber ?? sanction.previousBadgeNumber),
        sanction.officer?.rank.name ?? sanction.previousRank ?? '',
        penalGradeLabel(sanction.penalGrade),
        sanction.status,
        formatFineAmount(sanction.fineAmount),
        sanction.penalty ?? '',
        formatDateTime(sanction.dueAt),
        sanction.reason,
        sanction.issuedBy?.displayName ?? '',
      ]),
    ]
    return response(csv(rows), `sanktionen-${nowLabel}.csv`, 'text/csv')
  }

  if (type === 'promotions') {
    const logs = await prisma.promotionLog.findMany({
      include: { officer: true, oldRank: true, newRank: true, performedBy: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
    })
    const rows = [
      ['Datum', 'Officer', 'Alte DN', 'Neue DN', 'Alter Rang', 'Neuer Rang', 'Notiz', 'Durchgeführt von'],
      ...logs.map((log) => [
        formatDateTime(log.createdAt),
        `${log.officer.firstName} ${log.officer.lastName}`,
        displayBadgeNumber(log.oldBadgeNumber),
        displayBadgeNumber(log.newBadgeNumber),
        log.oldRank.name,
        log.newRank.name,
        log.note ?? '',
        log.performedBy?.displayName ?? '',
      ]),
    ]
    return response(csv(rows), `rangwechsel-${nowLabel}.csv`, 'text/csv')
  }

  if (type === 'officer') {
    const officerId = req.nextUrl.searchParams.get('officerId') ?? ''
    const officer = await prisma.officer.findUnique({
      where: { id: officerId },
      include: {
        rank: true,
        trainings: { include: { training: true } },
        sanctions: true,
        promotionLogs: { include: { oldRank: true, newRank: true } },
        officerNotes: true,
        probation: true,
      },
    })
    if (!officer) return error('Officer nicht gefunden', 404)

    if (format === 'html') {
      return new NextResponse(html(
        `Officer-Akte ${officer.firstName} ${officer.lastName}`,
        [
          ['Name', `${officer.firstName} ${officer.lastName}`],
          ['Dienstnummer', displayBadgeNumber(officer.badgeNumber)],
          ['Rang', officer.rank.name],
          ['Status', officer.status],
          ['Einstellung', formatDate(officer.hireDate)],
          ['Discord-ID', officer.discordId ?? ''],
          ['Probezeit', officer.probation ? `${officer.probation.status} bis ${formatDate(officer.probation.endsAt)}` : 'Keine'],
        ],
        [
          { title: 'Ausbildungen', rows: [['Ausbildung', 'Status'], ...officer.trainings.map((item) => [item.training.label, item.completed ? 'Abgeschlossen' : 'Offen'])] },
          { title: 'Rangverlauf', rows: [['Datum', 'Von', 'Nach', 'Notiz'], ...officer.promotionLogs.map((item) => [formatDateTime(item.createdAt), item.oldRank.name, item.newRank.name, item.note ?? ''])] },
          { title: 'Sanktionen', rows: [['Datum', 'Grade', 'Status', 'Geldstrafe', 'Maßnahme', 'Grund'], ...officer.sanctions.map((item) => [formatDateTime(item.createdAt), penalGradeLabel(item.penalGrade), item.status, formatFineAmount(item.fineAmount), item.penalty ?? '', item.reason])] },
          { title: 'Notizen', rows: [['Datum', 'Titel', 'Inhalt'], ...officer.officerNotes.map((item) => [formatDateTime(item.createdAt), item.title ?? '', item.content])] },
        ],
      ), { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }

    const rows = [
      ['Feld', 'Wert'],
      ['Name', `${officer.firstName} ${officer.lastName}`],
      ['Dienstnummer', displayBadgeNumber(officer.badgeNumber)],
      ['Rang', officer.rank.name],
      ['Status', officer.status],
      ['Einstellung', formatDate(officer.hireDate)],
      ['Discord-ID', officer.discordId ?? ''],
    ]
    return response(csv(rows), `officer-${displayBadgeNumber(officer.badgeNumber)}-${nowLabel}.csv`, 'text/csv')
  }

  return error('Export-Typ ist ungültig')
}
