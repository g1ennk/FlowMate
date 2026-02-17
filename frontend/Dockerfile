# Multi-stage 빌드: React Frontend
# Stage 1에서 빌드, Stage 2에서 실행 (이미지 크기 최적화)

# ============================================
# Stage 1: 빌드
# ============================================
FROM node:22.12.0-alpine AS builder

RUN npm install -g pnpm@9

WORKDIR /app

# package 파일 먼저 복사 (의존성 캐싱)
COPY package.json pnpm-lock.yaml ./

# 의존성 설치
RUN pnpm install --frozen-lockfile

# 소스 코드 복사
COPY . .

# 프로덕션 빌드
RUN pnpm build

# ============================================
# Stage 2: 실행
# ============================================
FROM nginx:1.27-alpine

# 빌드 결과물(dist/)만 복사
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA 라우팅 설정 (Docker Compose 사용 시 외부 nginx.conf로 덮어씌워짐)
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location /api { \
        return 404; \
    } \
}' > /etc/nginx/conf.d/default.conf

# 헬스 체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
