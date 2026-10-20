import { useEffect, useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { z } from 'zod'
import { isImeComposing } from '../../../lib/keyboard'
import { toastMessages } from '../../../lib/messages'
import { isOffline } from '../../../lib/useOnlineStatus'
import { userTextTitleClass } from '../../../lib/userTextStyles'
import { Button } from '../../../ui/Button'

const createSchema = z.object({
  title: z.string().min(1, '할 일을 입력하세요').max(200),
})
type CreateForm = z.infer<typeof createSchema>

const MAX_LENGTH = 200

type TodoInputFormProps = {
  sectionId: number
  // 구간 이름. placeholder를 "저녁에 할 일 추가"처럼 쓴다
  sectionTitle: string
  nextActiveOrder: number
  onCreate: (title: string, miniDay: number, dayOrder: number) => Promise<void>
  // submitted: 이번에 열린 동안 할 일을 추가했다면 섹션을 접지 않도록 알려 준다
  // viaEscape: Esc로 닫았다(포커스를 돌려줄 곳을 부모가 정한다). 다른 곳을 눌러 닫았으면 false
  onClose: (submitted: boolean, viaEscape?: boolean) => void
  // false면 열려 있기만 하고 포커스를 가져가지 않는다(빈 지금 구간에 늘 보이는 입력 줄)
  autoFocus?: boolean
  // 값이 바뀌면 입력창에 포커스한다(섹션 + 버튼)
  focusSignal?: number
  onFocus?: () => void
}

export function TodoInputForm({
  sectionId,
  sectionTitle,
  nextActiveOrder,
  onCreate,
  onClose,
  autoFocus = true,
  focusSignal = 0,
  onFocus,
}: TodoInputFormProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // 저장 응답 전에 연달아 추가해도 입력한 순서대로 쌓이도록 이 입력창에서 쓴 마지막 순서를 기억한다.
  const lastOrderRef = useRef(-1)
  // Enter로 추가한 직후 바깥을 눌러도 섹션이 접히지 않도록, 이번에 열린 동안 추가한 적이 있는지 기억한다.
  const hasSubmittedRef = useRef(false)

  const { register, reset, getValues, setValue } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { title: '' },
  })
  const [charCount, setCharCount] = useState(0)
  const [hasText, setHasText] = useState(false)

  // border-box라 scrollHeight(테두리 제외)에 위아래 테두리를 더해야 글자가 잘리지 않는다
  const resizeTodoInput = (node: HTMLTextAreaElement | null) => {
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight + node.offsetHeight - node.clientHeight}px`
  }

  const focusTodoInputSoon = () => {
    window.setTimeout(() => {
      if (!inputRef.current) return
      inputRef.current.focus()
      const length = inputRef.current.value.length
      inputRef.current.setSelectionRange(length, length)
      resizeTodoInput(inputRef.current)
    }, 0)
  }

  useEffect(() => {
    if (focusSignal > 0) inputRef.current?.focus()
  }, [focusSignal])

  const updateTextState = (value: string) => {
    setCharCount(value.length)
    setHasText(value.trim().length > 0)
  }

  // 제목을 바로 가져가고 입력창을 비워 다음 할 일을 이어서 칠 수 있게 한다.
  // 오프라인이면 보내지 않고 입력을 그대로 둔다('kept'). 연결된 뒤 말없이 저장되거나 다시 입력해 두 번 생기지 않게 한다
  const submitTitle = (): 'submitted' | 'empty' | 'kept' => {
    const title = (getValues('title') ?? '').trim()
    if (title && isOffline()) {
      toast.error(toastMessages.todoCreateOffline, { id: 'todo-create-failed' })
      return 'kept'
    }
    reset()
    updateTextState('')
    resizeTodoInput(inputRef.current)
    if (!title) return 'empty'

    const order = Math.max(nextActiveOrder, lastOrderRef.current + 1)
    lastOrderRef.current = order
    hasSubmittedRef.current = true
    onCreate(title, sectionId, order).catch((err) => {
      toast.error(toastMessages.todoCreateFailed, { id: 'todo-create-failed' })
      console.error(err)
      // 그사이 다음 할 일을 치고 있었다면 그 글자를 덮지 않는다.
      if (!inputRef.current || getValues('title')) return
      setValue('title', title)
      updateTextState(title)
      resizeTodoInput(inputRef.current)
    })
    return 'submitted'
  }

  const { ref: registerRef, onChange: registerOnChange, ...titleField } = register('title')

  return (
    // 입력 중인 줄: 상자 없이 저장된 행과 같은 열에 글자를 쓴다(빈 체크, 캐럿, "추가" 버튼이 단서)
    <div>
      {/* 할 일 행과 같은 열: 빈 체크는 앞 열(32) 가운데, 입력창은 글자 열부터(Task 21) */}
      <div className="flex items-start gap-list">
        <span aria-hidden className="flex h-11 w-8 shrink-0 items-center justify-center">
          <span className="h-5 w-5 rounded-full border-2 border-text-tertiary" />
        </span>
        <textarea
          {...titleField}
          ref={(e) => {
            registerRef(e)
            inputRef.current = e
            if (e) {
              resizeTodoInput(e)
            }
          }}
          aria-label={`${sectionTitle}에 할 일 추가`}
          placeholder={`${sectionTitle}에 할 일 추가`}
          autoFocus={autoFocus}
          onFocus={onFocus}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              reset()
              updateTextState('')
              onClose(false, true)
              if (inputRef.current) {
                inputRef.current.style.height = 'auto'
              }
              return
            }

            if (e.key === 'Enter' && !e.shiftKey) {
              if (isImeComposing(e)) return
              e.preventDefault()
              submitTitle()
              focusTodoInputSoon()
            }
          }}
          maxLength={MAX_LENGTH}
          onChange={(e) => {
            void registerOnChange(e)
            resizeTodoInput(e.target)
            updateTextState(e.target.value)
          }}
          onBlur={(e) => {
            void titleField.onBlur(e)
            const result = submitTitle()
            // 보내지 못한 글이 남아 있으면 입력 줄을 닫지 않는다(닫으면 글이 사라진다)
            if (result === 'kept') return
            onClose(result === 'submitted' || hasSubmittedRef.current)
          }}
          className={`min-w-0 flex-1 min-h-11 resize-none overflow-hidden px-0 py-3 ${userTextTitleClass} text-text-primary outline-none placeholder:text-text-secondary`}
          rows={1}
        />
        {hasText && (
          <Button
            size="sm"
            className="mt-tight shrink-0"
            // 누르는 순간 입력창 포커스가 빠지지 않게 해서, 이어서 다음 할 일을 칠 수 있게 한다
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              submitTitle()
              focusTodoInputSoon()
            }}
          >
            추가
          </Button>
        )}
      </div>
      {charCount >= MAX_LENGTH * 0.8 && (
        <p
          className={`pb-list pr-tight text-right text-xs tabular-nums ${
            charCount >= MAX_LENGTH ? 'text-state-error-text' : 'text-text-secondary'
          }`}
        >
          {charCount}/{MAX_LENGTH}
        </p>
      )}
    </div>
  )
}
