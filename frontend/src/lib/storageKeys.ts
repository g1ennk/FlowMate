export const STORAGE_PREFIX = 'flowmate'

export const storageKeys = {
  // 인증
  guestToken: `${STORAGE_PREFIX}/auth/guest-token`,
  // accessToken, authUser는 메모리(Zustand state)에만 저장 — localStorage 사용 안 함
  // 온보딩
  onboardingSeen: `${STORAGE_PREFIX}/onboarding/seen`,
  authMode: `${STORAGE_PREFIX}/auth/mode`,
  todosCalendarViewMode: `${STORAGE_PREFIX}/ui/todos-calendar-view-mode`,
  // 도메인 캐시
  todos: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/todos`,
  settings: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/settings`,
  reviews: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/reviews`,
  pomodoroSessionSettings: (clientId: string) =>
    `${STORAGE_PREFIX}/${clientId}/settings/pomodoroSession`,
  automationSettings: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/settings/automation`,
  miniDaysSettings: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/settings/miniDays`,
  sharedMiniDaysSettings: `${STORAGE_PREFIX}/settings/miniDays`,
  // 테마
  theme: `${STORAGE_PREFIX}/ui/theme`,
  // 코치마크
  coachMarksSeen: `${STORAGE_PREFIX}/ui/coach-marks-seen`,
  // 전환 퍼널
  guestReviewCount: `${STORAGE_PREFIX}/ui/guest-review-count`,
  // 회고 작성 중인 글 (저장 전 보관)
  reviewDraft: (type: string, periodStart: string) =>
    `${STORAGE_PREFIX}/review-draft:${type}:${periodStart}`,
  // OAuth 복귀 경로 (sessionStorage)
  oauthReturnTo: `${STORAGE_PREFIX}/auth/oauth-return-to`,
  // 사운드 (분위기, 밸런스, 전체 볼륨)
  soundPrefs: `${STORAGE_PREFIX}/ui/sound-prefs`,
  // 음악 (레거시, soundPrefs 마이그레이션 읽기용)
  musicVolume: `${STORAGE_PREFIX}:music:volume`,
  legacyMusicKeys: [`${STORAGE_PREFIX}:music:trackIndex`, `${STORAGE_PREFIX}:music:enabled`] as readonly string[],
}
