export type KptTag = 'keep' | 'problem' | 'try'

export type KptSegment =
  | { type: KptTag; text: string }
  | { type: 'quote'; text: string }
  | { type: 'plain'; text: string }

export const KPT_STYLES: Record<KptTag, { icon: string; label: string; colorClass: string }> = {
  keep: { icon: '✅', label: 'Keep', colorClass: 'text-accent' },
  problem: { icon: '⚠️', label: 'Problem', colorClass: 'text-state-warning' },
  try: { icon: '💡', label: 'Try', colorClass: 'text-accent-text' },
}

// [Keep] 대괄호 형식 (레거시) + ✅ Keep 이모지 형식 둘 다 인식
const BRACKET_PATTERN = /^\[(keep|problem|try)\]\s*/i
const EMOJI_PREFIXES: { prefix: string; type: KptTag }[] = [
  { prefix: '✅ Keep', type: 'keep' },
  { prefix: '⚠️ Problem', type: 'problem' },
  { prefix: '💡 Try', type: 'try' },
]

export function parseKpt(content: string): KptSegment[] | null {
  const lines = content.split('\n')
  const segments: KptSegment[] = []
  let hasTag = false

  for (const line of lines) {
    const bracketMatch = line.match(BRACKET_PATTERN)
    if (bracketMatch) {
      hasTag = true
      const type = bracketMatch[1].toLowerCase() as KptTag
      segments.push({ type, text: line.slice(bracketMatch[0].length) })
      continue
    }
    const emojiMatch = EMOJI_PREFIXES.find((e) => line.startsWith(e.prefix))
    if (emojiMatch) {
      hasTag = true
      const text = line.slice(emojiMatch.prefix.length).replace(/^\s+/, '')
      segments.push({ type: emojiMatch.type, text })
      continue
    }
    if (line.startsWith('> ')) {
      segments.push({ type: 'quote', text: line.slice(2) })
      continue
    }
    segments.push({ type: 'plain', text: line })
  }

  return hasTag ? segments : null
}

export function formatReportAsKpt(report: { keep: string; problem: string; try: string }): string {
  const { icon: ki, label: kl } = KPT_STYLES.keep
  const { icon: pi, label: pl } = KPT_STYLES.problem
  const { icon: ti, label: tl } = KPT_STYLES.try
  return `${ki} ${kl}\n${report.keep}\n\n${pi} ${pl}\n${report.problem}\n\n${ti} ${tl}\n${report.try}`
}

export function extractTry(content: string): string | null {
  const segments = parseKpt(content)
  if (!segments) return null
  const tryIdx = segments.findIndex((s) => s.type === 'try')
  if (tryIdx === -1) return null
  // Try 태그 줄의 text + 이후 plain 줄들을 결합 (다음 태그/인용까지)
  const parts: string[] = []
  if (segments[tryIdx].text) parts.push(segments[tryIdx].text)
  for (let i = tryIdx + 1; i < segments.length; i++) {
    const s = segments[i]
    if (s.type !== 'plain' || !s.text) break
    parts.push(s.text)
  }
  return parts.join('\n') || null
}
