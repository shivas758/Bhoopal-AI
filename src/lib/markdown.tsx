import { Fragment, type ReactNode } from 'react'

/** Renders **bold** without ever injecting HTML. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      // Stray single asterisks are dropped. No lookbehind: it breaks parsing on older Safari and WebViews.
      <Fragment key={i}>{part.replace(/(^|\s)\*(?=\S)/g, '$1').replace(/(\S)\*(?=\s|$)/g, '$1')}</Fragment>
    ),
  )
}

/** Minimal, safe Markdown for chat answers: paragraphs, bullet/numbered lists, headings, bold. */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(
      <Tag key={blocks.length} className={list.ordered ? 'list-decimal pl-5 space-y-1' : 'list-disc pl-5 space-y-1'}>
        {list.items.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </Tag>,
    )
    list = null
  }

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const bullet = /^[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      const ordered = Boolean(numbered)
      if (list && list.ordered !== ordered) flush()
      list ??= { ordered, items: [] }
      list.items.push((bullet ?? numbered)![1])
      continue
    }
    flush()
    if (!line) continue
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    blocks.push(
      <p key={blocks.length} className={heading ? 'font-semibold' : undefined}>
        {inline(heading ? heading[1] : line)}
      </p>,
    )
  }
  flush()
  return <div className="space-y-2 leading-relaxed">{blocks}</div>
}
