import { useMemo } from 'react'
import { parseKpt, KPT_STYLES } from '../kptParser'
import { userTextDisplayClass } from '../../../lib/userTextStyles'

export function KptText({ content }: { content: string }) {
  const segments = useMemo(() => parseKpt(content), [content])

  if (!segments) {
    return (
      <p className={`whitespace-pre-wrap ${userTextDisplayClass} text-text-secondary`}>
        {content}
      </p>
    )
  }

  return (
    <div className="space-y-0.5">
      {segments.map((seg, i) => {
        if (seg.type === 'plain') {
          if (!seg.text) return <div key={i} className="h-2" />
          return (
            <p key={i} className={`${userTextDisplayClass} text-text-secondary`}>
              {seg.text}
            </p>
          )
        }
        if (seg.type === 'quote') {
          return (
            <div key={i}>
              <p className={`font-semibold ${userTextDisplayClass} text-text-tertiary`}>
                ❓ Question
              </p>
              {seg.text && (
                <p className={`${userTextDisplayClass} text-text-tertiary`}>
                  - {seg.text}
                </p>
              )}
            </div>
          )
        }
        const style = KPT_STYLES[seg.type]
        return (
          <p key={i} className={`${userTextDisplayClass} text-text-secondary`}>
            <span className={`font-semibold ${style.colorClass}`}>
              {style.icon} {style.label}
            </span>
            {seg.text ? ` ${seg.text}` : ''}
          </p>
        )
      })}
    </div>
  )
}
