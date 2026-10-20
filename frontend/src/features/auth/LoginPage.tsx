import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { buildApiUrl } from '../../api/baseUrl'
import { todoApi } from '../../api/todos'
import AppSplash from '../../app/AppSplash'
import { useAuthStore } from '../../store/authStore'
import { getAuthMode, hasGuestStarted, hasSessionExpired, markGuestStarted } from '../../lib/auth'
import { setOnboardingSeen } from '../../lib/onboarding'
import { KakaoIcon } from '../../ui/Icons'
import { Button } from '../../ui/Button'
import { WordmarkHeader } from '../../ui/Wordmark'
import { queryKeys } from '../../lib/queryKeys'
import { authMessages, confirmMessages, toastMessages } from '../../lib/messages'
import { useConfirmSheet } from '../../ui/useConfirmSheet'
import { LoginScreensCarousel } from './LoginScreensCarousel'
import { fitLoginPreview } from './loginPreviewLayout'
import { useLoginPreviewSpace } from './useLoginPreviewSpace'

// 버튼 묶음 위에 남는 공간(area)에 워드마크·문장과 화면 미리보기를 한 묶음으로 붙여 세로 가운데에 둔다.
// area는 남는 만큼만 차지하고 내용 크기로 늘어나지 않는다(basis 0, min-h-0). 그 크기에서 워드마크 높이를 뺀 만큼에 미리보기를 맞추고,
// 너무 좁으면 빼서 미리보기가 버튼과 고지를 밀지 않는다. 휴대폰은 일정 높이에서 멈추므로 남는 높이는 묶음 위아래 빈칸이
// 1:2로 나눠 갖는다. 묶음이 화면 위쪽으로 붙어 워드마크 위가 크게 비지 않는다(사용자 결정 2026-10-21).
// 좌우 여백(px-6)이 버튼 묶음과 같아 회색 면의 양 끝이 버튼과 맞는다. 넓은 화면의 화살표가 회색 면 바깥에 놓이도록 넘침을 자르지 않는다
function IntroWithPreview() {
  const areaRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const space = useLoginPreviewSpace(areaRef, headerRef)
  const fit = space ? fitLoginPreview(space) : null
  return (
    <div
      ref={areaRef}
      data-login-intro
      className="flex min-h-0 flex-[1_1_0] flex-col px-6 pt-[calc(var(--safe-top)+32px)] [@media(min-height:901px)]:pt-0"
    >
      <div className="flex-[1_1_0]" />
      <div ref={headerRef} className="-mx-6">
        <WordmarkHeader placement="inline">
          <p className="mt-3 break-keep text-balance text-sm text-text-secondary">{authMessages.intro}</p>
        </WordmarkHeader>
      </div>
      {fit && (
        <div className="mt-7">
          <LoginScreensCarousel fit={fit} />
        </div>
      )}
      <div className="flex-[2_1_0]" />
    </div>
  )
}

