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

### Auto-updating CLAUDE.md
A Claude Code `PostToolUse` hook fires after every `Bash` or `PowerShell` `git commit`. Two scripts handle each shell: `.claude/hooks/update-claude-md-reminder.sh` (Bash) and `.claude/hooks/update-claude-md-reminder.ps1` (PowerShell). Both output a reminder to review and update CLAUDE.md. Commits whose message contains `[skip claude-md]` are ignored to prevent loops.

## Architecture

### Deployment
Three-stage CI/CD pipeline (`.github/workflows/deploy.yml`) triggered on push to master:
1. **Infrastructure** — CDK deploys/updates AWS resources, outputs S3 bucket + CloudFront distribution ID
2. **Backend** — builds `dist/index.js`, zips it, calls `aws lambda update-function-code`
3. **Frontend** — Vite build, sync to S3, CloudFront invalidation

Custom domain `golf.caseyhunter.net` → CloudFront → routes `/api/*` to API Gateway HTTP API → single Lambda, and `/*` to S3 static assets.

CloudFront `errorResponses` maps only **403 → 200/index.html** for SPA deep links. S3 with OAC returns 403 (not 404) for missing objects. There is intentionally **no 404 rule** — it would intercept API Gateway JSON error bodies from the `/api/*` behavior and replace them with HTML.

### Backend: single Lambda, manual routing
`backend/src/index.ts` is the entire API. It splits `rawPath` into `segments[]` and pattern-matches on `[method, segments[0], segments[1], segments[2]]`. There is no framework — adding a new endpoint means adding an `if` branch to the router.

Route ordering matters: more-specific paths (`segments[2] === 'profile'`, `segments[2] === 'rounds'`) must come before catch-alls (`segments[1]` truthy). The `POST /tournaments` vs `POST /tournaments/:id/rounds` ambiguity is resolved with a `&& !segments[1]` guard.

Admin-only routes are wrapped in `adminOnly(() => handler())` which short-circuits with 401 if the JWT is absent or invalid.

### Backend: handlers + DynamoDB
Six tables (all PAY_PER_REQUEST, RemovalPolicy RETAIN):
- `golf-players` — `handicapIndex` + `handicapHistory[]` stored inline; updated on every score submission
- `golf-tournaments` — stores `playerIds[]`, `roundIds[]`, `payoutStructure[]`, `closestToPinFee?`, `longestDriveFee?`
- `golf-rounds` — stores `teeTimeGroups[]`, `holes[]`, `closestToPinWinnerId?`, `longestDriveWinnerId?` inline
- `golf-scores` — GSIs on both `roundId` and `playerId`; includes `holeScores[]`, `adjustments[]`, `handicapDifferential`
- `golf-courses` — cached GHIN course data (not cleared with other data resets)
- `golf-draft-scorecards` — GSIs on `pin` and `roundId`; stores group scorecards during PIN-based entry; status lifecycle: `draft` → `submitted` → `confirmed`. ID is `${roundId}#${groupNumber}`. PIN lookup uses `getItem` by this ID (not the `pin-index` GSI) so stale PINs from previous tournaments don't block new ones.

`updateRound` spreads the request body onto the existing record, so any field sent is automatically persisted — no explicit field handling needed for new round properties.

`scanTable` and `queryIndex` both paginate via `LastEvaluatedKey` loop to handle tables larger than one DynamoDB page.

Submitting the first score auto-transitions a round from `scheduled` → `in_progress`. Completing the last round auto-transitions the tournament to `completed`. Reopening a completed round sets it back to `in_progress` and reopens the tournament if it was `completed`.

Score submission is idempotent: re-submitting for the same player+round reuses the existing score's `id` and `createdAt`, so DynamoDB `putItem` overwrites rather than appending. The old score is excluded when recalculating the handicap differential list to avoid double-counting.

Deleting a tournament cascades: queries all rounds by `tournamentId`, then all scores by `roundId`, deletes scores → rounds → tournament.

### GHIN integration
`backend/src/handlers/courses.ts` uses `@spicygolf/ghin` (USGA GHIN API) for course search and hole data. The client is cached as a module-level variable and reset to `null` on auth failure to force re-initialization. Credentials come from SSM SecureStrings (`/golf-app/ghin-username`, `/golf-app/ghin-password`). The Lambda IAM role has explicit `ssm:GetParameter` and `kms:Decrypt` permissions for these paths.

