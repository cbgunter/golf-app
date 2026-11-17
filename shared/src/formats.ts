// Pure scoring-format engine shared by backend, public site, and admin site.
// No imports — the backend bundles this file directly via a relative import.

export type RoundFormat = 'stroke_play' | 'stableford' | 'best_ball';
export type StandingsMode = 'cumulative' | 'points';

export interface RoundTeam {
  name?: string;
  playerIds: string[];
}

export const ROUND_FORMAT_LABELS: Record<RoundFormat, string> = {
  stroke_play: 'Stroke Play',
  stableford: 'Stableford',
  best_ball: 'Two-Man Best Ball',
};

export const ROUND_FORMAT_DESCRIPTIONS: Record<RoundFormat, string> = {
  stroke_play: 'Lowest total score wins.',
  stableford: 'Points per hole vs par: bogey 1, par 2, birdie 3, eagle 4, albatross 5. Highest total wins.',
  best_ball: 'Teams of two: the better score on each hole counts for the team. Lowest team total wins.',
};

// ── Minimal shapes (structurally compatible with the API types) ──────────────

export interface FormatHoleScore {
  hole: number;
  par: number;
  strokes: number;
  netStrokes: number;
}

export interface FormatScore {
  playerId: string;
  playerName: string;
  grossTotal: number;
  netTotal: number;
  holeScores: FormatHoleScore[];
}

export interface FormatRound {
  id: string;
  date: string;
  par: number;
  isPracticeRound?: boolean;
  format?: RoundFormat;
  teams?: RoundTeam[];
  pointsMultiplier?: number;
}

export interface RoundStanding {
  key: string;
  label: string;
  playerIds: string[];
  /** Strokes (stroke play / best ball) or points (stableford). */
  value: number;
  /** Relative to par for the holes played (stroke formats only). */
  toPar?: number;
  holesPlayed: number;
  rank: number;
  tied: boolean;
}

export interface RoundResult {
  format: RoundFormat;
  lowerIsBetter: boolean;
  unit: 'strokes' | 'points';
  isTeam: boolean;
  standings: RoundStanding[];
  /** Set when the format could not be applied as configured (e.g. best ball without teams). */
  warning?: string;
  /** Cup points earned per player for this round (multiplier applied). */
  pointsByPlayer: Record<string, number>;
}

