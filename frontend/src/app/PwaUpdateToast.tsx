import { useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaUpdateToast() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error('PWA register failed', error)
    },
  })

  useEffect(() => {
    if (!needRefresh) {
      toast.dismiss('pwa-update-available')
      return
    }

    toast.custom(
      (t) => (
        <div className="pointer-events-auto w-[min(92vw,420px)] rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
          <p className="text-sm font-semibold text-gray-900">새 버전이 있어요</p>
          <p className="mt-1 text-xs text-gray-500">
            저장 후 업데이트하면 최신 화면으로 반영돼요.
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
              onClick={async () => {
                toast.dismiss(t.id)
                await updateServiceWorker(true)
              }}
            >
              업데이트
            </button>
          </div>
        </div>
      ),
      {
        id: 'pwa-update-available',
        duration: Infinity,
      },
    )
  }, [needRefresh, updateServiceWorker])

  return null
}
