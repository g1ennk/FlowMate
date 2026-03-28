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
      <button
        className="font-semibold text-accent hover:underline"
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
