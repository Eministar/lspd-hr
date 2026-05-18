type TableAlign = 'left' | 'center' | 'right' | null

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
}

function isSafeLinkHref(href: string) {
  return /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href)
}

function renderInline(value: string) {
  const codeSpans: string[] = []
  let html = escapeHtml(value).replace(/`([^`]+)`/g, (_, code: string) => {
    const index = codeSpans.push(`<code>${code}</code>`) - 1
    return `\u0000CODE${index}\u0000`
  })

  html = html.replace(/&lt;br\s*\/?&gt;/gi, '<br />')
  html = html.replace(/\*\*~([^~]+)~\*\*/g, '<span class="markdown-signature">$1</span>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  html = html.replace(/\[([^\]]+)]\(([^)\s]+)\)/g, (match, label: string, href: string) => {
    if (!isSafeLinkHref(href)) return match
    const externalAttrs = /^https?:\/\//i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''
    return `<a href="${href}"${externalAttrs}>${label}</a>`
  })

  return html.replace(/\u0000CODE(\d+)\u0000/g, (_, index: string) => codeSpans[Number(index)] ?? '')
}

function splitTableRow(row: string) {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function parseTableAlign(row: string): TableAlign[] | null {
  const cells = splitTableRow(row)
  if (!cells.every((cell) => /^:?-{3,}:?$/.test(cell))) return null
  return cells.map((cell) => {
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    return 'left'
  })
}

function tableAlignClass(align: TableAlign) {
  if (align === 'center') return ' class="text-center"'
  if (align === 'right') return ' class="text-right"'
  return ''
}

export function renderMarkdown(markdown: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed)
    if (heading) {
      const level = heading[1].length
      const text = heading[2].trim()
      html.push(`<h${level} id="${slugify(text)}">${renderInline(text)}</h${level}>`)
      index += 1
      continue
    }

    if (/^---+$/.test(trimmed)) {
      html.push('<hr />')
      index += 1
      continue
    }

    if (trimmed.startsWith('> ')) {
      const quote: string[] = []
      while (index < lines.length && lines[index].trim().startsWith('> ')) {
        quote.push(lines[index].trim().slice(2))
        index += 1
      }
      html.push(`<blockquote>${quote.map(renderInline).join('<br />')}</blockquote>`)
      continue
    }

    const tableAlign = index + 1 < lines.length ? parseTableAlign(lines[index + 1]) : null
    if (trimmed.includes('|') && tableAlign) {
      const headers = splitTableRow(trimmed)
      const rows: string[][] = []
      index += 2
      while (index < lines.length && lines[index].trim().includes('|')) {
        rows.push(splitTableRow(lines[index]))
        index += 1
      }
      html.push(
        `<div class="markdown-table-wrap"><table><thead><tr>${headers
          .map((header, cellIndex) => `<th${tableAlignClass(tableAlign[cellIndex])}>${renderInline(header)}</th>`)
          .join('')}</tr></thead><tbody>${rows
          .map((row) => `<tr>${row
            .map((cell, cellIndex) => `<td${tableAlignClass(tableAlign[cellIndex])}>${renderInline(cell)}</td>`)
            .join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      )
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: { text: string; checked: boolean | null }[] = []
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        const item = lines[index].trim().replace(/^[-*]\s+/, '')
        const task = /^\[( |x|X)]\s+(.+)$/.exec(item)
        items.push(task ? { text: task[2], checked: task[1].toLowerCase() === 'x' } : { text: item, checked: null })
        index += 1
      }
      const taskList = items.some((item) => item.checked !== null)
      html.push(`<ul${taskList ? ' class="markdown-task-list"' : ''}>${items.map((item) => (
        item.checked === null
          ? `<li>${renderInline(item.text)}</li>`
          : `<li><input type="checkbox" disabled${item.checked ? ' checked' : ''} />${renderInline(item.text)}</li>`
      )).join('')}</ul>`)
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ''))
        index += 1
      }
      html.push(`<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ol>`)
      continue
    }

    const paragraph: string[] = []
    while (index < lines.length) {
      const current = lines[index].trim()
      const nextTableAlign = index + 1 < lines.length ? parseTableAlign(lines[index + 1]) : null
      if (
        !current ||
        /^(#{1,6})\s+/.test(current) ||
        /^[-*]\s+/.test(current) ||
        /^\d+\.\s+/.test(current) ||
        current.startsWith('> ') ||
        /^---+$/.test(current) ||
        (current.includes('|') && nextTableAlign)
      ) {
        break
      }
      paragraph.push(current)
      index += 1
    }
    html.push(`<p>${paragraph.map(renderInline).join('<br />')}</p>`)
  }

  return html.join('\n')
}
