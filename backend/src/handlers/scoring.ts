import { v4 as uuidv4 } from 'uuid';
import { getItem, putItem, queryIndex, scanTable } from '../lib/dynamo';
import { ok, error, notFound } from '../lib/response';
import { DraftScorecard, Round, Player, Tournament } from '../types';
import { submitScore } from './scores';

const D_TABLE = process.env.DRAFT_SCORECARDS_TABLE!;
const R_TABLE = process.env.ROUNDS_TABLE!;
const P_TABLE = process.env.PLAYERS_TABLE!;
const T_TABLE = process.env.TOURNAMENTS_TABLE!;

function draftId(roundId: string, groupNumber: number) {
  return `${roundId}#${groupNumber}`;
}

// GET /score/rounds — all active/upcoming rounds with group PINs
export async function getActiveRoundsForScoring() {
  const tournaments = await scanTable<Tournament>(T_TABLE);
  const active = tournaments.filter(t => t.status === 'upcoming' || t.status === 'active');
  if (active.length === 0) return ok([]);

  const results = await Promise.all(
    active.map(async t => {
      const rounds = await queryIndex<Round>(R_TABLE, 'tournament-index', 'tournamentId', t.id);
      const scorable = rounds.filter(r =>
        r.status !== 'completed' && r.teeTimeGroups && r.teeTimeGroups.length > 0
      );
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
            pin: g.pin,
            playerIds: g.playerIds,
          })),
        })),
      };
    })
  );

  return ok(results.filter(Boolean));
}

// GET /score/lookup?pin=1234 — resolve PIN → round + group + players
export async function lookupByPin(pin: string) {
  if (!pin) return error('pin is required', 400);

  const drafts = await queryIndex<DraftScorecard>(D_TABLE, 'pin-index', 'pin', pin);
  const draft = drafts[0] ?? null;

  // Find the round that owns this PIN
  const tournaments = await scanTable<Tournament>(T_TABLE);
  const active = tournaments.filter(t => t.status === 'upcoming' || t.status === 'active');

  let foundRound: Round | null = null;
  let foundGroupNumber = 0;

  for (const t of active) {
    const rounds = await queryIndex<Round>(R_TABLE, 'tournament-index', 'tournamentId', t.id);
    for (const r of rounds) {
      const group = (r.teeTimeGroups ?? []).find(g => g.pin === pin);
      if (group) {
        foundRound = r;
        foundGroupNumber = group.groupNumber;
        break;
      }
    }
    if (foundRound) break;
  }

  if (!foundRound) return error('Invalid PIN', 404);

  const group = foundRound.teeTimeGroups!.find(g => g.groupNumber === foundGroupNumber)!;
  const players = await Promise.all(
    group.playerIds.map(pid => getItem<Player>(P_TABLE, pid))
  );

  const tournament = await getItem<Tournament>(T_TABLE, foundRound.tournamentId);

  return ok({
    pin,
    roundId: foundRound.id,
    tournamentId: foundRound.tournamentId,
    tournamentName: tournament?.name ?? '',
    courseName: foundRound.courseName,
    date: foundRound.date,
    par: foundRound.par,
    tee: foundRound.tee,
    courseRating: foundRound.courseRating,
    slopeRating: foundRound.slopeRating,
    holes: foundRound.holes ?? [],
    groupNumber: foundGroupNumber,
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
  pin: string;
  holeNumber: number;
  scores: Record<string, number>; // playerId -> strokes
}) {
  const { pin, holeNumber, scores } = body;
  if (!pin || !holeNumber || !scores) return error('pin, holeNumber, and scores are required', 400);

  const drafts = await queryIndex<DraftScorecard>(D_TABLE, 'pin-index', 'pin', pin);
  const existing = drafts[0] ?? null;

  const now = new Date().toISOString();

  if (existing) {
    if (existing.status === 'submitted') return error('Scorecard already submitted', 400);
    // Merge new hole scores
    const updatedHoles = { ...existing.holes };
    for (const [playerId, strokes] of Object.entries(scores)) {
      if (!updatedHoles[playerId]) updatedHoles[playerId] = {};
      updatedHoles[playerId][String(holeNumber)] = strokes;
    }
    const updated: DraftScorecard = { ...existing, holes: updatedHoles, updatedAt: now };
    await putItem(D_TABLE, updated);
    return ok(updated);
  }

  // Create new draft — need to find the round for this PIN
  const tournaments = await scanTable<Tournament>(T_TABLE);
  const active = tournaments.filter(t => t.status === 'upcoming' || t.status === 'active');
  let foundRound: Round | null = null;
  let foundGroupNumber = 0;

  for (const t of active) {
    const rounds = await queryIndex<Round>(R_TABLE, 'tournament-index', 'tournamentId', t.id);
    for (const r of rounds) {
      const group = (r.teeTimeGroups ?? []).find(g => g.pin === pin);
      if (group) { foundRound = r; foundGroupNumber = group.groupNumber; break; }
    }
    if (foundRound) break;
  }

  if (!foundRound) return error('Invalid PIN', 404);

  const holesData: Record<string, Record<string, number>> = {};
  for (const [playerId, strokes] of Object.entries(scores)) {
    holesData[playerId] = { [String(holeNumber)]: strokes };
  }

  const draft: DraftScorecard = {
    id: draftId(foundRound.id, foundGroupNumber),
    pin,
    roundId: foundRound.id,
    tournamentId: foundRound.tournamentId,
    groupNumber: foundGroupNumber,
    status: 'draft',
    holes: holesData,
    createdAt: now,
    updatedAt: now,
  };
  await putItem(D_TABLE, draft);
  return ok(draft);
}

// POST /score/submit — mark draft as submitted
export async function submitDraft(body: { pin: string }) {
  const { pin } = body;
  if (!pin) return error('pin is required', 400);

  const drafts = await queryIndex<DraftScorecard>(D_TABLE, 'pin-index', 'pin', pin);
  const draft = drafts[0];
  if (!draft) return error('No draft found for this PIN', 404);
  if (draft.status === 'submitted') return ok(draft); // idempotent

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

  // Mark draft as confirmed by deleting it (scores are now in golf-scores)
  const now = new Date().toISOString();
  await putItem(D_TABLE, { ...draft, status: 'submitted', updatedAt: now });

  return ok({ confirmed: results.length, roundId, groupNumber });
}
