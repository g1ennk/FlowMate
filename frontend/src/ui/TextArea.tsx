import type { Ref, TextareaHTMLAttributes } from 'react'

// 여러 줄 입력창. sunken 면에 포커스 때 진한 글자색(text-primary) 테두리와 그 바로 바깥 ring 1px로 선 하나(2px)를 그린다. 기본 테두리가 회색이라 포커스는 초록이 아닌 검정으로 짙어진다(사용자 결정 2026-10-20).
// 전역 :focus-visible 링(2px 띄운 outline)은 끈다. 둘 다 그리면 테두리가 두 겹으로 보인다(사용자 리뷰 2026-10-20).
// 처음부터 보이는 큰 입력창이라 포커스 전 테두리도 3:1을 넘겨야 입력창으로 읽힌다(§3-5). 그래서 border-strong(1.4:1)
// 대신 text-tertiary 색 테두리를 쓴다. placeholder는 secondary다(§4-1, tertiary는 sunken 면에서 쓰지 않는다).
// 높이 조절은 쓰는 쪽이 한다.
// bare: 카드가 곧 입력창일 때(회고). 회색 면, 테두리, 둥근 상자, 안쪽 여백을 모두 빼서 글자가 카드 안쪽 여백 선에서 시작한다.
// 포커스 표시는 감싸는 카드가 입력창 포커스(has-[textarea:focus])로 그린다(사용자 결정 2026-10-20, 흰 카드 안에 회색 상자를 두지 않는다).

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: Ref<HTMLTextAreaElement>
  bare?: boolean
}

const BOXED = 'rounded-control border border-text-tertiary bg-surface-sunken px-3 py-3 transition-colors focus:border-text-primary focus:ring-1 focus:ring-text-primary'
const BARE = 'border-0 bg-transparent p-0'

export function TextArea({ bare = false, className = '', ref, ...props }: TextAreaProps) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={`block w-full resize-none text-text-primary placeholder:text-text-secondary focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${bare ? BARE : BOXED} ${className}`}
    />
  )
}
