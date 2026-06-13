import { useEffect, useState, useRef, FormEvent } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { roundsApi, tournamentsApi, playersApi, scoringApi, Round, Tournament, Player, Score, DraftScorecard } from '@shared/client';
import toast from 'react-hot-toast';
import { Save, Check, X, ChevronDown, ChevronUp, Trophy } from 'lucide-react';
import { parseLocalDate } from '@shared/dates';

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
  const [savingWinners, setSavingWinners] = useState(false);
  const [winnersSaved, setWinnersSaved] = useState(false);

  const [drafts, setDrafts] = useState<DraftScorecard[]>([]);
  const [confirmingGroup, setConfirmingGroup] = useState<number | null>(null);
  const [expandedDraft, setExpandedDraft] = useState<number | null>(null);

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
      try { setDrafts(await scoringApi.getDrafts(id)); } catch {}
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

      // Reflect edited scores in the draft scorecard display
      const playerGroup = round.teeTimeGroups?.find(g => g.playerIds.includes(activePlayer.id));
      if (playerGroup) {
        const holeMap: Record<string, number> = {};
        holeInputs.forEach(h => { holeMap[String(h.hole)] = Number(h.strokes); });
        setDrafts(prev => prev.map(d =>
          d.groupNumber === playerGroup.groupNumber
            ? { ...d, holes: { ...d.holes, [activePlayer.id]: holeMap } }
            : d
        ));
      }

      setActivePlayer(null);

      // Scroll leaderboard into view
      setTimeout(() => leaderboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function saveWinners(newCtp: string, newLd: string) {
    if (!round) return;
    setSavingWinners(true);
    setWinnersSaved(false);
    try {
      await roundsApi.update(round.id, {
        closestToPinWinnerId: newCtp || undefined,
        longestDriveWinnerId: newLd || undefined,
      });
      setWinnersSaved(true);
      setTimeout(() => setWinnersSaved(false), 2000);
    } catch (e: any) {
      toast.error('Failed to save winner');
    } finally {
      setSavingWinners(false);
    }
  }

  async function handleCompleteRound() {
    if (!round) return;
    const withdrawnIds = new Set(tournament?.withdrawnPlayerIds ?? []);
    const activePlayers = players.filter(p => !withdrawnIds.has(p.id));
    const activeScored = scores.filter(s => !withdrawnIds.has(s.playerId));
    if (activeScored.length < activePlayers.length) {
      const missing = activePlayers.length - activeScored.length;
      const ok = window.confirm(
        `${missing} player${missing > 1 ? 's are' : ' is'} missing a score. Complete the round anyway?`
      );
      if (!ok) return;
    }
    try {
      await roundsApi.complete(round.id);
      toast.success('Round completed');
      navigate(`/tournaments/${round.tournamentId}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function calcGross() { return holeInputs.reduce((s, h) => s + Number(h.strokes || 0), 0); }

  async function handleConfirmDraft(groupNumber: number) {
    if (!round) return;
    setConfirmingGroup(groupNumber);
    try {
      await scoringApi.confirmDraft(round.id, groupNumber);
      const [updated, updatedDrafts] = await Promise.all([
        roundsApi.scores(round.id),
        scoringApi.getDrafts(round.id),
      ]);
      setScores(updated);
      setDrafts(updatedDrafts);
      setExpandedDraft(null);
      toast.success(`Pairing ${groupNumber} scores confirmed`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setConfirmingGroup(null);
    }
  }

  if (loading) return <div className="text-ep-silver">Loading...</div>;
  if (!round || !tournament) return <div className="text-red-500">Round not found.</div>;

  const withdrawnIds = new Set(tournament.withdrawnPlayerIds ?? []);
  const scoredPlayerIds = new Set(scores.map(s => s.playerId));
  const needsScoring = players.filter(p => !scoredPlayerIds.has(p.id) && !withdrawnIds.has(p.id));
  const hasCTP = tournament.hasClosestToPin && round.closestToPinHole;
  const hasLD = tournament.hasLongestDrive && round.longestDriveHole;
  const sortedScores = [...scores].sort((a, b) =>
    tournament.isNet ? a.netTotal - b.netTotal : a.grossTotal - b.grossTotal
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <Link to={`/tournaments/${round.tournamentId}`} className="text-xs text-ep-silver hover:text-ep-green">← Tournament</Link>
        <h1 className="page-header mt-1">{round.courseName}</h1>
        <div className="text-sm text-ep-silver mt-0.5">
          {round.tee} tees · Par {round.par} · {parseLocalDate(round.date).toLocaleDateString()}
          <span className="text-ep-silver/60"> · Rating {round.courseRating} / Slope {round.slopeRating}</span>
        </div>
      </div>

      {/* Scorecard Submissions — shown at top when drafts exist */}
      {drafts.length > 0 && !activePlayer && (
        <div className="card p-5">
          <h2 className="font-semibold text-ep-green mb-3 text-sm uppercase tracking-wide">Scorecard Submissions</h2>
          <div className="space-y-2">
            {drafts.map(draft => {
              const group = round.teeTimeGroups?.find(g => g.groupNumber === draft.groupNumber);
              const groupPlayers = players.filter(p => group?.playerIds.includes(p.id));
              const allHoleNums = round.holes?.length
                ? round.holes.map(h => h.number)
                : Array.from({ length: 18 }, (_, i) => i + 1);
              const isExpanded = expandedDraft === draft.groupNumber;
              const isSubmitted = draft.status === 'submitted';
              const alreadyConfirmed = groupPlayers.every(p => scoredPlayerIds.has(p.id));

              return (
                <div key={draft.groupNumber} className={`border rounded-lg ${isSubmitted ? 'border-ep-green/20 bg-ep-green/5' : 'border-ep-silver/30'}`}>
                  <button
                    onClick={() => setExpandedDraft(isExpanded ? null : draft.groupNumber)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ep-green">Pairing {draft.groupNumber}</span>
                      {group?.teeTime && <span className="text-xs text-ep-silver">{group.teeTime}</span>}
                      {alreadyConfirmed ? (
                        <span className="text-xs bg-ep-green/10 text-ep-green px-2 py-0.5 rounded-full">Confirmed</span>
                      ) : isSubmitted ? (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Submitted — awaiting review</span>
                      ) : (
                        <span className="text-xs bg-ep-sand text-ep-silver px-2 py-0.5 rounded-full">In progress</span>
                      )}
                    </div>
                    {isExpanded ? <ChevronUp size={15} className="text-ep-silver" /> : <ChevronDown size={15} className="text-ep-silver" />}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-ep-silver/20">
                      <div className="overflow-x-auto mt-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-ep-sand/40">
                              <th className="text-left px-2 py-1.5 font-medium text-ep-silver">Player</th>
                              {allHoleNums.slice(0, 9).map(n => (
                                <th key={n} className="px-1 py-1.5 text-center text-ep-silver font-normal w-6">{n}</th>
                              ))}
                              <th className="px-2 py-1.5 text-center font-medium text-ep-green bg-ep-sand">Out</th>
                              {allHoleNums.slice(9).map(n => (
                                <th key={n} className="px-1 py-1.5 text-center text-ep-silver font-normal w-6">{n}</th>
                              ))}
                              <th className="px-2 py-1.5 text-center font-medium text-ep-green bg-ep-sand">In</th>
                              <th className="px-2 py-1.5 text-center font-medium text-ep-green bg-ep-sand/70">Tot</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groupPlayers.map(player => {
                              const front = allHoleNums.slice(0, 9).reduce((sum, n) => sum + (draft.holes[player.id]?.[String(n)] ?? 0), 0);
                              const back = allHoleNums.slice(9).reduce((sum, n) => sum + (draft.holes[player.id]?.[String(n)] ?? 0), 0);
                              const total = front + back;
                              return (
                                <tr key={player.id} className="border-t border-ep-silver/20">
                                  <td className="px-2 py-2 font-medium text-ep-green whitespace-nowrap">{player.name}</td>
                                  {allHoleNums.slice(0, 9).map(n => {
                                    const s = draft.holes[player.id]?.[String(n)];
                                    const hInfo = round.holes?.find(h => h.number === n);
                                    const diff = s != null && hInfo ? s - hInfo.par : null;
                                    return (
                                      <td key={n} className="px-1 py-2 text-center">
                                        <span className={`inline-block w-5 h-5 rounded text-center leading-5 ${
                                          s == null ? 'text-ep-silver/40' :
                                          diff != null && diff <= -2 ? 'bg-yellow-200 font-bold' :
                                          diff === -1 ? 'bg-red-200' :
                                          diff === 0 ? 'bg-green-100' : ''
                                        }`}>
                                          {s ?? '–'}
                                        </span>
                                      </td>
                                    );
                                  })}
                                  <td className="px-2 py-2 text-center font-semibold text-ep-green bg-ep-sand">{front || '–'}</td>
                                  {allHoleNums.slice(9).map(n => {
                                    const s = draft.holes[player.id]?.[String(n)];
                                    const hInfo = round.holes?.find(h => h.number === n);
                                    const diff = s != null && hInfo ? s - hInfo.par : null;
                                    return (
                                      <td key={n} className="px-1 py-2 text-center">
                                        <span className={`inline-block w-5 h-5 rounded text-center leading-5 ${
                                          s == null ? 'text-ep-silver/40' :
                                          diff != null && diff <= -2 ? 'bg-yellow-200 font-bold' :
                                          diff === -1 ? 'bg-red-200' :
                                          diff === 0 ? 'bg-green-100' : ''
                                        }`}>
                                          {s ?? '–'}
                                        </span>
                                      </td>
                                    );
                                  })}
                                  <td className="px-2 py-2 text-center font-semibold text-ep-green bg-ep-sand">{back || '–'}</td>
                                  <td className="px-2 py-2 text-center font-bold text-ep-green bg-ep-sand/70">{total || '–'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {isSubmitted && !alreadyConfirmed && (
                        <button
                          onClick={() => handleConfirmDraft(draft.groupNumber)}
                          disabled={confirmingGroup === draft.groupNumber}
                          className="btn-primary mt-3 text-sm"
                        >
                          {confirmingGroup === draft.groupNumber ? 'Confirming…' : '✓ Confirm Scores'}
                        </button>
                      )}
                      {alreadyConfirmed && (
                        <p className="text-xs text-ep-orange mt-2">Scores have been confirmed and finalized.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Score entry form */}
      {activePlayer ? (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-ep-green text-lg">{activePlayer.name}</h2>
              <div className="text-xs text-ep-silver">HCP Index {activePlayer.handicapIndex.toFixed(1)}</div>
            </div>
            <button onClick={() => setActivePlayer(null)} className="text-ep-silver hover:text-ep-green p-1"><X size={18} /></button>
          </div>

          <form onSubmit={handleSubmitScore} className="space-y-4">
            {/* HCP override */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-44">
                <label className="label">Course Handicap Override</label>
                <input className="input" type="number" min="0" max="54" value={manualHCP}
                  onChange={e => setManualHCP(e.target.value)} placeholder="Auto-calculated" />
              </div>
              {!manualHCP && (
                <p className="text-xs text-ep-silver pb-2">
                  Auto: {activePlayer.handicapIndex.toFixed(1)} × ({round.slopeRating}/113) + ({round.courseRating}−{round.par})
                </p>
              )}
            </div>

            {/* Scorecard */}
            <div className="overflow-x-auto -mx-5">
              <table className="min-w-max text-sm border-collapse">
                <thead>
                  <tr className="bg-ep-deep text-ep-cream text-xs">
                    <th className="pl-5 pr-4 py-2.5 text-left font-medium sticky left-0 bg-ep-deep z-10 min-w-[3.5rem]">Hole</th>
                    {[0,1,2,3,4,5,6,7,8].map(i => (
                      <th key={i} className="w-10 py-2.5 text-center font-medium">{i+1}</th>
                    ))}
                    <th className="w-12 py-2.5 text-center font-medium bg-ep-green/80">OUT</th>
                    {[9,10,11,12,13,14,15,16,17].map(i => (
                      <th key={i} className="w-10 py-2.5 text-center font-medium">{i+1}</th>
                    ))}
                    <th className="w-12 py-2.5 text-center font-medium bg-ep-green/80">IN</th>
                    <th className="w-12 py-2.5 text-center font-medium bg-ep-deep pr-5">TOT</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Par row */}
                  <tr className="bg-ep-sand/30 border-b border-ep-silver/30">
                    <td className="pl-5 pr-4 py-2 text-xs font-semibold text-ep-silver uppercase tracking-wide sticky left-0 bg-ep-sand/30 z-10">Par</td>
                    {holeInputs.slice(0, 9).map((h, i) => (
                      <td key={i} className="py-2 text-center text-sm text-ep-green/70">
                        {courseDataLoaded ? h.par : (
                          <input type="number" min="3" max="6"
                            className="w-9 text-center border border-ep-silver/30 rounded py-0.5 text-xs"
                            value={h.par}
                            onChange={e => setHoleInputs(hs => hs.map((x, j) => j === i ? { ...x, par: Number(e.target.value) } : x))} />
                        )}
                      </td>
                    ))}
                    <td className="py-2 text-center text-sm font-semibold text-ep-green bg-ep-sand">
                      {holeInputs.slice(0, 9).reduce((s, h) => s + h.par, 0)}
                    </td>
                    {holeInputs.slice(9).map((h, i) => (
                      <td key={i + 9} className="py-2 text-center text-sm text-ep-green/70">
                        {courseDataLoaded ? h.par : (
                          <input type="number" min="3" max="6"
                            className="w-9 text-center border border-ep-silver/30 rounded py-0.5 text-xs"
                            value={h.par}
                            onChange={e => setHoleInputs(hs => hs.map((x, j) => j === (i + 9) ? { ...x, par: Number(e.target.value) } : x))} />
                        )}
                      </td>
                    ))}
                    <td className="py-2 text-center text-sm font-semibold text-ep-green bg-ep-sand">
                      {holeInputs.slice(9).reduce((s, h) => s + h.par, 0)}
                    </td>
                    <td className="py-2 pr-5 text-center text-sm font-bold text-ep-green bg-ep-sand/50">
                      {holeInputs.reduce((s, h) => s + h.par, 0)}
                    </td>
                  </tr>

                  {/* HCP / SI row */}
                  <tr className="border-b border-ep-silver/30">
                    <td className="pl-5 pr-4 py-1.5 text-xs font-semibold text-ep-silver uppercase tracking-wide sticky left-0 bg-ep-cream z-10">HCP</td>
                    {holeInputs.slice(0, 9).map((h, i) => (
                      <td key={i} className="py-1.5 text-center">
                        {courseDataLoaded ? (
                          <span className="text-xs text-ep-silver">{h.handicap}</span>
                        ) : (
                          <input type="number" min="1" max="18"
                            className="w-9 text-center border border-ep-silver/30 rounded py-0.5 text-xs"
                            value={h.handicap}
                            onChange={e => setHoleInputs(hs => hs.map((x, j) => j === i ? { ...x, handicap: Number(e.target.value) } : x))} />
                        )}
                      </td>
                    ))}
                    <td className="bg-ep-sand" />
                    {holeInputs.slice(9).map((h, i) => (
                      <td key={i + 9} className="py-1.5 text-center">
                        {courseDataLoaded ? (
                          <span className="text-xs text-ep-silver">{h.handicap}</span>
                        ) : (
                          <input type="number" min="1" max="18"
                            className="w-9 text-center border border-ep-silver/30 rounded py-0.5 text-xs"
                            value={h.handicap}
                            onChange={e => setHoleInputs(hs => hs.map((x, j) => j === (i + 9) ? { ...x, handicap: Number(e.target.value) } : x))} />
                        )}
                      </td>
                    ))}
                    <td className="bg-ep-sand" />
                    <td className="bg-ep-sand/70" />
                  </tr>

                  {/* Score input row */}
                  <tr className="bg-ep-cream">
                    <td className="pl-5 pr-4 py-2 text-xs font-semibold text-ep-silver uppercase tracking-wide sticky left-0 bg-ep-cream z-10">Score</td>
                    {holeInputs.slice(0, 9).map((h, i) => {
                      const strokes = Number(h.strokes) || 0;
                      const diff = strokes > 0 ? strokes - h.par : null;
                      const cellBg = diff === null ? '' : diff <= -2 ? 'bg-yellow-100' : diff === -1 ? 'bg-red-100' : diff === 0 ? 'bg-green-50' : '';
                      return (
                        <td key={i} className={`py-1.5 px-0.5 text-center ${cellBg}`}>
                          <input
                            type="number" min="1" max="15" required
                            className="w-9 h-9 text-center text-sm font-bold rounded border border-ep-silver/30 focus:border-ep-orange focus:outline-none bg-transparent"
                            value={h.strokes || ''}
                            onChange={e => setHoleInputs(hs => hs.map((x, j) => j === i ? { ...x, strokes: Number(e.target.value) } : x))}
                          />
                        </td>
                      );
                    })}
                    <td className="text-center font-bold text-ep-green bg-ep-sand py-1.5 text-base">
                      {holeInputs.slice(0, 9).reduce((s, h) => s + (Number(h.strokes) || 0), 0) || '—'}
                    </td>
                    {holeInputs.slice(9).map((h, i) => {
                      const strokes = Number(h.strokes) || 0;
                      const diff = strokes > 0 ? strokes - h.par : null;
                      const cellBg = diff === null ? '' : diff <= -2 ? 'bg-yellow-100' : diff === -1 ? 'bg-red-100' : diff === 0 ? 'bg-green-50' : '';
                      return (
                        <td key={i + 9} className={`py-1.5 px-0.5 text-center ${cellBg}`}>
                          <input
                            type="number" min="1" max="15" required
                            className="w-9 h-9 text-center text-sm font-bold rounded border border-ep-silver/30 focus:border-ep-orange focus:outline-none bg-transparent"
                            value={h.strokes || ''}
                            onChange={e => setHoleInputs(hs => hs.map((x, j) => j === (i + 9) ? { ...x, strokes: Number(e.target.value) } : x))}
                          />
                        </td>
                      );
                    })}
                    <td className="text-center font-bold text-ep-green bg-ep-sand py-1.5 text-base">
                      {holeInputs.slice(9).reduce((s, h) => s + (Number(h.strokes) || 0), 0) || '—'}
                    </td>
                    <td className="pr-5 text-center font-bold text-ep-green bg-ep-sand/70 py-1.5 text-lg">
                      {calcGross() || '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Score summary + actions */}
            <div className="flex items-center justify-between gap-4 pt-1">
              <div className="text-sm text-ep-silver">
                {(() => {
                  const front = holeInputs.slice(0, 9).reduce((s, h) => s + (Number(h.strokes) || 0), 0);
                  const back = holeInputs.slice(9).reduce((s, h) => s + (Number(h.strokes) || 0), 0);
                  const gross = front + back;
                  const totalPar = holeInputs.reduce((s, h) => s + h.par, 0);
                  const toPar = gross - totalPar;
                  return (
                    <span className="flex flex-wrap gap-x-3 gap-y-1">
                      <span>Out <strong className="text-ep-green">{front || '—'}</strong></span>
                      <span>In <strong className="text-ep-green">{back || '—'}</strong></span>
                      {gross > 0 && (
                        <>
                          <span>Gross <strong className="text-ep-green">{gross}</strong></span>
                          <span className={`font-semibold ${toPar < 0 ? 'text-red-500' : toPar === 0 ? 'text-green-600' : 'text-ep-green/70'}`}>
                            {toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar}
                          </span>
                        </>
                      )}
                    </span>
                  );
                })()}
              </div>
              <div className="flex gap-2 shrink-0">
                <button type="button" onClick={() => setActivePlayer(null)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  <Save size={14} /> {submitting ? 'Saving…' : 'Submit Score'}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : (
        /* Player picker — shown when not actively entering a score */
        players.length > 0 && (() => {
          const groups = round.teeTimeGroups ?? [];
          const hasGroups = groups.length > 0;

          function PlayerBtn({ p }: { p: Player }) {
            const hasScore = scoredPlayerIds.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => startScoring(p)}
                className={`flex flex-col items-start p-3 border rounded-lg transition-colors text-left ${
                  hasScore
                    ? 'bg-ep-green/5 hover:bg-ep-green/10 border-ep-green/20 hover:border-ep-green/30'
                    : 'bg-ep-sand/30 hover:bg-ep-sand border-ep-silver/30 hover:border-ep-green/30'
                }`}
              >
                <span className="font-medium text-ep-green text-sm">{p.name}</span>
                <span className={`text-xs mt-0.5 ${hasScore ? 'text-ep-orange' : 'text-ep-silver'}`}>
                  {hasScore ? '✓ Edit score' : `HCP ${p.handicapIndex.toFixed(1)}`}
                </span>
              </button>
            );
          }

          if (hasGroups) {
            const assignedIds = new Set(groups.flatMap(g => g.playerIds));
            const ungrouped = players.filter(p => !assignedIds.has(p.id));
            return (
              <div className="card p-4 space-y-4">
                <h2 className="font-semibold text-ep-green text-sm uppercase tracking-wide">
                  {needsScoring.length > 0 ? `Enter Score For · ${needsScoring.length} remaining` : 'Edit Scores'}
                </h2>
                {groups.map(g => {
                  const groupPlayers = players.filter(p => g.playerIds.includes(p.id));
                  if (groupPlayers.length === 0) return null;
                  return (
                    <div key={g.groupNumber}>
                      <div className="text-xs font-semibold text-ep-silver uppercase tracking-wide mb-2">
                        Pairing {g.groupNumber} · {g.teeTime}
                        {g.startingHole ? ` · Hole ${g.startingHole}` : ''}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {groupPlayers.map(p => <PlayerBtn key={p.id} p={p} />)}
                      </div>
                    </div>
                  );
                })}
                {ungrouped.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-ep-silver uppercase tracking-wide mb-2">Unassigned</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {ungrouped.map(p => <PlayerBtn key={p.id} p={p} />)}
                    </div>
                  </div>
                )}
              </div>
            );
          }

          return (
            <div className="card p-4">
              <h2 className="font-semibold text-ep-green mb-3 text-sm uppercase tracking-wide">
                {needsScoring.length > 0 ? `Enter Score For · ${needsScoring.length} remaining` : 'Edit Scores'}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {players.map(p => <PlayerBtn key={p.id} p={p} />)}
              </div>
            </div>
          );
        })()
      )}

      {/* Live leaderboard — always visible, updates after each score */}
      <div ref={leaderboardRef}>
        {sortedScores.length > 0 && (
          <div className="card">
            <div className="px-5 py-3.5 border-b border-ep-silver/20 flex items-center justify-between">
              <h2 className="font-semibold text-ep-green flex items-center gap-2">
                <Trophy size={15} className="text-ep-orange" />
                Live Leaderboard
                <span className="text-xs font-normal text-ep-silver">
                  {scores.length}/{players.length} scores entered
                </span>
              </h2>
              <span className="text-xs text-ep-silver">{tournament.isNet ? 'Net' : 'Gross'}</span>
            </div>
            <div className="divide-y divide-ep-silver/10">
              {sortedScores.map((s, i) => {
                const toPar = (tournament.isNet ? s.netTotal : s.grossTotal) - round.par;
                const isExpanded = expandedScore === s.id;
                return (
                  <div key={s.id}>
                    <div className={`flex items-center px-5 py-3 ${i === 0 ? 'bg-ep-orange/5' : ''}`}>
                      <span className="w-6 text-sm font-bold text-ep-silver shrink-0">
                        {i === 0 ? '🏆' : i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-ep-green text-sm">{s.playerName}</div>
                        <div className="text-xs text-ep-silver">
                          Course HCP {s.courseHandicap}
                          {s.handicapDifferential !== undefined && ` · Diff ${s.handicapDifferential}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          {tournament.isNet && (
                            <div className="text-sm font-bold text-ep-green">Net {s.netTotal}</div>
                          )}
                          {tournament.isGross && (
                            <div className={`text-sm ${tournament.isNet ? 'text-xs text-ep-silver' : 'font-bold text-ep-green'}`}>
                              Gross {s.grossTotal}
                            </div>
                          )}
                          <div className={`text-xs font-semibold ${toPar < 0 ? 'text-red-500' : toPar === 0 ? 'text-green-600' : 'text-ep-silver'}`}>
                            {toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startScoring(players.find(p => p.id === s.playerId)!)}
                            className="text-xs text-ep-orange hover:underline px-1"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setExpandedScore(isExpanded ? null : s.id)}
                            className="text-ep-silver/40 hover:text-ep-silver p-1"
                          >
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-5 pb-4 bg-ep-sand/30 border-t border-ep-silver/20">
                        <p className="text-xs font-semibold text-ep-silver uppercase tracking-wider mb-2 mt-3">Adjustments</p>
                        {s.adjustments.length === 0 ? (
                          <p className="text-xs text-ep-silver">No adjustments applied.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {s.adjustments.map((adj, j) => (
                              <div key={j} className="text-xs bg-ep-cream rounded p-2.5 border border-ep-silver/30 text-ep-green/70">
                                <span className="font-semibold text-ep-green">[{adj.type.replace('_', ' ').toUpperCase()}]</span>
                                {adj.hole ? ` Hole ${adj.hole}:` : ''} {adj.reason}
                                {adj.originalValue !== adj.adjustedValue && (
                                  <span className="text-ep-silver ml-1">({adj.originalValue} → {adj.adjustedValue})</span>
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
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-semibold text-ep-green">Special Contests</h2>
            {savingWinners && <span className="text-xs text-ep-silver">Saving…</span>}
            {winnersSaved && <span className="text-xs text-green-600 font-medium">Saved ✓</span>}
          </div>
          <div className="space-y-4">
            {hasCTP && (
              <div>
                <label className="label">Closest to Pin Winner (Hole {round.closestToPinHole})</label>
                <select className="input" value={ctpWinner} onChange={e => {
                  const v = e.target.value;
                  setCtpWinner(v);
                  saveWinners(v, ldWinner);
                }}>
                  <option value="">— Select winner —</option>
                  {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            {hasLD && (
              <div>
                <label className="label">Longest Drive Winner (Hole {round.longestDriveHole})</label>
                <select className="input" value={ldWinner} onChange={e => {
                  const v = e.target.value;
                  setLdWinner(v);
                  saveWinners(ctpWinner, v);
                }}>
                  <option value="">— Select winner —</option>
                  {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Complete round */}
      {round.status !== 'completed' && scores.length > 0 && !activePlayer && (
        <div className={`card p-5 border-l-4 ${scores.length === players.length ? 'border-ep-orange' : 'border-ep-silver/30'}`}>
          <h2 className="font-semibold text-ep-green mb-1">
            {scores.length === players.length ? 'All scores entered!' : `${scores.length} of ${players.length} scores entered`}
          </h2>
          <p className="text-sm text-ep-silver mb-4">Mark this round as complete to finalize scores and update the leaderboard.</p>
          <button onClick={handleCompleteRound} className="btn-primary">
            <Check size={15} /> Complete Round
          </button>
        </div>
      )}

      {round.status === 'completed' && !activePlayer && (
        <div className="card p-5 border-l-4 border-ep-silver/30">
          <h2 className="font-semibold text-ep-green mb-1">Round Completed</h2>
          <p className="text-sm text-ep-silver mb-4">Reopen to add or edit scores.</p>
          <button
            onClick={async () => {
              try {
                const updated = await roundsApi.reopen(round.id) as any;
                setRound(updated);
                toast.success('Round reopened');
              } catch (e: any) { toast.error(e.message); }
            }}
            className="btn-secondary"
          >
            Reopen Round
          </button>
        </div>
      )}
    </div>
  );
}
