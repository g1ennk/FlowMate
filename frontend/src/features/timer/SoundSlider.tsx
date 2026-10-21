import type { InputHTMLAttributes } from 'react'

// 타이머 화면과 사운드 시트가 같이 쓰는 슬라이더. 늘 어두운 timer 면이라 timer-* 토큰만 쓴다.
// 엄지를 직접 그려 브라우저마다 크기가 같게 한다. 엄지 size-4(16px)의 중심은 양끝에서 8px 안쪽이라
// 트랙 선과 눈금선 줄도 THUMB_INSET_CLASS(mx-2, 8px)만큼 들인다
const SLIDER_THUMB_CLASS =
  '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-timer-accent ' +
  '[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-timer-accent [&::-moz-range-track]:bg-transparent'
export const THUMB_INSET_CLASS = 'mx-2'

type SoundSliderProps = InputHTMLAttributes<HTMLInputElement> & {
  // 바깥 상자에 더할 클래스(줄 안에서 늘어날 때 flex-1 등)
  wrapperClassName?: string
}

// 트랙은 2px 선(장식 그라디언트 없이 테두리 하나), 입력 상자는 44px로 둬서 터치 영역을 확보한다(§6-2)
export function SoundSlider({ wrapperClassName = '', ...props }: SoundSliderProps) {
  return (
    <div className={`relative ${props.disabled ? 'opacity-40' : ''} ${wrapperClassName}`}>
      <span aria-hidden="true" className="absolute inset-x-2 top-1/2 -translate-y-1/2 border-t-2 border-timer-btn-hover" />
      <input
        type="range"
        {...props}
        className={`relative block h-11 w-full cursor-pointer appearance-none bg-transparent outline-timer-focus-ring disabled:cursor-not-allowed ${SLIDER_THUMB_CLASS}`}
      />
    </div>
  )
}
