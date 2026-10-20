// 토스트, 상단 배너, 시스템 화면, 확인 시트 문구를 한곳에 둔다(.impeccable.md §9).
// 해요체, 느낌표와 이모지 없음, 실패는 "~하지 못했어요. 다시 시도해 주세요."로 쓴다.

const NAME_MAX_LENGTH = 20
// 실패 토스트는 기본(2초)보다 오래 둔다. 놓치면 저장된 줄 안다
export const FAILURE_TOAST_MS = 5000
// 받침이 있는 숫자 읽기: 0(영) 1(일) 3(삼) 6(육) 7(칠) 8(팔)
const DIGITS_WITH_FINAL = '013678'

/** 목적격 조사. 한글과 숫자는 받침으로 고르고, 그 밖의 글자는 읽는 법을 알 수 없어 둘 다 쓴다 */
export function objectParticle(word: string): '을' | '를' | '을(를)' {
  const last = word.trim().at(-1) ?? ''
  const code = last.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? '를' : '을'
  if (/[0-9]/.test(last)) return DIGITS_WITH_FINAL.includes(last) ? '을' : '를'
  return '을(를)'
}

/** 주격 조사. 받침이 있으면 '이', 없으면 '가'. 고르는 방법은 objectParticle과 같다 */
export function subjectParticle(word: string): '이' | '가' | '이(가)' {
  const object = objectParticle(word)
  return object === '을' ? '이' : object === '를' ? '가' : '이(가)'
}

/** 토스트에 넣는 이름. 길면 줄여서 토스트가 커지지 않게 한다. 조사는 원래 이름의 끝 글자로 고른다 */
function shortName(name: string) {
  const trimmed = name.trim()
  return trimmed.length > NAME_MAX_LENGTH ? `${trimmed.slice(0, NAME_MAX_LENGTH)}…` : trimmed
}

function quoteName(name: string) {
  return `'${shortName(name)}'${objectParticle(name)}`
}

export const toastMessages = {
  undo: '되돌리기',
  todoDeleted: (title: string) => `${quoteName(title)} 삭제했어요`,
  todosDeleted: (count: number) => `할 일 ${count}개를 삭제했어요`,
  todoCompleted: (title: string) => `${quoteName(title)} 완료했어요`,
  todoUncompleted: (title: string) => `'${shortName(title)}' 완료를 취소했어요`,
  reviewDeleted: '회고를 삭제했어요',
  undoTooLate: '이미 삭제돼서 되돌릴 수 없어요',
  guestStartFailed: '게스트로 시작하지 못했어요. 다시 시도해 주세요.',
  kakaoStartFailed: '카카오 로그인을 시작하지 못했어요. 다시 시도해 주세요.',
  todoUpdated: '수정했어요',
  todoUpdateFailed: '수정하지 못했어요. 다시 시도해 주세요.',
  todoCreateFailed: '할 일을 추가하지 못했어요. 다시 시도해 주세요.',
  // 오프라인에서는 보내지 않고 입력을 그대로 둔다(배너 "지금은 저장되지 않아요"와 같은 말)
  todoCreateOffline: '오프라인이라 추가하지 못했어요. 연결되면 다시 시도해 주세요.',
  todoUpdateOffline: '오프라인이라 수정하지 못했어요. 연결되면 다시 시도해 주세요.',
  batchCompleted: (count: number) => `할 일 ${count}개를 완료했어요`,
  completedTodoTimer: '완료한 할 일은 타이머를 시작할 수 없어요',
  // 타이머를 열거나 시작할 수 없는 이유(메뉴의 회색 한 줄, 행의 집중 버튼 토스트). 모드 이름은 '일반 타이머', '뽀모도로'
  timerBlockedCompleted: '완료한 할 일이에요',
  timerRunningOn: (title: string) => `'${shortName(title)}' 타이머가 실행 중이에요`,
  timerRunningElsewhere: '다른 할 일의 타이머가 실행 중이에요',
  timerSameTodoRunning: (modeName: string) => `같은 할 일의 ${modeName}가 실행 중이에요`,
  timerSameTodoPaused: (modeName: string) => `같은 할 일에 멈춘 ${modeName}가 있어요. 초기화한 뒤 바꿀 수 있어요`,
  timerConflict: (mode: 'stopwatch' | 'pomodoro') =>
    `다른 할 일에서 이미 ${mode === 'stopwatch' ? '일반 타이머' : '뽀모도로 타이머'}가 실행 중이에요`,
  timerTodoCompleted: '할 일을 완료했어요',
  timerSaved: '타이머를 저장했어요',
  // 타이머에서 완료: 집중 기록을 보내지 못하면 완료하지 않는다(완료됐다고 알리지 않는다). 기록은 다시 누르면 다시 보낸다
  timerSessionSaveFailed: '집중 기록을 저장하지 못해서 완료하지 않았어요. 다시 시도해 주세요.',
  timerCompleteFailed: '할 일을 완료하지 못했어요. 다시 시도해 주세요.',
  batchCompleteFailed: '완료하지 못한 할 일이 있어요. 다시 시도해 주세요.',
  timerReset: '타이머를 초기화했어요',
  noteSaved: '메모를 저장했어요',
  noteSaveFailed: '메모를 저장하지 못했어요. 다시 시도해 주세요.',
  noteDeleted: (title: string) => `'${shortName(title)}' 메모를 삭제했어요`,
  noteUndoFailed: '메모를 되돌리지 못했어요. 다시 시도해 주세요.',
  noteDeleteFailed: '메모를 삭제하지 못했어요. 다시 시도해 주세요.',
  settingsSaved: '저장했어요',
  settingsSaveFailed: '설정을 저장하지 못했어요. 다시 시도해 주세요.',
  miniDaysSaved: '저장했어요',
  miniDaysSaveFailed: '미니 데이를 저장하지 못했어요. 다시 시도해 주세요.',
  miniDaysReset: '미니 데이를 기본값으로 복원했어요',
  reviewSaved: '회고를 저장했어요',
  reviewSaveFailed: '회고를 저장하지 못했어요. 다시 시도해 주세요.',
  reviewDeleteFailed: '회고를 삭제하지 못했어요. 다시 시도해 주세요.',
  reviewUndoFailed: '회고를 되돌리지 못했어요. 다시 시도해 주세요.',
  guestUpgradeNudge: '로그인하면 AI 분석과 기기 간 동기화를 쓸 수 있어요',
  aiReportFailed: 'AI 리포트를 만들지 못했어요. 다시 시도해 주세요.',
  // 429/503/504: 지금 다시 눌러도 되는 실패라 "잠시 후"라고 쓰지 않는다(바로 아래 다시 시도 버튼과 어긋나지 않게)
  aiReportBusy: '요청이 많아 AI 리포트를 만들지 못했어요. 다시 시도해 주세요.',
  aiReportNoData: '이 기간에 완료한 할 일이 없어서 요약할 수 없어요',
  loginCanceled: '로그인을 취소했어요',
  loginFailed: '로그인하지 못했어요. 다시 시도해 주세요.',
  miniDaysDiscarded: '저장하지 않았어요',
} as const

