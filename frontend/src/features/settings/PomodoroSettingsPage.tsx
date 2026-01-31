import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm, useWatch, type Resolver } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { z } from 'zod'
import { Switch } from '../../ui/Switch'
import { usePomodoroSettings, useUpdatePomodoroSettings } from './hooks'

const schema = z.object({
  flowMin: z.coerce.number().int().min(1).max(90),
  breakMin: z.coerce.number().int().min(1).max(90),
  longBreakMin: z.coerce.number().int().min(1).max(90),
  cycleEvery: z.coerce.number().int().min(1).max(10),
  autoStartBreak: z.boolean(),
  autoStartSession: z.boolean(),
})

type FormValues = z.infer<typeof schema>

const settingsItems: {
  field: 'flowMin' | 'breakMin' | 'longBreakMin' | 'cycleEvery'
  label: string
  suffix: string
}[] = [
  { field: 'flowMin', label: 'Flow 시간', suffix: '분' },
  { field: 'breakMin', label: '휴식 시간', suffix: '분' },
  { field: 'longBreakMin', label: '긴 휴식 시간', suffix: '분' },
  { field: 'cycleEvery', label: '주기', suffix: '회' },
]

const defaultValues: FormValues = {
  flowMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cycleEvery: 4,
  autoStartBreak: false,
  autoStartSession: false,
}

function PomodoroSettingsPage() {
  const { data, isLoading } = usePomodoroSettings()
  const updateSettings = useUpdatePomodoroSettings()

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues,
  })

  const watchedValues = useWatch({ control })
  const values: FormValues = { ...defaultValues, ...watchedValues }

  useEffect(() => {
    if (data) {
      reset({
        flowMin: data.flowMin,
        breakMin: data.breakMin,
        longBreakMin: data.longBreakMin,
        cycleEvery: data.cycleEvery,
        autoStartBreak: data.autoStartBreak ?? false,
        autoStartSession: data.autoStartSession ?? false,
      })
    }
  }, [data, reset])

  const onSubmit = handleSubmit(async (formValues) => {
    await updateSettings.mutateAsync(formValues)
    toast.success('저장됨', { id: 'settings-saved' })
  })

  const handleNumberFieldSave = () => {
    onSubmit()
  }

  const handleToggle = (field: 'autoStartBreak' | 'autoStartSession') => {
    const newValue = !values[field]
    setValue(field, newValue)
    updateSettings.mutate({
      ...values,
      [field]: newValue,
    })
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <header>
        <h1 className="text-2xl font-bold text-gray-900">설정</h1>
      </header>

      {/* 세션 설정 */}
      <section>
        <p className="mb-3 text-sm font-medium text-gray-500">세션</p>
        <div className="divide-y divide-gray-100 rounded-2xl bg-white shadow-sm">
          {settingsItems.map(({ field, label, suffix }) => (
            <div key={field} className="flex items-center justify-between px-4 py-3.5">
              <span className="text-sm text-gray-900">{label}</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  {...register(field)}
                  onBlur={handleNumberFieldSave}
                  className="w-16 rounded-lg bg-emerald-50 px-3 py-1 text-right text-sm font-medium text-emerald-600 outline-none"
                />
                <span className="text-sm text-gray-500">{suffix}</span>
              </div>
            </div>
          ))}
        </div>
        {Object.keys(errors).length > 0 && (
          <p className="mt-2 text-xs text-red-500">유효한 값을 입력해주세요</p>
        )}
      </section>

      {/* 자동화 설정 */}
      <section>
        <p className="mb-3 text-sm font-medium text-gray-500">자동화</p>
        <div className="divide-y divide-gray-100 rounded-2xl bg-white shadow-sm">
          <div className="px-4 py-3.5">
            <Switch
              label="휴식 시간 자동 시작"
              description="Flow 종료 후 자동으로 휴식 시작"
              checked={values.autoStartBreak}
              onChange={() => handleToggle('autoStartBreak')}
              disabled={isLoading}
            />
          </div>
          <div className="px-4 py-3.5">
            <Switch
              label="세션 자동 시작"
              description="휴식 종료 후 자동으로 집중 시작"
              checked={values.autoStartSession}
              onChange={() => handleToggle('autoStartSession')}
              disabled={isLoading}
            />
          </div>
        </div>
      </section>

      {/* 버전 정보 */}
      <p className="text-center text-xs text-gray-400">Todo Flow v0.1.0</p>
    </div>
  )
}

export default PomodoroSettingsPage
