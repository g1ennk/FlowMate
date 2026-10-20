import { useEffect, useRef, type ReactNode } from 'react'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'

// window.confirm 대신 쓰는 확인 시트. 버튼 문구는 동작 이름("삭제", "계속 집중")으로 쓴다.
// 그래서 두 라벨 모두 필수이고 "확인/취소" 기본값은 두지 않는다. danger면 확인 버튼을 error-strong으로 채운다.
// 본문 문자열의 줄바꿈(\n)은 그대로 줄을 바꾼다.

type ConfirmSheetProps = {
  isOpen: boolean
  title: string
  body?: ReactNode
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  // 바깥을 누르거나 Escape로 닫을 때. 취소 버튼이 동작("뽀모도로 시작")이라 그냥 닫기와 다를 때만 준다
  onDismiss?: () => void
  danger?: boolean
  // 확인 처리 중에는 두 버튼을 막는다
  pending?: boolean
  tone?: 'surface' | 'timer'
  zIndex?: number
}

export function ConfirmSheet({
  isOpen,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  onDismiss,
  danger = false,
  pending = false,
  tone = 'surface',
  zIndex,
}: ConfirmSheetProps) {
  // 처리 중 막힌 버튼은 포커스를 잃는다(body로 떨어진다). 처리가 끝나도 시트가 열려 있으면(실패) 확인 버튼으로 돌려준다
  const actionsRef = useRef<HTMLDivElement>(null)
  const wasPendingRef = useRef(pending)
  useEffect(() => {
    const wasPending = wasPendingRef.current
    wasPendingRef.current = pending
    if (!wasPending || pending || !isOpen) return
    const active = document.activeElement
    if (active && active !== document.body) return
    actionsRef.current?.querySelector<HTMLButtonElement>('button:last-child')?.focus({ preventScroll: true })
  }, [pending, isOpen])

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={pending ? () => {} : (onDismiss ?? onCancel)}
      title={title}
      tone={tone}
      // 취소 버튼이 그냥 닫기와 같으면 숨긴 닫기가 필요 없다. onDismiss가 따로 있으면(두 버튼이 모두 동작)
      // 스크린리더 터치 사용자에게도 그냥 닫는 길이 있어야 해서 시트 끝에 숨긴 닫기를 둔다
      srCloseButton={onDismiss !== undefined}
      zIndex={zIndex}
    >
      {body && (
        <div
          className={`whitespace-pre-line break-keep pb-sheet text-center text-sm ${
            tone === 'timer' ? 'text-timer-modal-secondary' : 'text-text-secondary'
          }`}
        >
          {body}
        </div>
      )}
      <div ref={actionsRef} className="grid grid-cols-2 gap-list">
        <Button variant="secondary" tone={tone} onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          filled={danger}
          tone={tone}
          onClick={onConfirm}
          disabled={pending}
        >
          {confirmLabel}
        </Button>
      </div>
    </BottomSheet>
  )
}
