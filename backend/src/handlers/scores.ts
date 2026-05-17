import { v4 as uuidv4 } from 'uuid';
import { getItem, putItem, queryIndex } from '../lib/dynamo';
import { ok, error, notFound } from '../lib/response';
import { Score, Round, Player, HoleScore, ScoreAdjustment, HandicapEntry } from '../types';
import {
  calcDifferential,
  calcCourseHandicap,
  calcHandicapIndex,
  applyESC,
  computeHoleScores,
} from '../lib/handicap';

const S_TABLE = process.env.SCORES_TABLE!;
const R_TABLE = process.env.ROUNDS_TABLE!;
const P_TABLE = process.env.PLAYERS_TABLE!;

export async function listScoresForRound(roundId: string) {
  const scores = await queryIndex<Score>(S_TABLE, 'round-index', 'roundId', roundId);
  scores.sort((a, b) => a.playerName.localeCompare(b.playerName));
  return ok(scores);
}

export async function getScore(id: string) {
  const score = await getItem<Score>(S_TABLE, id);
  if (!score) return notFound('Score');
  return ok(score);
}

export interface RawHoleInput {
  hole: number;
  strokes: number;
  par: number;
  handicap: number; // stroke index (1-18)
}

export async function submitScore(
  roundId: string,
  body: {
    playerId: string;
    holeScores: RawHoleInput[];
    manualCourseHandicap?: number;
    notes?: string;
  }
) {
  const round = await getItem<Round>(R_TABLE, roundId);
  if (!round) return notFound('Round');

  const player = await getItem<Player>(P_TABLE, body.playerId);
  if (!player) return notFound('Player');

  if (!body.holeScores?.length) return error('holeScores are required');

  // Determine course handicap
  const { courseHandicap, explanation: chExplanation } = calcCourseHandicap(
    player.handicapIndex,
    round.slopeRating,
    round.courseRating,
    round.par
  );
  const effectiveCH = body.manualCourseHandicap !== undefined ? body.manualCourseHandicap : courseHandicap;

  const adjustments: ScoreAdjustment[] = [];
  if (body.manualCourseHandicap !== undefined && body.manualCourseHandicap !== courseHandicap) {
    adjustments.push({
      type: 'manual',
      originalValue: courseHandicap,
      adjustedValue: body.manualCourseHandicap,
      reason: `Manual course handicap override. Calculated: ${chExplanation}`,
    });
  }

  // Apply ESC and compute hole scores
  const processedHoles: RawHoleInput[] = [];
  for (const h of body.holeScores) {
    const { adjusted, wasAdjusted, maxAllowed } = applyESC(h.strokes, h.par, effectiveCH);
    if (wasAdjusted) {
      adjustments.push({
        type: 'ESC',
        hole: h.hole,
        originalValue: h.strokes,
        adjustedValue: adjusted,
        reason: `Equitable Stroke Control: Course handicap ${effectiveCH}, max allowed on hole = ${maxAllowed}`,
      });
    }
    processedHoles.push({ ...h, strokes: adjusted });
  }

  const holeScores: HoleScore[] = computeHoleScores(processedHoles, effectiveCH);

  const grossTotal = holeScores.reduce((s, h) => s + h.strokes, 0);
  const netTotal = holeScores.reduce((s, h) => s + h.netStrokes, 0);

  // Handicap differential from adjusted gross
  const adjustedGross = processedHoles.reduce((s, h) => s + h.strokes, 0);
  const differential = calcDifferential(adjustedGross, round.courseRating, round.slopeRating);

  adjustments.push({
    type: 'handicap_stroke',
    originalValue: grossTotal,
    adjustedValue: netTotal,
    reason: `Course Handicap ${effectiveCH} applied (${chExplanation}). Net = Gross − handicap strokes per hole.`,
  });

  const now = new Date().toISOString();
  const score: Score = {
    id: uuidv4(),
    roundId,
    tournamentId: round.tournamentId,
    playerId: player.id,
    playerName: player.name,
    holeScores,
    grossTotal,
    netTotal,
    courseHandicap: effectiveCH,
    handicapDifferential: differential,
    adjustments,
    isComplete: true,
    createdAt: now,
    updatedAt: now,
  };

  await putItem(S_TABLE, score);

  // Auto-transition round to in_progress on first score
  if (round.status === 'scheduled') {
    await putItem(R_TABLE, {
      ...round,
      status: 'in_progress',
      updatedAt: now,
    });
  }

  // Update player handicap
  const allPlayerScores = await queryIndex<Score>(S_TABLE, 'player-index', 'playerId', player.id);
  const allDiffs = [...allPlayerScores.map(s => s.handicapDifferential!).filter(d => d !== undefined), differential];
  const { handicapIndex, explanation } = calcHandicapIndex(allDiffs);

  const historyEntry: HandicapEntry = {
    date: now,
    handicapIndex,
    differential,
    roundId,
    courseRating: round.courseRating,
    slopeRating: round.slopeRating,
    adjustedGrossScore: adjustedGross,
    notes: explanation,
  };

  const updatedPlayer: Player = {
    ...player,
    handicapIndex,
    handicapHistory: [...player.handicapHistory, historyEntry],
    updatedAt: now,
  };
  await putItem(P_TABLE, updatedPlayer);

  return ok({
    score,
    handicapUpdate: {
      previousIndex: player.handicapIndex,
      newIndex: handicapIndex,
      differential,
      explanation,
    },
  }, 201);
}

export async function updateScore(id: string, body: Partial<Score> & { reason?: string }) {
  const existing = await getItem<Score>(S_TABLE, id);
  if (!existing) return notFound('Score');

  const now = new Date().toISOString();
  const adjustment: ScoreAdjustment = {
    type: 'manual',
    originalValue: existing.grossTotal,
    adjustedValue: body.grossTotal ?? existing.grossTotal,
    reason: body.reason ?? 'Manual score adjustment by admin',
  };

  const updated: Score = {
    ...existing,
    ...body,
    id,
    adjustments: [...existing.adjustments, adjustment],
    updatedAt: now,
  };

  await putItem(S_TABLE, updated);
  return ok(updated);
}
