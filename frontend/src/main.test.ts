import { describe, expect, it } from 'vitest'
import mainSource from './main.tsx?raw'

describe('main entry', () => {
  // themeStore는 불러올 때 OS 테마 변경 감지를 등록한다. 다른 모듈의 import에 기대지 않고 앱 시작 시 직접 불러온다.
  it('loads the theme store at startup so system theme changes are followed', () => {
    expect(mainSource).toMatch(/^import '\.\/store\/themeStore'$/m)
  })
})
