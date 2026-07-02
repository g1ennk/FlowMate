import { MoonIcon } from '../../ui/Icons'
import { SERVICE_HOURS_LABEL } from '../../lib/serviceHours'

function ServiceUnavailable() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface-base">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <MoonIcon className="h-10 w-10 text-accent" />
        <h1 className="mt-6 text-xl font-bold text-text-primary">
          지금은 운영 시간이 아니에요
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          FlowMate는 KST 기준 {SERVICE_HOURS_LABEL}에 운영됩니다.
        </p>
      </div>
    </div>
  )
}

export default ServiceUnavailable
