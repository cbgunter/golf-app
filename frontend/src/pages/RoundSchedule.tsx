import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { roundsApi, playersApi, Round, Player } from '../api/client';
import { parseLocalDate } from '../lib/dates';
import { Calendar, MapPin, Clock, Users } from 'lucide-react';

export default function RoundSchedule() {
  const { id } = useParams<{ id: string }>();
  const [round, setRound] = useState<Round | null>(null);
  const [playerMap, setPlayerMap] = useState<Map<string, Player>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([roundsApi.get(id), playersApi.list()])
      .then(([r, ps]) => {
        setRound(r);
        setPlayerMap(new Map(ps.map(p => [p.id, p])));
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="max-w-2xl mx-auto px-4 py-10 text-stone-400">Loading…</div>;
  if (!round) return <div className="max-w-2xl mx-auto px-4 py-10 text-red-500">Round not found.</div>;

  const groups = round.teeTimeGroups ?? [];
  const isShotgun = round.startFormat === 'shotgun';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900 mb-1">{round.courseName}</h1>
        <div className="flex flex-wrap gap-4 text-sm text-stone-500 mt-2">
          <span className="flex items-center gap-1.5">
            <Calendar size={14} />
            {parseLocalDate(round.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin size={14} />
            {round.tee} tees · Par {round.par} · {round.courseRating}/{round.slopeRating}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-3">
          {round.isPracticeRound && (
            <span className="text-xs bg-blue-100 text-blue-600 font-medium px-2 py-0.5 rounded">Practice Round</span>
          )}
          <span className="text-xs bg-stone-100 text-stone-500 font-medium px-2 py-0.5 rounded capitalize">
            {isShotgun ? 'Shotgun Start' : 'Sequential'}
          </span>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="card p-8 text-center text-stone-400 text-sm">
          No tee times have been posted yet. Check back later.
        </div>
      ) : (
        <>
          {/* Column headers */}
          <div className="grid gap-px">
            <div className="grid grid-cols-[80px_1fr] sm:grid-cols-[100px_1fr] gap-3 px-4 py-2 text-xs font-semibold text-stone-400 uppercase tracking-wide">
              <span className="flex items-center gap-1"><Clock size={11} /> Time</span>
              <span className="flex items-center gap-1">
                <Users size={11} />
                {isShotgun ? 'Players (Starting Hole)' : 'Players'}
              </span>
            </div>

            <div className="card divide-y divide-stone-100">
              {[...groups].sort((a, b) => a.groupNumber - b.groupNumber).map(group => {
                const groupPlayers = group.playerIds.map(pid => playerMap.get(pid)).filter((p): p is Player => !!p);
                return (
                  <div key={group.groupNumber} className="grid grid-cols-[80px_1fr] sm:grid-cols-[100px_1fr] gap-3 px-4 py-3.5 items-start">
                    {/* Time */}
                    <div>
                      <div className="font-semibold text-stone-900 text-sm">{group.teeTime}</div>
                      {isShotgun && group.startingHole && (
                        <div className="text-xs text-stone-400 mt-0.5">Hole {group.startingHole}</div>
                      )}
                    </div>

                    {/* Players */}
                    <div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {groupPlayers.map(p => (
                          <Link
                            key={p.id}
                            to={`/players/${p.id}`}
                            className="text-sm text-stone-800 hover:text-sage-700 transition-colors"
                          >
                            {p.name}
                            <span className="text-xs text-stone-400 ml-1">{p.handicapIndex.toFixed(1)}</span>
                          </Link>
                        ))}
                        {groupPlayers.length === 0 && (
                          <span className="text-sm text-stone-400">No players assigned</span>
                        )}
                      </div>
                      {group.pin && (
                        <div className="mt-1 text-xs text-stone-400">
                          Score entry PIN: <span className="font-mono font-semibold text-stone-600">{group.pin}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-stone-400 text-center mt-4">
            {groups.length} pairing{groups.length !== 1 ? 's' : ''} · {groups.reduce((s, g) => s + g.playerIds.length, 0)} players
          </p>
        </>
      )}
    </div>
  );
}
