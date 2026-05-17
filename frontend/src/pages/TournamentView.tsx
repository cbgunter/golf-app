import { Fragment, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { tournamentsApi, playersApi, Tournament, Round, Score, Player } from '../api/client';
import { roundsApi } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { Trophy, MapPin, Calendar, ChevronDown, ChevronUp, X, HelpCircle } from 'lucide-react';
import { parseLocalDate } from '../lib/dates';

export default function TournamentView() {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [scoresByRound, setScoresByRound] = useState<Record<string, Score[]>>({});
  const [players, setPlayers] = useState<Player[]>([]);
  const [expandedRound, setExpandedRound] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [loading, setLoading] = useState(true);
  const roundRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
      if (active) {
        setExpandedRound(active.id);
        // Scroll to it after render
        setTimeout(() => roundRefs.current[active.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
      }

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

  const playerCount = tournament.playerIds.length;
  const totalPot = tournament.entryFee * playerCount;
  const ctpPot = tournament.hasClosestToPin && tournament.closestToPinFee ? tournament.closestToPinFee * playerCount : 0;
  const ldPot = tournament.hasLongestDrive && tournament.longestDriveFee ? tournament.longestDriveFee * playerCount : 0;

  // Build projected leaderboard from current scores across all rounds
  const allScores = Object.values(scoresByRound).flat();
  const scoresByPlayer = new Map<string, Score[]>();
  for (const s of allScores) {
    if (!scoresByPlayer.has(s.playerId)) scoresByPlayer.set(s.playerId, []);
    scoresByPlayer.get(s.playerId)!.push(s);
  }
  const leaderboard = Array.from(scoresByPlayer.entries()).map(([pid, scores]) => {
    const player = players.find(p => p.id === pid);
    return {
      player,
      playerName: scores[0].playerName,
      totalGross: scores.reduce((s, sc) => s + sc.grossTotal, 0),
      totalNet: scores.reduce((s, sc) => s + sc.netTotal, 0),
      rounds: scores.length,
    };
  });
  leaderboard.sort((a, b) => tournament.isNet ? a.totalNet - b.totalNet : a.totalGross - b.totalGross);
  const showLeaderboard = leaderboard.length > 0;

  // Round progress + rank movement
  const scoredRoundsList = [...rounds]
    .filter(r => (scoresByRound[r.id] ?? []).length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const completedRoundsCount = scoredRoundsList.length;
  const lastScoredRound = scoredRoundsList[scoredRoundsList.length - 1];
  const prevRankMap = new Map<string, number>();
  if (lastScoredRound && scoredRoundsList.length > 1) {
    const prevScores = Object.entries(scoresByRound)
      .filter(([rid]) => rid !== lastScoredRound.id)
      .flatMap(([, ss]) => ss);
    const prevTotals = new Map<string, number>();
    for (const s of prevScores) {
      prevTotals.set(s.playerId, (prevTotals.get(s.playerId) ?? 0) + (tournament.isNet ? s.netTotal : s.grossTotal));
    }
    [...prevTotals.entries()]
      .sort((a, b) => a[1] - b[1])
      .forEach(([pid], i) => prevRankMap.set(pid, i + 1));
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Info modal */}
      {showInfo && <HandicapInfoModal isNet={tournament.isNet} isGross={tournament.isGross} onClose={() => setShowInfo(false)} />}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <StatusBadge status={tournament.status} />
          <button
            onClick={() => setShowInfo(true)}
            className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-sage-600 transition-colors"
            title="How scoring works"
          >
            <HelpCircle size={16} />
            <span>How it works</span>
          </button>
        </div>
        <h1 className="text-3xl font-bold text-stone-900">{tournament.name}</h1>
        {tournament.description && <p className="text-stone-500 mt-1">{tournament.description}</p>}

        <div className="flex flex-wrap gap-6 mt-4 text-sm text-stone-600">
          <span className="flex items-center gap-1">
            <Calendar size={15} />
            {parseLocalDate(tournament.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
          {totalPot > 0 && (
            <span className="flex items-center gap-1 text-sand-600 font-semibold">
              <Trophy size={15} />
              ${totalPot.toFixed(0)} pot
            </span>
          )}
          {ctpPot > 0 && (
            <span className="flex items-center gap-1 text-stone-500 text-xs font-medium">
              📍 CTP ${ctpPot.toFixed(0)}
            </span>
          )}
          {ldPot > 0 && (
            <span className="flex items-center gap-1 text-stone-500 text-xs font-medium">
              🏌️ LD ${ldPot.toFixed(0)}
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

      {/* Payout structure — only shown when there's an actual pot */}
      {(tournament.payoutStructure.length > 0 && totalPot > 0) || ctpPot > 0 || ldPot > 0 ? (
        <div className="card p-4 mb-6">
          <h2 className="font-semibold text-stone-800 mb-3 flex items-center gap-2">
            <Trophy size={16} className="text-sand-500" /> Prize Breakdown
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
            {ctpPot > 0 && (
              <div className="flex items-center justify-between py-2 text-sm">
                <span className="text-stone-600">📍 Closest to Pin</span>
                <span className="font-semibold text-stone-900">${ctpPot.toFixed(0)}</span>
              </div>
            )}
            {ldPot > 0 && (
              <div className="flex items-center justify-between py-2 text-sm">
                <span className="text-stone-600">🏌️ Longest Drive</span>
                <span className="font-semibold text-stone-900">${ldPot.toFixed(0)}</span>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Results link if completed */}
      {tournament.status === 'completed' && (
        <Link
          to={`/tournament/${id}/results`}
          className="btn-gold w-full justify-center mb-6"
        >
          <Trophy size={16} /> View Final Results
        </Link>
      )}

      {/* Live leaderboard */}
      {showLeaderboard && tournament.status !== 'completed' && (
        <div className="card mb-6">
          <div className="px-5 py-3.5 border-b border-stone-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-stone-800 flex items-center gap-2">
                <Trophy size={15} className="text-sand-500" />
                {tournament.status === 'active' ? 'Live Leaderboard' : 'Leaderboard'}
              </h2>
              {completedRoundsCount > 0 && rounds.length > 0 && (
                <p className="text-xs text-stone-400 mt-0.5">
                  After {completedRoundsCount} of {rounds.length} round{rounds.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <span className="text-xs text-stone-400">{tournament.isNet ? 'Net' : 'Gross'}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-50 text-stone-500 text-xs">
                  <th className="text-left px-5 py-2 font-medium">Rank</th>
                  <th className="text-left px-3 py-2 font-medium">Player</th>
                  {tournament.isGross && <th className="text-center px-3 py-2 font-medium">Gross</th>}
                  {tournament.isNet && <th className="text-center px-3 py-2 font-medium">Net</th>}
                  <th className="text-center px-3 py-2 font-medium hidden sm:table-cell">Back</th>
                  <th className="text-center px-3 py-2 font-medium">Rounds</th>
                  {totalPot > 0 && <th className="text-center px-3 py-2 font-medium">Projected $</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leaderboard.map((entry, idx) => {
                  const payout = tournament.payoutStructure[idx];
                  const projectedPayout = payout ? Math.round((payout.percentage / 100) * totalPot) : null;
                  const prevRank = entry.player ? prevRankMap.get(entry.player.id) : undefined;
                  const movement = prevRank !== undefined ? prevRank - (idx + 1) : null;
                  const leaderTotal = tournament.isNet ? leaderboard[0].totalNet : leaderboard[0].totalGross;
                  const entryTotal = tournament.isNet ? entry.totalNet : entry.totalGross;
                  const back = entryTotal - leaderTotal;
                  return (
                    <tr key={entry.playerName} className={idx === 0 ? 'bg-sand-50' : ''}>
                      <td className="px-5 py-2.5 font-bold text-stone-500">
                        <span className="flex items-center gap-1">
                          {idx === 0 ? '🏆' : idx + 1}
                          {movement !== null && (
                            movement > 0
                              ? <span className="text-xs text-green-600 font-normal">▲</span>
                              : movement < 0
                              ? <span className="text-xs text-red-500 font-normal">▼</span>
                              : <span className="text-xs text-stone-300 font-normal">—</span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-medium text-stone-900">
                        {entry.player
                          ? <Link to={`/players/${entry.player.id}`} className="hover:text-sage-600 hover:underline">{entry.playerName}</Link>
                          : entry.playerName}
                      </td>
                      {tournament.isGross && <td className="px-3 py-2.5 text-center">{entry.totalGross}</td>}
                      {tournament.isNet && <td className="px-3 py-2.5 text-center font-semibold">{entry.totalNet}</td>}
                      <td className="px-3 py-2.5 text-center text-xs hidden sm:table-cell">
                        {idx === 0
                          ? <span className="text-sage-600 font-medium">Leader</span>
                          : <span className="text-stone-500">+{back}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center text-stone-400">{entry.rounds}</td>
                      {totalPot > 0 && (
                        <td className="px-3 py-2.5 text-center font-semibold text-sage-700">
                          {projectedPayout ? `$${projectedPayout}` : '—'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rounds */}
      <h2 className="text-xl font-bold text-stone-800 mb-3">Rounds</h2>
      {rounds.length === 0 ? (
        <div className="card p-8 text-center text-stone-400 text-sm">No rounds scheduled yet.</div>
      ) : (
        <div className="space-y-3">
          {rounds.map(round => (
            <div key={round.id} ref={el => { roundRefs.current[round.id] = el; }}>
              <RoundCard
                round={round}
                scores={scoresByRound[round.id] ?? []}
                players={players}
                expanded={expandedRound === round.id}
                onToggle={() => setExpandedRound(expandedRound === round.id ? null : round.id)}
                isNet={tournament.isNet}
              />
            </div>
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
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
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
              {parseLocalDate(round.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <span>Par {round.par}</span>
            <span>Rating {round.courseRating} / Slope {round.slopeRating}</span>
          </div>
          {(round.closestToPinHole || round.longestDriveHole) && (
            <div className="flex flex-wrap gap-3 mt-1 text-xs text-stone-400">
              {round.closestToPinHole && (
                <span>
                  📍 CTP hole {round.closestToPinHole}
                  {round.closestToPinWinnerId
                    ? ` — ${players.find(p => p.id === round.closestToPinWinnerId)?.name ?? 'TBD'}`
                    : ''}
                </span>
              )}
              {round.longestDriveHole && (
                <span>
                  🏌️ LD hole {round.longestDriveHole}
                  {round.longestDriveWinnerId
                    ? ` — ${players.find(p => p.id === round.longestDriveWinnerId)?.name ?? 'TBD'}`
                    : ''}
                </span>
              )}
            </div>
          )}
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
                    const playerObj = players.find(p => p.id === score.playerId);
                    const isPlayerExpanded = expandedPlayer === score.id;
                    const histEntry = playerObj?.handicapHistory.find(h => h.roundId === round.id);
                    const histIdx = histEntry ? (playerObj?.handicapHistory.indexOf(histEntry) ?? -1) : -1;
                    const prevHcpEntry = histIdx > 0 ? playerObj?.handicapHistory[histIdx - 1] : null;
                    const hcpDelta = histEntry && prevHcpEntry
                      ? histEntry.handicapIndex - prevHcpEntry.handicapIndex
                      : null;
                    return (
                      <Fragment key={score.id}>
                        <tr
                          className={`cursor-pointer hover:bg-stone-50 transition-colors ${idx === 0 ? 'bg-sand-50' : ''}`}
                          onClick={() => setExpandedPlayer(isPlayerExpanded ? null : score.id)}
                        >
                          <td className="px-4 py-2.5 font-medium text-stone-900">
                            {idx === 0 && <Trophy size={12} className="text-sand-500 inline mr-1" />}
                            {playerObj
                              ? <Link to={`/players/${playerObj.id}`} onClick={e => e.stopPropagation()} className="hover:text-sage-600 hover:underline">{score.playerName}</Link>
                              : score.playerName}
                            {histEntry && (
                              <span className="ml-2 text-xs text-stone-400">
                                → {histEntry.handicapIndex.toFixed(1)}
                                {hcpDelta !== null && (
                                  <span className={hcpDelta < 0 ? 'text-green-600' : 'text-stone-400'}>
                                    {' '}({hcpDelta > 0 ? '+' : ''}{hcpDelta.toFixed(1)})
                                  </span>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center text-stone-500">{score.courseHandicap}</td>
                          <td className="px-3 py-2.5 text-center">{score.grossTotal}</td>
                          {isNet && <td className="px-3 py-2.5 text-center font-medium">{score.netTotal}</td>}
                          <td className={`px-3 py-2.5 text-center font-medium ${toPar < 0 ? 'text-red-600' : toPar === 0 ? 'text-green-600' : 'text-stone-700'}`}>
                            {toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar}
                          </td>
                        </tr>
                        {isPlayerExpanded && score.holeScores.length > 0 && (
                          <tr className="bg-stone-50">
                            <td colSpan={isNet ? 5 : 4} className="px-4 py-3 border-t border-stone-100">
                              <HoleScorecard holeScores={score.holeScores} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
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
                  {round.closestToPinWinnerId && (
                    <span className="font-medium text-stone-700 ml-1">
                      — {players.find(p => p.id === round.closestToPinWinnerId)?.name ?? 'Winner TBD'}
                    </span>
                  )}
                </span>
              )}
              {round.longestDriveHole && (
                <span className="flex items-center gap-1">
                  <span>🏌️</span>
                  LD: Hole {round.longestDriveHole}
                  {round.longestDriveWinnerId && (
                    <span className="font-medium text-stone-700 ml-1">
                      — {players.find(p => p.id === round.longestDriveWinnerId)?.name ?? 'Winner TBD'}
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HandicapInfoModal({ isNet, isGross, onClose }: { isNet: boolean; isGross: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 shrink-0">
          <h2 className="font-bold text-stone-900 text-lg">How Scoring Works</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 p-1 rounded-lg hover:bg-stone-100">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-5 py-4 space-y-5 text-sm text-stone-700">

          <section>
            <h3 className="font-semibold text-stone-900 mb-1.5">Handicap Index</h3>
            <p className="text-stone-600 leading-relaxed">
              Each player starts with a <span className="font-medium">manually entered Handicap Index</span> set
              by the tournament admin — this should reflect your current real-world handicap (e.g. from GHIN).
            </p>
            <p className="mt-2 text-stone-600 leading-relaxed">
              After each round is scored, your index is <span className="font-medium">automatically recalculated</span> using the{' '}
              <span className="font-medium">USGA World Handicap System</span>. A <span className="font-medium">differential</span> is computed for the round:
            </p>
            <div className="mt-2 bg-stone-50 rounded-lg px-4 py-3 font-mono text-xs text-stone-700 leading-relaxed">
              Differential = (Adjusted Gross − Course Rating) × 113 ÷ Slope Rating
            </div>
            <p className="mt-2 text-stone-500 text-xs">
              The new index is derived from the <span className="font-medium">best differentials</span> across
              your last 20 rounds in this system. Your manually entered starting index is used for round 1
              scoring, then replaced once that round's differential is recorded.
              How many differentials are used depends on how many rounds you have:
            </p>
            <div className="mt-2 bg-stone-50 rounded-lg px-4 py-2.5 text-xs space-y-1 text-stone-600">
              {[
                ['1–3 rounds', 'Lowest 1 (with −2 or −1 adjustment)'],
                ['4–5 rounds', 'Lowest 1'],
                ['6–8 rounds', 'Average of lowest 2'],
                ['9–11 rounds', 'Average of lowest 3'],
                ['12–14 rounds', 'Average of lowest 4'],
                ['15–16 rounds', 'Average of lowest 5'],
                ['17–18 rounds', 'Average of lowest 6'],
                ['19 rounds', 'Average of lowest 7'],
                ['20+ rounds', 'Average of best 8 of last 20 × 0.96'],
              ].map(([rounds, rule]) => (
                <div key={rounds} className="flex gap-3">
                  <span className="w-28 shrink-0 text-stone-400">{rounds}</span>
                  <span>{rule}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-semibold text-stone-900 mb-1.5">Course Handicap</h3>
            <p className="text-stone-600 leading-relaxed">
              Before each round, your Handicap Index is converted to a Course Handicap specific to that course and tee:
            </p>
            <div className="mt-2 bg-stone-50 rounded-lg px-4 py-3 font-mono text-xs text-stone-700">
              Course Handicap = Index × (Slope ÷ 113) + (Course Rating − Par)
            </div>
            <p className="mt-2 text-stone-500 text-xs">
              This accounts for the difficulty of the specific course and tee you're playing from.
              A harder course (higher slope or rating) gives you more strokes.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-stone-900 mb-1.5">Equitable Stroke Control (ESC)</h3>
            <p className="text-stone-600 leading-relaxed">
              To prevent one bad hole from unfairly inflating your handicap, the USGA caps the maximum score
              per hole before computing your differential:
            </p>
            <div className="mt-2 bg-stone-50 rounded-lg px-4 py-2.5 text-xs space-y-1 text-stone-600">
              {[
                ['0–9', 'Double bogey (Par + 2)'],
                ['10–19', '7'],
                ['20–29', '8'],
                ['30–39', '9'],
                ['40+', '10'],
              ].map(([hcp, max]) => (
                <div key={hcp} className="flex gap-3">
                  <span className="w-20 shrink-0 text-stone-400">HCP {hcp}</span>
                  <span>Max {max} per hole</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-stone-500 text-xs">
              ESC only affects the handicap differential calculation — your gross score for the leaderboard
              uses the actual strokes you took.
            </p>
          </section>

          {isNet && (
            <section>
              <h3 className="font-semibold text-stone-900 mb-1.5">Net Score</h3>
              <p className="text-stone-600 leading-relaxed">
                Net score subtracts your Course Handicap across the 18 holes. You receive{' '}
                <span className="font-medium">one stroke off</span> on holes whose Stroke Index (SI) is
                less than or equal to your Course Handicap, starting from the hardest hole (SI 1).
              </p>
              <p className="mt-2 text-stone-500 text-xs">
                Example: Course Handicap 12 → you get a stroke on the 12 hardest holes (SI 1–12).
                Net strokes on those holes = Gross strokes − 1.
              </p>
            </section>
          )}

          <section>
            <h3 className="font-semibold text-stone-900 mb-1.5">Leaderboard</h3>
            <p className="text-stone-600 leading-relaxed">
              {isNet && isGross
                ? 'The leaderboard ranks players by total net score (lowest wins). Gross scores are shown for reference.'
                : isNet
                ? 'The leaderboard ranks players by total net score across all rounds. Lowest net score wins.'
                : 'The leaderboard ranks players by total gross score across all rounds. Lowest gross score wins.'}
            </p>
            <p className="mt-2 text-stone-500 text-xs">
              Multi-round tournaments accumulate scores across all rounds. The leaderboard updates live
              as scores are entered — projected payouts are shown until all rounds are complete.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-stone-900 mb-1.5">A note on your starting index</h3>
            <p className="text-stone-600 leading-relaxed">
              Because handicaps here are recalculated from rounds played <span className="font-medium">in this system</span>,
              a player's index may differ from their official GHIN index after only a few rounds. The
              system uses USGA adjustment factors (e.g. −2 for 1 round) to compensate, but the index
              will stabilize to a reliable number once you have 6+ rounds recorded.
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}

function HoleScorecard({ holeScores }: { holeScores: { hole: number; par: number; strokes: number }[] }) {
  const front = holeScores.filter(h => h.hole <= 9).sort((a, b) => a.hole - b.hole);
  const back = holeScores.filter(h => h.hole > 9).sort((a, b) => a.hole - b.hole);
  const outGross = front.reduce((s, h) => s + h.strokes, 0);
  const outPar = front.reduce((s, h) => s + h.par, 0);
  const inGross = back.reduce((s, h) => s + h.strokes, 0);
  const inPar = back.reduce((s, h) => s + h.par, 0);

  function cellColor(strokes: number, par: number) {
    const d = strokes - par;
    if (d <= -2) return 'bg-yellow-100 font-bold';
    if (d === -1) return 'bg-red-100';
    if (d === 0) return 'bg-green-50';
    return '';
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse min-w-max">
        <thead>
          <tr className="text-stone-400">
            <th className="pr-3 py-1 text-left font-medium w-10">Hole</th>
            {front.map(h => <th key={h.hole} className="w-7 text-center">{h.hole}</th>)}
            <th className="w-8 text-center font-semibold text-stone-500 px-1">OUT</th>
            {back.map(h => <th key={h.hole} className="w-7 text-center">{h.hole}</th>)}
            <th className="w-8 text-center font-semibold text-stone-500 px-1">IN</th>
            <th className="w-8 text-center font-semibold text-stone-700 px-1">TOT</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-stone-400">
            <td className="pr-3 py-0.5 text-left">Par</td>
            {front.map(h => <td key={h.hole} className="text-center">{h.par}</td>)}
            <td className="text-center font-semibold text-stone-500">{outPar}</td>
            {back.map(h => <td key={h.hole} className="text-center">{h.par}</td>)}
            <td className="text-center font-semibold text-stone-500">{inPar}</td>
            <td className="text-center font-semibold text-stone-600">{outPar + inPar}</td>
          </tr>
          <tr>
            <td className="pr-3 py-0.5 text-left font-semibold text-stone-700">Score</td>
            {front.map(h => (
              <td key={h.hole} className={`text-center rounded ${cellColor(h.strokes, h.par)}`}>{h.strokes}</td>
            ))}
            <td className="text-center font-semibold text-stone-700">{outGross}</td>
            {back.map(h => (
              <td key={h.hole} className={`text-center rounded ${cellColor(h.strokes, h.par)}`}>{h.strokes}</td>
            ))}
            <td className="text-center font-semibold text-stone-700">{inGross}</td>
            <td className="text-center font-bold text-stone-900">{outGross + inGross}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
