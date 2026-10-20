import { describe, expect, it } from 'vitest'
import { confirmMessages, objectParticle, subjectParticle, toastMessages } from './messages'

describe('objectParticle', () => {
  it('한글은 받침으로 을/를을 고른다', () => {
    expect(objectParticle('은행 들르기')).toBe('를')
    expect(objectParticle('보고서 작성')).toBe('을')
  })

  it('숫자는 읽는 소리로 고른다', () => {
    expect(objectParticle('3')).toBe('을')
    expect(objectParticle('회의 2')).toBe('를')
  })

  it('읽는 법을 알 수 없는 글자는 둘 다 쓴다', () => {
    expect(objectParticle('PR review')).toBe('을(를)')
  })
})

describe('toastMessages', () => {
  it('할 일 삭제 문구에 대상 이름을 넣는다', () => {
    expect(toastMessages.todoDeleted('은행 들르기')).toBe("'은행 들르기'를 삭제했어요")
  })

  it('긴 이름은 줄이고 조사는 원래 이름에 맞춘다', () => {
    expect(toastMessages.todoDeleted('아주 길게 적은 할 일 제목이라서 토스트에 다 넣기 어려운 문장')).toBe(
      "'아주 길게 적은 할 일 제목이라서 토…'을 삭제했어요",
    )
  })

  it('여러 개를 지우면 개수로 말한다', () => {
    expect(toastMessages.todosDeleted(3)).toBe('할 일 3개를 삭제했어요')
  })
})

describe('subjectParticle', () => {
  it('받침으로 이/가를 고른다', () => {
    expect(subjectParticle('1시간 40분')).toBe('이')
    expect(subjectParticle('45초')).toBe('가')
    expect(subjectParticle('abc')).toBe('이(가)')
  })
})

describe('confirmMessages.completeTodoFromTimer', () => {
  it('실제 집중 횟수와 시간으로 본문을 만든다', () => {
    expect(confirmMessages.completeTodoFromTimer(4, '1시간 40분')).toEqual({
      title: '이 할 일을 완료할까요?',
      body: '이 할 일에 집중 4회, 1시간 40분이 기록돼요.',
      confirmLabel: '완료',
      cancelLabel: '계속 집중',
    })
    expect(confirmMessages.completeTodoFromTimer(1, '45초').body).toBe('이 할 일에 집중 1회, 45초가 기록돼요.')
  })
})
