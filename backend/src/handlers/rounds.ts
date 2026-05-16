import { v4 as uuidv4 } from 'uuid';
import { getItem, putItem, deleteItem, queryIndex } from '../lib/dynamo';
import { ok, error, notFound } from '../lib/response';
import { Round, Tournament } from '../types';

const R_TABLE = process.env.ROUNDS_TABLE!;
const T_TABLE = process.env.TOURNAMENTS_TABLE!;

export async function getRound(id: string) {
  const round = await getItem<Round>(R_TABLE, id);
  if (!round) return notFound('Round');
  return ok(round);
}

export async function listRoundsForTournament(tournamentId: string) {
  const rounds = await queryIndex<Round>(R_TABLE, 'tournament-index', 'tournamentId', tournamentId);
  rounds.sort((a, b) => a.date.localeCompare(b.date));
  return ok(rounds);
}

export async function createRound(tournamentId: string, body: Partial<Round>) {
  const tournament = await getItem<Tournament>(T_TABLE, tournamentId);
  if (!tournament) return notFound('Tournament');

  if (!body.courseId) return error('courseId is required');
  if (!body.courseName) return error('courseName is required');
  if (!body.date) return error('date is required');
  if (!body.tee) return error('tee is required');
  if (!body.courseRating) return error('courseRating is required');
  if (!body.slopeRating) return error('slopeRating is required');
  if (!body.par) return error('par is required');

  const now = new Date().toISOString();
  const round: Round = {
    id: uuidv4(),
    tournamentId,
    courseId: body.courseId,
    courseName: body.courseName,
    tee: body.tee,
    courseRating: Number(body.courseRating),
    slopeRating: Number(body.slopeRating),
    par: Number(body.par),
    date: body.date,
    status: 'scheduled',
    closestToPinHole: body.closestToPinHole,
    longestDriveHole: body.longestDriveHole,
    notes: body.notes,
    createdAt: now,
    updatedAt: now,
  };

  await putItem(R_TABLE, round);

  // Add round to tournament
  const updatedTournament: Tournament = {
    ...tournament,
    roundIds: [...tournament.roundIds, round.id],
    status: 'active',
    updatedAt: now,
  };
  await putItem(T_TABLE, updatedTournament);

  return ok(round, 201);
}

export async function updateRound(id: string, body: Partial<Round>) {
  const existing = await getItem<Round>(R_TABLE, id);
  if (!existing) return notFound('Round');

  const updated: Round = {
    ...existing,
    ...body,
    id,
    tournamentId: existing.tournamentId,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await putItem(R_TABLE, updated);
  return ok(updated);
}

export async function completeRound(id: string) {
  const round = await getItem<Round>(R_TABLE, id);
  if (!round) return notFound('Round');

  const updated: Round = {
    ...round,
    status: 'completed',
    updatedAt: new Date().toISOString(),
  };

  await putItem(R_TABLE, updated);

  // Check if all rounds in tournament are complete → mark tournament completed
  const tournament = await getItem<Tournament>(T_TABLE, round.tournamentId);
  if (tournament) {
    const allRounds = await queryIndex<Round>(R_TABLE, 'tournament-index', 'tournamentId', tournament.id);
    const allComplete = allRounds.every(r => r.status === 'completed' || r.id === id);
    if (allComplete) {
      await putItem(T_TABLE, {
        ...tournament,
        status: 'completed',
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return ok(updated);
}
