import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { tournamentsApi, Tournament } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { Trophy, Calendar, Users } from 'lucide-react';
import { parseLocalDate } from '../lib/dates';

export default function History() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      tournamentsApi.list('completed'),
      tournamentsApi.list('archived'),
    ])
      .then(([completed, archived]) => {
        const all = [...completed, ...archived];
        all.sort((a, b) => b.startDate.localeCompare(a.startDate));
        setTournaments(all);
      })
      .catch(e => setError(e.message ?? 'Failed to load history'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-8 text-stone-500">Loading...</div>;
  if (error) return <div className="max-w-4xl mx-auto px-4 py-8 text-red-500">{error}</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-stone-900">History</h1>
        <p className="text-stone-500 mt-1">Completed and archived tournaments</p>
      </div>

      {tournaments.length === 0 ? (
        <div className="card p-12 text-center">
          <span className="text-4xl mb-3 block">📋</span>
          <h2 className="text-lg font-semibold text-stone-700">No completed tournaments yet</h2>
        </div>
      ) : (
        <div className="space-y-3">
          {tournaments.map(t => {
            const totalPot = t.entryFee * t.playerIds.length;
            return (
              <div key={t.id} className={`card p-5 flex items-center justify-between gap-4 ${t.status === 'archived' ? 'opacity-70' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={t.status} />
                    {t.status === 'archived' && (
                      <span className="text-xs text-stone-400 italic">archived</span>
                    )}
                  </div>
                  <h2 className={`font-semibold truncate ${t.status === 'archived' ? 'text-stone-500' : 'text-stone-900'}`}>{t.name}</h2>
                  <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-stone-500">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {parseLocalDate(t.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {t.playerIds.length} players
                    </span>
                    <span>{t.roundIds.length} rounds</span>
                    {totalPot > 0 && (
                      <span className="text-sand-600 font-medium">${totalPot.toFixed(0)} pot</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 flex flex-col gap-1.5 items-end">
                  <Link to={`/tournament/${t.id}/results`} className="btn-secondary text-xs">
                    <Trophy size={13} /> Results
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
