import type { ReactNode } from 'react'

// 스플래시와 로그인이 같이 쓰는 워드마크 자리. 같은 위치, 같은 크기여야 스플래시에서 로그인으로 넘어갈 때 로고가 튀지 않는다.
// 화면 높이의 28% 지점에 고정하고, 아래에 붙는 내용(소개 문장, 스피너)이 바뀌어도 워드마크는 움직이지 않는다.
// placement="inline"은 로그인 화면이 워드마크와 화면 미리보기를 한 묶음으로 세로 가운데에 둘 때 쓴다. 위 여백은 감싸는 쪽이 정한다.
// 워드마크는 한 가지 색이다.

const PADDING_TOP = {
  splash: 'calc(var(--safe-top) + 28dvh)',
  inline: '0px',
}

export function WordmarkHeader({
  children,
  placement = 'splash',
}: {
  children?: ReactNode
  placement?: keyof typeof PADDING_TOP
}) {
  return (
    <header data-placement={placement} className="px-6 text-center" style={{ paddingTop: PADDING_TOP[placement] }}>
      <h1 className="text-2xl font-bold tracking-tight text-text-primary">FlowMate</h1>
      {children}
    </header>
  )
}
