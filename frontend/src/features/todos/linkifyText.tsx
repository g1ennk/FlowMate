import { Fragment, type ReactNode } from 'react'

// http/https만 링크로 만든다. 스킴을 고정해 javascript: 같은 URL은 애초에 매칭되지 않는다.
// 한글(자모·음절)과 CJK 문장부호·전각 문자에서 끊는다: `https://a.com/b에서` → `https://a.com/b`
const URL_PATTERN = /https?:\/\/[^\s<>"'\u3131-\u318E\uAC00-\uD7A3\u3000-\u303F\uFF00-\uFFEF]+/gi
// globals.css의 레이어 밖 `a { color: inherit; text-decoration: none }`가 유틸리티보다 우선해 important로 덮는다.
// skip-ink를 끄면 밑줄이 p, g, / 처럼 아래로 내려간 글자에서 끊기지 않고 이어진다
const LINK_CLASS =
  'text-accent-text! underline! [text-decoration-skip-ink:none] hover:decoration-2! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

// 긴 URL이 단어 중간(`co.kr/le|arn`)이 아니라 경로 구분자 `/` 뒤에서 줄바꿈되도록 <wbr>을 넣는다.
// 그래도 한 줄에 안 들어가는 조각은 부모의 break-words가 마지막 수단으로 자른다
function withPathBreaks(url: string): ReactNode[] {
  // lookbehind 정규식은 Safari 16.4 미만에서 문법 오류라 split('/') 후 구분자를 되붙인다
  const parts = url.split('/')
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i < parts.length - 1 ? `${part}/` : part}
      {/* parts[0..1]은 `https:`와 빈 문자열이라 `https://` 안에서는 끊지 않는다 */}
      {i >= 2 && <wbr />}
    </Fragment>
  ))
}

const countChar = (text: string, char: string) => text.split(char).length - 1

// 문장 끝 문장부호는 URL이 아니라 문장의 일부로 본다.
// 닫는 괄호는 URL 안에서 짝이 안 맞을 때만 뗀다: `Foo_(bar)`는 유지, `(https://a.com)`의 `)`는 제거
function trimTrailingPunctuation(url: string): string {
  let result = url
  while (result.length > 0) {
    const last = result[result.length - 1]
    if ('.,;:!?'.includes(last)) {
      result = result.slice(0, -1)
    } else if (last === ')' && countChar(result, ')') > countChar(result, '(')) {
      result = result.slice(0, -1)
    } else if (last === ']' && countChar(result, ']') > countChar(result, '[')) {
      result = result.slice(0, -1)
    } else {
      break
    }
  }
  return result
}

export function findUrls(text: string): Array<{ start: number; url: string }> {
  return [...text.matchAll(URL_PATTERN)].map((match) => ({
    start: match.index,
    url: trimTrailingPunctuation(match[0]),
  }))
}

/**
 * 메모 텍스트의 URL을 링크로 바꾼다.
 * pathBreaks: `/` 뒤 줄바꿈 힌트(<wbr>). textarea와 줄바꿈 위치를 똑같이 맞춰야 하는 편집 미러에서는 끈다
 */
export function linkifyText(text: string, { pathBreaks = true }: { pathBreaks?: boolean } = {}): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0

  for (const { start, url } of findUrls(text)) {
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start))
    nodes.push(
      <a
        key={start}
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={(e) => e.stopPropagation()}
        className={LINK_CLASS}
      >
        {pathBreaks ? withPathBreaks(url) : url}
      </a>,
    )
    lastIndex = start + url.length
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}
