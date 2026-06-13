import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { tournamentsApi, TournamentResults } from '../api/client';
import { Trophy, Info, ArrowLeft } from 'lucide-react';

export default function TournamentResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [results, setResults] = useState<TournamentResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    tournamentsApi.results(id)
      .then(setResults)
      .catch(e => setError(e.message ?? 'Failed to load results'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-8 text-ep-silver">Loading results...</div>;
  if (error) return <div className="max-w-4xl mx-auto px-4 py-8 text-red-500">{error}</div>;
  if (!results) return <div className="max-w-4xl mx-auto px-4 py-8 text-red-500">Results not found.</div>;

  const { tournament, leaderboard, payouts, totalPot, ctpPot, ldPot, closestToPin, longestDrive } = results;
  const isNet = tournament.isNet;
  const withdrawnIds = new Set(tournament.withdrawnPlayerIds ?? []);
  const activeLeaderboard = leaderboard
    .filter(e => !withdrawnIds.has(e.player.id))
    .map((e, i) => ({ ...e, rank: i + 1 }));
  const wdEntries = leaderboard.filter(e => withdrawnIds.has(e.player.id));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link to={`/tournament/${id}`} className="inline-flex items-center gap-1 text-sm text-ep-silver hover:text-ep-green mb-4">
        <ArrowLeft size={14} /> Back to tournament
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-heading font-extrabold text-ep-green tracking-tight">{tournament.name}</h1>
        <p className="text-ep-silver mt-1">Final Results</p>
      </div>

      {/* Payouts */}
      {(payouts.length > 0 && totalPot > 0) || ctpPot > 0 || ldPot > 0 ? (
        <div className="card p-5 mb-6 border-l-4 border-ep-orange">
          <h2 className="font-heading font-bold text-ep-green mb-4 flex items-center gap-2">
            <Trophy size={18} className="text-ep-orange" /> Payouts
            {totalPot > 0 && <span className="text-sm font-normal text-ep-silver">— ${totalPot.toFixed(0)} pot</span>}
          </h2>
          <div className="space-y-3">
            {payouts.map(p => (
              <div key={p.place} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${p.place === 1 ? 'bg-ep-orange/20 text-ep-orange' : p.place === 2 ? 'bg-ep-silver/30 text-ep-green' : 'bg-ep-sand text-ep-green/70'}`}>
                    {p.place}
                  </span>
                  <div>
                    <div className="font-medium text-ep-green">{p.player?.name ?? 'TBD'}</div>
                    <div className="text-xs text-ep-silver">{p.label}</div>
                  </div>
                </div>
                <span className="text-lg font-bold text-ep-orange">${p.amount.toFixed(0)}</span>
              </div>
            ))}
            {ctpPot > 0 && (
              <div className="flex items-center justify-between pt-1 border-t border-ep-silver/20">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 flex items-center justify-center text-lg">📍</span>
                  <div>
                    <div className="font-medium text-ep-green">
                      {closestToPin?.[0]?.player?.name ?? 'TBD'}
                    </div>
                    <div className="text-xs text-ep-silver">Closest to Pin</div>
                  </div>
                </div>
                <span className="text-lg font-bold text-ep-orange">${ctpPot.toFixed(0)}</span>
              </div>
            )}
            {ldPot > 0 && (
              <div className="flex items-center justify-between pt-1 border-t border-ep-silver/20">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 flex items-center justify-center text-lg">🏌️</span>
                  <div>
                    <div className="font-medium text-ep-green">
                      {longestDrive?.[0]?.player?.name ?? 'TBD'}
                    </div>
                    <div className="text-xs text-ep-silver">Longest Drive</div>
                  </div>
                </div>
                <span className="text-lg font-bold text-ep-orange">${ldPot.toFixed(0)}</span>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Leaderboard */}
      <div className="card mb-6">
        <div className="px-5 py-4 border-b border-ep-silver/20">
          <h2 className="font-heading font-bold text-ep-green">Leaderboard</h2>
          <p className="text-xs text-ep-silver mt-0.5">Sorted by {isNet ? 'net' : 'gross'} score (lowest wins)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ep-sand text-ep-silver text-xs">
                <th className="text-left px-5 py-2.5 font-medium">Rank</th>
                <th className="text-left px-3 py-2.5 font-medium">Player</th>
                <th className="text-center px-3 py-2.5 font-medium">HCP Idx</th>
                {tournament.isGross && <th className="text-center px-3 py-2.5 font-medium">Gross</th>}
                {tournament.isNet && <th className="text-center px-3 py-2.5 font-medium">Net</th>}
                <th className="text-center px-3 py-2.5 font-medium">Rounds</th>
                <th className="text-center px-3 py-2.5 font-medium">Payout</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ep-silver/10">
              {activeLeaderboard.map((entry, idx) => {
                const payout = payouts.find(p => p.player?.id === entry.player.id);
                const isExpanded = expandedPlayer === entry.player.id;
                return (
                  <>
                    <tr
                      key={entry.player.id}
                      className={`${idx === 0 ? 'bg-ep-orange/10' : idx % 2 === 0 ? 'bg-ep-cream' : 'bg-ep-sand/40'} cursor-pointer hover:bg-ep-sand/50`}
                      onClick={() => setExpandedPlayer(isExpanded ? null : entry.player.id)}
                    >
                      <td className="px-5 py-3 font-bold text-ep-green">
                        {idx === 0 ? '🏆' : entry.rank}
                      </td>
                      <td className="px-3 py-3 font-medium text-ep-green">{entry.player.name}</td>
                      <td className="px-3 py-3 text-center text-ep-silver">{entry.player.handicapIndex.toFixed(1)}</td>
                      {tournament.isGross && <td className="px-3 py-3 text-center">{entry.totalGross}</td>}
                      {tournament.isNet && <td className="px-3 py-3 text-center font-semibold">{entry.totalNet}</td>}
                      <td className="px-3 py-3 text-center text-ep-silver">{entry.scores.length}</td>
                      <td className="px-3 py-3 text-center font-semibold text-ep-orange">
                        {payout ? `$${payout.amount.toFixed(0)}` : '—'}
                      </td>
                      <td className="px-3 py-3 text-ep-silver text-xs">{isExpanded ? '▲' : '▼'}</td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${entry.player.id}-detail`}>
                        <td colSpan={8} className="px-5 py-4 bg-ep-sand/50 border-t border-ep-silver/20">
                          <ScoreBreakdown entry={entry} rounds={results.rounds} isNet={isNet} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {wdEntries.map(entry => (
                <tr key={entry.player.id} className="opacity-50">
                  <td className="px-5 py-3 text-xs font-semibold text-ep-silver">WD</td>
                  <td className="px-3 py-3 font-medium text-ep-green/60 line-through">{entry.player.name}</td>
                  <td className="px-3 py-3 text-center text-ep-silver">{entry.player.handicapIndex.toFixed(1)}</td>
                  {tournament.isGross && <td className="px-3 py-3 text-center text-ep-silver">—</td>}
                  {tournament.isNet && <td className="px-3 py-3 text-center text-ep-silver">—</td>}
                  <td className="px-3 py-3 text-center text-ep-silver">—</td>
                  <td className="px-3 py-3 text-center text-ep-silver">—</td>
                  <td className="px-3 py-3" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Special contests */}
      {((closestToPin?.length ?? 0) > 0 || (longestDrive?.length ?? 0) > 0) && (
        <div className="card p-5 mb-6">
          <h2 className="font-heading font-bold text-ep-green mb-4">Special Contests</h2>
          <div className="space-y-3">
            {closestToPin?.map((c, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-ep-orange">📍</span>
                <div>
                  <div className="text-sm font-medium text-ep-green">Closest to Pin — Hole {c.hole}</div>
                  <div className="text-xs text-ep-silver">{c.player?.name ?? 'TBD'}</div>
                </div>
              </div>
            ))}
            {longestDrive?.map((l, i) => (
              <div key={i} className="flex items-center gap-3">
                <span>🏌️</span>
                <div>
                  <div className="text-sm font-medium text-ep-green">Longest Drive — Hole {l.hole}</div>
                  <div className="text-xs text-ep-silver">{l.player?.name ?? 'TBD'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreBreakdown({ entry, rounds, isNet }: {
  entry: TournamentResults['leaderboard'][0];
  rounds: TournamentResults['rounds'];
  isNet: boolean;
}) {
  const [expandedAdjustments, setExpandedAdjustments] = useState<string | null>(null);

  return (
    <div>
      <p className="text-xs font-heading font-semibold text-ep-silver uppercase tracking-wider mb-2">Round Breakdown</p>
      <div className="space-y-2">
        {entry.scores.map(score => {
          const round = rounds.find(r => r.id === score.roundId);
          const showAdj = expandedAdjustments === score.id;
          return (
            <div key={score.id} className="bg-ep-cream rounded-lg border border-ep-silver/30 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm text-ep-green">{round?.courseName ?? 'Unknown Course'}</div>
                  <div className="text-xs text-ep-silver">
                    {round ? new Date(round.date).toLocaleDateString() : ''} · Par {round?.par} · Course HCP {score.courseHandicap}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-ep-green">
                    {isNet ? `Net ${score.netTotal}` : `Gross ${score.grossTotal}`}
                    {isNet && <span className="text-xs text-ep-silver ml-2">(Gross {score.grossTotal})</span>}
                  </div>
                  {score.handicapDifferential !== undefined && (
                    <div className="text-xs text-ep-silver">Differential: {score.handicapDifferential}</div>
                  )}
                </div>
              </div>

              {score.adjustments.length > 0 && (
                <button
                  onClick={() => setExpandedAdjustments(showAdj ? null : score.id)}
                  className="mt-2 text-xs text-ep-orange hover:underline flex items-center gap-1"
                >
                  <Info size={11} />
                  {showAdj ? 'Hide' : 'Show'} score adjustments ({score.adjustments.length})
                </button>
              )}

              {showAdj && (
                <div className="mt-2 space-y-1.5">
                  {score.adjustments.map((adj, i) => (
                    <div key={i} className="text-xs bg-ep-sand rounded p-2 text-ep-green/80">
                      <span className="font-medium text-ep-green">[{adj.type.toUpperCase()}]</span>
                      {adj.hole ? ` Hole ${adj.hole}:` : ''} {adj.reason}
                      {adj.originalValue !== adj.adjustedValue && (
                        <span className="ml-1 text-ep-silver">({adj.originalValue} → {adj.adjustedValue})</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
