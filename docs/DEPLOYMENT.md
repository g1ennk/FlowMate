# Frontend 배포 가이드

## 📦 배포 옵션

### ⭐ Option 1: Vercel (추천)

Vite + React에 최적화된 플랫폼으로, 가장 쉽고 빠른 배포 방법입니다.

#### GitHub 연동 배포 (추천)

1. [vercel.com](https://vercel.com) 회원가입
2. "Add New Project" → GitHub 저장소 선택
3. 프로젝트 설정:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `pnpm build`
   - **Output Directory**: `dist`
   - **Install Command**: `pnpm install`
4. 환경 변수 설정 (선택):
   - `VITE_API_BASE_URL`: 백엔드 API URL (예: `https://api.yourdomain.com`)
   - `VITE_USE_MOCK`: `0` (프로덕션에서는 MSW 비활성화)
5. Deploy 버튼 클릭

이후 main 브랜치에 push하면 자동으로 배포됩니다.

#### CLI 배포

```bash
# Vercel CLI 설치
npm i -g vercel

# frontend 디렉토리에서 실행
cd frontend

# 로그인 및 배포
vercel

# 프로덕션 배포
vercel --prod
```

#### 설정 파일

`frontend/vercel.json`이 이미 생성되어 있습니다:
- SPA 라우팅 지원
- 자동 빌드 설정

---

### 🔷 Option 2: Netlify

Vercel의 좋은 대안으로, 무료 티어가 넉넉합니다.

#### GitHub 연동 배포

1. [netlify.com](https://netlify.com) 회원가입
2. "Add new site" → "Import from Git"
3. 프로젝트 설정:
   - **Base directory**: `frontend`
   - **Build command**: `pnpm build`
   - **Publish directory**: `frontend/dist`
4. 환경 변수 설정:
   - `VITE_API_BASE_URL`: 백엔드 API URL
   - `VITE_USE_MOCK`: `0`
5. Deploy 버튼 클릭

#### CLI 배포

```bash
# Netlify CLI 설치
npm i -g netlify-cli

# 배포
cd frontend
netlify login
netlify init
netlify deploy --prod
```

#### 설정 파일

`frontend/netlify.toml`이 이미 생성되어 있습니다.

---

### 🟦 Option 3: Cloudflare Pages

무료로 무제한 트래픽을 제공합니다.

1. [Cloudflare Pages](https://pages.cloudflare.com) 접속
2. "Create a project" → GitHub 연동
3. 빌드 설정:
   - **Build command**: `cd frontend && pnpm install && pnpm build`
   - **Build output**: `frontend/dist`
4. 환경 변수 설정
5. 배포

---

### 🗂️ Option 4: GitHub Pages

간단한 정적 사이트에 적합합니다.

```bash
cd frontend

# gh-pages 브랜치에 배포
pnpm add -D gh-pages

# package.json에 추가
{
  "scripts": {
    "deploy": "vite build && gh-pages -d dist"
  }
}

# 배포
pnpm deploy
```

**주의**: GitHub Pages는 `/<repo-name>/` 경로에 배포되므로 `vite.config.ts`에 `base` 설정 필요:

```typescript
export default defineConfig({
  base: '/todo-flow/', // 저장소 이름
  plugins: [react(), tailwindcss()],
})
```

---

## 🔧 배포 전 체크리스트

### 1. 환경 변수 확인

프로덕션 배포 시 다음 환경 변수를 설정하세요:

| 변수 | 용도 | 기본값 | 프로덕션 권장값 |
|------|------|--------|----------------|
| `VITE_API_BASE_URL` | 백엔드 API URL | `/api` | `https://api.yourdomain.com` |
| `VITE_USE_MOCK` | MSW 모킹 활성화 | `0` | `0` (비활성화) |

#### 로컬 테스트

프로덕션 빌드를 로컬에서 미리 테스트하세요:

```bash
cd frontend

# 프로덕션 빌드
pnpm build

# 빌드 결과 프리뷰
pnpm preview
```

### 2. 빌드 최적화 확인

```bash
# 빌드 크기 분석
cd frontend
pnpm build

# dist 폴더 크기 확인
du -sh dist
```

빌드 결과물은 보통 200KB ~ 1MB 정도입니다.

### 3. CORS 설정

백엔드 API에서 프론트엔드 도메인을 허용해야 합니다:

```java
// Spring Boot 예시
@Configuration
public class CorsConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(
                    "https://your-frontend.vercel.app",
                    "http://localhost:5173"
                )
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE")
                .allowCredentials(true);
    }
}
```

---

## 🚀 배포 후 확인사항

1. **라우팅 테스트**: `/todos`, `/settings` 등 직접 접근 시 404 발생하지 않는지 확인
2. **API 연동**: 실제 백엔드 API와 통신이 되는지 확인
3. **타이머 기능**: 타이머가 정상 작동하는지 확인
4. **반응형**: 모바일/태블릿에서 UI가 깨지지 않는지 확인

---

## 📝 현재 상태

- ✅ **Vercel 설정 파일**: `frontend/vercel.json` 생성됨
- ✅ **Netlify 설정 파일**: `frontend/netlify.toml` 생성됨
- ✅ **환경 변수 처리**: `src/api/http.ts`, `src/app/AppProviders.tsx`에 구현됨
- ✅ **MSW 조건부 로딩**: 프로덕션에서는 자동으로 비활성화됨

---

## 🔄 CI/CD 자동화

### GitHub Actions 예시

`.github/workflows/deploy.yml`:

```yaml
name: Deploy Frontend

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'pnpm'
          cache-dependency-path: frontend/pnpm-lock.yaml
      
      - name: Install dependencies
        run: |
          cd frontend
          pnpm install
      
      - name: Build
        run: |
          cd frontend
          pnpm build
      
      - name: Test
        run: |
          cd frontend
          pnpm test
```

Vercel/Netlify는 자동으로 이런 워크플로우를 제공하므로 별도 설정이 필요 없습니다.

---

## 💡 추천 배포 전략

1. **개발 단계** (현재):
   - Vercel 무료 티어로 배포
   - 자동 Preview 배포로 PR 리뷰
   - MSW로 백엔드 없이 프론트엔드 개발 계속

2. **백엔드 준비 후**:
   - 백엔드 API URL을 환경 변수로 설정
   - CORS 설정
   - 프로덕션에서 `VITE_USE_MOCK=0`으로 설정

3. **프로덕션**:
   - 커스텀 도메인 연결
   - HTTPS 자동 적용 (Vercel/Netlify 기본 제공)
   - CDN 자동 적용

---

## 🆘 문제 해결

### 404 에러 (라우팅)

**증상**: `/todos` 직접 접근 시 404

**해결**: `vercel.json` 또는 `netlify.toml`의 rewrite 규칙 확인

### API 연결 실패

**증상**: API 호출 시 `Failed to fetch`

**해결**:
1. `VITE_API_BASE_URL` 환경 변수 확인
2. 백엔드 CORS 설정 확인
3. 브라우저 콘솔에서 실제 요청 URL 확인

### MSW가 프로덕션에서 활성화됨

**증상**: 프로덕션에서도 mock 데이터가 보임

**해결**: `VITE_USE_MOCK` 환경 변수가 `0` 또는 설정되지 않았는지 확인

---

**추천**: 지금 당장 Vercel로 배포해보세요! GitHub 연동만 하면 3분 안에 끝납니다. 🚀
