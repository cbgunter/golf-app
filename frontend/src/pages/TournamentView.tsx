import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { tournamentsApi, playersApi, Tournament, Round, Score, Player } from '../api/client';
import { roundsApi } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { Trophy, MapPin, Calendar, ChevronDown, ChevronUp, Info } from 'lucide-react';

export default function TournamentView() {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [scoresByRound, setScoresByRound] = useState<Record<string, Score[]>>({});
  const [players, setPlayers] = useState<Player[]>([]);
  const [expandedRound, setExpandedRound] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      tournamentsApi.get(id),
      tournamentsApi.rounds(id),
      playersApi.list(),
    ]).then(async ([t, rs, ps]) => {
      setTournament(t);
      setRounds(rs);
      setPlayers(ps);
      // Auto-expand in-progress round
      const active = rs.find(r => r.status === 'in_progress');
      if (active) setExpandedRound(active.id);

      // Load scores for all rounds
      const scoreMap: Record<string, Score[]> = {};
      await Promise.all(
        rs.map(async r => {
          scoreMap[r.id] = await roundsApi.scores(r.id);
        })
      );
      setScoresByRound(scoreMap);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-8 text-stone-500">Loading...</div>;
  if (!tournament) return <div className="max-w-4xl mx-auto px-4 py-8 text-red-500">Tournament not found.</div>;

  const totalPot = tournament.entryFee * tournament.playerIds.length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <StatusBadge status={tournament.status} />
        </div>
        <h1 className="text-3xl font-bold text-stone-900">{tournament.name}</h1>
        {tournament.description && <p className="text-stone-500 mt-1">{tournament.description}</p>}

        <div className="flex flex-wrap gap-6 mt-4 text-sm text-stone-600">
          <span className="flex items-center gap-1">
            <Calendar size={15} />
            {new Date(tournament.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
          {totalPot > 0 && (
            <span className="flex items-center gap-1 text-sand-600 font-semibold">
              <Trophy size={15} />
              ${totalPot.toFixed(0)} total pot
            </span>
          )}
        </div>

        {/* Game info chips */}
        <div className="flex flex-wrap gap-2 mt-3">
          {tournament.isGross && <span className="badge badge-gray">Gross</span>}
          {tournament.isNet && <span className="badge badge-green">Net</span>}
          {tournament.hasClosestToPin && <span className="badge badge-blue">Closest to Pin</span>}
          {tournament.hasLongestDrive && <span className="badge badge-blue">Longest Drive</span>}
        </div>
      </div>

      {/* Payout structure */}
      {tournament.payoutStructure.length > 0 && totalPot > 0 && (
        <div className="card p-4 mb-6">
          <h2 className="font-semibold text-stone-800 mb-3 flex items-center gap-2">
            <Trophy size={16} className="text-sand-500" /> Payout Structure
          </h2>
          <div className="divide-y divide-gray-100">
            {tournament.payoutStructure.map(p => (
              <div key={p.place} className="flex items-center justify-between py-2 text-sm">
                <span className="text-stone-600">{p.label}</span>
                <span className="font-semibold text-stone-900">
                  ${((p.percentage / 100) * totalPot).toFixed(0)}
                  <span className="text-stone-400 font-normal ml-1">({p.percentage}%)</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results link if completed */}
      {tournament.status === 'completed' && (
        <Link
          to={`/tournament/${id}/results`}
          className="btn-gold w-full justify-center mb-6"
        >
          <Trophy size={16} /> View Final Results
        </Link>
      )}

      {/* Rounds */}
      <h2 className="text-xl font-bold text-stone-800 mb-3">Rounds</h2>
      {rounds.length === 0 ? (
        <div className="card p-8 text-center text-stone-400 text-sm">No rounds scheduled yet.</div>
      ) : (
        <div className="space-y-3">
          {rounds.map(round => (
            <RoundCard
              key={round.id}
              round={round}
              scores={scoresByRound[round.id] ?? []}
              players={players}
              expanded={expandedRound === round.id}
              onToggle={() => setExpandedRound(expandedRound === round.id ? null : round.id)}
              isNet={tournament.isNet}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RoundCard({
  round,
  scores,
  players,
  expanded,
  onToggle,
  isNet,
}: {
  round: Round;
  scores: Score[];
  players: Player[];
  expanded: boolean;
  onToggle: () => void;
  isNet: boolean;
}) {
  const sorted = [...scores].sort((a, b) =>
    isNet ? a.netTotal - b.netTotal : a.grossTotal - b.grossTotal
  );

  return (
    <div className="card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-stone-50 transition-colors"
      >
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <StatusBadge status={round.status} />
            <span className="text-xs text-stone-400">{round.tee} tees</span>
          </div>
          <div className="font-semibold text-stone-900">{round.courseName}</div>
          <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              {new Date(round.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <span>Par {round.par}</span>
            <span>Rating {round.courseRating} / Slope {round.slopeRating}</span>
          </div>
        </div>
        {expanded ? <ChevronUp size={18} className="text-stone-400 shrink-0" /> : <ChevronDown size={18} className="text-stone-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-stone-100">
          {/* Tee sheet */}
          {round.teeTimeGroups && round.teeTimeGroups.length > 0 && (
            <div className="px-4 pt-4 pb-3">
              <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
                Tee Sheet
                {round.startFormat && (
                  <span className="ml-2 font-normal normal-case text-stone-400 capitalize">({round.startFormat})</span>
                )}
              </h3>
              <div className="space-y-1.5">
                {[...round.teeTimeGroups]
                  .sort((a, b) => a.groupNumber - b.groupNumber)
                  .map(group => {
                    const names = group.playerIds
                      .map(pid => players.find(p => p.id === pid)?.name)
                      .filter(Boolean)
                      .join(', ');
                    return (
                      <div key={group.groupNumber} className="flex items-baseline gap-3 text-sm">
                        <span className="font-medium text-stone-700 w-20 shrink-0">
                          {group.teeTime || `Group ${group.groupNumber}`}
                        </span>
                        {round.startFormat === 'shotgun' && group.startingHole && (
                          <span className="text-xs text-stone-400 w-14 shrink-0">Hole {group.startingHole}</span>
                        )}
                        <span className="text-stone-600">{names || '—'}</span>
                      </div>
                    );
                  })}
              </div>
              <div className="border-t border-stone-100 mt-3" />
            </div>
          )}

          {scores.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-6">No scores entered yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-stone-50 text-stone-500 text-xs">
                    <th className="text-left px-4 py-2 font-medium">Player</th>
                    <th className="text-center px-3 py-2 font-medium">HCP</th>
                    <th className="text-center px-3 py-2 font-medium">Gross</th>
                    {isNet && <th className="text-center px-3 py-2 font-medium">Net</th>}
                    <th className="text-center px-3 py-2 font-medium">+/-</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sorted.map((score, idx) => {
                    const toPar = (isNet ? score.netTotal : score.grossTotal) - round.par;
                    return (
                      <tr key={score.id} className={idx === 0 ? 'bg-sand-50' : ''}>
                        <td className="px-4 py-2.5 font-medium text-stone-900">
                          {idx === 0 && <Trophy size={12} className="text-sand-500 inline mr-1" />}
                          {score.playerName}
                        </td>
                        <td className="px-3 py-2.5 text-center text-stone-500">{score.courseHandicap}</td>
                        <td className="px-3 py-2.5 text-center">{score.grossTotal}</td>
                        {isNet && <td className="px-3 py-2.5 text-center font-medium">{score.netTotal}</td>}
                        <td className={`px-3 py-2.5 text-center font-medium ${toPar < 0 ? 'text-red-600' : toPar === 0 ? 'text-green-600' : 'text-stone-700'}`}>
                          {toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Special contests */}
          {(round.closestToPinHole || round.longestDriveHole) && (
            <div className="px-4 pb-4 pt-2 flex flex-wrap gap-3 text-xs text-stone-500 border-t border-stone-100 mt-2">
              {round.closestToPinHole && (
                <span className="flex items-center gap-1">
                  <MapPin size={12} className="text-blue-500" />
                  CTP: Hole {round.closestToPinHole}
                  {round.closestToPinWinnerId && ` — winner TBD`}
                </span>
              )}
              {round.longestDriveHole && (
                <span className="flex items-center gap-1">
                  <span>🏌️</span>
                  LD: Hole {round.longestDriveHole}
                  {round.longestDriveWinnerId && ` — winner TBD`}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
