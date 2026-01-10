import { useMemo, useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { z } from 'zod'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useTimerStore } from '../timer/timerStore'
import { useTimerTicker } from '../timer/useTimerTicker'
import { Calendar, formatDateKey } from '../../ui/Calendar'
import {
  BottomSheet,
  BottomSheetActions,
  BottomSheetActionButton,
  BottomSheetItem,
} from '../../ui/BottomSheet'
import {
  PlusIcon,
  CheckCircleIcon,
  EditIcon,
  TrashIcon,
  ClockIcon,
  DocumentIcon,
} from '../../ui/Icons'
import { SortableTodoItem } from './SortableTodoItem'
import { TimerFullScreen } from '../timer/TimerFullScreen'
import { DailyStatsBadges } from './components/DailyStatsBadges'
import { useTodoActions } from './useTodoActions'
import { useTodos } from './hooks'

// === 스키마 ===
const createSchema = z.object({
  title: z.string().min(1, '할 일을 입력하세요').max(200),
})
type CreateForm = z.infer<typeof createSchema>

// === 메인 컴포넌트 ===
function TodosPage() {
  const { data, isLoading } = useTodos()
  const store = useTimerStore()

  useTimerTicker()

  // 캘린더 상태
  const [selectedDate, setSelectedDate] = useState(new Date())
  const selectedDateKey = formatDateKey(selectedDate)

  // Todo 액션 훅
  const actions = useTodoActions(selectedDateKey)

  // UI 상태
  const [showInput, setShowInput] = useState(false)
  const [activeOrder, setActiveOrder] = useState<string[]>([])
  const [doneOrder, setDoneOrder] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // 폼
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { title: '' },
  })

  // === Memoized 데이터 ===
  const todosForSelectedDate = useMemo(() => {
    return (data?.items ?? [])
      .filter((t) => t.date === selectedDateKey)
      .sort((a, b) => {
        if (a.id === store.todoId && store.status !== 'idle') return -1
        if (b.id === store.todoId && store.status !== 'idle') return 1
        if (a.isDone !== b.isDone) return a.isDone ? 1 : -1
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })
  }, [data?.items, selectedDateKey, store.todoId, store.status])

  const markedDates = useMemo(() => {
    const marks: Record<string, { done: number; total: number }> = {}
    for (const todo of data?.items ?? []) {
      if (!marks[todo.date]) marks[todo.date] = { done: 0, total: 0 }
      marks[todo.date].total++
      if (todo.isDone) marks[todo.date].done++
    }
    return marks
  }, [data?.items])

  const dailyStats = useMemo(() => {
    const stats: Record<string, { count: number; minutes: number }> = {}
    for (const todo of data?.items ?? []) {
      if (!stats[todo.date]) stats[todo.date] = { count: 0, minutes: 0 }
      stats[todo.date].count += todo.pomodoroDone
      stats[todo.date].minutes += Math.round(todo.focusSeconds / 60)
    }
    return stats
  }, [data?.items])

  const activeTodosRaw = todosForSelectedDate.filter((t) => !t.isDone)
  const doneTodosRaw = todosForSelectedDate.filter((t) => t.isDone)

  const activeTodos = useMemo(() => {
    if (activeOrder.length === 0) return activeTodosRaw
    const orderMap = new Map(activeOrder.map((id, idx) => [id, idx]))
    return [...activeTodosRaw].sort((a, b) => {
      const orderA = orderMap.get(a.id) ?? Infinity
      const orderB = orderMap.get(b.id) ?? Infinity
      return orderA - orderB
    })
  }, [activeTodosRaw, activeOrder])

  const doneTodos = useMemo(() => {
    if (doneOrder.length === 0) return doneTodosRaw
    const orderMap = new Map(doneOrder.map((id, idx) => [id, idx]))
    return [...doneTodosRaw].sort((a, b) => {
      const orderA = orderMap.get(a.id) ?? Infinity
      const orderB = orderMap.get(b.id) ?? Infinity
      return orderA - orderB
    })
  }, [doneTodosRaw, doneOrder])

  // 타이머 상태
  // === 핸들러 ===
  const onSubmit = handleSubmit(async (values) => {
    try {
      await actions.handleCreate(values.title)
      reset()
      inputRef.current?.focus()
    } catch (err) {
      toast.error('추가 실패')
      console.error(err)
    }
  })

  // DnD
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleActiveDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = activeTodos.findIndex((t) => t.id === active.id)
    const newIndex = activeTodos.findIndex((t) => t.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) {
      setActiveOrder(arrayMove(activeTodos.map((t) => t.id), oldIndex, newIndex))
    }
  }

  const handleDoneDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = doneTodos.findIndex((t) => t.id === active.id)
    const newIndex = doneTodos.findIndex((t) => t.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) {
      setDoneOrder(arrayMove(doneTodos.map((t) => t.id), oldIndex, newIndex))
    }
  }

  // 현재 날짜 통계
  const currentMark = markedDates[selectedDateKey]
  const currentStats = dailyStats[selectedDateKey]

  return (
    <div className="space-y-4">
      {/* 캘린더 */}
      <Calendar
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        onMonthChange={setSelectedDate}
        markedDates={markedDates}
      />

      {/* Todo 리스트 카드 */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        {/* 헤더 */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-900">
              {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일
            </h2>
            <DailyStatsBadges
              remaining={(currentMark?.total ?? 0) - (currentMark?.done ?? 0)}
              done={currentMark?.done ?? 0}
              sessionCount={currentStats?.count ?? 0}
              sessionMinutes={currentStats?.minutes ?? 0}
            />
          </div>
          <button
            onClick={() => setShowInput((v) => !v)}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
              showInput ? 'bg-gray-200 text-gray-600' : 'bg-emerald-500 text-white'
            }`}
          >
            <PlusIcon className={`h-4 w-4 transition-transform ${showInput ? 'rotate-45' : ''}`} />
          </button>
        </div>

        {/* 입력 폼 */}
        {showInput && (
          <form onSubmit={onSubmit} className="mb-4 flex items-center gap-2">
            <input
              {...register('title')}
              ref={(e) => {
                register('title').ref(e)
                inputRef.current = e
              }}
              placeholder="할 일을 입력하세요 (Enter로 추가)"
              autoFocus
              className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-emerald-500 placeholder:text-gray-400"
            />
            <button
              type="submit"
              disabled={actions.isCreating}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
            >
              추가
            </button>
          </form>
        )}

        {/* 로딩 */}
        {isLoading && <div className="py-8 text-center text-sm text-gray-400">불러오는 중...</div>}

        {/* 빈 상태 */}
        {!isLoading && todosForSelectedDate.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircleIcon className="h-8 w-8 text-emerald-300" />
            </div>
            <p className="mb-1 text-sm font-medium text-gray-600">할 일이 없어요</p>
            <p className="mb-4 text-xs text-gray-400">+ 버튼을 눌러 오늘의 첫 할 일을 추가해보세요</p>
            {!showInput && (
              <button
                onClick={() => setShowInput(true)}
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
              >
                + 할 일 추가하기
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {/* 미완료 Todo (드래그 가능) */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleActiveDragEnd}>
              <SortableContext items={activeTodos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {activeTodos.map((todo) => {
                  // 실시간 타이머 정보 계산
                  const isActiveTimer = (store.status === 'running' || store.status === 'paused') && store.todoId === todo.id
                  let activeTimerElapsedMs: number | undefined = undefined
                  let activeTimerRemainingMs: number | undefined = undefined
                  
                  if (isActiveTimer) {
                    if (store.mode === 'stopwatch') {
                      // 일반 타이머: elapsedMs 그대로 사용
                      activeTimerElapsedMs = store.elapsedMs
                    } else if (store.mode === 'pomodoro' && store.phase === 'flow') {
                      // 뽀모도로 Flow: 남은 시간 전달 (카운트다운용)
                      const remaining = store.remainingMs ?? (store.endAt ? Math.max(0, store.endAt - Date.now()) : 0)
                      activeTimerRemainingMs = remaining
                    }
                  }
                  
                  return (
                    <SortableTodoItem
                      key={todo.id}
                      id={todo.id}
                      title={todo.title}
                      note={todo.note}
                      pomodoroDone={todo.pomodoroDone}
                      focusSeconds={todo.focusSeconds}
                      isDone={todo.isDone}
                      timerMode={todo.timerMode}
                      isEditing={actions.editingId === todo.id}
                      editingTitle={actions.editingTitle}
                      onEditingTitleChange={actions.setEditingTitle}
                      onToggle={() => actions.handleToggleDone(todo.id, !todo.isDone)}
                      onEdit={() => actions.handleEdit(todo.id, todo.title)}
                      onSaveEdit={actions.handleSaveEdit}
                      onCancelEdit={actions.handleCancelEdit}
                      onDelete={() => actions.handleDelete(todo.id)}
                      onOpenMenu={() => actions.setSelectedTodo(todo)}
                      onOpenTimer={() => actions.handleOpenTimer(todo, todo.timerMode || store.mode)}
                      isActiveTimer={isActiveTimer}
                      activeTimerElapsedMs={activeTimerElapsedMs}
                      activeTimerRemainingMs={activeTimerRemainingMs}
                    />
                  )
                })}
              </SortableContext>
            </DndContext>

            {/* 완료된 Todo (드래그 가능) */}
            {doneTodos.length > 0 && (
              <>
                {activeTodos.length > 0 && (
                  <div className="py-2">
                    <p className="text-xs font-medium text-gray-400">완료됨</p>
                  </div>
                )}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDoneDragEnd}>
                  <SortableContext items={doneTodos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                    {doneTodos.map((todo) => {
                      // 실시간 타이머 정보 계산
                      const isActiveTimer = (store.status === 'running' || store.status === 'paused') && store.todoId === todo.id
                      let activeTimerElapsedMs: number | undefined = undefined
                      let activeTimerRemainingMs: number | undefined = undefined
                      
                      if (isActiveTimer) {
                        if (store.mode === 'stopwatch') {
                          // 일반 타이머: elapsedMs 그대로 사용
                          activeTimerElapsedMs = store.elapsedMs
                        } else if (store.mode === 'pomodoro' && store.phase === 'flow') {
                          // 뽀모도로 Flow: 남은 시간 전달 (카운트다운용)
                          const remaining = store.remainingMs ?? (store.endAt ? Math.max(0, store.endAt - Date.now()) : 0)
                          activeTimerRemainingMs = remaining
                        }
                      }
                      
                      return (
                        <SortableTodoItem
                          key={todo.id}
                          id={todo.id}
                          title={todo.title}
                          note={todo.note}
                          pomodoroDone={todo.pomodoroDone}
                          focusSeconds={todo.focusSeconds}
                          isDone={todo.isDone}
                          timerMode={todo.timerMode}
                          isEditing={actions.editingId === todo.id}
                          editingTitle={actions.editingTitle}
                          onEditingTitleChange={actions.setEditingTitle}
                          onToggle={() => actions.handleToggleDone(todo.id, !todo.isDone)}
                          onEdit={() => actions.handleEdit(todo.id, todo.title)}
                          onSaveEdit={actions.handleSaveEdit}
                          onCancelEdit={actions.handleCancelEdit}
                          onDelete={() => actions.handleDelete(todo.id)}
                          onOpenMenu={() => actions.setSelectedTodo(todo)}
                          onOpenTimer={() => actions.handleOpenTimer(todo, todo.timerMode || store.mode)}
                          isActiveTimer={isActiveTimer}
                          activeTimerElapsedMs={activeTimerElapsedMs}
                          activeTimerRemainingMs={activeTimerRemainingMs}
                        />
                      )
                    })}
                  </SortableContext>
                </DndContext>
              </>
            )}
          </div>
        )}
      </div>

      {/* Todo 액션 바텀시트 */}
      <BottomSheet
        isOpen={!!actions.selectedTodo && !actions.showNoteModal}
        onClose={() => actions.setSelectedTodo(null)}
        title={actions.selectedTodo?.title}
      >
        <BottomSheetActions>
          <BottomSheetActionButton
            icon={<EditIcon className="h-5 w-5" />}
            label="수정하기"
            onClick={() => actions.selectedTodo && actions.handleEdit(actions.selectedTodo.id, actions.selectedTodo.title)}
          />
          <BottomSheetActionButton
            icon={<TrashIcon className="h-5 w-5" />}
            label="삭제하기"
            onClick={() => actions.selectedTodo && actions.handleDelete(actions.selectedTodo.id)}
            variant="danger"
          />
        </BottomSheetActions>
        <div className="space-y-1">
          <BottomSheetItem
            icon={<DocumentIcon className="h-5 w-5 text-amber-500" />}
            label="메모"
            onClick={() => actions.selectedTodo && actions.handleOpenNote(actions.selectedTodo)}
          />
          {actions.selectedTodo && (
            <>
              {/* 타이머 모드가 없거나 일반 타이머로 선택된 경우 */}
              {(!actions.selectedTodo.timerMode || actions.selectedTodo.timerMode === 'stopwatch') && (
                <BottomSheetItem
                  icon={<ClockIcon className="h-5 w-5 text-emerald-500" />}
                  label="일반 타이머"
                  onClick={() => actions.selectedTodo && actions.handleOpenTimer(actions.selectedTodo, 'stopwatch')}
                />
              )}
              {/* 타이머 모드가 없거나 뽀모도로로 선택된 경우 */}
              {(!actions.selectedTodo.timerMode || actions.selectedTodo.timerMode === 'pomodoro') && (
                <BottomSheetItem
                  icon={<ClockIcon className="h-5 w-5 text-red-500" />}
                  label="뽀모도로 타이머"
                  onClick={() => actions.selectedTodo && actions.handleOpenTimer(actions.selectedTodo, 'pomodoro')}
                />
              )}
            </>
          )}
        </div>
      </BottomSheet>

      {/* 메모 바텀시트 */}
      <BottomSheet isOpen={actions.showNoteModal} onClose={actions.handleCloseNote} title="메모">
        <textarea
          value={actions.noteText}
          onChange={(e) => actions.setNoteText(e.target.value)}
          placeholder="메모를 입력하세요..."
          className="mb-4 h-32 w-full resize-none rounded-xl border border-gray-200 p-3 text-sm text-gray-900 outline-none focus:border-emerald-500 placeholder:text-gray-400"
          autoFocus
        />
        <button
          onClick={actions.handleSaveNote}
          className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
        >
          저장
        </button>
      </BottomSheet>

      {/* 타이머 풀스크린 */}
      <TimerFullScreen
        isOpen={!!actions.timerTodo}
        onClose={actions.handleCloseTimer}
        todoId={actions.timerTodo?.id ?? ''}
        todoTitle={actions.timerTodo?.title ?? ''}
        pomodoroDone={actions.timerTodo?.pomodoroDone ?? 0}
        focusSeconds={actions.timerTodo?.focusSeconds ?? 0}
        initialMode={actions.timerMode ?? undefined}
        isDone={actions.timerTodo?.isDone ?? false}
      />
    </div>
  )
}

export default TodosPage
