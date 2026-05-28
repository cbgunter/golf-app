import { v4 as uuidv4 } from 'uuid';
import { getItem, putItem, deleteItem, scanTable, queryIndex } from '../lib/dynamo';
import { ok, error, notFound } from '../lib/response';
import { Tournament, Round, Score, Player, TournamentResults, LeaderboardEntry, PayoutResult } from '../types';

const T_TABLE = process.env.TOURNAMENTS_TABLE!;
const R_TABLE = process.env.ROUNDS_TABLE!;
const S_TABLE = process.env.SCORES_TABLE!;
const P_TABLE = process.env.PLAYERS_TABLE!;

export async function listTournaments(status?: string) {
  let tournaments = await scanTable<Tournament>(T_TABLE);
  if (status) {
    tournaments = tournaments.filter(t => t.status === status);
  }
  tournaments.sort((a, b) => b.startDate.localeCompare(a.startDate));
  return ok(tournaments);
}

export async function getTournament(id: string) {
  const t = await getItem<Tournament>(T_TABLE, id);
  if (!t) return notFound('Tournament');
  return ok(t);
}

export async function createTournament(body: Partial<Tournament>) {
  if (!body.name) return error('Tournament name is required');
  if (!body.startDate) return error('Start date is required');

  const now = new Date().toISOString();
  const pctRows = (body.payoutStructure ?? []).filter(p => (p.payoutType ?? 'percentage') === 'percentage');
  const total = pctRows.reduce((s, p) => s + p.percentage, 0);
  if (pctRows.length > 0 && Math.abs(total - 100) > 0.01) {
    return error('Payout percentages must sum to 100');
  }

  const tournament: Tournament = {
    id: uuidv4(),
    name: body.name.trim(),
    description: body.description,
    status: 'upcoming',
    format: body.format ?? 'stroke_play',
    isNet: body.isNet ?? true,
    isGross: body.isGross ?? true,
    hasClosestToPin: body.hasClosestToPin ?? false,
    hasLongestDrive: body.hasLongestDrive ?? false,
    closestToPinFee: body.closestToPinFee !== undefined ? Number(body.closestToPinFee) : undefined,
    longestDriveFee: body.longestDriveFee !== undefined ? Number(body.longestDriveFee) : undefined,
    entryFee: Number(body.entryFee ?? 0),
    payoutStructure: body.payoutStructure ?? [],
    playerIds: body.playerIds ?? [],
    roundIds: [],
    startDate: body.startDate,
    endDate: body.endDate,
    notes: body.notes,
    createdAt: now,
    updatedAt: now,
  };

  await putItem(T_TABLE, tournament);
  return ok(tournament, 201);
}

export async function updateTournament(id: string, body: Partial<Tournament>) {
  const existing = await getItem<Tournament>(T_TABLE, id);
  if (!existing) return notFound('Tournament');

  const updated: Tournament = {
    ...existing,
    ...body,
    id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await putItem(T_TABLE, updated);
  return ok(updated);
}

export async function deleteTournament(id: string) {
  const existing = await getItem<Tournament>(T_TABLE, id);
  if (!existing) return notFound('Tournament');

  // Cascade: delete all rounds and their scores
  const rounds = await queryIndex<Round>(R_TABLE, 'tournament-index', 'tournamentId', id);
  for (const round of rounds) {
    const scores = await queryIndex<Score>(S_TABLE, 'round-index', 'roundId', round.id);
    for (const score of scores) {
      await deleteItem(S_TABLE, score.id);
    }
    await deleteItem(R_TABLE, round.id);
  }

  await deleteItem(T_TABLE, id);
  return ok({ deleted: true });
}

export async function getTournamentResults(id: string) {
  const tournament = await getItem<Tournament>(T_TABLE, id);
  if (!tournament) return notFound('Tournament');

  // Fetch all rounds
  const allRounds = await queryIndex<Round>(R_TABLE, 'tournament-index', 'tournamentId', id);
  // Practice rounds count toward handicap but not standings
  const completedRounds = allRounds.filter(r => r.status === 'completed' && !r.isPracticeRound);

  // Fetch all players in tournament
  const playerMap = new Map<string, Player>();
  for (const playerId of tournament.playerIds) {
    const p = await getItem<Player>(P_TABLE, playerId);
    if (p) playerMap.set(p.id, p);
  }

  // Fetch all scores (practice rounds excluded from standings)
  const scoresByPlayer = new Map<string, Score[]>();
  for (const round of completedRounds) {
    const roundScores = await queryIndex<Score>(S_TABLE, 'round-index', 'roundId', round.id);
    for (const score of roundScores) {
      if (!scoresByPlayer.has(score.playerId)) scoresByPlayer.set(score.playerId, []);
      scoresByPlayer.get(score.playerId)!.push(score);
    }
  }

  // Build leaderboard
  const leaderboard: LeaderboardEntry[] = [];
  for (const [playerId, scores] of scoresByPlayer.entries()) {
    const player = playerMap.get(playerId);
    if (!player) continue;

    const totalGross = scores.reduce((s, sc) => s + sc.grossTotal, 0);
    const totalNet = scores.reduce((s, sc) => s + sc.netTotal, 0);
    const roundDifferentials = scores
      .filter(s => s.handicapDifferential !== undefined)
      .map(s => s.handicapDifferential!);

    leaderboard.push({ rank: 0, player, scores, totalGross, totalNet, roundDifferentials });
  }

  // Sort by net (primary) then gross
  if (tournament.isNet) {
    leaderboard.sort((a, b) => a.totalNet - b.totalNet);
  } else {
    leaderboard.sort((a, b) => a.totalGross - b.totalGross);
  }
  leaderboard.forEach((e, i) => (e.rank = i + 1));

  // Calculate payouts
  const playerCount = tournament.playerIds.length;
  const totalPot = tournament.entryFee * playerCount;
  const ctpPot = tournament.hasClosestToPin && tournament.closestToPinFee
    ? tournament.closestToPinFee * playerCount : 0;
  const ldPot = tournament.hasLongestDrive && tournament.longestDriveFee
    ? tournament.longestDriveFee * playerCount : 0;
  const payouts: PayoutResult[] = tournament.payoutStructure.map(p => ({
    place: p.place,
    label: p.label,
    amount: p.payoutType === 'flat'
      ? (p.amount ?? 0)
      : Math.round((p.percentage / 100) * totalPot * 100) / 100,
    percentage: p.percentage,
    payoutType: p.payoutType,
    player: leaderboard[p.place - 1]?.player,
  }));

  // Closest to pin and longest drive
  const closestToPin = completedRounds
    .filter(r => r.closestToPinWinnerId && r.closestToPinHole)
    .map(r => ({
      hole: r.closestToPinHole!,
      roundId: r.id,
      player: playerMap.get(r.closestToPinWinnerId!),
    }));

  const longestDrive = completedRounds
    .filter(r => r.longestDriveWinnerId && r.longestDriveHole)
    .map(r => ({
      hole: r.longestDriveHole!,
      roundId: r.id,
      player: playerMap.get(r.longestDriveWinnerId!),
    }));

  const results: TournamentResults = {
    tournament,
    rounds: allRounds,
    leaderboard,
    closestToPin: closestToPin.length ? closestToPin : undefined,
    longestDrive: longestDrive.length ? longestDrive : undefined,
    payouts,
    totalPot,
    ctpPot,
    ldPot,
  };

  return ok(results);
}
