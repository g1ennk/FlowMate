import type { KeyboardEventHandler } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TodoItem, type TodoItemProps } from './TodoItem'
import { REVEAL_WIDTH, useSwipeToDelete } from '../useSwipeToDelete'

type SortableTodoItemProps = TodoItemProps & {
  id: string
  // 왼쪽으로 밀어 지운다(터치). 없으면 밀리지 않는다
  onSwipeDelete?: () => void
}

// 할 일 한 줄(li). 길게 눌러 끄는 포인터 리스너는 행 전체에 두고, 키보드 정렬용 속성(role=button, tabIndex)은
// 행 위에 깐 보이지 않는 층에만 준다. 행 전체가 버튼이 되면 안의 버튼들과 겹쳐(nested-interactive) 이름이 반복해 읽힌다
export function SortableTodoItem({
  id,
  onSwipeDelete,
  ...props
}: SortableTodoItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.96 : 1,
    willChange: isDragging ? 'transform' : undefined,
  }

  // 편집 중이거나 선택 모드이면 드래그 불가
  const canDrag = !props.isEditing && !props.selectMode
  const { onKeyDown, ...pointerListeners } = listeners ?? {}
  const { rowRef, offset, isSwiping, handlers: swipeHandlers, onClickCapture, handleDelete } = useSwipeToDelete({
    enabled: !!onSwipeDelete && canDrag && !isDragging,
    onDelete: () => onSwipeDelete?.(),
  })
  const isShifted = offset !== 0

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`relative touch-manipulation select-none ${isDragging ? 'z-50' : ''}`}
      {...(canDrag ? pointerListeners : {})}
    >
      {canDrag && (
        // 키보드로 Tab해 들어와 Space로 집고 방향키로 옮긴다. 포인터는 통과시켜 행 안 버튼이 그대로 눌린다.
        // pointer-events: none은 손가락·마우스의 hit test만 막는다. VoiceOver 두 번 탭(WebKit AX press)은 hit test 결과가
        // 이 요소의 자식일 때만 그쪽을 누르고, 자식이 없는 이 층은 자기 자신에 click을 보내므로 아래 제목·체크 버튼이 눌리지 않는다.
        // 그 click은 아무것도 하지 않게 여기서 멈춘다(스크린리더로 옮기기는 dnd-kit 키보드 방식만 된다)
        <span
          ref={setActivatorNodeRef}
          {...attributes}
          aria-label={`${props.title} 순서 바꾸기`}
          onKeyDown={onKeyDown as KeyboardEventHandler | undefined}
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-none absolute inset-0 rounded-control"
        />
      )}
      {/* 밀기 층. 내용을 왼쪽으로 옮기면 뒤의 빨간 "삭제"가 드러난다. 행 강조 면(-mx-2)까지 담도록 같은 폭으로 넓히고,
          밀린 동안만 가로를 잘라 카드 밖으로 내용이 나가지 않게 한다. 세로 스크롤은 브라우저가 맡는다(pan-y) */}
      <div
        ref={rowRef}
        className={`relative -mx-2 touch-pan-y px-2 ${isShifted ? 'overflow-x-clip' : ''}`}
        {...swipeHandlers}
      >
        {isShifted && (
          // 손짓 전용 보조 버튼이라 접근성 트리에서 뺀다(메뉴 시트에 같은 삭제가 있다)
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={handleDelete}
            className="absolute inset-y-0 right-0 flex items-center justify-end rounded-control bg-state-error-strong pr-5 text-sm font-medium whitespace-nowrap text-white"
            style={{ width: Math.max(REVEAL_WIDTH, -offset + 8) }}
          >
            삭제
          </button>
        )}
        <div
          className={`relative rounded-control ${
            isSwiping ? '' : 'transition-transform duration-200 ease-out motion-reduce:transition-none'
          } ${isShifted ? '[&>div>div]:rounded-none [&>div>div]:bg-surface-card' : ''}`}
          style={isShifted ? { transform: `translateX(${offset}px)` } : undefined}
          onClickCapture={onClickCapture}
        >
          <div
            className={`rounded-control transition-[box-shadow,opacity] duration-150 ease-out motion-reduce:transition-none ${
              isDragging ? 'bg-surface-card shadow-float' : ''
            }`}
          >
            <TodoItem {...props} />
          </div>
        </div>
      </div>
    </li>
  )
}
