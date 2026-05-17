import { useEffect, useState, useRef, FormEvent } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { roundsApi, tournamentsApi, playersApi, Round, Tournament, Player, Score } from '../../api/client';
import toast from 'react-hot-toast';
import { Save, Check, Info, X, ChevronDown, ChevronUp, Trophy } from 'lucide-react';

const DEFAULT_HOLES = Array.from({ length: 18 }, (_, i) => ({
  hole: i + 1,
  par: 4,
  handicap: i + 1,
  strokes: 0,
}));

function buildHoleInputs(round: Round) {
  if (round.holes && round.holes.length === 18) {
    return round.holes.map(h => ({ hole: h.number, par: h.par, handicap: h.handicap, strokes: 0 }));
  }
  return DEFAULT_HOLES.map(h => ({ ...h }));
}

export default function AdminRoundScoring() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const leaderboardRef = useRef<HTMLDivElement>(null);

  const [round, setRound] = useState<Round | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);

  const [activePlayer, setActivePlayer] = useState<Player | null>(null);
  const [holeInputs, setHoleInputs] = useState(DEFAULT_HOLES);
  const [manualHCP, setManualHCP] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandedScore, setExpandedScore] = useState<string | null>(null);

  const [ctpWinner, setCtpWinner] = useState('');
  const [ldWinner, setLdWinner] = useState('');

  // True when course hole data came from GHIN — lock par/SI columns
  const courseDataLoaded = Boolean(round?.holes && round.holes.length === 18);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const r = await roundsApi.get(id);
      setRound(r);
      setCtpWinner(r.closestToPinWinnerId ?? '');
      setLdWinner(r.longestDriveWinnerId ?? '');
      const [t, existingScores] = await Promise.all([
        tournamentsApi.get(r.tournamentId),
        roundsApi.scores(id),
      ]);
      setTournament(t);
      setScores(existingScores);
      const allPlayers = await playersApi.list();
      setPlayers(allPlayers.filter(p => t.playerIds.includes(p.id)));
      setLoading(false);
    };
    load();
  }, [id]);

  function startScoring(player: Player) {
    const existing = scores.find(s => s.playerId === player.id);
    if (existing) {
      setHoleInputs(existing.holeScores.map(h => ({
        hole: h.hole, par: h.par, handicap: h.handicap, strokes: h.strokes,
      })));
      setManualHCP(String(existing.courseHandicap));
    } else {
      setHoleInputs(buildHoleInputs(round!));
      setManualHCP('');
    }
    setActivePlayer(player);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmitScore(e: FormEvent) {
    e.preventDefault();
    if (!activePlayer || !round) return;
    setSubmitting(true);
    try {
      const result = await roundsApi.submitScore(round.id, {
        playerId: activePlayer.id,
        holeScores: holeInputs.map(h => ({
          hole: h.hole, strokes: Number(h.strokes), par: h.par, handicap: h.handicap,
        })),
        manualCourseHandicap: manualHCP ? Number(manualHCP) : undefined,
      }) as any;

      toast.success(
        `${activePlayer.name} — New HCP: ${result.handicapUpdate.newIndex.toFixed(1)}`
      );

      const updated = await roundsApi.scores(round.id);
      setScores(updated);
      setActivePlayer(null);

      // Scroll leaderboard into view
      setTimeout(() => leaderboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCompleteRound() {
    if (!round) return;
    try {
      await roundsApi.update(round.id, {
        closestToPinWinnerId: ctpWinner || undefined,
        longestDriveWinnerId: ldWinner || undefined,
      });
      await roundsApi.complete(round.id);
      toast.success('Round completed');
      navigate(`/admin/tournaments/${round.tournamentId}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function calcGross() { return holeInputs.reduce((s, h) => s + Number(h.strokes || 0), 0); }

  if (loading) return <div className="text-stone-500">Loading...</div>;
  if (!round || !tournament) return <div className="text-red-500">Round not found.</div>;

  const scoredPlayerIds = new Set(scores.map(s => s.playerId));
  const needsScoring = players.filter(p => !scoredPlayerIds.has(p.id));
  const hasCTP = tournament.hasClosestToPin && round.closestToPinHole;
  const hasLD = tournament.hasLongestDrive && round.longestDriveHole;
  const sortedScores = [...scores].sort((a, b) =>
    tournament.isNet ? a.netTotal - b.netTotal : a.grossTotal - b.grossTotal
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <Link to={`/admin/tournaments/${round.tournamentId}`} className="text-xs text-stone-400 hover:text-stone-600">← Tournament</Link>
        <h1 className="text-2xl font-bold text-stone-900 mt-1">{round.courseName}</h1>
        <div className="text-sm text-stone-500 mt-0.5">
          {round.tee} tees · Par {round.par} · {new Date(round.date).toLocaleDateString()}
          <span className="text-stone-400"> · Rating {round.courseRating} / Slope {round.slopeRating}</span>
        </div>
      </div>

      {/* Score entry form */}
      {activePlayer ? (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-stone-800 text-lg">{activePlayer.name}</h2>
              <div className="text-xs text-stone-500">HCP Index {activePlayer.handicapIndex.toFixed(1)}</div>
            </div>
            <button onClick={() => setActivePlayer(null)} className="text-stone-400 hover:text-stone-600 p-1"><X size={18} /></button>
          </div>

          <form onSubmit={handleSubmitScore} className="space-y-4">
            {/* HCP override — collapsed by default when course data loaded */}
            {!courseDataLoaded && (
              <div className="bg-blue-50 rounded-lg p-3 flex items-start gap-2 text-xs text-blue-700">
                <Info size={14} className="shrink-0 mt-0.5" />
                <span>
                  Course handicap auto-calculated: HCP Index × ({round.slopeRating}/113) + ({round.courseRating} − {round.par}).
                  Override only if needed.
                </span>
              </div>
            )}
            <div className="w-48">
              <label className="label">Course Handicap Override (optional)</label>
              <input className="input" type="number" min="0" max="54" value={manualHCP}
                onChange={e => setManualHCP(e.target.value)} placeholder="Auto-calculated" />
            </div>

            {/* Hole scores */}
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-xs text-stone-500 bg-stone-50">
                    <th className="text-left px-2 py-2 w-10">Hole</th>
                    <th className="px-2 py-2 w-10">Par</th>
                    {!courseDataLoaded && <th className="px-2 py-2 w-10">SI</th>}
                    <th className="px-2 py-2">Strokes</th>
                    <th className="px-2 py-2 text-stone-400">+/-</th>
                  </tr>
                </thead>
                <tbody>
                  {holeInputs.map((h, i) => {
                    const strokes = Number(h.strokes) || 0;
                    const diff = strokes ? strokes - h.par : null;
                    return (
                      <tr key={h.hole} className={i % 2 === 0 ? 'bg-white' : 'bg-stone-50/40'}>
                        <td className="px-2 py-1 font-medium text-stone-600 text-sm">{h.hole}</td>

                        {/* Par — read-only when course loaded, editable otherwise */}
                        <td className="px-2 py-1 text-center">
                          {courseDataLoaded ? (
                            <span className="text-sm text-stone-500">{h.par}</span>
                          ) : (
                            <input type="number" min="3" max="6"
                              className="w-10 text-center border border-stone-200 rounded px-1 py-0.5 text-xs"
                              value={h.par}
                              onChange={e => setHoleInputs(hs => hs.map((x, j) => j === i ? { ...x, par: Number(e.target.value) } : x))}
                            />
                          )}
                        </td>

                        {/* SI — hidden when course loaded */}
                        {!courseDataLoaded && (
                          <td className="px-2 py-1 text-center">
                            <input type="number" min="1" max="18"
                              className="w-10 text-center border border-stone-200 rounded px-1 py-0.5 text-xs"
                              value={h.handicap}
                              onChange={e => setHoleInputs(hs => hs.map((x, j) => j === i ? { ...x, handicap: Number(e.target.value) } : x))}
                            />
                          </td>
                        )}

                        {/* Strokes — always editable, large target */}
                        <td className="px-2 py-0.5">
                          <input
                            type="number" min="1" max="15" required
                            className="input text-center text-lg font-bold py-1.5"
                            value={h.strokes || ''}
                            onChange={e => setHoleInputs(hs => hs.map((x, j) => j === i ? { ...x, strokes: Number(e.target.value) } : x))}
                          />
                        </td>

                        <td className={`px-2 py-1 text-center text-xs font-semibold ${
                          diff === null ? 'text-stone-300'
                          : diff < 0 ? 'text-red-500'
                          : diff === 0 ? 'text-green-600'
                          : 'text-stone-500'
                        }`}>
                          {diff === null ? '—' : diff === 0 ? 'E' : diff > 0 ? `+${diff}` : diff}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-sage-50 font-semibold border-t-2 border-sage-200">
                    <td className="px-2 py-2 text-stone-700" colSpan={courseDataLoaded ? 2 : 3}>Total</td>
                    <td className="px-2 py-2 text-center text-xl font-bold text-stone-900">{calcGross() || '—'}</td>
                    <td className="px-2 py-2 text-center text-sm text-stone-500">
                      {calcGross() ? (() => {
                        const toPar = calcGross() - holeInputs.reduce((s, h) => s + h.par, 0);
                        return toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar;
                      })() : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="submit" className="btn-primary flex-1 justify-center" disabled={submitting}>
                <Save size={14} /> {submitting ? 'Saving...' : 'Submit Score'}
              </button>
              <button type="button" onClick={() => setActivePlayer(null)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      ) : (
        /* Player picker — only shown when not actively entering a score */
        needsScoring.length > 0 && (
          <div className="card p-4">
            <h2 className="font-semibold text-stone-700 mb-3 text-sm uppercase tracking-wide">Enter Score For</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {needsScoring.map(p => (
                <button
                  key={p.id}
                  onClick={() => startScoring(p)}
                  className="flex flex-col items-start p-3 bg-stone-50 hover:bg-sage-50 border border-stone-200 hover:border-sage-300 rounded-lg transition-colors text-left"
                >
                  <span className="font-medium text-stone-900 text-sm">{p.name}</span>
                  <span className="text-xs text-stone-400 mt-0.5">HCP {p.handicapIndex.toFixed(1)}</span>
                </button>
              ))}
            </div>
          </div>
        )
      )}

      {/* Live leaderboard — always visible, updates after each score */}
      <div ref={leaderboardRef}>
        {sortedScores.length > 0 && (
          <div className="card">
            <div className="px-5 py-3.5 border-b border-stone-100 flex items-center justify-between">
              <h2 className="font-semibold text-stone-800 flex items-center gap-2">
                <Trophy size={15} className="text-sand-500" />
                Live Leaderboard
                <span className="text-xs font-normal text-stone-400">
                  {scores.length}/{players.length} scores entered
                </span>
              </h2>
              <span className="text-xs text-stone-400">{tournament.isNet ? 'Net' : 'Gross'}</span>
            </div>
            <div className="divide-y divide-stone-50">
              {sortedScores.map((s, i) => {
                const toPar = (tournament.isNet ? s.netTotal : s.grossTotal) - round.par;
                const isExpanded = expandedScore === s.id;
                return (
                  <div key={s.id}>
                    <div className={`flex items-center px-5 py-3 ${i === 0 ? 'bg-sand-50' : ''}`}>
                      <span className="w-6 text-sm font-bold text-stone-400 shrink-0">
                        {i === 0 ? '🏆' : i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-stone-900 text-sm">{s.playerName}</div>
                        <div className="text-xs text-stone-400">
                          Course HCP {s.courseHandicap}
                          {s.handicapDifferential !== undefined && ` · Diff ${s.handicapDifferential}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          {tournament.isNet && (
                            <div className="text-sm font-bold text-stone-900">Net {s.netTotal}</div>
                          )}
                          {tournament.isGross && (
                            <div className={`text-sm ${tournament.isNet ? 'text-xs text-stone-400' : 'font-bold text-stone-900'}`}>
                              Gross {s.grossTotal}
                            </div>
                          )}
                          <div className={`text-xs font-semibold ${toPar < 0 ? 'text-red-500' : toPar === 0 ? 'text-green-600' : 'text-stone-500'}`}>
                            {toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startScoring(players.find(p => p.id === s.playerId)!)}
                            className="text-xs text-sage-600 hover:underline px-1"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setExpandedScore(isExpanded ? null : s.id)}
                            className="text-stone-300 hover:text-stone-500 p-1"
                          >
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-5 pb-4 bg-stone-50 border-t border-stone-100">
                        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2 mt-3">Adjustments</p>
                        {s.adjustments.length === 0 ? (
                          <p className="text-xs text-stone-400">No adjustments applied.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {s.adjustments.map((adj, j) => (
                              <div key={j} className="text-xs bg-white rounded p-2.5 border border-stone-200 text-stone-600">
                                <span className="font-semibold text-stone-700">[{adj.type.replace('_', ' ').toUpperCase()}]</span>
                                {adj.hole ? ` Hole ${adj.hole}:` : ''} {adj.reason}
                                {adj.originalValue !== adj.adjustedValue && (
                                  <span className="text-stone-400 ml-1">({adj.originalValue} → {adj.adjustedValue})</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Special contests */}
      {(hasCTP || hasLD) && !activePlayer && (
        <div className="card p-5">
          <h2 className="font-semibold text-stone-800 mb-4">Special Contests</h2>
          <div className="space-y-4">
            {hasCTP && (
              <div>
                <label className="label">Closest to Pin Winner (Hole {round.closestToPinHole})</label>
                <select className="input" value={ctpWinner} onChange={e => setCtpWinner(e.target.value)}>
                  <option value="">— Select winner —</option>
                  {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            {hasLD && (
              <div>
                <label className="label">Longest Drive Winner (Hole {round.longestDriveHole})</label>
                <select className="input" value={ldWinner} onChange={e => setLdWinner(e.target.value)}>
                  <option value="">— Select winner —</option>
                  {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Complete round */}
      {round.status !== 'completed' && scores.length === players.length && players.length > 0 && !activePlayer && (
        <div className="card p-5 border-l-4 border-sage-500">
          <h2 className="font-semibold text-stone-800 mb-1">All scores entered!</h2>
          <p className="text-sm text-stone-500 mb-4">Mark this round as complete to finalize scores and update the leaderboard.</p>
          <button onClick={handleCompleteRound} className="btn-primary">
            <Check size={15} /> Complete Round
          </button>
        </div>
      )}
    </div>
  );
}
