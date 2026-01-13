import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type BottomSheetProps = {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

export function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  // 마운트/언마운트 애니메이션
  useEffect(() => {
    if (isOpen) {
      setMounted(true)
      // 다음 프레임에서 visible 설정 (애니메이션 트리거)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      })
    } else {
      setVisible(false)
      const timer = setTimeout(() => setMounted(false), 300)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: 9999 }}>
      {/* 배경 */}
      <div
        className={`absolute inset-0 bg-black transition-opacity duration-300 ${
          visible ? 'opacity-60' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* 시트 */}
      <div
        className={`absolute inset-x-0 bottom-0 max-h-[85vh] overflow-hidden rounded-t-3xl bg-white shadow-xl transition-transform duration-300 ease-out ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* 핸들 */}
        <div className="flex justify-center py-3">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        {/* 타이틀 */}
        {title && (
          <div className="border-b border-gray-100 px-5 pb-3">
            <h3 className="text-center text-base font-semibold text-gray-900 truncate">{title}</h3>
          </div>
        )}

        {/* 컨텐츠 */}
        <div className="overflow-y-auto px-5 pb-8 pt-2" style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

type BottomSheetItemProps = {
  icon?: ReactNode
  label: string
  onClick: () => void
  variant?: 'default' | 'danger'
  disabled?: boolean
  className?: string
}

export function BottomSheetItem({
  icon,
  label,
  onClick,
  variant = 'default',
  disabled = false,
  className = '',
}: BottomSheetItemProps) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all ${
        disabled
          ? 'cursor-not-allowed opacity-40'
          : variant === 'danger'
            ? 'text-red-500 hover:bg-red-50'
            : 'text-gray-700 hover:bg-gray-50'
      } ${className}`}
    >
      {icon && <span className="flex h-6 w-6 items-center justify-center">{icon}</span>}
      <span className="text-sm font-medium">{label}</span>
    </button>
  )
}

type BottomSheetActionsProps = {
  children: ReactNode
}

export function BottomSheetActions({ children }: BottomSheetActionsProps) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3">
      {children}
    </div>
  )
}

type BottomSheetActionButtonProps = {
  icon?: ReactNode
  label: string
  onClick: () => void
  variant?: 'default' | 'danger'
}

export function BottomSheetActionButton({
  icon,
  label,
  onClick,
  variant = 'default',
}: BottomSheetActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1.5 rounded-xl py-4 bg-gray-50 text-gray-900 transition-colors hover:bg-gray-100"
    >
      {icon && (
        <span className={`flex h-6 w-6 items-center justify-center ${
          variant === 'danger' ? 'text-red-500' : 'text-blue-500'
        }`}>
          {icon}
        </span>
      )}
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}
