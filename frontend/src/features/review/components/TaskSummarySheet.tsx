import type { TaskItem } from '../reviewTypes'
import { BottomSheet } from '../../../ui/BottomSheet'
import { CompletedTaskList } from './CompletedTaskList'
import { IncompleteTasks } from './IncompleteTasks'

type TaskSummarySheetProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  completedItems: TaskItem[]
  incompleteItems: TaskItem[]
  onSelectTask?: (item: TaskItem) => void
}

export function TaskSummarySheet({
  isOpen,
  onClose,
  title,
  completedItems,
  incompleteItems,
  onSelectTask,
}: TaskSummarySheetProps) {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      showCloseButton
      panelClassName="max-h-[90vh]"
      contentClassName="grid grid-cols-2 gap-3"
    >
      <CompletedTaskList items={completedItems} onSelect={onSelectTask} />
      <IncompleteTasks items={incompleteItems} onSelect={onSelectTask} />
    </BottomSheet>
  )
}
