import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { tournamentsApi, Tournament, Round } from '@shared/client';
import { tournamentFormatLabel } from '@shared/formats';
import StatusBadge from '../components/StatusBadge';
import { Trophy, Calendar, Users, DollarSign } from 'lucide-react';

export default function Home() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [roundsByTournament, setRoundsByTournament] = useState<Record<string, Round[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      tournamentsApi.list('active'),
      tournamentsApi.list('upcoming'),
    ])
      .then(([active, upcoming]) => {
        const all = [...active, ...upcoming];
        setTournaments(all);
        // Format labels come from each tournament's rounds; load them without blocking the list.
        all.forEach(t => {
          tournamentsApi.rounds(t.id)
            .then(rs => setRoundsByTournament(m => ({ ...m, [t.id]: rs })))
            .catch(() => { /* label just stays hidden */ });
        });
      })
      .catch(() => setError('Failed to load tournaments'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-heading font-extrabold text-ep-green tracking-tight">CH Tournaments</h1>
        <p className="text-ep-muted mt-1">Active and upcoming tournaments</p>
      </div>

      {tournaments.length === 0 ? (
        <div className="card p-12 text-center">
          <span className="text-5xl mb-4 block">⛳</span>
          <h2 className="text-lg font-heading font-semibold text-ep-green">No active tournaments</h2>
          <p className="text-ep-muted text-sm mt-1">Check back soon, or view the <Link to="/history" className="text-ep-orange hover:underline">history</Link>.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tournaments.map(t => (
            <TournamentCard key={t.id} tournament={t} rounds={roundsByTournament[t.id]} />
          ))}
        </div>
      )}
    </div>
  );
}

function TournamentCard({ tournament: t, rounds }: { tournament: Tournament; rounds?: Round[] }) {
  const totalPot = t.entryFee * t.playerIds.length;
  const formatLabel = rounds ? tournamentFormatLabel(rounds, t.standingsMode) : null;

  return (
    <Link to={`/tournament/${t.id}`} className="card p-5 block hover:shadow-md transition-shadow group">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={t.status} />
            {formatLabel && <span className="text-xs text-ep-muted">{formatLabel}</span>}
          </div>
          <h2 className="text-lg font-heading font-semibold text-ep-green group-hover:text-ep-orange transition-colors">
            {t.name}
          </h2>
          {t.description && <p className="text-sm text-ep-muted mt-0.5 truncate">{t.description}</p>}
          <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-ep-muted">
            <span className="flex items-center gap-1">
              <Calendar size={14} />
              {new Date(t.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <span className="flex items-center gap-1">
              <Users size={14} />
              {t.playerIds.length} player{t.playerIds.length !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              <Trophy size={14} />
              {t.roundIds.length} round{t.roundIds.length !== 1 ? 's' : ''}
            </span>
            {t.entryFee > 0 && (
              <span className="flex items-center gap-1 text-ep-orange font-medium">
                <DollarSign size={14} />
                ${totalPot.toFixed(0)} pot
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {t.isNet && <span className="text-xs text-ep-muted">Net</span>}
          {t.isGross && <span className="text-xs text-ep-muted">Gross</span>}
          {t.hasClosestToPin && <span className="text-xs text-ep-muted">CTP</span>}
          {t.hasLongestDrive && <span className="text-xs text-ep-muted">LD</span>}
        </div>
      </div>
    </Link>
  );
}

function LoadingState() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="h-8 w-48 bg-ep-sand rounded animate-pulse mb-8" />
      <div className="space-y-4">
        {[1, 2].map(i => (
          <div key={i} className="card p-5 animate-pulse">
            <div className="h-4 w-20 bg-ep-sand rounded mb-2" />
            <div className="h-6 w-64 bg-ep-sand rounded mb-3" />
            <div className="h-4 w-48 bg-ep-sand/60 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 text-center">
      <p className="text-red-500">{message}</p>
    </div>
  );
}
