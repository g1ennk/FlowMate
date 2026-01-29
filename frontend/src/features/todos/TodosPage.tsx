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
import { Calendar } from '../../ui/Calendar'
import { formatDateKey } from '../../ui/calendarUtils'
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
import { SortableTodoItem } from './components/SortableTodoItem'
import { TimerFullScreen } from '../timer/TimerFullScreen'
import { useTodoActions } from './useTodoActions'
import { useReorderTodos, useTodos } from './hooks'
import { getTimerInfo } from '../timer/useTimerInfo'

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
  const reorderTodos = useReorderTodos()

  // UI 상태
  const [showInput, setShowInput] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
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

  // === Helper 함수는 제거되고 useTimerInfo 사용 ===

  // === Memoized 데이터 ===
  const todosForSelectedDate = useMemo(() => {
    return (data?.items ?? []).filter((t) => t.date === selectedDateKey)
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

  const activeTodos = useMemo(() => {
    return [...todosForSelectedDate]
      .filter((t) => !t.isDone)
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })
  }, [todosForSelectedDate])

  const doneTodos = useMemo(() => {
    return [...todosForSelectedDate]
      .filter((t) => t.isDone)
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })
  }, [todosForSelectedDate])

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

  const getNextOrder = (list: Array<{ order: number }>) =>
    list.length === 0 ? 0 : Math.max(...list.map((todo) => todo.order)) + 1

  const handleActiveDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = activeTodos.findIndex((t) => t.id === active.id)
    const newIndex = activeTodos.findIndex((t) => t.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) {
      const nextTodos = arrayMove(activeTodos, oldIndex, newIndex)
      reorderTodos.mutate({
        items: nextTodos.map((todo, index) => ({ id: todo.id, order: index })),
      })
    }
  }

  const handleDoneDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = doneTodos.findIndex((t) => t.id === active.id)
    const newIndex = doneTodos.findIndex((t) => t.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) {
      const nextTodos = arrayMove(doneTodos, oldIndex, newIndex)
      reorderTodos.mutate({
        items: nextTodos.map((todo, index) => ({ id: todo.id, order: index })),
      })
    }
  }

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
            <h2 className="text-base font-semibold text-gray-900">
              {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일
            </h2>
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
                  // 실시간 타이머 정보 계산
                  const timer = store.getTimer(todo.id)
                  const { isActiveTimer, activeTimerElapsedMs, activeTimerRemainingMs, activeTimerPhase, breakElapsedMs, breakTargetMs, isBreakPhase, flexiblePhase } = getTimerInfo(timer)
                  const sessionHistory = timer?.sessionHistory ?? []
                  const initialFocusMs = timer?.initialFocusMs ?? 0
                  
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
                      onToggle={() =>
                        actions.handleToggleDone(todo.id, !todo.isDone, getNextOrder(doneTodos))
                      }
                      onEdit={() => actions.handleEdit(todo.id, todo.title)}
                      onSaveEdit={actions.handleSaveEdit}
                      onCancelEdit={actions.handleCancelEdit}
                      onDelete={() => actions.handleDelete(todo.id)}
                      onOpenMenu={() => actions.setSelectedTodo(todo)}
                      onOpenTimer={() => {
                        // 우선순위: 현재 실행 중인 타이머 모드 > todo.timerMode > null
                        const modeToUse = timer?.mode || todo.timerMode || null
                        actions.handleOpenTimer(todo, modeToUse)
                      }}
                      onOpenNote={() => actions.handleOpenNote(todo)}
                      isActiveTimer={isActiveTimer}
                      activeTimerMode={timer?.mode}
                      activeTimerElapsedMs={activeTimerElapsedMs}
                      activeTimerRemainingMs={activeTimerRemainingMs}
                      activeTimerPhase={activeTimerPhase}
                      breakElapsedMs={breakElapsedMs}
                      breakTargetMs={breakTargetMs}
                      isBreakPhase={isBreakPhase}
                      flexiblePhase={flexiblePhase}
                      sessionHistory={sessionHistory}
                      initialFocusMs={initialFocusMs}
                    />
                  )
                })}
              </SortableContext>
            </DndContext>

            {/* 새 할 일 추가 - TodoItem 형태 (미완료 태스크 맨 아래) */}
            {showInput && (
              <div className="rounded-xl p-2">
                <div className="flex items-start gap-3 rounded-lg px-2 py-1 -mx-2 -my-1">
                  {/* 체크박스 (비활성) */}
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 bg-transparent opacity-50 mt-0.5" />
                  
                  {/* 입력 필드 */}
                  <textarea
                    {...register('title')}
                    ref={(e) => {
                      register('title').ref(e)
                      inputRef.current = e
                      // 높이 자동 조정
                      if (e) {
                        e.style.height = 'auto'
                        e.style.height = `${e.scrollHeight}px`
                      }
                    }}
                    placeholder="할 일 입력"
                    autoFocus
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        if (isSubmittingRef.current) return
                        
                        const title = getValues('title')
                        if (title?.trim()) {
                          isSubmittingRef.current = true
                          try {
                            await actions.handleCreate(title)
                            reset()
                            // Enter 시에는 입력 필드 유지 (연속 입력 가능)
                            setTimeout(() => {
                              if (inputRef.current) {
                                inputRef.current.focus()
                                inputRef.current.style.height = 'auto'
                                inputRef.current.style.height = `${inputRef.current.scrollHeight}px`
                              }
                            }, 0)
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
                      // 높이 자동 조정
                      e.target.style.height = 'auto'
                      e.target.style.height = `${e.target.scrollHeight}px`
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
                          toast.error('추가 실패', { id: 'todo-create-failed' })
                          console.error(err)
                        } finally {
                          isSubmittingRef.current = false
                        }
                      } else {
                        // 입력 값이 없으면 입력 필드만 닫기
                        setShowInput(false)
                      }
                    }}
                    className="flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 resize-none overflow-hidden min-h-[20px]"
                    rows={1}
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
                      // 실시간 타이머 정보 계산
                      const timer = store.getTimer(todo.id)
                      const { isActiveTimer, activeTimerElapsedMs, activeTimerRemainingMs, activeTimerPhase } = getTimerInfo(timer)
                      const sessionHistory = timer?.sessionHistory ?? []
                      const initialFocusMs = timer?.initialFocusMs ?? 0
                      
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
                          onToggle={() =>
                            actions.handleToggleDone(
                              todo.id,
                              !todo.isDone,
                              getNextOrder(activeTodos),
                            )
                          }
                          onEdit={() => actions.handleEdit(todo.id, todo.title)}
                          onSaveEdit={actions.handleSaveEdit}
                          onCancelEdit={actions.handleCancelEdit}
                          onDelete={() => actions.handleDelete(todo.id)}
                          onOpenMenu={() => actions.setSelectedTodo(todo)}
                          onOpenTimer={() => {
                        // 우선순위: 현재 실행 중인 타이머 모드 > todo.timerMode > null
                        const modeToUse = timer?.mode || todo.timerMode || null
                        actions.handleOpenTimer(todo, modeToUse)
                      }}
                          onOpenNote={() => actions.handleOpenNote(todo)}
                          isActiveTimer={isActiveTimer}
                          activeTimerMode={timer?.mode}
                          activeTimerElapsedMs={activeTimerElapsedMs}
                          activeTimerRemainingMs={activeTimerRemainingMs}
                          activeTimerPhase={activeTimerPhase}
                          sessionHistory={sessionHistory}
                          initialFocusMs={initialFocusMs}
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
            // 현재 선택된 태스크의 타이머 상태
            const currentTimer = store.getTimer(actions.selectedTodo.id)
            const currentTimerRunning = currentTimer?.status === 'running'
            
            // 다른 태스크에서 실행 중인 타이머 찾기
            const allTimerEntries = Object.entries(store.timers)
            const otherRunningTimer = allTimerEntries.find(
              ([todoId, timer]) => timer.status === 'running' && todoId !== actions.selectedTodo?.id
            )
            
            const isCompleted = actions.selectedTodo.isDone
            
            // 일반 타이머 비활성화 조건
            // 1. 완료된 태스크
            // 2. 다른 태스크에서 타이머 실행 중
            // 3. 같은 태스크에서 뽀모도로 실행 중
            const disableStopwatch = 
              isCompleted || 
              !!otherRunningTimer || 
              (currentTimerRunning && currentTimer.mode === 'pomodoro')
            
            // 뽀모도로 타이머 비활성화 조건
            // 1. 완료된 태스크
            // 2. 다른 태스크에서 타이머 실행 중
            // 3. 같은 태스크에서 일반 타이머 실행 중
            const disablePomodoro = 
              isCompleted || 
              !!otherRunningTimer || 
              (currentTimerRunning && currentTimer.mode === 'stopwatch')
            
            return (
              <>
                {/* 일반 타이머 */}
                <BottomSheetItem
                  icon={<ClockIcon className="h-5 w-5 text-emerald-500" />}
                  label="일반 타이머"
                  onClick={() => {
                    if (!actions.selectedTodo) return
                    if (isCompleted) {
                      actions.setTimerErrorMessage('완료된 태스크는 타이머를 시작할 수 없습니다')
                      return
                    }
                    if (otherRunningTimer) {
                      actions.setTimerErrorMessage('다른 타이머가 실행 중입니다')
                      return
                    }
                    if (currentTimerRunning && currentTimer.mode === 'pomodoro') {
                      actions.setTimerErrorMessage('뽀모도로 타이머가 실행 중입니다')
                      return
                    }
                    actions.handleOpenTimer(actions.selectedTodo, 'stopwatch')
                  }}
                  disabled={disableStopwatch}
                />
                
                {/* 뽀모도로 타이머 */}
                <BottomSheetItem
                  icon={<ClockIcon className="h-5 w-5 text-red-500" />}
                  label="뽀모도로 타이머"
                  onClick={() => {
                    if (!actions.selectedTodo) return
                    if (isCompleted) {
                      actions.setTimerErrorMessage('완료된 태스크는 타이머를 시작할 수 없습니다')
                      return
                    }
                    if (otherRunningTimer) {
                      actions.setTimerErrorMessage('다른 타이머가 실행 중입니다')
                      return
                    }
                    if (currentTimerRunning && currentTimer.mode === 'stopwatch') {
                      actions.setTimerErrorMessage('일반 타이머가 실행 중입니다')
                      return
                    }
                    actions.handleOpenTimer(actions.selectedTodo, 'pomodoro')
                  }}
                  disabled={disablePomodoro}
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
