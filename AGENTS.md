# AGENT Rules

## Purpose

- This file is for AI coding agents working in this repository.
- Keep guidance minimal, repo-accurate, and implementation-focused.
- Use `AGENTS.local.md` for private notes or session-specific instructions. Do not commit that file.

## Source of Truth

- Resolve conflicts in this order: source code > `README.md` > `docs/architecture.md` / `docs/api.md` / `docs/data-model.md`.
- Prefer canonical docs under `docs/` over ad-hoc subsystem notes when they match the code and configs.
- Treat `docs/agent/*` as local reference or draft material. It is ignored by Git and is not the source of truth for current behavior.
- Do not introduce links to missing files or empty placeholders as if they were canonical docs.

## Repository Map

- `frontend/`: React 19 + TypeScript app.
  - `src/app/`: app shell, routing, providers
  - `src/features/`: domain features such as `auth`, `todos`, `timer`, `review`, `settings`, `notifications`, `pwa`
  - `src/api/`, `src/ui/`, `src/store/`, `src/mocks/`, `src/styles/`, `src/test/`
- `backend/`: Spring Boot API.
  - `auth`, `todo`, `timer`, `session`, `review`, `settings`, `common`, `config`
  - Flyway migrations: `src/main/resources/db/migration`
- `infra/`: deployment and runtime configuration.
  - `dev/`, `prod/`: Docker Compose, host nginx, Alloy config
  - GitHub Actions deploy frontend to S3 + CloudFront and backend to EC2 + ECR
- `docs/`: portfolio-facing and implementation docs.
  - `architecture.md`, `api.md`, `data-model.md`, `study/`
- `load-test/`: k6 load test assets

## Commands

- Run from `frontend/`:
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
  - `pnpm dev`
  - `pnpm dev:mock`
- Run from `backend/`:
  - `./gradlew test`
  - `./gradlew bootRun --args='--spring.profiles.active=local'`

## Coding Rules

- Frontend uses TypeScript, React, and Tailwind CSS.
- Use 2-space indentation, single quotes, and no semicolons unless the file clearly uses a different style.
- Component files use PascalCase. Hooks use `useX`. Utilities use camelCase.
- Place tests next to source files with `*.test.ts` or `*.test.tsx`.
- Treat `README.md` as a portfolio document. Keep engineering detail in canonical docs under `docs/` or detailed logs, not in the root README.
- When docs drift from code, prefer fixing the code-aligned canonical docs rather than expanding ignored local drafts.
