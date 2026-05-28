import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownText } from './MarkdownText'

describe('MarkdownText', () => {
  it('bold/italic/inline code 를 렌더한다', () => {
    render(<MarkdownText content="**굵게** *기울임* `code`" />)
    expect(screen.getByText('굵게').tagName).toBe('STRONG')
    expect(screen.getByText('기울임').tagName).toBe('EM')
    expect(screen.getByText('code').tagName).toBe('CODE')
  })

  it('연속 불릿을 단일 ul 로 묶는다', () => {
    const { container } = render(<MarkdownText content={'- 첫 항목\n- 두번째\n- 세번째'} />)
    const lists = container.querySelectorAll('ul')
    const items = container.querySelectorAll('li')
    expect(lists).toHaveLength(1)
    expect(items).toHaveLength(3)
  })

  it('script 태그는 실행되지 않고 텍스트로 escape 된다', () => {
    const { container } = render(<MarkdownText content={'<script>alert(1)</script>안녕'} />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('안녕')
  })

  it('h1-h6 은 paragraph 와 동일 스타일로 렌더되어 줄바꿈을 보존한다', () => {
    const { container } = render(<MarkdownText content={'# 하이\n## 하이'} />)
    // 헤딩은 p 로 매핑되므로 h1/h2 태그는 남지 않는다.
    expect(container.querySelector('h1')).toBeNull()
    expect(container.querySelector('h2')).toBeNull()
    // 두 줄이 각자 paragraph 로 wrap 되어야 한다 — unwrap 만 하면 텍스트가 한 줄로 합쳐진다.
    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs.length).toBeGreaterThanOrEqual(2)
    expect(paragraphs[0].textContent).toBe('하이')
    expect(paragraphs[1].textContent).toBe('하이')
  })

  it('화이트리스트 밖 요소(img)는 unwrap 되어 본문만 남는다', () => {
    const { container } = render(<MarkdownText content={'![alt](http://x)'} />)
    expect(container.querySelector('img')).toBeNull()
  })

  it('block code (```fence```) 는 pre+code 로 렌더한다', () => {
    const { container } = render(
      <MarkdownText content={'```\nconst x = 1\nconst y = 2\n```'} />,
    )
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre?.querySelector('code')).not.toBeNull()
    expect(container.textContent).toContain('const x = 1')
    expect(container.textContent).toContain('const y = 2')
  })

  it('blockquote (> ) 는 인용 스타일로 렌더한다', () => {
    const { container } = render(<MarkdownText content={'> 인용된 문장'} />)
    expect(container.querySelector('blockquote')).not.toBeNull()
    expect(container.textContent).toContain('인용된 문장')
  })

  it('외부 링크는 target=_blank rel=noopener 로 렌더한다', () => {
    render(<MarkdownText content="[Anthropic](https://anthropic.com)" />)
    const link = screen.getByRole('link', { name: 'Anthropic' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('rel')).toContain('noreferrer')
  })

  it('단일 줄바꿈을 br 로 렌더한다 (remarkBreaks)', () => {
    const { container } = render(<MarkdownText content={'첫줄\n둘째줄'} />)
    expect(container.querySelector('br')).not.toBeNull()
  })

  it('muted=true 면 text-text-tertiary 클래스를 적용한다', () => {
    const { container } = render(<MarkdownText content="텍스트" muted />)
    const p = container.querySelector('p')
    expect(p?.className).toContain('text-text-tertiary')
  })
})