// 로그인 화면과 설정 계정 섹션. 게스트 기록이 어디에 남는지는 두 곳에서 같은 말로 쓴다
export const authMessages = {
  intro: '할 일 하나를 골라 집중하고, 그 기록으로 하루를 돌아봐요',
  // 375 폭에서 문장 가운데가 아니라 문장 사이에서 줄을 바꾸도록 두 문장을 줄로 나눈다(화면은 whitespace-pre-line)
  sessionExpired: '로그인이 만료됐어요.\n다시 로그인하면 기록이 그대로 있어요',
  kakaoStart: '카카오로 시작하기',
  kakaoRelogin: '카카오로 다시 로그인',
  guestStart: '게스트로 둘러보기',
  guestNotice: '게스트 기록은 이 브라우저에만 남아요',
  guestStatus: '게스트로 쓰는 중',
  guestStatusNotice: '기록은 이 브라우저에만 남아요',
  kakaoLogin: '카카오로 로그인',
  logout: '로그아웃',
  signingIn: '로그인하는 중...',
} as const

// 로그인 화면의 실제 화면 넘겨 보기. title은 휴대폰 위의 두 줄 제목(\n에서 줄을 바꾼다), name은 넘길 때 알림에 붙는 장면 이름,
// alt는 캡처에서 보이는 위쪽을 말한다(캡처를 다시 찍으면 함께 고친다)
export const loginPreviewMessages = {
  region: 'FlowMate 화면 미리보기',
  roledescription: '화면 넘겨 보기',
  prev: '이전 화면',
  next: '다음 화면',
  position: (current: number, total: number, name: string) => `${total}장 중 ${current}장, ${name}`,
  dot: (n: number) => `${n}번째 화면`,
  plan: {
    name: '계획',
    title: '시간대별로 할 일을 나눠 적고\n하루를 한눈에 봐요',
    alt: '계획 화면. 이번 주 달력 아래 오늘 총 집중 2시간 37분, 미분류에 장보기와 끝낸 병원 예약 전화가 있어요',
  },
  timer: {
    name: '타이머',
    title: '할 일 하나를 골라\n타이머로 집중해요',
    alt: '타이머 화면. 발표 자료 다듬기에 집중하는 중이고 15분 39초 남았어요',
  },
  review: {
    name: '회고',
    title: '그날 기록을 보며\n하루를 돌아봐요',
    alt: '회고 화면. 일간 회고에 아침 러닝과 보고서 초안을 끝낸 일, 발표 자료를 반만 손본 아쉬움을 적었어요',
  },
} as const

// 할 일 끌어 옮기기의 스크린리더 안내와 알림(dnd-kit accessibility). 기본값은 영어라 바꾼다
export const dragMessages = {
  instructions: '순서를 바꾸려면 Space로 집고 위아래 방향키로 옮긴 뒤 Space로 놓아요. Escape를 누르면 취소해요.',
  pickedUp: (title: string) => `${quoteName(title)} 집었어요`,
  movedOver: (target: string) => `'${shortName(target)}' 자리로 옮겼어요`,
  outside: '놓을 자리를 벗어났어요',
  dropped: (title: string) => `${quoteName(title)} 놓았어요`,
  canceled: (title: string) => `옮기기를 취소해서 ${quoteName(title)} 제자리에 두었어요`,
} as const

