import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { tournamentsApi, Tournament } from '../../api/client';
import StatusBadge from '../../components/StatusBadge';
import { Plus, Trophy, ChevronRight, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { parseLocalDate } from '../../lib/dates';

const STATUS_FILTERS = ['all', 'active', 'upcoming', 'completed', 'archived'] as const;

export default function AdminTournaments() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') ?? 'all';

  useEffect(() => {
    tournamentsApi.list()
      .then(ts => {
        ts.sort((a, b) => b.startDate.localeCompare(a.startDate));
        setTournaments(ts);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(e: React.MouseEvent, t: Tournament) {
    e.preventDefault();
    if (!confirm(`Delete "${t.name}"? This cannot be undone.`)) return;
    try {
      await tournamentsApi.delete(t.id);
      setTournaments(ts => ts.filter(x => x.id !== t.id));
      toast.success('Tournament deleted');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  if (loading) return <div className="text-stone-500">Loading...</div>;

  const visible = statusFilter === 'all' ? tournaments : tournaments.filter(t => t.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-900">Tournaments</h1>
        <Link to="/admin/tournaments/new" className="btn-primary">
          <Plus size={16} /> New Tournament
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 border-b border-stone-200">
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setSearchParams(s === 'all' ? {} : { status: s })}
            className={`px-3 pb-2 pt-1 text-sm font-medium capitalize border-b-2 transition-colors -mb-px ${
              statusFilter === s ? 'border-sage-600 text-sage-700' : 'border-transparent text-stone-400 hover:text-stone-600'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="card p-10 text-center">
          <Trophy size={40} className="text-stone-300 mx-auto mb-3" />
          <p className="text-stone-500">{statusFilter === 'all' ? 'No tournaments yet.' : `No ${statusFilter} tournaments.`}</p>
          {statusFilter === 'all' && (
            <Link to="/admin/tournaments/new" className="btn-primary mt-4 inline-flex">
              <Plus size={15} /> Create First Tournament
            </Link>
          )}
        </div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {visible.map(t => (
            <Link
              key={t.id}
              to={`/admin/tournaments/${t.id}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-stone-50 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <StatusBadge status={t.status} />
                  <span className="text-xs text-stone-400">
                    {t.roundIds.length} round{t.roundIds.length !== 1 ? 's' : ''} · {t.playerIds.length} players
                  </span>
                </div>
                <div className="font-medium text-stone-900 group-hover:text-sage-700 truncate">{t.name}</div>
                <div className="text-xs text-stone-400 mt-0.5">
                  {parseLocalDate(t.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {t.entryFee > 0 && ` · $${t.entryFee} entry`}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={e => handleDelete(e, t)}
                  className="p-1.5 text-stone-300 hover:text-red-400 transition-colors rounded"
                  title="Delete tournament"
                >
                  <Trash2 size={15} />
                </button>
                <ChevronRight size={16} className="text-stone-300" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
