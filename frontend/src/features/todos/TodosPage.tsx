import { useMemo, useRef, useState, useEffect } from 'react'
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
  MoreVerticalIcon,
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

  // Global ticker is installed in AppProviders

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
  const isSubmittingRef = useRef(false)
  const memoTextareaRef = useRef<HTMLTextAreaElement>(null)

  // 폼
  const {
    register,
    reset,
    getValues,
  } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { title: '' },
  })

  // === Helper 함수 ===
  // 타이머 정보 계산 로직 (중복 제거)
  const calculateTimerInfo = (todoId: string) => {
    const timer = store.getTimer(todoId)
    const isActiveTimer = timer && (timer.status === 'running' || timer.status === 'paused')
    let activeTimerElapsedMs: number | undefined = undefined
    let activeTimerRemainingMs: number | undefined = undefined
    let activeTimerPhase: 'flow' | 'short' | 'long' | undefined = undefined
    
    if (isActiveTimer && timer) {
      if (timer.mode === 'stopwatch') {
        // 일반 타이머: 카운트업 (실시간 계산)
        activeTimerElapsedMs = timer.elapsedMs
      } else if (timer.mode === 'pomodoro') {
        // 뽀모도로: 카운트다운 (실시간 계산, endAt 기준)
        // Date.now()는 실시간 타이머 업데이트를 위해 의도적으로 render 중 호출됨
        activeTimerRemainingMs = timer.endAt ? Math.max(0, timer.endAt - Date.now()) : (timer.remainingMs ?? 0)
        activeTimerPhase = timer.phase
      }
    }
    
    return { isActiveTimer, activeTimerElapsedMs, activeTimerRemainingMs, activeTimerPhase }
  }

  // === Memoized 데이터 ===
  const todosForSelectedDate = useMemo(() => {
    return (data?.items ?? [])
      .filter((t) => t.date === selectedDateKey)
      .sort((a, b) => {
        // 완료 여부로 정렬 (미완료 > 완료)
        if (a.isDone !== b.isDone) return a.isDone ? 1 : -1
        // 생성 시간 순으로 정렬
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })
  }, [data?.items, selectedDateKey])

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
  // === Effects ===
  // 메모 편집 모드로 전환 시 자동 포커스
  useEffect(() => {
    if (actions.noteEditMode && memoTextareaRef.current) {
      // 약간의 딜레이를 주어 DOM 업데이트 후 포커스
      setTimeout(() => {
        if (memoTextareaRef.current) {
          memoTextareaRef.current.focus()
          // 커서를 텍스트 끝으로 이동
          const length = memoTextareaRef.current.value.length
          memoTextareaRef.current.setSelectionRange(length, length)
        }
      }, 0)
    }
  }, [actions.noteEditMode])

  // === 핸들러 ===

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
              sessionCount={currentStats?.count ?? 0}
              sessionMinutes={currentStats?.minutes ?? 0}
            />
          </div>
          <button
            onClick={() => setShowInput((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white transition-colors"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>

        {/* 로딩 */}
        {isLoading && <div className="py-8 text-center text-sm text-gray-400">불러오는 중...</div>}

        {/* 빈 상태 또는 리스트 */}
        {!isLoading && todosForSelectedDate.length === 0 && !showInput ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircleIcon className="h-8 w-8 text-emerald-300" />
            </div>
            <p className="mb-1 text-sm font-medium text-gray-600">할 일이 없어요</p>
            <p className="mb-4 text-xs text-gray-400">+ 버튼을 눌러 오늘의 첫 할 일을 추가해보세요</p>
            <button
              onClick={() => setShowInput(true)}
              className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            >
              + 할 일 추가하기
            </button>
          </div>
        ) : (!isLoading && (todosForSelectedDate.length > 0 || showInput)) ? (
          <div className="space-y-1">
            {/* 미완료 Todo (드래그 가능) */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleActiveDragEnd}>
              <SortableContext items={activeTodos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {activeTodos.map((todo) => {
                  // 실시간 타이머 정보 계산 (헬퍼 함수 사용)
                  const timer = store.getTimer(todo.id)
                  const { isActiveTimer, activeTimerElapsedMs, activeTimerRemainingMs, activeTimerPhase } = calculateTimerInfo(todo.id)
                  
                  return (
                    <SortableTodoItem
                      key={todo.id}
                      id={todo.id}
                      title={todo.title}
                      note={todo.note}
                      pomodoroDone={todo.pomodoroDone}
                      focusSeconds={todo.focusSeconds}
                      isDone={todo.isDone}
                      isEditing={actions.editingId === todo.id}
                      editingTitle={actions.editingTitle}
                      onEditingTitleChange={actions.setEditingTitle}
                      onToggle={() => actions.handleToggleDone(todo.id, !todo.isDone)}
                      onEdit={() => actions.handleEdit(todo.id, todo.title)}
                      onSaveEdit={actions.handleSaveEdit}
                      onCancelEdit={actions.handleCancelEdit}
                      onDelete={() => actions.handleDelete(todo.id)}
                      onOpenMenu={() => actions.setSelectedTodo(todo)}
                      onOpenTimer={() => actions.handleOpenTimer(todo, todo.timerMode || timer?.mode || null)}
                      onOpenNote={() => actions.handleOpenNote(todo)}
                      isActiveTimer={isActiveTimer}
                      activeTimerElapsedMs={activeTimerElapsedMs}
                      activeTimerRemainingMs={activeTimerRemainingMs}
                      activeTimerPhase={activeTimerPhase}
                    />
                  )
                })}
              </SortableContext>
            </DndContext>

            {/* 새 할 일 추가 - TodoItem 형태 (미완료 태스크 맨 아래) */}
            {showInput && (
              <div className="rounded-xl p-2">
                <div className="flex items-center gap-3 rounded-lg px-2 py-1 -mx-2 -my-1">
                  {/* 체크박스 (비활성) */}
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 bg-transparent opacity-50" />
                  
                  {/* 입력 필드 */}
                  <input
                    {...register('title')}
                    ref={(e) => {
                      register('title').ref(e)
                      inputRef.current = e
                    }}
                    placeholder="할 일 입력"
                    autoFocus
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (isSubmittingRef.current) return
                        
                        const title = getValues('title')
                        if (title?.trim()) {
                          isSubmittingRef.current = true
                          try {
                            await actions.handleCreate(title)
                            reset()
                            // Enter 시에는 입력 필드 유지 (연속 입력 가능)
                            // setShowInput(false) 제거
                            // 입력 필드에 다시 포커스
                            setTimeout(() => {
                              inputRef.current?.focus()
                            }, 0)
                          } catch (err) {
                            toast.error('추가 실패')
                            console.error(err)
                          } finally {
                            isSubmittingRef.current = false
                          }
                        }
                      }
                    }}
                    onBlur={async () => {
                      // 제출 중이면 blur 무시
                      if (isSubmittingRef.current) return
                      
                      const title = getValues('title')
                      if (title?.trim()) {
                        // 입력 값이 있으면 자동으로 추가
                        isSubmittingRef.current = true
                        try {
                          await actions.handleCreate(title)
                          reset()
                          setShowInput(false) // blur 시에는 입력 필드 닫기
                        } catch (err) {
                          toast.error('추가 실패')
                          console.error(err)
                        } finally {
                          isSubmittingRef.current = false
                        }
                      } else {
                        // 입력 값이 없으면 입력 필드만 닫기
                        setShowInput(false)
                      }
                    }}
                    className="flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
                  />
                  
                  {/* 더보기 버튼 (비활성) */}
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-300 opacity-50">
                    <MoreVerticalIcon className="h-4 w-4" />
                  </div>
                </div>
              </div>
            )}

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
                      // 실시간 타이머 정보 계산 (헬퍼 함수 사용)
                      const timer = store.getTimer(todo.id)
                      const { isActiveTimer, activeTimerElapsedMs, activeTimerRemainingMs, activeTimerPhase } = calculateTimerInfo(todo.id)
                      
                      return (
                        <SortableTodoItem
                          key={todo.id}
                          id={todo.id}
                          title={todo.title}
                          note={todo.note}
                          pomodoroDone={todo.pomodoroDone}
                          focusSeconds={todo.focusSeconds}
                          isDone={todo.isDone}
                          isEditing={actions.editingId === todo.id}
                          editingTitle={actions.editingTitle}
                          onEditingTitleChange={actions.setEditingTitle}
                          onToggle={() => actions.handleToggleDone(todo.id, !todo.isDone)}
                          onEdit={() => actions.handleEdit(todo.id, todo.title)}
                          onSaveEdit={actions.handleSaveEdit}
                          onCancelEdit={actions.handleCancelEdit}
                          onDelete={() => actions.handleDelete(todo.id)}
                          onOpenMenu={() => actions.setSelectedTodo(todo)}
                          onOpenTimer={() => actions.handleOpenTimer(todo, todo.timerMode || timer?.mode || null)}
                          onOpenNote={() => actions.handleOpenNote(todo)}
                          isActiveTimer={isActiveTimer}
                          activeTimerElapsedMs={activeTimerElapsedMs}
                          activeTimerRemainingMs={activeTimerRemainingMs}
                          activeTimerPhase={activeTimerPhase}
                        />
                      )
                    })}
                  </SortableContext>
                </DndContext>
              </>
            )}
          </div>
        ) : null}
      </div>

      {/* Todo 액션 바텀시트 */}
      <BottomSheet
        isOpen={!!actions.selectedTodo && !actions.showNoteModal}
        onClose={() => {
          actions.setSelectedTodo(null)
          actions.setTimerErrorMessage(null)
        }}
        title={actions.selectedTodo?.title}
      >
        <BottomSheetActions>
          <BottomSheetActionButton
            icon={<EditIcon className="h-6 w-6" />}
            label="수정하기"
            onClick={() => actions.selectedTodo && actions.handleEdit(actions.selectedTodo.id, actions.selectedTodo.title)}
          />
          <BottomSheetActionButton
            icon={<TrashIcon className="h-6 w-6" />}
            label="삭제하기"
            onClick={() => actions.selectedTodo && actions.handleDelete(actions.selectedTodo.id)}
            variant="danger"
          />
        </BottomSheetActions>
        <div className="space-y-1">
          <BottomSheetItem
            icon={<DocumentIcon className="h-5 w-5 text-yellow-400" />}
            label="메모"
            onClick={() => actions.selectedTodo && actions.handleOpenNote(actions.selectedTodo)}
          />
          {actions.selectedTodo && (() => {
            // 전체 타이머 중에서 실행 중인 타이머 찾기 (running만)
            const allTimers = Object.values(store.timers)
            const runningTimer = allTimers.find(t => t.status === 'running')
            const activeMode = runningTimer ? runningTimer.mode : null
            
            return (
              <>
                {/* 일반 타이머 */}
                <BottomSheetItem
                  icon={<ClockIcon className="h-5 w-5 text-emerald-500" />}
                  label="일반 타이머"
                  onClick={() => {
                    if (!actions.selectedTodo) return
                    if (activeMode === 'pomodoro') {
                      actions.setTimerErrorMessage('이미 뽀모도로 타이머가 실행 중입니다')
                      return
                    }
                    actions.handleOpenTimer(actions.selectedTodo, 'stopwatch')
                  }}
                  disabled={activeMode === 'pomodoro'}
                />
                
                {/* 뽀모도로 타이머 */}
                <BottomSheetItem
                  icon={<ClockIcon className="h-5 w-5 text-red-500" />}
                  label="뽀모도로 타이머"
                  onClick={() => {
                    if (!actions.selectedTodo) return
                    if (activeMode === 'stopwatch') {
                      actions.setTimerErrorMessage('이미 일반 타이머가 실행 중입니다')
                      return
                    }
                    actions.handleOpenTimer(actions.selectedTodo, 'pomodoro')
                  }}
                  disabled={activeMode === 'stopwatch'}
                />
              </>
            )
          })()}
        </div>
      </BottomSheet>

      {/* 메모 바텀시트 */}
      <BottomSheet 
        isOpen={actions.showNoteModal} 
        onClose={actions.handleCloseNote}
      >
        {/* 커스텀 헤더 */}
        <div className="mb-4 -mt-2">
          <div className="flex items-center justify-between">
            {actions.noteEditMode ? (
              <>
                <button
                  onClick={actions.handleDeleteNote}
                  className="text-sm font-medium text-red-600 transition-colors hover:text-red-700"
                >
                  삭제
                </button>
                <h3 className="text-base font-semibold text-gray-900">
                  {actions.noteTodo?.title || '메모'}
                </h3>
                <button
                  onClick={actions.handleSaveNote}
                  className="text-sm font-medium text-gray-900 transition-colors hover:text-gray-700"
                >
                  완료
                </button>
              </>
            ) : (
              <>
                <div className="w-8"></div>
                <h3 className="text-base font-semibold text-gray-900">
                  {actions.noteTodo?.title || '메모'}
                </h3>
                <div className="w-8"></div>
              </>
            )}
          </div>
        </div>

        {/* 단일 textarea - 읽기/편집 모드 전환 */}
        <textarea
          ref={memoTextareaRef}
          value={actions.noteText}
          onChange={(e) => actions.setNoteText(e.target.value)}
          onClick={!actions.noteEditMode ? actions.handleEditNote : undefined}
          readOnly={!actions.noteEditMode}
          placeholder="메모를 입력하세요..."
          className={`mb-4 h-40 w-full resize-none rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 ${
            !actions.noteEditMode ? 'cursor-pointer' : ''
          }`}
        />
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

      {/* 타이머 에러 메시지 (하단 중앙 floating) */}
      {actions.timerErrorMessage && (
        <div className="fixed bottom-20 left-0 right-0 z-[10000] flex justify-center px-6 pointer-events-none">
          <div className="animate-fade-in rounded-2xl bg-gray-900 px-6 py-4 shadow-2xl pointer-events-auto">
            <p className="text-sm text-white font-medium">
              {actions.timerErrorMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default TodosPage
