import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { linkifyText } from './linkifyText'

const renderText = (text: string) => render(<p>{linkifyText(text)}</p>)

describe('linkifyText', () => {
  it('URL이 없으면 원문을 그대로 반환한다', () => {
    expect(linkifyText('그냥 메모')).toEqual(['그냥 메모'])
  })

  it('여러 줄의 URL을 각각 링크로 만들고 사이 텍스트와 줄바꿈을 보존한다', () => {
    const note =
      '1. 이진 변환 반복하기:\nhttps://school.programmers.co.kr/learn/courses/30/lessons/70129\n' +
      '2. 크기가 작은 부분 문자열:\nhttps://school.programmers.co.kr/learn/courses/30/lessons/147355'
    const { container } = renderText(note)

    const links = screen.getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://school.programmers.co.kr/learn/courses/30/lessons/70129',
      'https://school.programmers.co.kr/learn/courses/30/lessons/147355',
    ])
    expect(links[0]).toHaveAttribute('target', '_blank')
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer nofollow')
    expect(container.textContent).toBe(note)
  })

  it('긴 URL은 경로 구분자 뒤에서만 줄바꿈되도록 <wbr>을 넣는다', () => {
    renderText('https://school.programmers.co.kr/learn/courses/30/lessons/70129')

    const link = screen.getByRole('link')
    expect(link.querySelectorAll('wbr').length).toBeGreaterThan(0)
    for (const wbr of link.querySelectorAll('wbr')) {
      const before = wbr.previousSibling?.textContent ?? ''
      if (wbr.nextSibling) expect(before.endsWith('/')).toBe(true)
    }
  })

  it('URL 끝의 문장부호와 닫는 괄호는 링크에서 뺀다', () => {
    const { container } = renderText('참고(https://example.com/a). 끝')

    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/a')
    expect(container.textContent).toBe('참고(https://example.com/a). 끝')
  })

  it('URL 뒤에 붙은 한글과 전각 문장부호는 링크에서 뺀다', () => {
    const { container } = renderText('https://a.com/b에서 확인（https://c.com/d）')

    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      'https://a.com/b',
      'https://c.com/d',
    ])
    expect(container.textContent).toBe('https://a.com/b에서 확인（https://c.com/d）')
  })

  it('대문자 스킴도 링크로 만든다', () => {
    renderText('HTTPS://EXAMPLE.COM/A')

    expect(screen.getByRole('link')).toHaveAttribute('href', 'HTTPS://EXAMPLE.COM/A')
  })

  it('URL 안에서 짝이 맞는 괄호는 유지한다', () => {
    renderText('위키 https://en.wikipedia.org/wiki/Foo_(bar) 참고')

    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Foo_(bar)')
  })

  it('http/https가 아닌 주소는 링크로 만들지 않는다', () => {
    renderText('javascript:alert(1) www.example.com')

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
