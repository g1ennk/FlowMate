import { useId, type InputHTMLAttributes, type Ref } from 'react'

// 한 줄 입력창. sunken 면 + text-tertiary 테두리, 포커스 때 검정(text-primary) 테두리와 1px 링. 메모, 회고 입력과 같은 포커스 색이다(사용자 결정 2026-10-21).
// 포커스 전 테두리도 3:1을 넘겨야 입력창으로 읽힌다(§3-5, §10). 그래서 §7 표의 border-strong(1.4:1) 대신 TextArea와 같은 값을 쓴다.
// placeholder는 secondary다(§4-1, tertiary는 sunken 면에서 쓰지 않는다).
// 오류 상태는 빨간 테두리를 지키므로 링을 2px로 키워 밖에서 포커스가 보이게 한다.
// label을 주면 위에 보이는 이름을 달고, 없으면 aria-label을 직접 넘긴다. error는 아래 caption으로 읽힌다.

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label?: string
  error?: string
  ref?: Ref<HTMLInputElement>
}

export function TextField({ label, error, id, className = '', ref, ...props }: TextFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`

  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="mb-list block text-sm font-medium text-text-primary">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
        className={`h-11 w-full rounded-control border bg-surface-sunken px-3 text-sm text-text-primary transition-colors placeholder:text-text-secondary focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
          error
            ? 'border-state-error-text focus:border-state-error-text focus:ring-2 focus:ring-text-primary'
            : 'border-text-tertiary focus:border-text-primary focus:ring-1 focus:ring-text-primary'
        }`}
      />
      {error && (
        <p id={errorId} className="mt-tight text-xs text-state-error-text">
          {error}
        </p>
      )}
    </div>
  )
}
