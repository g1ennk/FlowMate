import { create } from 'zustand'

// 일반 타이머 전체 화면의 표시 기준(현재 세션 / 전체 누적). 브라우저 탭 제목도 같은 값을 따른다.
// 전체 화면을 열고 닫을 때마다 기본값으로 돌아가므로 저장하지 않는다.
// 추천 휴식이 끝난 뒤에는 넘친 시간(라벨)과 총 휴식(숫자)을 함께 보여 주므로 휴식 쪽 토글은 없다.
interface TimerDisplayStore {
  /** 현재 세션(false) vs 전체 누적(true) */
  showTotalFocus: boolean
  setShowTotalFocus: (value: boolean) => void
  resetDisplay: () => void
}

export const useTimerDisplayStore = create<TimerDisplayStore>((set) => ({
  showTotalFocus: false,
  setShowTotalFocus: (value) => set({ showTotalFocus: value }),
  resetDisplay: () => set({ showTotalFocus: false }),
}))
