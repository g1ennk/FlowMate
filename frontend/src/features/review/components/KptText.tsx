import { useMemo } from 'react'
import { parseKpt, KPT_STYLES, type KptSegment, type KptTag } from '../kptParser'
import { userTextDisplayClass } from '../../../lib/userTextStyles'
import { MarkdownText } from './MarkdownText'

type Group =
  | { kind: 'kpt'; type: KptTag; body: string }
  | { kind: 'quote'; body: string }
  | { kind: 'plain'; body: string }

// 연속 plain 세그먼트를 직전 kpt/plain 그룹 body에 join하여 마크다운 리스트가 분리되지 않도록 함
function groupSegments(segments: KptSegment[]): Group[] {
  const groups: Group[] = []
  let current: Group | null = null
  for (const seg of segments) {
    if (seg.type === 'keep' || seg.type === 'problem' || seg.type === 'try') {
      if (current) groups.push(current)
      current = { kind: 'kpt', type: seg.type, body: seg.text }
    } else if (seg.type === 'quote') {
      if (current) groups.push(current)
      groups.push({ kind: 'quote', body: seg.text })
      current = null
    } else {
      if (current && (current.kind === 'kpt' || current.kind === 'plain')) {
        current.body = current.body ? `${current.body}\n${seg.text}` : seg.text
      } else {
        current = { kind: 'plain', body: seg.text }
      }
    }
  }
  if (current) groups.push(current)
  return groups
}

export function KptText({ content }: { content: string }) {
  const groups = useMemo(() => {
    const segments = parseKpt(content)
    return segments ? groupSegments(segments) : null
  }, [content])

  if (!groups) {
    return <MarkdownText content={content} />
  }

  return (
    <div className="space-y-1">
      {groups.map((group, i) => {
        if (group.kind === 'plain') {
          if (!group.body.trim()) return null
          return <MarkdownText key={i} content={group.body} />
        }
        if (group.kind === 'quote') {
          return (
            <div key={i}>
              <p className={`font-semibold ${userTextDisplayClass} text-text-tertiary`}>
                ❓ Question
              </p>
              {group.body.trim() && <MarkdownText content={group.body} muted />}
            </div>
          )
        }
        const style = KPT_STYLES[group.type]
        return (
          <div key={i}>
            <p className={`${userTextDisplayClass} text-text-secondary`}>
              <span className={`font-semibold ${style.colorClass}`}>
                {style.icon} {style.label}
              </span>
            </p>
            {group.body.trim() && <MarkdownText content={group.body} />}
          </div>
        )
      })}
    </div>
  )
}
