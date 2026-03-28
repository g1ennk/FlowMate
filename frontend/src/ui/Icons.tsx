import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number
}

const defaultProps: IconProps = {
  className: 'h-5 w-5',
  fill: 'none',
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  strokeWidth: 2,
}

export function PlayIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      fill="currentColor"
      stroke="none"
      {...props}
    >
      <path d="M8 5.14v14.72a1 1 0 001.5.86l11-7.36a1 1 0 000-1.72l-11-7.36A1 1 0 008 5.14z" />
    </svg>
  )
}

export function PauseIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      fill="currentColor"
      stroke="none"
      {...props}
    >
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  )
}

export function StopIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      fill="currentColor"
      stroke="none"
      {...props}
    >
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  )
}

export function CheckIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      {...props}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

export function PlusIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      {...props}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}

export function ChevronLeftIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      {...props}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

export function ChevronRightIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      {...props}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

export function ArrowDownIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      {...props}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5.25v13.5m0 0l-5.25-5.25M12 18.75l5.25-5.25" />
    </svg>
  )
}

export function ArrowRightIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      {...props}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 12h13.5m0 0L13.5 6.75M18.75 12l-5.25 5.25" />
    </svg>
  )
}

export function CloseIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      strokeWidth={1.5}
      {...props}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6l-12 12" />
    </svg>
  )
}

export function MoreVerticalIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      fill="currentColor"
      stroke="none"
      {...props}
    >
      <circle cx="12" cy="6" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="18" r="1.5" />
    </svg>
  )
}

export function EditIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
      />
    </svg>
  )
}

export function TrashIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  )
}

export function CheckCircleIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      strokeWidth={1.5}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

export function SettingsIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      strokeWidth={1.5}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

export function ClockIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

export function DocumentIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  )
}

export function CalendarIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
      />
    </svg>
  )
}

export function GripVerticalIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      fill="currentColor"
      stroke="none"
      {...props}
    >
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  )
}

export function ArrowPathIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.181a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  )
}

// 옵션 1: 간단한 "휴식" 텍스트 아이콘
export function BreakIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      {...props}
    >
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize="10"
        fontWeight="600"
        fill="currentColor"
      >
        휴식
      </text>
    </svg>
  )
}

// 옵션 2: 달 아이콘 (휴식/쉼)
export function MoonIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
      />
    </svg>
  )
}

export function ListBulletIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h7.5M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
      />
    </svg>
  )
}

export function SunIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v1.5M18.364 5.636l-1.06 1.06M21 12h-1.5M18.364 18.364l-1.06-1.06M12 19.5V21M7.757 17.303l-1.061 1.061M4.5 12H3M7.757 6.697 6.696 5.636M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z"
      />
    </svg>
  )
}

// 옵션 3: 커피 아이콘 (더 단순화)
export function CoffeeIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 14v.01M12 14v.01M16 14v.01M21 12c0 .55-.45 1-1 1h-2c0 2.76-2.24 5-5 5s-5-2.24-5-5H6c-.55 0-1-.45-1-1V7c0-.55.45-1 1-1h14c.55 0 1 .45 1 1v5z"
      />
    </svg>
  )
}

export function SpeakerWaveIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
      />
    </svg>
  )
}

export function SpeakerXMarkIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.531V19.94a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.506-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.395C2.806 8.757 3.63 8.25 4.51 8.25H6.75z"
      />
    </svg>
  )
}

export function ChartBarIcon({ size, className, ...props }: IconProps) {
  return (
    <svg
      {...defaultProps}
      className={className ?? (size ? undefined : defaultProps.className)}
      width={size}
      height={size}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
      />
    </svg>
  )
}
