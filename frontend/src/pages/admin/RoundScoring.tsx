import { useEffect, useState, FormEvent } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { roundsApi, tournamentsApi, playersApi, Round, Tournament, Player, Score } from '../../api/client';
import toast from 'react-hot-toast';
import { Save, Check, Info, X, ChevronDown, ChevronUp } from 'lucide-react';

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

  const [round, setRound] = useState<Round | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);

  const [activePlayer, setActivePlayer] = useState<Player | null>(null);
  const [holeInputs, setHoleInputs] = useState(DEFAULT_HOLES);
  const [manualHCP, setManualHCP] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingScore, setEditingScore] = useState<Score | null>(null);
  const [expandedScore, setExpandedScore] = useState<string | null>(null);

  // Special contest winners
  const [ctpWinner, setCtpWinner] = useState('');
  const [ldWinner, setLdWinner] = useState('');

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
      // Load existing into form for editing
      setEditingScore(existing);
      setHoleInputs(existing.holeScores.map(h => ({
        hole: h.hole, par: h.par, handicap: h.handicap, strokes: h.strokes,
      })));
      setManualHCP(String(existing.courseHandicap));
    } else {
      setEditingScore(null);
      setHoleInputs(buildHoleInputs(round!));
      setManualHCP('');
    }
    setActivePlayer(player);
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
        `Score submitted. New HCP: ${result.handicapUpdate.newIndex.toFixed(1)} (was ${result.handicapUpdate.previousIndex.toFixed(1)})`
      );

      const updated = await roundsApi.scores(round.id);
      setScores(updated);
      setActivePlayer(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCompleteRound() {
    if (!round) return;
    // Save contest winners first
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link to={`/admin/tournaments/${round.tournamentId}`} className="text-xs text-stone-400 hover:text-stone-600">← Tournament</Link>
        <h1 className="text-2xl font-bold text-stone-900 mt-1">Round Scoring</h1>
        <div className="text-sm text-stone-500 mt-1">
          {round.courseName} · {round.tee} tees · Par {round.par} · {new Date(round.date).toLocaleDateString()}
        </div>
        <div className="text-xs text-stone-400 mt-0.5">
          Rating {round.courseRating} / Slope {round.slopeRating}
        </div>
      </div>

      {/* Score entry */}
      {activePlayer && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-stone-800">Entering score for {activePlayer.name}</h2>
              <div className="text-xs text-stone-500 mt-0.5">HCP Index: {activePlayer.handicapIndex.toFixed(1)}</div>
            </div>
            <button onClick={() => setActivePlayer(null)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
          </div>

          <form onSubmit={handleSubmitScore} className="space-y-4">
            {/* Manual HCP override */}
            <div className="bg-blue-50 rounded-lg p-3 flex items-start gap-2 text-xs text-blue-700">
              <Info size={14} className="shrink-0 mt-0.5" />
              <div>
                Course handicap is auto-calculated: HCP Index × ({round.slopeRating}/113) + ({round.courseRating} − {round.par}).
                Override only if needed.
              </div>
            </div>
            <div className="w-48">
              <label className="label">Course Handicap Override (optional)</label>
              <input className="input" type="number" min="0" max="54" value={manualHCP} onChange={e => setManualHCP(e.target.value)} placeholder="Auto-calculated" />
            </div>

            {/* Hole scores */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-xs text-stone-500 bg-stone-50">
                    <th className="text-left px-2 py-2">Hole</th>
                    <th className="px-2 py-2">Par</th>
                    <th className="px-2 py-2">SI</th>
                    <th className="px-2 py-2 w-20">Strokes</th>
                    <th className="px-2 py-2 text-stone-400">+/-</th>
                  </tr>
                </thead>
                <tbody>
                  {holeInputs.map((h, i) => {
                    const strokes = Number(h.strokes) || 0;
                    const diff = strokes ? strokes - h.par : null;
                    return (
                      <tr key={h.hole} className={i % 2 === 0 ? 'bg-white' : 'bg-stone-50/50'}>
                        <td className="px-2 py-1 font-medium text-stone-700">{h.hole}</td>
                        <td className="px-2 py-1 text-center">
                          <input
                            type="number" min="3" max="6"
                            className="w-10 text-center border border-stone-200 rounded px-1 py-0.5 text-xs"
                            value={h.par}
                            onChange={e => setHoleInputs(hs => hs.map((x, j) => j === i ? { ...x, par: Number(e.target.value) } : x))}
                          />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <input
                            type="number" min="1" max="18"
                            className="w-10 text-center border border-stone-200 rounded px-1 py-0.5 text-xs"
                            value={h.handicap}
                            onChange={e => setHoleInputs(hs => hs.map((x, j) => j === i ? { ...x, handicap: Number(e.target.value) } : x))}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number" min="1" max="15" required
                            className="input text-center text-base font-semibold"
                            value={h.strokes || ''}
                            onChange={e => setHoleInputs(hs => hs.map((x, j) => j === i ? { ...x, strokes: Number(e.target.value) } : x))}
                          />
                        </td>
                        <td className={`px-2 py-1 text-center text-xs font-medium ${diff === null ? 'text-stone-300' : diff < 0 ? 'text-red-500' : diff === 0 ? 'text-green-600' : 'text-stone-600'}`}>
                          {diff === null ? '—' : diff === 0 ? 'E' : diff > 0 ? `+${diff}` : diff}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-sage-50 font-semibold">
                    <td className="px-2 py-2" colSpan={3}>Total</td>
                    <td className="px-2 py-2 text-center text-lg">{calcGross()}</td>
                    <td className="px-2 py-2 text-center text-xs text-stone-500">
                      {calcGross() ? (calcGross() > 0 ? `+${calcGross() - holeInputs.reduce((s, h) => s + h.par, 0)}` : 'E') : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={submitting}>
                <Save size={14} /> {submitting ? 'Saving...' : 'Submit Score'}
              </button>
              <button type="button" onClick={() => setActivePlayer(null)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Players needing scores */}
      {!activePlayer && needsScoring.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-stone-800 mb-3">Enter Scores</h2>
          <div className="space-y-2">
            {needsScoring.map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-stone-50 rounded-lg">
                <div>
                  <div className="font-medium text-sm text-stone-900">{p.name}</div>
                  <div className="text-xs text-stone-400">HCP Index {p.handicapIndex.toFixed(1)}</div>
                </div>
                <button onClick={() => startScoring(p)} className="btn-primary text-xs">
                  Enter Score
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Existing scores */}
      {scores.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-stone-100">
            <h2 className="font-semibold text-stone-800">Entered Scores</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {scores.sort((a, b) => tournament.isNet ? a.netTotal - b.netTotal : a.grossTotal - b.grossTotal).map((s, i) => (
              <div key={s.id}>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-stone-400 w-5">{i + 1}</span>
                    <div>
                      <div className="font-medium text-stone-900">{s.playerName}</div>
                      <div className="text-xs text-stone-400">Course HCP {s.courseHandicap} · Diff {s.handicapDifferential}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm font-semibold">Net {s.netTotal}</div>
                      <div className="text-xs text-stone-400">Gross {s.grossTotal}</div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => startScoring(players.find(p => p.id === s.playerId)!)}
                        className="text-xs text-sage-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setExpandedScore(expandedScore === s.id ? null : s.id)}
                        className="text-stone-400 p-1"
                      >
                        {expandedScore === s.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>
                </div>

                {expandedScore === s.id && (
                  <div className="px-5 pb-4 bg-stone-50 border-t border-stone-100">
                    <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2 mt-3">Score Adjustments & Transparency</p>
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
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Special contests */}
      {(hasCTP || hasLD) && (
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
      {round.status !== 'completed' && scores.length === players.length && players.length > 0 && (
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
