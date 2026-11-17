import { getItem, putItem, queryIndex, scanTable } from '../lib/dynamo';
import { ok, error, notFound } from '../lib/response';
import { DraftScorecard, Round, Player, Tournament, TeeTimeGroup } from '../types';
import { submitScore } from './scores';

const D_TABLE = process.env.DRAFT_SCORECARDS_TABLE!;
const R_TABLE = process.env.ROUNDS_TABLE!;
const P_TABLE = process.env.PLAYERS_TABLE!;
const T_TABLE = process.env.TOURNAMENTS_TABLE!;

function draftId(roundId: string, groupNumber: number) {
  return `${roundId}#${groupNumber}`;
}

// Resolve a scorable group: the round must exist, belong to an upcoming/active tournament,
// and contain the requested group.
type ScorableGroup =
  | { err: ReturnType<typeof error> }
  | { err?: undefined; round: Round; group: TeeTimeGroup; tournament: Tournament };

async function findScorableGroup(roundId: string, groupNumber: number): Promise<ScorableGroup> {
  if (!roundId || !Number.isInteger(groupNumber) || groupNumber < 1) {
    return { err: error('roundId and groupNumber are required', 400) }
  }
  const round = await getItem<Round>(R_TABLE, roundId);
  const group = round?.teeTimeGroups?.find(g => g.groupNumber === groupNumber);
  if (!round || !group) return { err: notFound('Group') }
  const tournament = await getItem<Tournament>(T_TABLE, round.tournamentId);
  if (!tournament || (tournament.status !== 'upcoming' && tournament.status !== 'active')) {
    return { err: error('This tournament is not open for scoring', 400) }
  }
  return { round, group, tournament }
}

// GET /score/rounds — active/upcoming rounds with their groups, optionally scoped to one tournament
export async function getActiveRoundsForScoring(tournamentId?: string) {
  const tournaments = await scanTable<Tournament>(T_TABLE);
  let active = tournaments.filter(t => t.status === 'upcoming' || t.status === 'active');
  if (tournamentId) active = active.filter(t => t.id === tournamentId);
  if (active.length === 0) return ok([]);

  const results = await Promise.all(
    active.map(async t => {
      const rounds = await queryIndex<Round>(R_TABLE, 'tournament-index', 'tournamentId', t.id);
      const scorable = rounds
        .filter(r => r.status !== 'completed' && r.teeTimeGroups && r.teeTimeGroups.length > 0)
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
      if (scorable.length === 0) return null;
      return {
        tournamentId: t.id,
        tournamentName: t.name,
        rounds: scorable.map(r => ({
          roundId: r.id,
          courseName: r.courseName,
          date: r.date,
          status: r.status,
          groups: (r.teeTimeGroups ?? []).map(g => ({
            groupNumber: g.groupNumber,
            teeTime: g.teeTime,
            startingHole: g.startingHole,
            playerIds: g.playerIds,
          })),
        })),
      };
    })
  );

  return ok(results.filter(Boolean));
}

// GET /score/group?roundId=…&group=N — round + group + players + current draft
export async function getGroupForScoring(roundId: string, groupNumber: number) {
  const found = await findScorableGroup(roundId, groupNumber);
  if (found.err) return found.err;
  const { round, group, tournament } = found;

  const [players, draft] = await Promise.all([
    Promise.all(group.playerIds.map(pid => getItem<Player>(P_TABLE, pid))),
    getItem<DraftScorecard>(D_TABLE, draftId(round.id, groupNumber)),
  ]);

  return ok({
    roundId: round.id,
    tournamentId: round.tournamentId,
    tournamentName: tournament.name,
    courseName: round.courseName,
    date: round.date,
    par: round.par,
    tee: round.tee,
    courseRating: round.courseRating,
    slopeRating: round.slopeRating,
    holes: round.holes ?? [],
    groupNumber,
    teeTime: group.teeTime,
    startingHole: group.startingHole,
    players: players.filter((p): p is Player => p !== null).map(p => ({
      id: p.id,
      name: p.name,
      handicapIndex: p.handicapIndex,
    })),
    draft: draft ?? null,
  });
}

