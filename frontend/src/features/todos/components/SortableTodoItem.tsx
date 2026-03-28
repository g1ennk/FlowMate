import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TodoItem, type TodoItemProps } from './TodoItem'

type SortableTodoItemProps = TodoItemProps & {
  id: string
}

export function SortableTodoItem({
  id,
  ...props
}: SortableTodoItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`touch-manipulation select-none ${isDragging ? 'z-50' : ''}`}
      {...(canDrag ? { ...attributes, ...listeners } : {})}
    >
      <div
        className={`rounded-xl transition-[box-shadow,opacity] duration-150 ease-out motion-reduce:transition-none ${
          isDragging
            ? 'shadow-2xl'
            : ''
        }`}
      >
        <TodoItem {...props} />
      </div>
    </div>
  )
}
