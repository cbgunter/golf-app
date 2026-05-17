# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend
```bash
cd backend
npm run build       # tsc + esbuild bundle → dist/index.js
npm run typecheck   # type-check without emitting
npm run dev         # local dev server (ts-node src/local.ts) on :3001
```

### Frontend
```bash
cd frontend
npm run dev         # Vite dev server on :5173 (proxies /api → :3001)
npm run build       # tsc + vite build
npm run typecheck   # type-check without emitting
```

### Infrastructure
```bash
cd infrastructure
npm run synth   # generate CloudFormation (validates CDK TypeScript)
npm run deploy  # cdk deploy --require-approval never
npm run diff    # preview infrastructure changes
```

### Install all workspaces
```bash
npm run install:all  # from repo root
```

There are no automated tests in any workspace.

## Architecture

### Deployment
Three-stage CI/CD pipeline (`.github/workflows/deploy.yml`) triggered on push to master:
1. **Infrastructure** — CDK deploys/updates AWS resources, outputs S3 bucket + CloudFront distribution ID
2. **Backend** — builds `dist/index.js`, zips it, calls `aws lambda update-function-code`
3. **Frontend** — Vite build, sync to S3, CloudFront invalidation

Custom domain `golf.caseyhunter.net` → CloudFront → routes `/api/*` to API Gateway HTTP API → single Lambda, and `/*` to S3 static assets.

### Backend: single Lambda, manual routing
`backend/src/index.ts` is the entire API. It splits `rawPath` into `segments[]` and pattern-matches on `[method, segments[0], segments[1], segments[2]]`. There is no framework — adding a new endpoint means adding an `if` branch to the router.

Route ordering matters: more-specific conditions (`segments[2] === 'rounds'`) must come before catch-alls (`segments[1]` truthy). The fix for `POST /tournaments` vs `POST /tournaments/:id/rounds` was adding `&& !segments[1]` guard.

Admin-only routes are wrapped in `adminOnly(() => handler())` which short-circuits with 401 if the JWT is absent or invalid.

### Backend: handlers + DynamoDB
Five tables (all PAY_PER_REQUEST, RemovalPolicy RETAIN):
- `golf-players` — handicap history stored inline on the player record
- `golf-tournaments` — stores `playerIds[]` and `roundIds[]` as denormalized arrays
- `golf-rounds` — stores `teeTimeGroups[]` and `holes[]` inline (no separate tables)
- `golf-scores` — GSIs on both `roundId` and `playerId`
- `golf-courses` — cached GHIN course data

`updateRound` spreads the request body onto the existing record, so any field sent is automatically persisted — no explicit field handling needed for new round properties.

Submitting the first score auto-transitions a round from `scheduled` → `in_progress`. Completing the last round in a tournament auto-transitions the tournament to `completed`.

### GHIN integration
`backend/src/handlers/courses.ts` uses `@spicygolf/ghin` (USGA GHIN API) for course search and hole data. The client is cached as a module-level variable and reset to `null` on auth failure to force re-initialization. Credentials come from SSM SecureStrings (`/golf-app/ghin-username`, `/golf-app/ghin-password`). The Lambda IAM role has explicit `ssm:GetParameter` and `kms:Decrypt` permissions for these paths.

GHIN response shape for holes: `TeeSets[].Holes[{ Number, Par, Allocation (stroke index), Length }]`.

### Frontend: API client
`frontend/src/api/client.ts` is the single source of truth for all types and API calls. Types here must stay in sync with `backend/src/types/index.ts`. The `Round` interface includes `holes?`, `startFormat?`, and `teeTimeGroups?` for inline group management.

### Frontend: admin vs public
- Public pages (`/`, `/history`, `/tournament/:id`, `/tournament/:id/results`) require no auth
- Admin pages (`/admin/*`) check JWT stored in `localStorage` under `golf_admin_token`
- `AdminLayout` wraps all admin pages; `Layout` wraps public pages

### Handicap system
`backend/src/lib/handicap.ts` implements USGA World Handicap System: ESC (Equitable Stroke Control), course handicap formula, differential calculation, and handicap index from best differentials. Course handicap = `handicapIndex × (slope / 113) + (courseRating − par)`.

### Styling conventions
Tailwind CSS with a custom palette: `sage` (greens), `sand` (gold/tan), `stone` (neutrals). Shared utility classes (`btn-primary`, `btn-secondary`, `btn-gold`, `card`, `badge-*`, `label`, `input`, `page-header`) are defined in `frontend/src/index.css`. Use these rather than raw Tailwind for consistency.
