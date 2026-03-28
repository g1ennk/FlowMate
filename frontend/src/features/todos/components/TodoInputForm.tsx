import { useRef } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { z } from 'zod'
import { userTextInputClass } from '../../../lib/userTextStyles'

const createSchema = z.object({
  title: z.string().min(1, '할 일을 입력하세요').max(200),
})
type CreateForm = z.infer<typeof createSchema>

type TodoInputFormProps = {
  sectionId: number
  nextActiveOrder: number
  onCreate: (title: string, miniDay: number, dayOrder: number) => Promise<void>
  onClose: () => void
}

export function TodoInputForm({
  sectionId,
  nextActiveOrder,
  onCreate,
  onClose,
}: TodoInputFormProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isSubmittingRef = useRef(false)

  const { register, reset, getValues } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { title: '' },
  })

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

  return (
    <div className="rounded-xl p-2">
      <div className="flex items-start gap-3 rounded-lg px-2 py-1 -mx-2 -my-1">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 bg-transparent" />
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
          onKeyDown={async (e) => {
            if (e.key === 'Escape') {
              reset()
              onClose()
              if (inputRef.current) {
                inputRef.current.style.height = 'auto'
              }
              return
            }

            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (isSubmittingRef.current) return

              const title = getValues('title')
              if (title?.trim()) {
                isSubmittingRef.current = true
                try {
                  await onCreate(title, sectionId, nextActiveOrder)
                  reset()
                  focusTodoInputSoon()
                } catch (err) {
                  toast.error('추가 실패', { id: 'todo-create-failed' })
                  console.error(err)
                } finally {
                  isSubmittingRef.current = false
                }
              }
            }
          }}
          onChange={(e) => {
            register('title').onChange(e)
            resizeTodoInput(e.target)
          }}
          onBlur={async () => {
            if (isSubmittingRef.current) return
            const title = getValues('title')
            if (title?.trim()) {
              isSubmittingRef.current = true
              try {
                await onCreate(title, sectionId, nextActiveOrder)
                reset()
              } catch (err) {
                toast.error('추가 실패', { id: 'todo-create-failed' })
                console.error(err)
              } finally {
                isSubmittingRef.current = false
              }
            } else {
              reset()
            }
            onClose()
          }}
          className={`w-full bg-transparent ${userTextInputClass} text-gray-900 outline-none placeholder:text-gray-400 resize-none overflow-hidden min-h-[20px]`}
          rows={1}
        />
      </div>
    </div>
  )
}