export interface CupStandingsEntry {
  playerId: string;
  playerName: string;
  total: number;
  byRound: Record<string, number | undefined>;
  rank: number;
  tied: boolean;
  roundsPlayed: number;
  netTotal: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function roundFormat(round: { format?: RoundFormat }): RoundFormat {
  return round.format ?? 'stroke_play';
}

/**
 * Display label for a tournament, derived from its rounds (Tournament has no format of its own —
 * each round has one). Practice rounds are ignored. Returns null when there are no rounds yet.
 *   one format              → "Stableford"
 *   mixed, cumulative       → "Mixed formats"
 *   cup points              → "Cup · Stroke Play" / "Cup · 3 formats"
 */
export function tournamentFormatLabel(
  rounds: { format?: RoundFormat; isPracticeRound?: boolean }[],
  standingsMode?: 'cumulative' | 'points',
): string | null {
  const counted = rounds.filter(r => !r.isPracticeRound);
  if (counted.length === 0) return null;
  const formats = [...new Set(counted.map(roundFormat))];
  const base = formats.length === 1 ? ROUND_FORMAT_LABELS[formats[0]] : `${formats.length} formats`;
  if (standingsMode === 'points') return `Cup · ${base}`;
  return formats.length === 1 ? base : 'Mixed formats';
}

/** Stableford points for one hole: 2 for par, +1 per stroke under, −1 per stroke over, floored at 0. */
export function stablefordPoints(strokes: number, par: number): number {
  return Math.max(0, 2 + par - strokes);
}

export function stablefordTotal(score: FormatScore, useNet: boolean): number {
  return score.holeScores.reduce(
    (s, h) => s + stablefordPoints(useNet ? h.netStrokes : h.strokes, h.par),
    0
  );
}

/** Default cup points: N for 1st down to 1 for last. */
export function defaultPointsTable(playerCount: number): number[] {
  return Array.from({ length: playerCount }, (_, i) => playerCount - i);
}

/**
 * Pair players for a two-man best ball from current standings:
 * 1st with last, 2nd with second-to-last, … (4 players → 1&4 vs 2&3).
 */
export function teamsFromStandings(orderedPlayerIds: string[]): RoundTeam[] {
  const ids = [...orderedPlayerIds];
  const teams: RoundTeam[] = [];
  while (ids.length >= 2) {
    const first = ids.shift()!;
    const last = ids.pop()!;
    teams.push({ playerIds: [first, last] });
  }
  if (ids.length === 1) teams.push({ playerIds: [ids[0]] });
  return teams;
}

function rankRows<T extends { value: number }>(rows: T[], lowerIsBetter: boolean): (T & { rank: number; tied: boolean })[] {
  const sorted = [...rows].sort((a, b) => (lowerIsBetter ? a.value - b.value : b.value - a.value));
  return sorted.map(row => ({
    ...row,
    rank: sorted.findIndex(r => r.value === row.value) + 1,
    tied: sorted.filter(r => r.value === row.value).length > 1,
  }));
}

/**
 * Convert ordered groups of tied players into points. Each group occupies as many
 * finishing positions as it has players; tied players split those positions' points.
 */
function placementPoints(groups: string[][], table: number[], multiplier: number): Record<string, number> {
  const out: Record<string, number> = {};
  let pos = 0;
  for (const group of groups) {
    const span = table.slice(pos, pos + group.length);
    while (span.length < group.length) span.push(0);
    const each = span.reduce((s, p) => s + p, 0) / group.length;
    for (const pid of group) out[pid] = Math.round(each * multiplier * 100) / 100;
    pos += group.length;
  }
  return out;
}

// ── Per-round results ───────────────────────────────────────────────────────

export function computeRoundResult(
  round: FormatRound,
  scores: FormatScore[],
  opts: { useNet: boolean; pointsTable?: number[] }
): RoundResult {
  let format = roundFormat(round);
  let warning: string | undefined;
  const scoreByPlayer = new Map(scores.map(s => [s.playerId, s]));

  const teams = (round.teams ?? []).filter(t => t.playerIds.length > 0);
  if (format === 'best_ball' && teams.length === 0) {
    warning = 'No teams set for this best-ball round — showing individual stroke play.';
    format = 'stroke_play';
  }

  const lowerIsBetter = format !== 'stableford';
  const unit: RoundResult['unit'] = format === 'stableford' ? 'points' : 'strokes';
  let standings: RoundStanding[];
  let groups: string[][];

  if (format === 'best_ball') {
    const teamRows = teams
      .map((team, i) => {
        const members = team.playerIds.map(pid => scoreByPlayer.get(pid)).filter(Boolean) as FormatScore[];
        const holeNumbers = new Set(members.flatMap(m => m.holeScores.map(h => h.hole)));
        let value = 0;
        let parPlayed = 0;
        for (const hole of holeNumbers) {
          const entries = members
            .map(m => m.holeScores.find(h => h.hole === hole))
            .filter(Boolean) as FormatHoleScore[];
          value += Math.min(...entries.map(h => (opts.useNet ? h.netStrokes : h.strokes)));
          parPlayed += entries[0].par;
        }
        const names = team.playerIds.map(pid => scoreByPlayer.get(pid)?.playerName ?? '?');
        return {
          key: `team-${i}`,
          label: team.name || names.join(' & '),
          playerIds: team.playerIds,
          value,
          toPar: value - parPlayed,
          holesPlayed: holeNumbers.size,
        };
      })
      .filter(t => t.holesPlayed > 0);
    standings = rankRows(teamRows, true);
    groups = groupByRank(standings).map(g => g.flatMap(t => t.playerIds));
  } else {
    const rows = scores.map(s => {
      const value =
        format === 'stableford' ? stablefordTotal(s, opts.useNet) : opts.useNet ? s.netTotal : s.grossTotal;
      const parPlayed = s.holeScores.reduce((sum, h) => sum + h.par, 0);
      return {
        key: s.playerId,
        label: s.playerName,
        playerIds: [s.playerId],
        value,
        toPar: format === 'stableford' ? undefined : value - parPlayed,
        holesPlayed: s.holeScores.length,
      };
    });
    standings = rankRows(rows, lowerIsBetter);
    groups = groupByRank(standings).map(g => g.flatMap(r => r.playerIds));
  }

  const rankedPlayerCount = groups.reduce((s, g) => s + g.length, 0);
  const table = opts.pointsTable?.length ? opts.pointsTable : defaultPointsTable(rankedPlayerCount);
  const pointsByPlayer = placementPoints(groups, table, round.pointsMultiplier ?? 1);

  return { format, lowerIsBetter, unit, isTeam: format === 'best_ball', standings, warning, pointsByPlayer };
}

function groupByRank<T extends { rank: number }>(rows: T[]): T[][] {
  const groups: T[][] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last[0].rank === row.rank) last.push(row);
    else groups.push([row]);
  }
  return groups;
}

