import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ConfirmSheet } from './ConfirmSheet'

// window.confirm 대신 쓰는 확인 시트를 Promise로 묻는다.
//   const { confirm, confirmSheet } = useConfirmSheet()
//   if (!(await confirm(confirmMessages.logout))) return
// confirmSheet는 컴포넌트가 렌더하는 JSX 어딘가에 둔다. 버튼 문구는 동작 이름이다("확인/취소" 금지).

export type ConfirmOptions = {
  title: string
  body?: ReactNode
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
}

export function useConfirmSheet() {
  const [isOpen, setIsOpen] = useState(false)
  // 닫히는 애니메이션 동안에도 문구가 남도록 마지막 내용을 들고 있는다
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((ok: boolean) => void) | null>(null)

  const settle = useCallback((ok: boolean) => {
    const resolve = resolveRef.current
    resolveRef.current = null
    setIsOpen(false)
    resolve?.(ok)
  }, [])

  const confirm = useCallback((next: ConfirmOptions) => {
    // 이전 질문이 남아 있으면 취소로 끝낸다
    resolveRef.current?.(false)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
      setOptions(next)
      setIsOpen(true)
    })
  }, [])

  // 화면을 떠나면 기다리던 쪽이 멈추지 않게 취소로 끝낸다
  useEffect(() => () => resolveRef.current?.(false), [])

  const handleConfirm = useCallback(() => settle(true), [settle])
  const handleCancel = useCallback(() => settle(false), [settle])

  const confirmSheet = options ? (
    <ConfirmSheet
      isOpen={isOpen}
      title={options.title}
      body={options.body}
      confirmLabel={options.confirmLabel}
      cancelLabel={options.cancelLabel}
      danger={options.danger}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null

  return { confirm, confirmSheet }
}
