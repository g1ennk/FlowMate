import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Toast } from 'react-hot-toast'
import { toast } from 'react-hot-toast'
import { toastMessages } from '../lib/messages'

// 되돌리기 토스트. 문구에는 대상 이름을 넣는다(toastMessages.todoDeleted 등, "'은행 들르기'를 삭제했어요").
// 지운 행이 사라지면 포커스가 갈 곳이 없어 body로 떨어진다. takeFocus면 그때 되돌리기로 포커스를 옮겨
// 키보드로 바로 되돌릴 수 있게 하고(토스트는 inert 바깥에 있다), 토스트가 사라질 때 포커스가 안에 있으면 returnFocus로 돌려준다.
type UndoToastProps = {
  t: Toast
  message: string
  onUndo: () => void
  takeFocus?: boolean
  // undone: 되돌리기를 눌러 닫혔는지(눌렀으면 되살린 자리, 아니면 다음 자리로 보낸다)
  returnFocus?: (undone: boolean) => void
}

// 포커스가 갈 곳을 잃었는지: body, 화면에서 빠진 요소, 닫히는 시트처럼 inert 안에 남은 요소
function isFocusLost() {
  const active = document.activeElement
  return !active || active === document.body || !active.isConnected || !!active.closest('[inert]')
}

export function UndoToast({ t, message, onUndo, takeFocus = false, returnFocus }: UndoToastProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const undoneRef = useRef(false)
  const returnFocusRef = useRef(returnFocus)
  useEffect(() => {
    returnFocusRef.current = returnFocus
  })

  // 시트가 닫히며 연 자리로 포커스를 돌려주는 일(마이크로태스크)이 끝난 뒤에 본다
  useEffect(() => {
    if (!takeFocus) return
    const timer = window.setTimeout(() => {
      if (isFocusLost()) buttonRef.current?.focus({ preventScroll: true })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [takeFocus])

  const hasFocus = () => !!buttonRef.current && document.activeElement === buttonRef.current
  const handBack = () => {
    const back = returnFocusRef.current
    if (!back) return
    const undone = undoneRef.current
    // 되살린 행이 다시 그려진 뒤에 옮긴다
    window.setTimeout(() => back(undone), 0)
  }

  // 시간이 다 되거나 되돌리기로 닫히면 visible이 먼저 false가 된다(사라지는 애니메이션 동안 DOM에 남는다). 그때 한 번 본다
  const visible = t.visible
  useEffect(() => {
    if (visible === false && hasFocus()) handBack()
  }, [visible])

  // 숨김을 거치지 않고 바로 빠질 때(toast.remove)도 포커스를 잃지 않게 한다. 마운트 해제 때 DOM에서 빠지기 전에 본다
  useLayoutEffect(() => () => {
    if (hasFocus()) handBack()
  }, [])

  return (
    <span className="flex items-center gap-card-item text-sm">
      <span className="min-w-0">{message}</span>
      {/* 보이는 크기는 글자 그대로 두고, 의사 요소로 위아래 12px씩 넓혀 터치 영역을 44로 맞춘다 */}
      <button
        ref={buttonRef}
        type="button"
        className="relative shrink-0 whitespace-nowrap font-semibold text-toast-action after:absolute after:-inset-x-2 after:-inset-y-3 hover:underline"
        onClick={() => {
          undoneRef.current = true
          onUndo()
          toast.dismiss(t.id)
        }}
      >
        {toastMessages.undo}
      </button>
    </span>
  )
}
