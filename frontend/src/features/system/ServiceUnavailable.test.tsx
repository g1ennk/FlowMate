import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderApp } from '../../test/renderApp'
import { SERVICE_HOURS_LABEL } from '../../lib/serviceHours'
import ServiceUnavailable from './ServiceUnavailable'

describe('ServiceUnavailable', () => {
  it('제목 "지금은 운영 시간이 아니에요"를 렌더한다', () => {
    renderApp(<ServiceUnavailable />)
    expect(screen.getByRole('heading', { name: '지금은 운영 시간이 아니에요' })).toBeInTheDocument()
  })

  it('본문에 운영 시간 라벨이 포함된다', () => {
    renderApp(<ServiceUnavailable />)
    expect(screen.getByText(new RegExp(`FlowMate는 KST 기준 ${SERVICE_HOURS_LABEL}에 운영됩니다.`))).toBeInTheDocument()
  })
})
