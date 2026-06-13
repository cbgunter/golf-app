import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { playersApi, Player } from '@shared/client';

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

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-8 text-ep-silver">Loading...</div>;
  if (error) return <div className="max-w-3xl mx-auto px-4 py-8 text-red-500">{error}</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-heading font-extrabold text-ep-green tracking-tight">Players</h1>
        <p className="text-ep-silver mt-1">{players.length} registered players</p>
      </div>

      {players.length === 0 ? (
        <div className="card p-10 text-center text-ep-silver text-sm">No players yet.</div>
      ) : (
        <div className="card divide-y divide-ep-silver/20">
          {players.map(p => (
            <Link
              key={p.id}
              to={`/players/${p.id}`}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-ep-cream/50 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-ep-green/15 text-ep-green flex items-center justify-center font-semibold text-sm shrink-0">
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-ep-green">{p.name}</div>
                <div className="text-xs text-ep-silver">{p.handicapHistory.length} rounds recorded</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold text-ep-green">{p.handicapIndex.toFixed(1)}</div>
                <div className="text-xs text-ep-silver">HCP</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
