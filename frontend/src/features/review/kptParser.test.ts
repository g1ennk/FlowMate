import { describe, it, expect } from 'vitest'
import { parseKpt, extractTry } from './kptParser'

describe('parseKpt', () => {
  it('parses bracket KPT tags', () => {
    const input = `[Keep] 잘한 것\n\n[Problem] 문제점\n\n[Try] 개선할 것`
    const result = parseKpt(input)
    expect(result).toEqual([
      { type: 'keep', text: '잘한 것' },
      { type: 'plain', text: '' },
      { type: 'problem', text: '문제점' },
      { type: 'plain', text: '' },
      { type: 'try', text: '개선할 것' },
    ])
  })

  it('parses emoji KPT tags', () => {
    const input = `✅ Keep 잘한 것\n\n⚠️ Problem 문제점\n\n💡 Try 개선할 것`
    const result = parseKpt(input)
    expect(result).toEqual([
      { type: 'keep', text: '잘한 것' },
      { type: 'plain', text: '' },
      { type: 'problem', text: '문제점' },
      { type: 'plain', text: '' },
      { type: 'try', text: '개선할 것' },
    ])
  })

  it('returns null for plain text without KPT tags', () => {
    expect(parseKpt('그냥 일반 회고입니다.')).toBeNull()
  })

  it('handles mixed content with untagged lines', () => {
    const input = `[Keep] 잘한 것
추가 내용
[Problem] 문제`
    const result = parseKpt(input)
    expect(result).not.toBeNull()
    expect(result![0]).toEqual({ type: 'keep', text: '잘한 것' })
    expect(result![1]).toEqual({ type: 'plain', text: '추가 내용' })
  })

  it('is case insensitive', () => {
    const result = parseKpt('[keep] 소문자도 됨')
    expect(result).not.toBeNull()
    expect(result![0].type).toBe('keep')
  })

  it('parses > lines as quote type', () => {
    const input = `[Keep] 잘한 것\n\n[Try] 개선할 것\n\n> 어떤 부분이 어려웠나요?`
    const result = parseKpt(input)
    expect(result).not.toBeNull()
    const quote = result!.find((s) => s.type === 'quote')
    expect(quote).toEqual({ type: 'quote', text: '어떤 부분이 어려웠나요?' })
  })

  it('treats > as plain when no KPT tags exist', () => {
    const result = parseKpt('> 그냥 인용')
    expect(result).toBeNull()
  })
})

describe('extractTry', () => {
  it('extracts Try text from KPT content', () => {
    const input = `[Keep] 잘한 것\n\n[Problem] 문제\n\n[Try] 개선할 것`
    expect(extractTry(input)).toBe('개선할 것')
  })

  it('returns null for content without Try tag', () => {
    expect(extractTry('그냥 텍스트')).toBeNull()
  })

  it('extracts multiline Try from emoji format', () => {
    const input = `✅ Keep\n잘한 것\n\n💡 Try\n- 내일 아침에 운동하기\n- 일찍 자기\n\n> 질문`
    expect(extractTry(input)).toBe('- 내일 아침에 운동하기\n- 일찍 자기')
  })
})
