import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderApp } from '../../test/renderApp'
import { SERVICE_HOURS_LABEL } from '../../lib/serviceHours'
import ServiceUnavailable from './ServiceUnavailable'

describe('ServiceUnavailable', () => {
  it('제목 "잠시 쉬는 중이에요"를 렌더한다', () => {
    renderApp(<ServiceUnavailable />)
    expect(screen.getByRole('heading', { name: '잠시 쉬는 중이에요' })).toBeInTheDocument()
  })

  it('본문에 운영 시간 라벨이 포함된다', () => {
    renderApp(<ServiceUnavailable />)
    // 본문 텍스트가 "FlowMate는 매일\n오전 7시 - 자정에 운영해요" 형태
    expect(screen.getByText(/FlowMate는 매일/)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`${SERVICE_HOURS_LABEL}에 운영해요`))).toBeInTheDocument()
  })
})
