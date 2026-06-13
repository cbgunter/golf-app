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

## Epic: Rebrand to Electric Phactory Visual Identity

Apply the EP branding guidelines (`electric-phactory-branding-guidelines.md`) to the public site. The goal is warm, confident, unmistakably Philly — not country club, not generic SaaS.

### 1. Fonts
- Load **Outfit** (headings) and **DM Sans** (body) from Google Fonts in `index.html`
- Update Tailwind config: set `fontFamily.sans` → DM Sans, add `fontFamily.heading` → Outfit
- Replace all `font-*` classes that use the current default with the new font family classes

### 2. Color palette
Replace the current `sage` / `sand` / `stone` custom palette in `tailwind.config.js` with the EP palette:

| Token | Name | Hex |
|---|---|---|
| `ep-cream` | Warm Cream | `#F5F0E8` |
| `ep-green` | Midnight Green | `#004C54` |
| `ep-orange` | Phactory Orange | `#D4691C` |
| `ep-deep` | Deep Green | `#002B30` |
| `ep-silver` | Stadium Silver | `#B8B5AF` |
| `ep-sand` | Sand | `#EDE6DA` |

- Update `index.css` shared utility classes (`btn-primary`, `btn-secondary`, `btn-gold`, `card`, `badge-*`, `label`, `input`, `page-header`, `section-title`) to use new tokens
- Replace inline Tailwind color classes across all public pages and components

### 3. Page background and surfaces
- Set default page background to `ep-cream` (`#F5F0E8`) — no pure white
- Cards → `ep-sand` background
- Dark sections (footer, overlays) → `ep-deep`

### 4. Typography scale
- Hero headlines: Outfit ExtraBold (800), 36–48px, letter-spacing −0.035em
- Section headings: Outfit ExtraBold (800), 26–32px, letter-spacing −0.03em
- Subheads: Outfit 600–700, 18–22px
- Body: DM Sans 400, 16px, line-height 1.7
- Labels/tags: Outfit 600, 12–13px, uppercase, wide letter-spacing
- Captions/meta: DM Sans 400, 13–14px, `ep-silver` color

### 5. Buttons and CTAs
- Primary CTA → `ep-orange` background, `ep-cream` text (replaces current `btn-primary`)
- Secondary → `ep-green` background, `ep-cream` text
- Danger/outline → `ep-green` border, `ep-green` text
- Remove `btn-gold` or remap to orange

### 6. Nav and footer
- Sticky nav: frosted-glass `ep-cream` background, EP wordmark left (placeholder text until logo asset exists), minimal links right
- Footer: `ep-deep` background, `ep-cream` wordmark text, `ep-orange` links

### 7. Status and data colors
- Existing color-coded score cells (eagle/birdie/par) and `StatusBadge` values need mapping to the warm palette — desaturate greens/reds into the EP color family per the "no additional colors" rule

### 8. Mobile audit
- Walk all public pages at 375px width after rebrand; fix any layout regressions
- Score entry and PIN flow (`/score`, `/score/:pin`) are already full-screen mobile — verify they still feel cohesive with new palette

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