// PUT /score/draft — save one hole for all players in the group
export async function saveDraftHole(body: {
  roundId: string;
  groupNumber: number;
  holeNumber: number;
  scores: Record<string, number>; // playerId -> strokes
}) {
  const { roundId, groupNumber, holeNumber, scores } = body ?? {};
  if (!holeNumber || !scores) return error('holeNumber and scores are required', 400);

  const found = await findScorableGroup(roundId, Number(groupNumber));
  if (found.err) return found.err;
  const { round, group } = found;

  const id = draftId(round.id, group.groupNumber);
  const existing = await getItem<DraftScorecard>(D_TABLE, id);
  const now = new Date().toISOString();

  if (existing) {
    if (existing.status === 'submitted' || existing.status === 'confirmed') {
      return error('Scorecard already submitted', 400);
    }
    const updatedHoles = { ...existing.holes };
    for (const [playerId, strokes] of Object.entries(scores)) {
      if (!updatedHoles[playerId]) updatedHoles[playerId] = {};
      updatedHoles[playerId][String(holeNumber)] = strokes;
    }
    const updated: DraftScorecard = { ...existing, holes: updatedHoles, updatedAt: now };
    await putItem(D_TABLE, updated);
    return ok(updated);
  }

  const holesData: Record<string, Record<string, number>> = {};
  for (const [playerId, strokes] of Object.entries(scores)) {
    holesData[playerId] = { [String(holeNumber)]: strokes };
  }

  const draft: DraftScorecard = {
    id,
    roundId: round.id,
    tournamentId: round.tournamentId,
    groupNumber: group.groupNumber,
    status: 'draft',
    holes: holesData,
    createdAt: now,
    updatedAt: now,
  };
  await putItem(D_TABLE, draft);
  return ok(draft);
}

// POST /score/submit — validate completeness and mark draft as submitted
export async function submitDraft(body: { roundId: string; groupNumber: number }) {
  const found = await findScorableGroup(body?.roundId, Number(body?.groupNumber));
  if (found.err) return found.err;
  const { round, group } = found;

  const draft = await getItem<DraftScorecard>(D_TABLE, draftId(round.id, group.groupNumber));
  if (!draft) return error('No scores have been saved for this group yet', 404);
  if (draft.status === 'submitted' || draft.status === 'confirmed') return ok(draft); // idempotent

  // Validate all group players have scores for all holes
  const allHoleNums = round.holes?.length
    ? round.holes.map(h => h.number)
    : Array.from({ length: 18 }, (_, i) => i + 1);

  const missing: string[] = [];
  for (const pid of group.playerIds) {
    const playerHoles = draft.holes[pid] ?? {};
    const missingHoles = allHoleNums.filter(n => playerHoles[String(n)] == null);
    if (missingHoles.length > 0) {
      missing.push(`holes ${missingHoles.join(',')} for player ${pid}`);
    }
  }
  if (missing.length > 0) {
    return error(`Incomplete scorecard — missing: ${missing.join('; ')}`, 400);
  }

  const now = new Date().toISOString();
  const updated: DraftScorecard = { ...draft, status: 'submitted', submittedAt: now, updatedAt: now };
  await putItem(D_TABLE, updated);
  return ok(updated);
}

// GET /rounds/:id/drafts — admin: get all drafts for a round
export async function getDraftsForRound(roundId: string) {
  const drafts = await queryIndex<DraftScorecard>(D_TABLE, 'round-index', 'roundId', roundId);
  return ok(drafts);
}

// POST /rounds/:id/drafts/:group/confirm — admin: confirm a group's draft → write real scores
export async function confirmDraft(roundId: string, groupNumber: number, body: {
  // Optional per-player overrides: { playerId: { [hole]: strokes } }
  overrides?: Record<string, Record<string, number>>;
  manualHandicaps?: Record<string, number>; // playerId -> courseHandicap override
}) {
  const id = draftId(roundId, groupNumber);
  const draft = await getItem<DraftScorecard>(D_TABLE, id);
  if (!draft) return notFound('Draft scorecard');

  // Idempotent: re-confirming a confirmed draft is a no-op (prevents double handicap recalculation)
  if (draft.status === 'confirmed') {
    return ok({ confirmed: 0, roundId, groupNumber, alreadyConfirmed: true });
  }

  const round = await getItem<Round>(R_TABLE, roundId);
  if (!round) return notFound('Round');

  // Merge overrides into holes
  const finalHoles = { ...draft.holes };
  if (body.overrides) {
    for (const [pid, holeMap] of Object.entries(body.overrides)) {
      finalHoles[pid] = { ...(finalHoles[pid] ?? {}), ...holeMap };
    }
  }

  // Submit a real score for each player
  const results = [];
  for (const [playerId, holeMap] of Object.entries(finalHoles)) {
    if (Object.keys(holeMap).length === 0) continue;

    // Build holeScores input using round hole data if available
    const roundHoles = round.holes ?? [];
    const holeScores = Object.entries(holeMap).map(([holeStr, strokes]) => {
      const holeNum = Number(holeStr);
      const roundHole = roundHoles.find(h => h.number === holeNum);
      return {
        hole: holeNum,
        strokes,
        par: roundHole?.par ?? 4,
        handicap: roundHole?.handicap ?? holeNum,
      };
    }).sort((a, b) => a.hole - b.hole);

    const result = await submitScore(roundId, {
      playerId,
      holeScores,
      manualCourseHandicap: body.manualHandicaps?.[playerId],
    });
    results.push(result);
  }

  const now = new Date().toISOString();
  await putItem(D_TABLE, { ...draft, status: 'confirmed', updatedAt: now });

  return ok({ confirmed: results.length, roundId, groupNumber });
}