GHIN response shape for holes: `TeeSets[].Holes[{ Number, Par, Allocation (stroke index), Length }]`.

### Handicap system
`backend/src/lib/handicap.ts` implements USGA World Handicap System:
- `calcDifferential` — `(adjustedGross − courseRating) × 113 / slope`, rounded to 1 decimal
- `calcHandicapIndex` — uses best N differentials from last 20 rounds (count-based table: 1 round → lowest 1 with −2 adj, up to 20+ → best 8 of last 20 × 0.96)
- `calcCourseHandicap` — `handicapIndex × (slope / 113) + (courseRating − par)`, rounded
- `applyESC` — per-hole stroke cap by course handicap bracket (≤9 → double bogey, 10–19 → 7, 20–29 → 8, 30–39 → 9, 40+ → 10)
- `computeHoleScores` — applies handicap strokes hole-by-hole by stroke index

Player `handicapIndex` defaults to `0.0` at creation if not supplied. It is automatically recalculated and overwritten after every scored round. The starting value is not separately stored; the `handicapHistory[]` array shows the progression from round 1 onward.

### Side contests (CTP / LD)
Tournaments have `hasClosestToPin` / `hasLongestDrive` boolean flags and optional `closestToPinFee` / `longestDriveFee` per-player ante amounts. The hole for each contest is set per-round (`closestToPinHole`, `longestDriveHole`). Winners are selected on the RoundScoring admin page via dropdowns that **auto-save immediately on change** (calls `roundsApi.update` directly; no need to complete the round first). `closestToPinWinnerId` / `longestDriveWinnerId` are stored on the round. Prize pots (`fee × playerCount`) are shown on the public tournament view and results page.

### Tee time groups
Rounds store `startFormat?: 'sequential' | 'shotgun'` and `teeTimeGroups?: TeeTimeGroup[]` inline. Groups are managed from the TournamentSetup admin page (accordion panel per round). Each group has `groupNumber`, `teeTime` (display string e.g. "8:00 AM"), `playerIds[]`, optional `startingHole` for shotgun starts, and a `pin?: string` (4-digit, auto-generated on save). The public tournament view shows the tee sheet above the scores table when groups exist.

### PIN-based group scoring
Public mobile scoring flow: `/score` (ScoreHub) → player enters 4-digit PIN → `/score/:pin` (ScoreEntry) for hole-by-hole entry. `/tournament/:id/score` is a tournament-scoped alias for ScoreHub.

Backend flow: `GET /score/rounds` lists active rounds with group PINs → `GET /score/lookup?pin=XXXX` resolves PIN to round+group+players+draft → `PUT /score/draft` saves one hole at a time → `POST /score/submit` validates all holes are present for every group player and marks draft `submitted` → admin confirms via `POST /rounds/:id/drafts/:group/confirm` which calls `submitScore` for each player and marks draft `confirmed`.

`confirmDraft` is idempotent: a `confirmed` draft returns immediately without re-running score or handicap calculations.

`ScoreEntry.tsx` persists hole scores to localStorage (`golf_draft_${pin}`) as an offline fallback; server draft and local draft are merged on load (local takes precedence). Both `ScoreHub` and `ScoreEntry` are rendered outside the `Layout` wrapper — they are full-screen mobile pages with their own sticky header.

Draft status lifecycle gates the mobile UI: `draft`/`submitted` → entry/review allowed; `confirmed` → shows a locked "Scores Confirmed" screen, no further edits possible.

`ScoreHub` fetches confirmed scores (`GET /rounds/:id/scores`) for each active round in parallel. Groups where all players have confirmed scores replace the PIN button with a compact Out/In/Tot scorecard. `ScoreEntry` shows a running Out/In/Tot summary table (per player, above the nav buttons) once any hole has been entered.

After admin manually edits a player's score on the RoundScoring page, the local `drafts` state is patched with the new hole values so the "Scorecard Submissions" table reflects the correction immediately (without a full reload).

### Frontend: routing and pages
Public routes (no auth):
- `/` — active/upcoming tournaments
- `/history` — completed and archived tournaments
- `/tournament/:id` — live tournament view with leaderboard, tee sheet, and round scores
- `/tournament/:id/results` — final results with payouts
- `/players` — alphabetical player list
- `/players/:id` — player profile: handicap trend chart, stats, round history

