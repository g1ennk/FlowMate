// 로그인 화면 미리보기 크기 계산. 워드마크·문장 바로 아래(PREVIEW_GAP)에 장면 한 장을 붙여 한 묶음으로 두고,
// 묶음은 버튼 위에 남는 공간의 세로 가운데에 놓인다. 장면은 연한 회색 면(패널) 위에 위치 점, 두 줄 제목, 작은 휴대폰 화면을 쌓고
// 휴대폰은 패널 아래 경계에서 평평하게 잘린다. 패널 폭은 버튼 폭과 같고, 높이는 내용에 딱 맞춘다.
// 남는 공간이 커도 휴대폰은 일정 높이를 넘지 않고, 너무 낮아지면 미리보기를 빼서 버튼과 게스트 고지가 밀리지 않게 한다.

// 캡처 비율(가로/세로). 375×812 휴대폰 화면 전체를 그대로 찍는다(scripts/capture-login-shots.mjs의 WIDTH/HEIGHT와 같아야 한다)
export const LOGIN_SHOT_ASPECT = 375 / 812

// 워드마크·문장과 패널 사이 간격(LoginPage의 mt-7과 같아야 한다)
export const PREVIEW_GAP = 28

// 휴대폰 위에 들어가는 높이: 위 여백 20 + 점 버튼 24 + 간격 8 + 제목 두 줄(28 × 2) + 간격 16
export const PANEL_HEAD_HEIGHT = 124

// 휴대폰 보이는 높이의 최대. 높은 화면과 데스크톱에서도 이보다 커지지 않는다
export const PHONE_MAX_VISIBLE = 240
// 묶음 위아래에 최소로 남겨 두는 숨 쉴 공간(합)
const BREATHING_ROOM = 64

// 휴대폰 화면은 위쪽 약 62%가 보이게 폭을 정한다(보이는 높이 = 폭 / 비율 × 0.62)
const VISIBLE_RATIO = 0.62
// 휴대폰 양옆에 최소로 남길 패널 여백
const PHONE_SIDE_GAP = 24

// 보이는 휴대폰 화면이 이보다 낮으면 알아볼 수 없어 미리보기를 뺀다
const MIN_PHONE_VISIBLE = 100
export const MIN_PREVIEW_SPACE_HEIGHT = PREVIEW_GAP + PANEL_HEAD_HEIGHT + BREATHING_ROOM + MIN_PHONE_VISIBLE

// panel: 회색 면 크기, phone: 휴대폰 폭, 보이는 높이, 캡처 전체를 그 폭으로 그린 높이
export type LoginPreviewFit = {
  panelWidth: number
  panelHeight: number
  phoneWidth: number
  phoneVisibleHeight: number
  phoneFullHeight: number
}

// space: 워드마크·문장 아래에 남는 공간(폭 = 버튼 폭)
export function fitLoginPreview(space: { width: number; height: number }): LoginPreviewFit | null {
  const panelWidth = Math.floor(space.width)
  const visible = Math.min(PHONE_MAX_VISIBLE, Math.floor(space.height) - PREVIEW_GAP - PANEL_HEAD_HEIGHT - BREATHING_ROOM)
  if (visible < MIN_PHONE_VISIBLE) return null
  const phoneWidth = Math.min(panelWidth - 2 * PHONE_SIDE_GAP, Math.round((visible * LOGIN_SHOT_ASPECT) / VISIBLE_RATIO))
  if (phoneWidth <= 0) return null
  const phoneFullHeight = Math.round(phoneWidth / LOGIN_SHOT_ASPECT)
  const phoneVisibleHeight = Math.min(visible, phoneFullHeight)
  return { panelWidth, panelHeight: PANEL_HEAD_HEIGHT + phoneVisibleHeight, phoneWidth, phoneVisibleHeight, phoneFullHeight }
}