// ── Cup (points) standings across rounds ────────────────────────────────────

/**
 * Sum per-round placement points. Rounds should be pre-filtered by the caller
 * (e.g. exclude practice rounds; completed-only for final results).
 * Tiebreak: more points in the latest round, then lower cumulative net.
 */
export function computeCupStandings(
  rounds: FormatRound[],
  scoresByRound: Record<string, FormatScore[]>,
  opts: { useNet: boolean; pointsTable?: number[]; excludePlayerIds?: Set<string> }
): CupStandingsEntry[] {
  const ordered = [...rounds].sort((a, b) => a.date.localeCompare(b.date));
  const entries = new Map<string, CupStandingsEntry>();
  const exclude = opts.excludePlayerIds ?? new Set<string>();

  for (const round of ordered) {
    const scores = (scoresByRound[round.id] ?? []).filter(s => !exclude.has(s.playerId));
    if (scores.length === 0) continue;
    const result = computeRoundResult(round, scores, opts);
    for (const s of scores) {
      let e = entries.get(s.playerId);
      if (!e) {
        e = { playerId: s.playerId, playerName: s.playerName, total: 0, byRound: {}, rank: 0, tied: false, roundsPlayed: 0, netTotal: 0 };
        entries.set(s.playerId, e);
      }
      const pts = result.pointsByPlayer[s.playerId] ?? 0;
      e.byRound[round.id] = pts;
      e.total = Math.round((e.total + pts) * 100) / 100;
      e.roundsPlayed += 1;
      e.netTotal += opts.useNet ? s.netTotal : s.grossTotal;
    }
  }

  const scoredRoundIds = ordered.filter(r => (scoresByRound[r.id] ?? []).length > 0).map(r => r.id).reverse();
  const cmp = (a: CupStandingsEntry, b: CupStandingsEntry) => {
    if (b.total !== a.total) return b.total - a.total;
    for (const rid of scoredRoundIds) {
      const diff = (b.byRound[rid] ?? 0) - (a.byRound[rid] ?? 0);
      if (diff !== 0) return diff;
    }
    return a.netTotal - b.netTotal;
  };
  const list = [...entries.values()].sort(cmp);
  for (const e of list) {
    e.rank = list.findIndex(o => cmp(o, e) === 0) + 1;
    e.tied = list.filter(o => cmp(o, e) === 0).length > 1;
  }
  return list;
}

export function formatPoints(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}
