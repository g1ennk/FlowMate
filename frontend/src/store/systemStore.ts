import { create } from 'zustand'

export type BackendStatus = 'unknown' | 'available' | 'unavailable'

interface SystemStore {
  status: BackendStatus
  setStatus: (status: BackendStatus) => void
}

export const useSystemStore = create<SystemStore>((set) => ({
  status: 'unknown',
  setStatus: (status) => set({ status }),
}))