export const bannerMessages = {
  // 저장된다고 약속하지 않는다. 오프라인에서 저장은 멈춰 두지 않고 바로 실패한다(queryClient mutationDefaults).
  // 할 일 추가와 제목 수정은 보내지 않고 입력을 그대로 둔다
  offline: '오프라인이에요. 지금은 저장되지 않아요',
  serverDown: '서버에 연결할 수 없어요. 지금은 저장되지 않아요',
  recheck: '다시 확인',
  rechecking: '확인 중...',
} as const

export const systemMessages = {
  goToPlan: '계획으로 가기',
  // 오프라인으로 열어 아직 한 번도 못 불러온 화면. 연결되면 저절로 다시 불러온다(lib/queryStatus.ts)
  offlineLoadFailed: (what: string) => `오프라인이라 ${what}${objectParticle(what)} 불러오지 못했어요. 연결되면 다시 불러와요.`,
  serviceUnavailable: {
    title: '지금은 서버에 연결할 수 없어요',
    // useBackendWatcher가 3초마다 다시 확인하고, 연결되면 BackendStatusGate가 앱을 연다
    body: '연결되면 화면이 자동으로 열려요.',
    action: '다시 확인',
    pending: '확인 중...',
  },
  authRestoreFailed: {
    title: '로그인 정보를 불러오지 못했어요',
    body: '로그아웃된 건 아니에요. 잠시 후 다시 시도해 주세요.',
    action: '다시 시도',
    pending: '불러오는 중...',
    secondary: '로그인 화면으로',
  },
  notFound: {
    title: '페이지를 찾을 수 없어요',
    body: '주소가 잘못됐거나 옮겨진 페이지예요.',
  },
  routeError: {
    title: '화면을 열지 못했어요',
    body: '잠시 후 다시 시도해 주세요.',
    action: '다시 시도',
  },
  appUpdated: {
    title: '앱이 업데이트됐어요',
    body: '새로고침하면 새 버전으로 열려요.',
    action: '새로고침',
  },
  chunkOffline: {
    title: '연결이 끊겨 화면을 불러오지 못했어요',
    body: '연결되면 다시 시도해 주세요.',
    action: '다시 시도',
  },
} as const

export const confirmMessages = {
  // 타이머에서 할 일 완료. duration은 "1시간 40분"처럼 멈춘 기록 형식이다
  completeTodoFromTimer: (count: number, duration: string) => ({
    title: '이 할 일을 완료할까요?',
    body: `이 할 일에 집중 ${count}회, ${duration}${subjectParticle(duration)} 기록돼요.`,
    confirmLabel: '완료',
    cancelLabel: '계속 집중',
  }),
  resetTimer: {
    title: '타이머를 초기화할까요?',
    // 두 줄로 쓴다(ConfirmSheet가 \n을 줄바꿈으로 보여 준다)
    body: '지금 진행 중인 구간만 처음으로 돌려요.\n이미 기록된 집중은 남아요.',
    confirmLabel: '초기화',
    cancelLabel: '돌아가기',
  },
  // 회원 복원에 실패한 사람이 게스트로 시작하려 할 때
  guestStartForMember: {
    title: '게스트로 시작할까요?',
    body: '로그인하지 않고 게스트로 시작하면 회원 기록은 보이지 않아요.',
    confirmLabel: '게스트로 시작',
    cancelLabel: '돌아가기',
  },
  // 게스트 기록이 있는 사람이 카카오로 로그인하려 할 때
  kakaoWithGuestRecords: {
    title: '카카오로 계속할까요?',
    body: '게스트로 쓴 기록은 회원 계정으로 옮겨지지 않아요.',
    confirmLabel: '게스트 기록 두고 계속',
    cancelLabel: '돌아가기',
  },
  logout: {
    title: '로그아웃할까요?',
    body: '다시 로그인하면 기록이 그대로 있어요.',
    confirmLabel: '로그아웃',
    cancelLabel: '돌아가기',
  },
  resetSession: {
    title: '뽀모도로 설정을 기본값으로 복원할까요?',
    body: '집중, 휴식, 긴 휴식 시간과 긴 휴식 간격이 기본값으로 돌아가요.',
    confirmLabel: '기본값으로 복원',
    cancelLabel: '돌아가기',
  },
  resetAutomation: {
    title: '자동화 설정을 기본값으로 복원할까요?',
    confirmLabel: '기본값으로 복원',
    cancelLabel: '돌아가기',
  },
  resetMiniDays: (defaultStarts: string) => ({
    title: '미니 데이를 기본값으로 복원할까요?',
    body: `기본값은 ${defaultStarts} 시작이에요.`,
    confirmLabel: '기본값으로 복원',
    cancelLabel: '돌아가기',
  }),
} as const
