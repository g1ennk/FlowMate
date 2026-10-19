import type { Toast } from 'react-hot-toast'
import { toast } from 'react-hot-toast'

type UndoToastProps = {
  t: Toast
  message: string
  onUndo: () => void
}

export function UndoToast({ t, message, onUndo }: UndoToastProps) {
  return (
    <span className="flex items-center gap-3 text-sm">
      {message}
      {/* 음수 마진으로 보이는 위치는 그대로 두고 터치 영역만 44px 가까이 넓힌다 */}
      <button
        type="button"
        className="-mx-2 -my-2.5 shrink-0 whitespace-nowrap px-2 py-2.5 font-semibold text-accent hover:underline"
        onClick={() => {
          onUndo()
          toast.dismiss(t.id)
        }}
      >
        되돌리기
      </button>
    </span>
  )
}
