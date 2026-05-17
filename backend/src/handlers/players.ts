import { v4 as uuidv4 } from 'uuid';
import { getItem, putItem, deleteItem, scanTable, queryIndex } from '../lib/dynamo';
import { ok, error, notFound } from '../lib/response';
import { Player, Score, Round, Tournament } from '../types';

const TABLE = process.env.PLAYERS_TABLE!;
const S_TABLE = process.env.SCORES_TABLE!;
const R_TABLE = process.env.ROUNDS_TABLE!;
const T_TABLE = process.env.TOURNAMENTS_TABLE!;

export async function listPlayers() {
  const players = await scanTable<Player>(TABLE);
  players.sort((a, b) => a.name.localeCompare(b.name));
  return ok(players);
}

export async function getPlayer(id: string) {
  const player = await getItem<Player>(TABLE, id);
  if (!player) return notFound('Player');
  return ok(player);
}

export async function createPlayer(body: Partial<Player>) {
  if (!body.name) return error('Player name is required');
  if (body.handicapIndex === undefined || body.handicapIndex === null) {
    return error('Initial handicap index is required');
  }

  const now = new Date().toISOString();
  const player: Player = {
    id: uuidv4(),
    name: body.name.trim(),
    email: body.email,
    handicapIndex: Number(body.handicapIndex),
    handicapHistory: [],
    createdAt: now,
    updatedAt: now,
  };

  await putItem(TABLE, player);
  return ok(player, 201);
}

export async function updatePlayer(id: string, body: Partial<Player>) {
  const existing = await getItem<Player>(TABLE, id);
  if (!existing) return notFound('Player');

  const updated: Player = {
    ...existing,
    name: body.name?.trim() ?? existing.name,
    email: body.email ?? existing.email,
    handicapIndex: body.handicapIndex !== undefined ? Number(body.handicapIndex) : existing.handicapIndex,
    updatedAt: new Date().toISOString(),
  };

  await putItem(TABLE, updated);
  return ok(updated);
}

export async function deletePlayer(id: string) {
  const existing = await getItem<Player>(TABLE, id);
  if (!existing) return notFound('Player');
  await deleteItem(TABLE, id);
  return ok({ deleted: true });
}

export async function getPlayerProfile(id: string) {
  const player = await getItem<Player>(TABLE, id);
  if (!player) return notFound('Player');

  const scores = await queryIndex<Score>(S_TABLE, 'player-index', 'playerId', id);
  scores.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const roundIds = [...new Set(scores.map(s => s.roundId))];
  const tournamentIds = [...new Set(scores.map(s => s.tournamentId))];

  const [roundResults, tournamentResults] = await Promise.all([
    Promise.all(roundIds.map(rid => getItem<Round>(R_TABLE, rid))),
    Promise.all(tournamentIds.map(tid => getItem<Tournament>(T_TABLE, tid))),
  ]);
  const roundMap = new Map(roundResults.filter((r): r is Round => r !== null).map(r => [r.id, r]));
  const tournamentMap = new Map(tournamentResults.filter((t): t is Tournament => t !== null).map(t => [t.id, t]));

  const roundScores = scores.map(s => {
    const round = roundMap.get(s.roundId);
    const tournament = tournamentMap.get(s.tournamentId);
    return {
      scoreId: s.id,
      roundId: s.roundId,
      tournamentId: s.tournamentId,
      tournamentName: tournament?.name ?? 'Unknown Tournament',
      courseName: round?.courseName ?? 'Unknown Course',
      date: round?.date ?? s.createdAt.slice(0, 10),
      par: round?.par ?? 72,
      grossTotal: s.grossTotal,
      netTotal: s.netTotal,
      courseHandicap: s.courseHandicap,
      handicapDifferential: s.handicapDifferential ?? 0,
    };
  });

  return ok({ player, roundScores });
}
