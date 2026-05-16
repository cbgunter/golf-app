import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { tournamentsApi, Tournament } from '../../api/client';
import StatusBadge from '../../components/StatusBadge';
import { Plus, Trophy, ChevronRight } from 'lucide-react';

export default function AdminTournaments() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tournamentsApi.list()
      .then(ts => {
        ts.sort((a, b) => b.startDate.localeCompare(a.startDate));
        setTournaments(ts);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tournaments</h1>
        <Link to="/admin/tournaments/new" className="btn-primary">
          <Plus size={16} /> New Tournament
        </Link>
      </div>

      {tournaments.length === 0 ? (
        <div className="card p-10 text-center">
          <Trophy size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No tournaments yet.</p>
          <Link to="/admin/tournaments/new" className="btn-primary mt-4 inline-flex">
            <Plus size={15} /> Create First Tournament
          </Link>
        </div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {tournaments.map(t => (
            <Link
              key={t.id}
              to={`/admin/tournaments/${t.id}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <StatusBadge status={t.status} />
                  <span className="text-xs text-gray-400">
                    {t.roundIds.length} round{t.roundIds.length !== 1 ? 's' : ''} · {t.playerIds.length} players
                  </span>
                </div>
                <div className="font-medium text-gray-900 group-hover:text-fairway-700 truncate">{t.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {new Date(t.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {t.entryFee > 0 && ` · $${t.entryFee} entry`}
                </div>
              </div>
              <ChevronRight size={16} className="text-gray-300 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
