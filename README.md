# FlowMate

Todo를 적는 순간부터 집중 세션을 실행하고, 타이머 기록을 회고까지 이어가는 생산성 웹 앱입니다.

할 일 관리와 집중 기록이 서로 분리될 때 생기는 전환을 줄이고, 하루와 주간 단위의 작업 흐름 그리고 회고까지 하나의 서비스 안에서 이어가는 데 초점을 맞췄습니다.

- [Live Demo](https://flowmate.io.kr): 실제 서비스 바로가기
- [Architecture](docs/architecture.md): 시스템 구조, 인증 흐름, SSE 동기화, 배포 구조
- [Data Model](docs/data-model.md): 핵심 엔터티, 관계, 물리 모델, 설계 근거
- [API Docs](docs/api.md): 인증, Todo, 타이머, 설정, 회고 API 계약

## 1. 프로젝트 배경

개인적으로 Todo 관리는 `TodoMate`, 집중 시간 관리는 `Flow`를 함께 사용해왔습니다.

하지만 두 앱을 번갈아 쓰다 보니 컨텍스트가 자주 끊기고, “할 일”과 “집중 기록”이 분리되는 점이 불편했습니다.

- `TodoMate`는 태스크 관리가 직관적이지만 뽀모도로 타이머가 없다.
- `Flow`는 집중 시간 측정에는 좋지만 태스크 기반 기록이 약하다.

FlowMate는 Todo를 중심으로 태스크와 집중 세션을 한 흐름에서 기록하고, 그 결과를 캘린더와 회고로 되돌아볼 수 있게 설계하였습니다.

## 2. 주요 기능

### 1) Todo와 집중 세션 연결

- 할 일을 작성한 뒤 바로 타이머를 시작할 수 있습니다.
- 완료한 세션 기록은 Todo와 연결되어 이후 회고와 통계로 이어집니다.

### 2) 뽀모도로와 스톱워치 지원

- 뽀모도로 모드로 집중, 짧은 휴식, 긴 휴식 사이클을 관리할 수 있습니다.
- 스톱워치 모드로 더 집중 기록도 남기고, 추천 휴식과 자유 휴식을 제공하여 유연하게 사용할 수 있습니다.

### 3) 여러 탭·기기 간 타이머 동기화

- 회원은 서버에 저장된 타이머 상태를 기준으로 여러 탭과 기기에서 이어서 사용할 수 있습니다.
- SSE 기반 동기화로 같은 계정의 연결에 최신 타이머 상태를 전파합니다.

### 4) 주간·월간 회고와 통계

- 집중 시간 타임라인과 누적 통계를 확인할 수 있습니다.
- 주간·월간 단위 회고를 작성하며 작업 흐름을 돌아볼 수 있습니다.

## 3. 주요 기술 결정 (추가 예정)

### 1) 제목

- 문제:
- 해결:
- 결과:
- 관련 문서:

## 4. 기술 스택

| 영역         | 기술                                                                       |
|------------|--------------------------------------------------------------------------|
| Frontend   | React 19, TypeScript, Zustand, TanStack Query, Tailwind CSS 4, Vite, PWA |
| Backend    | Spring Boot 4, Java 21, Spring Security, JPA, Flyway, MySQL 8            |
| Infra      | EC2, Docker Compose, Host Nginx, S3, CloudFront, ECR, GitHub Actions     |
| Monitoring | Grafana Cloud, Alloy, Mimir, Loki, Tempo                                 |

## 5. 프로젝트 구조

```txt
FlowMate/
├── frontend/           # React 앱 (Vite + TypeScript)
├── backend/            # Spring Boot API
├── infra/              # dev/prod 인프라 구성 (Docker Compose, Host Nginx, Alloy)
├── docs/               # 기준 문서 세트 (architecture, data-model, api)
├── images/             # 로고 및 README 이미지 자산
└── .github/workflows/  # 프론트/백엔드 배포 파이프라인
```
