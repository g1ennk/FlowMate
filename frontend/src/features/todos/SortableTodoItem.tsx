import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TodoItem, type TodoItemProps } from './TodoItem'

type SortableTodoItemProps = TodoItemProps & {
  id: string
}

export function SortableTodoItem({ id, ...props }: SortableTodoItemProps) {
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
    opacity: isDragging ? 0.5 : 1,
  }

  // 편집 중인 항목은 드래그 불가
  const canDrag = !props.isEditing

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${isDragging ? 'z-50 shadow-lg rounded-xl' : ''}`}
      {...(canDrag ? { ...attributes, ...listeners } : {})}
    >
      <TodoItem {...props} />
    </div>
  )
}