Admin routes (JWT required, stored in `localStorage` as `golf_admin_token`):
- `/admin` — dashboard with stat cards linking to filtered tournament lists
- `/admin/tournaments` — tournament list with status filter tabs
- `/admin/tournaments/:id` — tournament setup (Details / Players / Rounds tabs)
- `/admin/rounds/:id/scoring` — horizontal scorecard entry + live leaderboard
- `/admin/players` — global player roster (full CRUD + handicap history)

`AdminLayout` wraps all admin pages and verifies the JWT on mount. `Layout` wraps public pages.

### Frontend: API client
`frontend/src/api/client.ts` is the single source of truth for all types and API calls. Types here must stay in sync with `backend/src/types/index.ts`. Key exported types: `Player`, `Tournament`, `Round`, `Score`, `Course`, `TournamentResults`, `PlayerProfile`.

### Frontend: key utilities
- `frontend/src/lib/dates.ts` — `parseLocalDate(dateStr)` parses `YYYY-MM-DD` as local midnight (not UTC) to prevent off-by-one-day display bugs. Use this everywhere dates are displayed.
- `frontend/src/components/ErrorBoundary.tsx` — class component wrapping the entire app; shows a reload prompt on render errors.
- `frontend/src/components/StatusBadge.tsx` — colored badge for tournament/round status values.

### Player profile endpoint
`GET /players/:id/profile` (public) returns `{ player, roundScores[] }`. It batch-fetches all scores via `player-index` GSI, then batch-fetches the associated rounds and tournaments via `Promise.all` to enrich each score with `courseName`, `tournamentName`, `date`, and `par`. The frontend renders a handicap trend SVG chart (inline, no chart library), a round history table, and a section showing upcoming/active tournaments the player is enrolled in (fetched client-side from `tournamentsApi.list()`).

### Public tournament view
`frontend/src/pages/TournamentView.tsx` live leaderboard shows:
- Rank movement indicators (▲/▼/—) by comparing cumulative totals with vs without the most recent scored round
- Strokes-back column ("Leader" / "+N") hidden on small screens
- "After X of Y rounds" subtitle based on how many rounds have scores

Round cards (expanded view):
- CTP/LD hole number and winner name surface in the **collapsed** card header, not just when expanded
- Each player row is clickable — expands an inline hole-by-hole scorecard (`HoleScorecard` component at bottom of file) with eagle/birdie/par color coding
- Player name links to their profile page; HCP index change (e.g. `→ 14.2 (-0.8)`) shown inline next to the name for completed rounds
- The `HoleScorecard` component is a local function at the bottom of `TournamentView.tsx` (no separate file)

### Score entry UI
`frontend/src/pages/admin/RoundScoring.tsx` renders a horizontal golf scorecard: holes 1–9 across the top, OUT subtotal, holes 10–18, IN subtotal, TOT. Par and HCP (stroke index) rows are read-only when course data was loaded from GHIN, editable otherwise. Score cells are color-coded by +/- par (yellow = eagle+, red = birdie, green = par). The sticky left column keeps row labels visible while scrolling on small screens.

The score summary bar below the scorecard shows **Out · In · Gross · to-par** in real time as holes are filled in.

The player picker reorganizes into tee time groups when `round.teeTimeGroups` is populated — shows group header (time + hole for shotgun) with players listed under each. Attempting to complete a round with missing scores shows a `window.confirm` listing how many players are unscored.

The "Scorecard Submissions" panel (shown when drafts exist) displays submitted group scorecards with Out/In/Tot columns. When admin manually edits a player's score, the panel updates immediately via local state patch rather than waiting for a server refetch.

### Tournament setup: inline player creation + guidance
The Players tab in `TournamentSetup.tsx` allows creating new players inline without navigating away. Players is demoted to a secondary "All Players" link in the admin sidebar (below a divider), not a primary nav item.

A contextual next-steps banner appears below the tab bar (for non-completed tournaments) guiding the admin through: add players → add rounds → enter scores → mark completed. The banner is computed from `selectedPlayerIds`, `rounds`, and round statuses — no server call needed.

### Styling conventions
Tailwind CSS with a custom palette: `sage` (greens), `sand` (gold/tan), `stone` (neutrals). Shared utility classes (`btn-primary`, `btn-secondary`, `btn-gold`, `card`, `badge-*`, `label`, `input`, `page-header`, `section-title`) are defined in `frontend/src/index.css`. Use these rather than raw Tailwind for consistency.