function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const authState = useAuthStore((s) => s.state)
  const initialized = useAuthStore((s) => s.initialized)
  const startGuest = useAuthStore((s) => s.startGuest)
  const [kakaoPending, setKakaoPending] = useState(false)
  // 게스트 기록 확인과 확인 시트를 묻는 동안 다시 눌러도 한 번만 진행한다.
  // 이때는 버튼을 disabled로 막지 않는다(막으면 시트가 닫힐 때 버튼으로 포커스가 돌아오지 못한다)
  const kakaoStartingRef = useRef(false)
  const [sessionExpired] = useState(hasSessionExpired)
  const { confirm, confirmSheet } = useConfirmSheet()

  // 카카오 화면에서 뒤로 가기로 돌아오면(bfcache 복원) 버튼을 다시 누를 수 있게 한다
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      kakaoStartingRef.current = false
      setKakaoPending(false)
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  if (!initialized) return <AppSplash />

  if (authState?.type === 'member') {
    // 온보딩 키가 지워진 회원도 레이아웃 게이트가 다시 /login으로 돌려보내지 않게 한다.
    setOnboardingSeen(true)
    return <Navigate to="/todos" replace />
  }

  const handleGuestStart = async () => {
    // 회원 복원에 실패해 들어온 사람이 게스트로 시작하면 회원 힌트가 덮여 조용히 게스트가 된다
    if (
      !authState &&
      getAuthMode() === 'member' &&
      !(await confirm(confirmMessages.guestStartForMember))
    ) {
      return
    }
    try {
      if (authState?.type !== 'guest') {
        await startGuest()
      }
      markGuestStarted()
      setOnboardingSeen(true)
      // 게스트 기록이 이 브라우저에만 남는다는 고지는 이 화면과 설정 계정 섹션에 늘 있다.
      // 첫 화면에 토스트로 한 번 더 띄우지 않는다(첫 진입 안내는 1개까지)
      navigate('/todos', { replace: true })
    } catch (e) {
      console.error('[LoginPage] 게스트 시작 실패', e)
      toast.error(toastMessages.guestStartFailed)
    }
  }

  // 게스트에게 옮겨지지 않을 할 일이 있는지 본다. 캐시가 없으면 불러오고, 확인하지 못하면 있다고 본다.
  const hasGuestTodos = async () => {
    try {
      const list = await queryClient.ensureQueryData({ queryKey: queryKeys.todos(), queryFn: () => todoApi.list() })
      return list.items.length > 0
    } catch {
      return true
    }
  }

  const handleKakaoLogin = async () => {
    if (kakaoStartingRef.current) return
    kakaoStartingRef.current = true
    // 옮겨지지 않을 게스트 기록이 있을 수 있는 사람에게만 확인한다.
    // "게스트로 둘러보기"를 직접 골랐거나, 표시가 생기기 전부터 써서 할 일이 남아 있는 게스트다.
    // (처음 들어온 사람, 로그아웃해서 게스트가 된 회원은 옮길 게스트 기록이 없다)
    const shouldConfirm = authState?.type === 'guest' && (hasGuestStarted() || (await hasGuestTodos()))
    if (
      shouldConfirm &&
      !(await confirm(confirmMessages.kakaoWithGuestRecords))
    ) {
      kakaoStartingRef.current = false
      return
    }
    setKakaoPending(true)
    try {
      const res = await fetch(buildApiUrl('/auth/kakao/authorize-url'))
      if (!res.ok) throw new Error('인증 URL 발급 실패')
      const data = await res.json()
      sessionStorage.setItem('oauth_state', data.state)
      sessionStorage.setItem('oauth_provider', 'kakao')
      setOnboardingSeen(true)
      // 페이지를 떠나므로 pending은 풀지 않는다
      window.location.href = data.authorizeUrl
    } catch (e) {
      console.error('[LoginPage] 카카오 로그인 시작 실패', e)
      toast.error(toastMessages.kakaoStartFailed)
      kakaoStartingRef.current = false
      setKakaoPending(false)
    }
  }

  return (
    // 높은 화면(높이 900 초과, 데스크톱)에서는 전체를 내용에 맞는 높이(692: 워드마크 묶음 + 최대 장면 + 버튼 묶음)의 상자에 담아
    // 화면 가운데에 모은다(버튼만 바닥에 붙고 나머지가 떠 보이지 않게).
    // 휴대폰 높이(900 이하)에서는 버튼 묶음을 화면 아래에 붙인다
    <div className="flex min-h-dvh flex-col bg-surface-base [@media(min-height:901px)]:justify-center">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col [@media(min-height:901px)]:h-[692px] [@media(min-height:901px)]:flex-none">
        {/* 세션이 만료돼 돌아온 회원에게는 소개와 미리보기 대신 만료 안내 한 문장을 스플래시 워드마크 자리에 둔다 */}
        {sessionExpired ? (
          <>
            <WordmarkHeader placement="splash">
              <p role="status" className="mt-3 whitespace-pre-line break-keep text-balance text-sm text-text-primary">
                {authMessages.sessionExpired}
              </p>
            </WordmarkHeader>
            <div className="flex-1" />
          </>
        ) : (
          <IntroWithPreview />
        )}

        {/* 버튼 묶음은 화면 아래에 붙인다. 375×667에서도 버튼 둘과 고지가 스크롤 없이 보인다 */}
        <footer
          className="flex flex-col px-6 pt-section"
          style={{ paddingBottom: 'calc(var(--safe-bottom) + 24px)' }}
        >
          <button
            type="button"
            onClick={handleKakaoLogin}
            disabled={kakaoPending}
            aria-busy={kakaoPending}
            className="flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-control bg-kakao text-sm font-medium text-kakao-label transition-opacity active:opacity-80 disabled:opacity-60"
          >
            <KakaoIcon className="h-5 w-5" />
            {sessionExpired ? authMessages.kakaoRelogin : authMessages.kakaoStart}
          </button>

          <Button
            variant={sessionExpired ? 'ghost' : 'secondary'}
            fullWidth
            className="mt-3"
            onClick={handleGuestStart}
          >
            {authMessages.guestStart}
          </Button>

          <p className="mt-2 break-keep text-center text-xs text-text-secondary">{authMessages.guestNotice}</p>
        </footer>
      </div>
      {confirmSheet}
    </div>
  )
}

export default LoginPage
