import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import { userTextMarkdownClass } from '../../../lib/userTextStyles'

// remark-gfm 은 표/체크박스/오토링크/strikethrough 를 켜는데, 그중 우리가 화면에
// 노출할 의도가 있는 건 strikethrough(`~~`) 정도다. 그러나 표는 allowedElements 에
// 없으니 unwrapDisallowed 로 셀 텍스트가 구분자 없이 이어 붙어 가비지가 된다.
// GFM 자체를 끄면 사용자가 `~~` 로 취소선을 만들 수 없는 대신 표 붕괴 위험은 사라진다.
//
// h1-h6 도 명시 허용한다. KPT 라벨이 이미 헤딩 역할을 하니 별도 크기 강조는 안 하지만,
// 허용하지 않으면 unwrapDisallowed 가 노드를 풀어 텍스트만 남기고 paragraph wrap 도 안
// 해서 `# 하이\n## 하이` 같은 입력이 한 줄로 합쳐져 표시된다.
const ALLOWED = [
  'p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]

export function MarkdownText({ content, muted = false }: { content: string; muted?: boolean }) {
  const text = `${userTextMarkdownClass} ${muted ? 'text-text-tertiary' : 'text-text-secondary'}`
  // h1-h6 는 모두 paragraph 와 동일 스타일로 렌더 — 줄바꿈 보존이 목적이고 크기 강조는
  // KPT 라벨이 담당하므로 의도된 동일 처리.
  const Para = ({ children }: { children?: ReactNode }) => <p className={text}>{children}</p>
  return (
    <ReactMarkdown
      remarkPlugins={[remarkBreaks]}
      allowedElements={ALLOWED}
      unwrapDisallowed
      components={{
        p: Para,
        h1: Para,
        h2: Para,
        h3: Para,
        h4: Para,
        h5: Para,
        h6: Para,
        ul: ({ children }) => (
          <ul className="list-disc list-inside space-y-0.5 pl-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside space-y-0.5 pl-1">{children}</ol>
        ),
        li: ({ children }) => (
          <li className={`${text} marker:text-text-tertiary`}>{children}</li>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-text-primary">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children }) => (
          <code className="rounded bg-surface-elevated px-1 py-0.5 text-[0.85em] font-mono">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="my-1 overflow-x-auto rounded bg-surface-elevated p-2 text-[0.85em] font-mono">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className={`border-l-2 border-border-strong pl-3 ${text}`}>
            {children}
          </blockquote>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-accent underline"
          >
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
