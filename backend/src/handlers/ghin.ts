import { getItem, putItem } from '../lib/dynamo';
import { ok, error, notFound } from '../lib/response';
import { getGhinClient, resetGhinClient } from '../lib/ghinClient';
import { GhinGolfer, Player } from '../types';

const P_TABLE = process.env.PLAYERS_TABLE!;

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  // Plus handicaps are displayed as "+2.1" and mean a negative index.
  const n = s.startsWith('+') ? -Number(s.slice(1)) : Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalize(g: any): GhinGolfer {
  return {
    ghinNumber: String(g.ghin),
    firstName: g.first_name ?? '',
    lastName: g.last_name ?? '',
    handicapIndex: toNumberOrNull(g.hi_value ?? g.handicap_index),
    handicapDisplay: g.hi_display ?? (g.handicap_index != null ? String(g.handicap_index) : 'NH'),
    clubName: g.club_name ?? null,
    state: g.state ?? null,
    status: g.status ?? 'Active',
  };
}

/**
 * Search GHIN golfers. `q` is either a GHIN number (all digits) or a name.
 * Names: "Smith" → last name; "John Smith" → first + last; "Smith, John" → last, first.
 */
export async function searchGolfers(q: string, state?: string) {
  const query = (q ?? '').trim();
  if (query.length < 2) return error('Search must be at least 2 characters');

  try {
    const client = await getGhinClient();

    if (/^\d+$/.test(query)) {
      const golfer = await client.golfers.getOne(Number(query));
      return ok({ golfers: golfer ? [normalize(golfer)] : [], truncated: false });
    }

    let first: string | undefined;
    let last: string;
    if (query.includes(',')) {
      const [l, f] = query.split(',').map(s => s.trim());
      last = l;
      first = f || undefined;
    } else {
      const parts = query.split(/\s+/);
      last = parts.pop()!;
      first = parts.length ? parts.join(' ') : undefined;
    }

    // globalSearch works nationwide (golfers.search 400s on name searches without a state).
    // State is optional and narrows results; it must be the 2-letter code ("NC").
    const PER_PAGE = 50;
    const raw = await client.golfers.globalSearch({
      last_name: last,
      first_name: first,
      country: 'USA',
      state: state?.trim() ? state.trim().toUpperCase() : undefined,
      status: 'Active',
      per_page: PER_PAGE,
      page: 1,
    });

    // One row per club affiliation comes back — collapse to one per GHIN number.
    const byGhin = new Map<string, GhinGolfer>();
    for (const g of raw ?? []) {
      const n = normalize(g);
      const prev = byGhin.get(n.ghinNumber);
      if (!prev) byGhin.set(n.ghinNumber, n);
      else {
        if (!prev.clubName && n.clubName) prev.clubName = n.clubName;
        if (!prev.state && n.state) prev.state = n.state;
      }
    }
    return ok({ golfers: [...byGhin.values()], truncated: (raw?.length ?? 0) >= PER_PAGE });
  } catch (e: any) {
    resetGhinClient();
    return error(`GHIN search failed: ${e.message}`, 502);
  }
}

/** Pull the player's current official Handicap Index from GHIN and store it. */
export async function refreshPlayerFromGhin(playerId: string) {
  const player = await getItem<Player>(P_TABLE, playerId);
  if (!player) return notFound('Player');
  if (!player.ghinNumber) return error('Player has no GHIN number');

  try {
    const client = await getGhinClient();
    const golfer = await client.golfers.getOne(Number(player.ghinNumber));
    if (!golfer) return error('Golfer not found on GHIN', 404);
    const g = normalize(golfer);
    const now = new Date().toISOString();
    const updated: Player = {
      ...player,
      handicapIndex: g.handicapIndex ?? player.handicapIndex,
      ghinHandicapIndex: g.handicapIndex ?? undefined,
      ghinSyncedAt: now,
      updatedAt: now,
    };
    await putItem(P_TABLE, updated);
    return ok(updated);
  } catch (e: any) {
    resetGhinClient();
    return error(`GHIN lookup failed: ${e.message}`, 502);
  }
}
