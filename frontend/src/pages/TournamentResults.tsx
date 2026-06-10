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

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-8 text-stone-500">Loading results...</div>;
  if (error) return <div className="max-w-4xl mx-auto px-4 py-8 text-red-500">{error}</div>;
  if (!results) return <div className="max-w-4xl mx-auto px-4 py-8 text-red-500">Results not found.</div>;

  const { tournament, leaderboard, payouts, totalPot, ctpPot, ldPot, closestToPin, longestDrive } = results;
  const isNet = tournament.isNet;
  const withdrawnIds = new Set(tournament.withdrawnPlayerIds ?? []);
  const activeLeaderboard = leaderboard.filter(e => !withdrawnIds.has(e.player.id));
  const wdEntries = leaderboard.filter(e => withdrawnIds.has(e.player.id));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link to={`/tournament/${id}`} className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700 mb-4">
        <ArrowLeft size={14} /> Back to tournament
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-stone-900">{tournament.name}</h1>
        <p className="text-stone-500 mt-1">Final Results</p>
      </div>

      {/* Payouts */}
      {(payouts.length > 0 && totalPot > 0) || ctpPot > 0 || ldPot > 0 ? (
        <div className="card p-5 mb-6 border-l-4 border-sand-400">
          <h2 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
            <Trophy size={18} className="text-sand-500" /> Payouts
            {totalPot > 0 && <span className="text-sm font-normal text-stone-400">— ${totalPot.toFixed(0)} pot</span>}
          </h2>
          <div className="space-y-3">
            {payouts.map(p => (
              <div key={p.place} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${p.place === 1 ? 'bg-sand-100 text-sand-700' : p.place === 2 ? 'bg-stone-100 text-stone-700' : 'bg-orange-50 text-orange-700'}`}>
                    {p.place}
                  </span>
                  <div>
                    <div className="font-medium text-stone-900">{p.player?.name ?? 'TBD'}</div>
                    <div className="text-xs text-stone-400">{p.label}</div>
                  </div>
                </div>
                <span className="text-lg font-bold text-sage-700">${p.amount.toFixed(0)}</span>
              </div>
            ))}
            {ctpPot > 0 && (
              <div className="flex items-center justify-between pt-1 border-t border-stone-100">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 flex items-center justify-center text-lg">📍</span>
                  <div>
                    <div className="font-medium text-stone-900">
                      {closestToPin?.[0]?.player?.name ?? 'TBD'}
                    </div>
                    <div className="text-xs text-stone-400">Closest to Pin</div>
                  </div>
                </div>
                <span className="text-lg font-bold text-sage-700">${ctpPot.toFixed(0)}</span>
              </div>
            )}
            {ldPot > 0 && (
              <div className="flex items-center justify-between pt-1 border-t border-stone-100">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 flex items-center justify-center text-lg">🏌️</span>
                  <div>
                    <div className="font-medium text-stone-900">
                      {longestDrive?.[0]?.player?.name ?? 'TBD'}
                    </div>
                    <div className="text-xs text-stone-400">Longest Drive</div>
                  </div>
                </div>
                <span className="text-lg font-bold text-sage-700">${ldPot.toFixed(0)}</span>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Leaderboard */}
      <div className="card mb-6">
        <div className="px-5 py-4 border-b border-stone-100">
          <h2 className="font-bold text-stone-800">Leaderboard</h2>
          <p className="text-xs text-stone-400 mt-0.5">Sorted by {isNet ? 'net' : 'gross'} score (lowest wins)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 text-stone-500 text-xs">
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
            <tbody className="divide-y divide-gray-50">
              {activeLeaderboard.map((entry, idx) => {
                const payout = payouts.find(p => p.player?.id === entry.player.id);
                const isExpanded = expandedPlayer === entry.player.id;
                return (
                  <>
                    <tr
                      key={entry.player.id}
                      className={`${idx === 0 ? 'bg-sand-50' : idx % 2 === 0 ? 'bg-white' : 'bg-stone-50/50'} cursor-pointer hover:bg-stone-50`}
                      onClick={() => setExpandedPlayer(isExpanded ? null : entry.player.id)}
                    >
                      <td className="px-5 py-3 font-bold text-stone-700">
                        {idx === 0 ? '🏆' : entry.rank}
                      </td>
                      <td className="px-3 py-3 font-medium text-stone-900">{entry.player.name}</td>
                      <td className="px-3 py-3 text-center text-stone-500">{entry.player.handicapIndex.toFixed(1)}</td>
                      {tournament.isGross && <td className="px-3 py-3 text-center">{entry.totalGross}</td>}
                      {tournament.isNet && <td className="px-3 py-3 text-center font-semibold">{entry.totalNet}</td>}
                      <td className="px-3 py-3 text-center text-stone-500">{entry.scores.length}</td>
                      <td className="px-3 py-3 text-center font-semibold text-sage-700">
                        {payout ? `$${payout.amount.toFixed(0)}` : '—'}
                      </td>
                      <td className="px-3 py-3 text-stone-400 text-xs">{isExpanded ? '▲' : '▼'}</td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${entry.player.id}-detail`}>
                        <td colSpan={8} className="px-5 py-4 bg-stone-50 border-t border-stone-100">
                          <ScoreBreakdown entry={entry} rounds={results.rounds} isNet={isNet} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {wdEntries.map(entry => (
                <tr key={entry.player.id} className="opacity-50">
                  <td className="px-5 py-3 text-xs font-semibold text-stone-400">WD</td>
                  <td className="px-3 py-3 font-medium text-stone-500 line-through">{entry.player.name}</td>
                  <td className="px-3 py-3 text-center text-stone-400">{entry.player.handicapIndex.toFixed(1)}</td>
                  {tournament.isGross && <td className="px-3 py-3 text-center text-stone-400">—</td>}
                  {tournament.isNet && <td className="px-3 py-3 text-center text-stone-400">—</td>}
                  <td className="px-3 py-3 text-center text-stone-400">—</td>
                  <td className="px-3 py-3 text-center text-stone-400">—</td>
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
          <h2 className="font-bold text-stone-800 mb-4">Special Contests</h2>
          <div className="space-y-3">
            {closestToPin?.map((c, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-blue-500">📍</span>
                <div>
                  <div className="text-sm font-medium">Closest to Pin — Hole {c.hole}</div>
                  <div className="text-xs text-stone-500">{c.player?.name ?? 'TBD'}</div>
                </div>
              </div>
            ))}
            {longestDrive?.map((l, i) => (
              <div key={i} className="flex items-center gap-3">
                <span>🏌️</span>
                <div>
                  <div className="text-sm font-medium">Longest Drive — Hole {l.hole}</div>
                  <div className="text-xs text-stone-500">{l.player?.name ?? 'TBD'}</div>
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
      <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Round Breakdown</p>
      <div className="space-y-2">
        {entry.scores.map(score => {
          const round = rounds.find(r => r.id === score.roundId);
          const showAdj = expandedAdjustments === score.id;
          return (
            <div key={score.id} className="bg-white rounded-lg border border-stone-200 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm text-stone-800">{round?.courseName ?? 'Unknown Course'}</div>
                  <div className="text-xs text-stone-400">
                    {round ? new Date(round.date).toLocaleDateString() : ''} · Par {round?.par} · Course HCP {score.courseHandicap}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">
                    {isNet ? `Net ${score.netTotal}` : `Gross ${score.grossTotal}`}
                    {isNet && <span className="text-xs text-stone-400 ml-2">(Gross {score.grossTotal})</span>}
                  </div>
                  {score.handicapDifferential !== undefined && (
                    <div className="text-xs text-stone-400">Differential: {score.handicapDifferential}</div>
                  )}
                </div>
              </div>

              {score.adjustments.length > 0 && (
                <button
                  onClick={() => setExpandedAdjustments(showAdj ? null : score.id)}
                  className="mt-2 text-xs text-sage-600 hover:underline flex items-center gap-1"
                >
                  <Info size={11} />
                  {showAdj ? 'Hide' : 'Show'} score adjustments ({score.adjustments.length})
                </button>
              )}

              {showAdj && (
                <div className="mt-2 space-y-1.5">
                  {score.adjustments.map((adj, i) => (
                    <div key={i} className="text-xs bg-stone-50 rounded p-2 text-stone-600">
                      <span className="font-medium text-stone-700">[{adj.type.toUpperCase()}]</span>
                      {adj.hole ? ` Hole ${adj.hole}:` : ''} {adj.reason}
                      {adj.originalValue !== adj.adjustedValue && (
                        <span className="ml-1 text-stone-400">({adj.originalValue} → {adj.adjustedValue})</span>
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
