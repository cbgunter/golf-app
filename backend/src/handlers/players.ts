import { v4 as uuidv4 } from 'uuid';
import { getItem, putItem, deleteItem, scanTable } from '../lib/dynamo';
import { ok, error, notFound } from '../lib/response';
import { Player } from '../types';

const TABLE = process.env.PLAYERS_TABLE!;

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
