import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { playersApi, Player } from '../api/client';

export default function Players() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    playersApi.list()
      .then(ps => setPlayers([...ps].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(e => setError(e.message ?? 'Failed to load players'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-8 text-stone-500">Loading...</div>;
  if (error) return <div className="max-w-3xl mx-auto px-4 py-8 text-red-500">{error}</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-stone-900">Players</h1>
        <p className="text-stone-500 mt-1">{players.length} registered players</p>
      </div>

      {players.length === 0 ? (
        <div className="card p-10 text-center text-stone-400 text-sm">No players yet.</div>
      ) : (
        <div className="card divide-y divide-stone-100">
          {players.map(p => (
            <Link
              key={p.id}
              to={`/players/${p.id}`}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-stone-50 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-sage-100 text-sage-700 flex items-center justify-center font-semibold text-sm shrink-0">
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-stone-900">{p.name}</div>
                <div className="text-xs text-stone-400">{p.handicapHistory.length} rounds recorded</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold text-sage-700">{p.handicapIndex.toFixed(1)}</div>
                <div className="text-xs text-stone-400">HCP</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
