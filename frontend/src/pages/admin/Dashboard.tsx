import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { tournamentsApi, playersApi, Tournament, Player } from '../../api/client';
import StatusBadge from '../../components/StatusBadge';
import { Users, Trophy, Plus } from 'lucide-react';

export default function AdminDashboard() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([tournamentsApi.list(), playersApi.list()])
      .then(([ts, ps]) => { setTournaments(ts); setPlayers(ps); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-500">Loading...</div>;

  const active = tournaments.filter(t => t.status === 'active');
  const upcoming = tournaments.filter(t => t.status === 'upcoming');
  const completed = tournaments.filter(t => t.status === 'completed');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Active', count: active.length, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Upcoming', count: upcoming.length, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Completed', count: completed.length, color: 'text-gold-600', bg: 'bg-gold-50' },
          { label: 'Players', count: players.length, color: 'text-fairway-700', bg: 'bg-fairway-50' },
        ].map(s => (
          <div key={s.label} className={`card p-4 ${s.bg}`}>
            <div className={`text-2xl font-bold ${s.color}`}>{s.count}</div>
            <div className="text-sm text-gray-600 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Link to="/admin/tournaments" className="card p-5 hover:shadow-md transition-shadow group">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-fairway-100 rounded-lg flex items-center justify-center">
              <Trophy size={18} className="text-fairway-700" />
            </div>
            <h2 className="font-semibold text-gray-900 group-hover:text-fairway-700">Tournaments</h2>
          </div>
          <p className="text-sm text-gray-500">Create and manage tournaments, rounds, and scoring</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs text-fairway-600 font-medium">
            <Plus size={12} /> New Tournament
          </span>
        </Link>
        <Link to="/admin/players" className="card p-5 hover:shadow-md transition-shadow group">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users size={18} className="text-blue-700" />
            </div>
            <h2 className="font-semibold text-gray-900 group-hover:text-fairway-700">Players</h2>
          </div>
          <p className="text-sm text-gray-500">Manage player profiles and handicap indexes</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs text-fairway-600 font-medium">
            <Plus size={12} /> Add Player
          </span>
        </Link>
      </div>

      {/* Recent tournaments */}
      {tournaments.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Recent Tournaments</h2>
            <Link to="/admin/tournaments" className="text-xs text-fairway-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {tournaments.slice(0, 5).map(t => (
              <Link
                key={t.id}
                to={`/admin/tournaments/${t.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
              >
                <div>
                  <div className="font-medium text-sm text-gray-900">{t.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {new Date(t.startDate).toLocaleDateString()} · {t.playerIds.length} players
                  </div>
                </div>
                <StatusBadge status={t.status} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
