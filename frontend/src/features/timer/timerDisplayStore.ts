import { create } from 'zustand'

// 타이머 전체 화면의 표시 기준 토글. 브라우저 탭 제목도 같은 값을 따른다.
// 전체 화면을 열고 닫을 때마다 기본값으로 돌아가므로 저장하지 않는다.
interface TimerDisplayStore {
  /** 현재 세션(false) vs 전체 누적(true) */
  showTotalFocus: boolean
  /** 추가 휴식(false) vs 총 휴식(true) */
  showTotalBreak: boolean
  setShowTotalFocus: (value: boolean) => void
  setShowTotalBreak: (value: boolean) => void
  resetDisplay: () => void
}

export const useTimerDisplayStore = create<TimerDisplayStore>((set) => ({
  showTotalFocus: false,
  showTotalBreak: false,
  setShowTotalFocus: (value) => set({ showTotalFocus: value }),
  setShowTotalBreak: (value) => set({ showTotalBreak: value }),
  resetDisplay: () => set({ showTotalFocus: false, showTotalBreak: false }),
}))
