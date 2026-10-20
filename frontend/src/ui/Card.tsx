import type { HTMLAttributes } from 'react'

// 카드 면. 라이트는 border-default 1px, 다크는 면의 명도로만 구분한다(card-border 토큰). 그림자 없음.
// Card 안에 Card를 넣지 않는다. 안쪽 여백이 필요 없으면(목록을 꽉 채울 때) padding="none".

type CardProps = HTMLAttributes<HTMLDivElement> & {
  padding?: 'card' | 'none'
}

export function Card({ padding = 'card', className = '', ...props }: CardProps) {
  return (
    <div
      {...props}
      className={`rounded-card border border-card-border bg-surface-card ${padding === 'card' ? 'p-card' : ''} ${className}`}
    />
  )
}
