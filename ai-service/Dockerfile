# Multi-stage 빌드: NestJS AI Service
# Stage 1에서 빌드, Stage 2에서 실행 (이미지 크기 최적화)

# ============================================
# Stage 1: 빌드
# ============================================
FROM node:20-alpine AS builder
WORKDIR /app

# 의존성 캐싱: 패키지 파일 먼저 복사
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# 소스 복사 & 빌드
COPY . .
RUN pnpm build

# ============================================
# Stage 2: 실행
# ============================================
FROM node:20-alpine
WORKDIR /app

# 헬스체크 도구 설치 + non-root 사용자 생성 (보안)
RUN apk add --no-cache wget && \
    addgroup -S nestjs && adduser -S nestjs -G nestjs

# 프로덕션 의존성만 설치
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

# 빌드 산출물 복사
COPY --from=builder /app/dist ./dist

# non-root 전환
USER nestjs:nestjs

# 헬스 체크: 10초 워밍업, 30초마다 체크, 3초 타임아웃, 3회 실패 시 unhealthy
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/ai/health || exit 1

EXPOSE 3000
CMD ["node", "dist/main"]
