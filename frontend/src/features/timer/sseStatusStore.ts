import { create } from 'zustand'

type SseStatus = 'disconnected' | 'connecting' | 'connected'

interface SseStatusStore {
  status: SseStatus
  setStatus: (status: SseStatus) => void
}

export const useSseStatusStore = create<SseStatusStore>((set) => ({
  status: 'disconnected',
  setStatus: (status) => set({ status }),
}))
