import { useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { z } from 'zod'
import { isImeComposing } from '../../../lib/keyboard'
import { userTextInputClass } from '../../../lib/userTextStyles'

const createSchema = z.object({
  title: z.string().min(1, '할 일을 입력하세요').max(200),
})
type CreateForm = z.infer<typeof createSchema>

type TodoInputFormProps = {
  sectionId: number
  nextActiveOrder: number
  onCreate: (title: string, miniDay: number, dayOrder: number) => Promise<void>
  // submitted: 이번에 열린 동안 할 일을 추가했다면 섹션을 접지 않도록 알려 준다
  onClose: (submitted: boolean) => void
}

export function TodoInputForm({
  sectionId,
  nextActiveOrder,
  onCreate,
  onClose,
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
  const MAX_LENGTH = 200
  const [charCount, setCharCount] = useState(0)

  const resizeTodoInput = (node: HTMLTextAreaElement | null) => {
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
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

  // 제목을 바로 가져가고 입력창을 비워 다음 할 일을 이어서 칠 수 있게 한다.
  const submitTitle = () => {
    const title = (getValues('title') ?? '').trim()
    reset()
    setCharCount(0)
    resizeTodoInput(inputRef.current)
    if (!title) return false

    const order = Math.max(nextActiveOrder, lastOrderRef.current + 1)
    lastOrderRef.current = order
    hasSubmittedRef.current = true
    onCreate(title, sectionId, order).catch((err) => {
      toast.error('할 일을 추가하지 못했어요. 다시 시도해 주세요', { id: 'todo-create-failed' })
      console.error(err)
      // 그사이 다음 할 일을 치고 있었다면 그 글자를 덮지 않는다.
      if (!inputRef.current || getValues('title')) return
      setValue('title', title)
      setCharCount(title.length)
      resizeTodoInput(inputRef.current)
    })
    return true
  }

  return (
    <div className="rounded-xl p-2">
      <div className="flex items-start gap-card-item rounded-lg px-2 py-1 -mx-2 -my-1">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-border-strong bg-transparent" />
        <textarea
          {...register('title')}
          ref={(e) => {
            register('title').ref(e)
            inputRef.current = e
            if (e) {
              resizeTodoInput(e)
            }
          }}
          placeholder="할 일을 입력하세요"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              reset()
              onClose(false)
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
            register('title').onChange(e)
            resizeTodoInput(e.target)
            setCharCount(e.target.value.length)
          }}
          onBlur={() => {
            const submitted = submitTitle()
            onClose(submitted || hasSubmittedRef.current)
          }}
          className={`w-full bg-transparent ${userTextInputClass} text-text-primary outline-none placeholder:text-text-tertiary resize-none overflow-hidden min-h-[20px]`}
          rows={1}
        />
      </div>
      {charCount >= MAX_LENGTH * 0.8 && (
        <div className="mt-1 px-10 text-right">
          <span className={`text-[11px] tabular-nums ${charCount >= MAX_LENGTH ? 'text-state-error' : 'text-text-tertiary'}`}>
            {charCount}/{MAX_LENGTH}
          </span>
        </div>
      )}
    </div>
  )
}
