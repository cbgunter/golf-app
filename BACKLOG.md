# Golf App Backlog

## Epic: Separate Admin and Public Sites

Split the single-SPA into two independently deployed frontends — a public site and an admin site — sharing one backend Lambda.

### 1. Extract shared workspace
- Create `shared/` npm workspace with `package.json` and `tsconfig.json`
- Move `frontend/src/api/client.ts` (types + API functions) into `shared/src/`
- Update root `package.json` workspaces array to include `shared`
- Add `shared` as a dependency in both `frontend/` and the new `admin/` workspace
- Run `npm install` at root to wire up symlinks

### 2. Create admin workspace
- Scaffold `admin/` as a new Vite + React + TypeScript app (mirror `frontend/` config)
- Copy Tailwind config, `index.css` utility classes, and shared components (e.g. `StatusBadge`, `ErrorBoundary`) into `admin/`
- Move all admin pages (`/admin/*`) and `AdminLayout` from `frontend/` into `admin/`
- Update imports to pull types/API from `shared`
- Remove admin routes and `AdminLayout` from `frontend/`
- Add `admin/` build command to root `package.json` scripts

### 3. Update infrastructure (CDK)
- Add second S3 bucket: `golf-admin-assets`
- Add second CloudFront distribution for admin site
  - Origin: `golf-admin-assets` bucket with OAC
  - `/api/*` behavior → same API Gateway HTTP API as public distribution
  - `errorResponses`: 403 → 200/index.html (SPA deep links)
- Add DNS record for admin subdomain (e.g. `admin.golf.caseyhunter.net`) pointing to new distribution
- (Optional) Attach WAF rule or geo/IP restriction to admin distribution
- Outputs: admin S3 bucket name + admin CloudFront distribution ID

### 4. Update CI/CD pipeline
- Add `admin-deploy` job to `.github/workflows/deploy.yml` (runs after `infrastructure` job)
  - Build: `cd admin && npm run build`
  - Deploy: sync `admin/dist` to `golf-admin-assets` S3 bucket
  - Invalidate admin CloudFront distribution
- Keep existing `frontend-deploy` job unchanged (public site only)

### 5. Cleanup
- Delete orphaned admin files from `frontend/src/pages/admin/` and `frontend/src/components/AdminLayout.tsx`
- Remove admin-only imports from `frontend/src/App.tsx` route tree
- Verify public site build has no references to admin routes
- Update `CLAUDE.md` to document the new workspace layout

---

## Epic: Admin — Next-Action-Focused Event Management

Redesign the admin event experience around a single guiding principle: **always surface the one thing that needs to happen next.** Rather than a rigid wizard or tab layout, the event page computes its current state and leads with a prominent action card telling the admin exactly what to do. Secondary details (rounds, players, game types) are accessible but not the focus.

### Event states and their next actions

| State | Condition | Primary CTA shown |
|---|---|---|
| **Incomplete** | No rounds or no game type defined | "Add rounds & game type" |
| **Needs players** | Rounds + game type exist, no players added | "Add players" |
| **Ready to publish** | Players added, event still in `draft` | "Publish event" |
| **Scoring open** | Published, scores not yet submitted | "Scoring in progress — view tee sheet" |
| **Scores pending confirmation** | One or more groups submitted, not confirmed | "Confirm submitted scorecards" ← urgent |
| **Validate leaderboard** | All scores confirmed, side contests unassigned or unreviewed | "Review leaderboard & assign winners" |
| **Ready to complete** | Leaderboard validated, all side contests assigned | "Mark event complete" |
| **Completed** | Tournament `completed` | Read-only summary + link to public results |

### 1. Next-action card
- Prominent card at the top of the admin event page, always visible
- Shows the current state label, a one-sentence description of what's needed, and the primary CTA button
- If multiple rounds are in different states (e.g. round 1 confirmed, round 2 pending), the card reflects the most urgent unresolved state
- Card is computed client-side from event data already fetched — no extra API call

### 2. Create event form
- Event-level fields: name, date(s), course, format notes
- Add one or more **rounds** inline (each with date, tee format, start time, course/tee set)
- Add one or more **game types** per event (stroke play, Stableford, skins, CTP, longest drive, etc.)
- Saving with rounds and a game type moves state to "Needs players"

### 3. Player management
- Same player picker as current Players tab; supports inline player creation
- Warnings surfaced inline: missing handicap index, no players added
- Adding at least one player moves state to "Ready to publish"

### 4. Publish / un-publish
- "Publish" transitions `draft` → `scheduled`; event becomes visible publicly and PINs activate
- Un-publish allowed until any scores exist; guarded with a confirm dialog after scores exist

### 5. Score confirmation panel
- Surfaces automatically when any groups have submitted scorecards (state: "Scores pending confirmation")
- Shows each group with Out/In/Tot per player; bulk-confirm button per group
- Unscored players called out by name; manual score entry shortcut from this panel
- All groups confirmed moves state to "Validate leaderboard"

### 6. Leaderboard validation
- Read-only standings + projected payouts
- CTP and LD winner dropdowns must be set (if those game types are active) before "Mark complete" unlocks
- "Recalculate" button if manual edits were made after confirmation

### 7. Mark complete
- Single button; transitions to `completed`
- Results page goes live; admin sees a read-only summary with a public results link

---

## Epic: Public — Single Aggregated Leaderboard with Live Payouts

Replace the per-round breakdown on the public tournament view with one unified leaderboard that aggregates all rounds, updates as scores are confirmed, and shows live payout calculations.

### 1. Single leaderboard component
- Aggregate all confirmed scores across rounds into one ranked table
- Columns: Rank, Player, Handicap Index, Round scores (one column per round, "--" if not yet played/confirmed), Total (gross + net where applicable), To Par
- Rank is computed from the active game type(s) — stroke play net by default
- Rank movement indicators (▲/▼/—) compare current standings to standings before the most recently confirmed round

### 2. Live payout display
- Payout structure (already stored on the tournament) applied to current standings in real time
- Payouts shown as a column on the leaderboard or as a callout panel alongside it
- Updates automatically as each group's scores are confirmed by admin — no page reload required (poll or optimistic update)
- CTP and LD side contest pots shown separately with winner name once assigned
- If tournament is not yet complete, payouts are labeled "Projected" to set expectations

### 3. Multi-game-type support (future-ready)
- If an event has more than one game type (e.g. stroke play + skins), leaderboard has a toggle or tab to switch between them
- Payouts displayed are scoped to the selected game type

### 4. Remove per-round leaderboard from public view
- Remove the current round-by-round score cards that serve as the de facto leaderboard
- Individual round score details (hole-by-hole) remain accessible via player row expansion
- Tee sheet (tee time groups) stays visible above the leaderboard

---

<!-- Add items below -->

---

## Completed

### Epic: Rebrand to Electric Phactory Visual Identity
EP color tokens (`ep-cream`, `ep-green`, `ep-orange`, `ep-deep`, `ep-silver`, `ep-sand`) and fonts (`Outfit` heading / `DM Sans` body) applied to all public pages. Shared utility classes in `index.css` updated. Admin pages retain legacy `sage`/`stone`/`sand` tokens (out of scope).
