export type KptTag = 'keep' | 'problem' | 'try'

export type KptSegment =
  | { type: KptTag; text: string }
  | { type: 'quote'; text: string }
  | { type: 'plain'; text: string }

// 예전에 KPT 형식으로 저장한 회고를 읽기 위한 파서다. 새 회고는 라벨 없는 평문으로 저장한다.
// 화면에서는 예전 라벨을 평범한 소제목으로 바꿔 보여 준다(.impeccable.md §8). 저장된 글은 고치지 않는다.
export const LEGACY_KPT_HEADINGS: Record<KptTag | 'quote', string> = {
  keep: '잘한 점',
  problem: '아쉬운 점',
  try: '다음에 해 볼 것',
  quote: '질문',
}

// [Keep] 대괄호 형식 + ✅ Keep 이모지 형식 둘 다 읽는다(둘 다 예전 형식)
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
