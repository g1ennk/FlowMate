import { useMemo } from 'react'
import { parseKpt, LEGACY_KPT_HEADINGS, type KptSegment, type KptTag } from '../kptParser'
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

function LegacyHeading({ children }: { children: string }) {
  return <p className="text-sm font-semibold text-text-primary">{children}</p>
}

// 저장한 회고를 보여 준다. 예전 KPT 형식이면 라벨을 평범한 소제목으로 바꾸고, 아니면 글 그대로 보여 준다
export function KptText({ content }: { content: string }) {
  const groups = useMemo(() => {
    const segments = parseKpt(content)
    return segments ? groupSegments(segments) : null
  }, [content])

  if (!groups) {
    return <MarkdownText content={content} tone="primary" />
  }

  return (
    <div className="space-y-card-item">
      {groups.map((group, i) => {
        if (group.kind === 'plain') {
          if (!group.body.trim()) return null
          return <MarkdownText key={i} content={group.body} tone="primary" />
        }
        const heading = group.kind === 'quote' ? LEGACY_KPT_HEADINGS.quote : LEGACY_KPT_HEADINGS[group.type]
        return (
          <div key={i} className="space-y-tight">
            <LegacyHeading>{heading}</LegacyHeading>
            {group.body.trim() && <MarkdownText content={group.body} tone="primary" />}
          </div>
        )
      })}
    </div>
  )
}
