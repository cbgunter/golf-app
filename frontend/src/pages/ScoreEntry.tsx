import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { scoringApi, PinLookupResult, DraftScorecard } from '@shared/client';
import { Loader2, CheckCircle, ChevronLeft, ChevronRight, Send, AlertCircle } from 'lucide-react';

const DRAFT_KEY = (pin: string) => `golf_draft_${pin}`;

// Persist draft to localStorage
function saveDraftLocally(pin: string, holes: Record<string, Record<string, number>>) {
  try { localStorage.setItem(DRAFT_KEY(pin), JSON.stringify(holes)); } catch {}
}

function loadLocalDraft(pin: string): Record<string, Record<string, number>> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(pin));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearLocalDraft(pin: string) {
  try { localStorage.removeItem(DRAFT_KEY(pin)); } catch {}
}

type Phase = 'loading' | 'entry' | 'review' | 'submitted' | 'confirmed' | 'error';

export default function ScoreEntry() {
  const { pin } = useParams<{ pin: string }>();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<PinLookupResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // holes[playerId][holeNumber] = strokes
  const [holes, setHoles] = useState<Record<string, Record<string, number>>>({});
  const [currentHole, setCurrentHole] = useState(1);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const totalHoles = info?.holes?.length ?? 18;

  useEffect(() => {
    if (!pin) { setPhase('error'); setErrorMsg('No PIN provided.'); return; }

    scoringApi.lookupByPin(pin)
      .then(result => {
        setInfo(result);
        // Merge server draft + local draft (local takes precedence for newer edits)
        const serverHoles = result.draft?.holes ?? {};
        const localHoles = loadLocalDraft(pin) ?? {};
        const merged: Record<string, Record<string, number>> = {};
        for (const pid of result.players.map(p => p.id)) {
          merged[pid] = { ...(serverHoles[pid] ?? {}), ...(localHoles[pid] ?? {}) };
        }
        setHoles(merged);

        // Start on the first unscored hole
        const allHoleNums = result.holes.length > 0
          ? result.holes.map(h => h.number)
          : Array.from({ length: 18 }, (_, i) => i + 1);
        const firstUnscored = allHoleNums.find(n =>
          result.players.some(p => !(merged[p.id]?.[String(n)] != null))
        ) ?? allHoleNums[0];
        setCurrentHole(firstUnscored);

        if (result.draft?.status === 'confirmed') {
          setPhase('confirmed');
        } else if (result.draft?.status === 'submitted') {
          setPhase('submitted');
        } else {
          setPhase('entry');
        }
      })
      .catch(e => {
        setPhase('error');
        setErrorMsg(e.message ?? 'Invalid PIN');
      });
  }, [pin]);

  function getHoleInfo(holeNum: number) {
    return info?.holes?.find(h => h.number === holeNum) ?? { number: holeNum, par: 4, handicap: holeNum };
  }

  function setScore(playerId: string, holeNum: number, val: string) {
    const num = val === '' ? undefined : Math.max(1, Math.min(15, Number(val)));
    setHoles(prev => {
      const updated = {
        ...prev,
        [playerId]: { ...(prev[playerId] ?? {}), ...(num != null ? { [String(holeNum)]: num } : {}) },
      };
      if (num == null) delete updated[playerId][String(holeNum)];
      if (pin) saveDraftLocally(pin, updated);
      return updated;
    });
  }

  async function syncCurrentHole() {
    if (!pin || !info) return;
    const holeScores: Record<string, number> = {};
    for (const p of info.players) {
      const s = holes[p.id]?.[String(currentHole)];
      if (s != null) holeScores[p.id] = s;
    }
    if (Object.keys(holeScores).length === 0) return;
    setSaving(true);
    try {
      await scoringApi.saveDraftHole(pin, currentHole, holeScores);
    } catch {
      // local draft is already saved; server sync is best-effort
    } finally {
      setSaving(false);
    }
  }

  async function goToHole(next: number) {
    await syncCurrentHole();
    setCurrentHole(next);
    // Focus first input on next hole
    setTimeout(() => {
      const firstPlayer = info?.players[0];
      if (firstPlayer) inputRefs.current[firstPlayer.id]?.focus();
    }, 50);
  }

  async function handleReview() {
    await syncCurrentHole();
    setPhase('review');
  }

  async function handleSubmit() {
    if (!pin) return;
    setSubmitting(true);
    try {
      // Sync all holes first
      if (info) {
        const allHoleNums = info.holes.length > 0
          ? info.holes.map(h => h.number)
          : Array.from({ length: 18 }, (_, i) => i + 1);
        for (const h of allHoleNums) {
          const holeScores: Record<string, number> = {};
          for (const p of info.players) {
            const s = holes[p.id]?.[String(h)];
            if (s != null) holeScores[p.id] = s;
          }
          if (Object.keys(holeScores).length > 0) {
            await scoringApi.saveDraftHole(pin, h, holeScores);
          }
        }
      }
      await scoringApi.submitDraft(pin);
      clearLocalDraft(pin);
      setPhase('submitted');
    } catch (e: any) {
      alert(e.message ?? 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 text-ep-silver">
        <Loader2 className="animate-spin" size={32} />
        <p>Looking up PIN…</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6 text-center">
        <AlertCircle size={40} className="text-red-400" />
        <h2 className="text-xl font-heading font-semibold text-ep-green">Invalid PIN</h2>
        <p className="text-ep-silver text-sm">{errorMsg}</p>
        <button onClick={() => navigate('/score')} className="btn-secondary">Back to Score Hub</button>
      </div>
    );
  }

  if (phase === 'submitted') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6 text-center">
        <CheckCircle size={48} className="text-ep-orange" />
        <h2 className="text-2xl font-heading font-extrabold text-ep-green">Scores Submitted!</h2>
        <p className="text-ep-silver text-sm">
          Your scorecard for Group {info?.groupNumber} has been submitted.<br />
          The tournament admin will review and confirm your scores.
        </p>
        <button onClick={() => navigate('/')} className="btn-primary mt-2">Back to Home</button>
      </div>
    );
  }

  if (phase === 'confirmed') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6 text-center">
        <CheckCircle size={48} className="text-ep-orange" />
        <h2 className="text-2xl font-heading font-extrabold text-ep-green">Scores Confirmed</h2>
        <p className="text-ep-silver text-sm">
          Your scorecard for Group {info?.groupNumber} has been reviewed and confirmed by the tournament admin.
          No further changes can be made.
        </p>
        <button onClick={() => navigate('/')} className="btn-primary mt-2">Back to Home</button>
      </div>
    );
  }

  if (phase === 'review' && info) {
    return <ReviewScreen info={info} holes={holes} onEdit={() => setPhase('entry')} onSubmit={handleSubmit} submitting={submitting} />;
  }

  if (!info) return null;

  // ── Entry phase ───────────────────────────────────────────────────────────
  const holeInfo = getHoleInfo(currentHole);
  const allHoleNums = info.holes.length > 0
    ? info.holes.map(h => h.number)
    : Array.from({ length: 18 }, (_, i) => i + 1);
  const currentIdx = allHoleNums.indexOf(currentHole);
  const isLastHole = currentIdx === allHoleNums.length - 1;
  const totalEntered = info.players.reduce((count, p) => {
    return count + allHoleNums.filter(n => holes[p.id]?.[String(n)] != null).length;
  }, 0);
  const totalExpected = info.players.length * allHoleNums.length;

  return (
    <div className="max-w-lg mx-auto min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-ep-green text-ep-cream px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button onClick={() => navigate('/score')} className="p-1 hover:text-ep-cream/80">
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <div className="text-sm font-heading font-semibold">{info.courseName}</div>
          <div className="text-xs text-ep-cream/70">Group {info.groupNumber} · {info.teeTime}</div>
        </div>
        <div className="text-right text-xs text-ep-cream/70">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <span>{totalEntered}/{totalExpected}</span>}
        </div>
      </div>

      {/* Hole navigation dots */}
      <div className="bg-ep-deep px-3 py-1.5 flex gap-1 flex-wrap justify-center">
        {allHoleNums.map(n => {
          const allScored = info.players.every(p => holes[p.id]?.[String(n)] != null);
          const someScored = info.players.some(p => holes[p.id]?.[String(n)] != null);
          return (
            <button
              key={n}
              onClick={() => goToHole(n)}
              className={`w-6 h-6 rounded text-xs font-medium transition-colors ${
                n === currentHole
                  ? 'bg-ep-cream text-ep-green font-bold'
                  : allScored
                  ? 'bg-ep-green text-ep-cream'
                  : someScored
                  ? 'bg-ep-green/60 text-ep-cream/70'
                  : 'bg-ep-green/30 text-ep-cream/50'
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>

      {/* Hole info */}
      <div className="bg-ep-cream border-b border-ep-silver/20 px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-2xl font-heading font-extrabold text-ep-green">Hole {currentHole}</div>
          <div className="text-sm text-ep-silver">Par {holeInfo.par} · HCP {holeInfo.handicap}</div>
        </div>
        <div className="text-4xl font-light text-ep-silver/40">Par {holeInfo.par}</div>
      </div>

      {/* Score inputs */}
      <div className="flex-1 px-4 py-4 space-y-3">
        {info.players.map(player => {
          const score = holes[player.id]?.[String(currentHole)];
          const diff = score != null ? score - holeInfo.par : null;
          return (
            <div key={player.id} className="card p-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="text-sm font-semibold text-ep-green">{player.name}</div>
                <div className="text-xs text-ep-silver">HCP {player.handicapIndex}</div>
              </div>
              <div className="flex items-center gap-2">
                {diff != null && (
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                    diff <= -2 ? 'bg-ep-orange/30 text-ep-orange' :
                    diff === -1 ? 'bg-ep-orange/15 text-ep-orange/80' :
                    diff === 0 ? 'bg-ep-green/15 text-ep-green' :
                    'bg-ep-silver/20 text-ep-silver'
                  }`}>
                    {diff <= -2 ? 'Eagle+' : diff === -1 ? 'Birdie' : diff === 0 ? 'Par' : `+${diff}`}
                  </span>
                )}
                <input
                  ref={el => { inputRefs.current[player.id] = el; }}
                  type="number"
                  min={1}
                  max={15}
                  value={score ?? ''}
                  onChange={e => setScore(player.id, currentHole, e.target.value)}
                  onFocus={e => e.target.select()}
                  placeholder="–"
                  className="w-16 text-center text-2xl font-bold border-2 border-ep-silver/50 rounded-lg focus:border-ep-green focus:outline-none py-2 bg-ep-cream text-ep-green"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Running totals */}
      {info.players.some(p => Object.keys(holes[p.id] ?? {}).length > 0) && (
        <div className="bg-ep-sand/60 border-t border-ep-silver/20 px-4 py-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-ep-silver">
                <th className="text-left font-normal pb-0.5">Player</th>
                <th className="text-center font-normal pb-0.5 w-10">Out</th>
                <th className="text-center font-normal pb-0.5 w-10">In</th>
                <th className="text-center font-semibold pb-0.5 w-10 text-ep-green/70">Tot</th>
              </tr>
            </thead>
            <tbody>
              {info.players.map(p => {
                const front = allHoleNums.filter(n => n <= 9).reduce((s, n) => s + (holes[p.id]?.[String(n)] ?? 0), 0);
                const back = allHoleNums.filter(n => n >= 10).reduce((s, n) => s + (holes[p.id]?.[String(n)] ?? 0), 0);
                const hasFront = allHoleNums.filter(n => n <= 9).some(n => holes[p.id]?.[String(n)] != null);
                const hasBack = allHoleNums.filter(n => n >= 10).some(n => holes[p.id]?.[String(n)] != null);
                return (
                  <tr key={p.id}>
                    <td className="py-0.5 text-ep-green/80 font-medium">{p.name.split(' ')[0]}</td>
                    <td className="py-0.5 text-center text-ep-silver">{hasFront ? front : '—'}</td>
                    <td className="py-0.5 text-center text-ep-silver">{hasBack ? back : '—'}</td>
                    <td className="py-0.5 text-center font-bold text-ep-green">{hasFront || hasBack ? front + back : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Navigation */}
      <div className="sticky bottom-0 bg-ep-cream border-t border-ep-silver/20 px-4 py-3 flex gap-2">
        <button
          onClick={() => currentIdx > 0 && goToHole(allHoleNums[currentIdx - 1])}
          disabled={currentIdx === 0}
          className="btn-secondary flex-1 disabled:opacity-30"
        >
          <ChevronLeft size={16} /> Prev
        </button>

        {isLastHole ? (
          <button onClick={handleReview} className="btn-primary flex-1">
            <CheckCircle size={16} /> Review & Submit
          </button>
        ) : (
          <button
            onClick={() => goToHole(allHoleNums[currentIdx + 1])}
            className="btn-primary flex-1"
          >
            Next <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Review Screen ─────────────────────────────────────────────────────────────
function ReviewScreen({
  info,
  holes,
  onEdit,
  onSubmit,
  submitting,
}: {
  info: PinLookupResult;
  holes: Record<string, Record<string, number>>;
  onEdit: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const allHoleNums = info.holes.length > 0
    ? info.holes.map(h => h.number)
    : Array.from({ length: 18 }, (_, i) => i + 1);

  const missingScores = info.players.flatMap(p =>
    allHoleNums.filter(n => holes[p.id]?.[String(n)] == null).map(n => ({ player: p.name, hole: n }))
  );

  return (
    <div className="max-w-lg mx-auto min-h-screen flex flex-col">
      <div className="bg-ep-green text-ep-cream px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={onEdit} className="p-1 hover:text-ep-cream/80"><ChevronLeft size={20} /></button>
        <div>
          <div className="font-heading font-semibold">Review Scorecard</div>
          <div className="text-xs text-ep-cream/70">{info.courseName} · Group {info.groupNumber}</div>
        </div>
      </div>

      <div className="flex-1 px-4 py-4 overflow-auto">
        {missingScores.length > 0 && (
          <div className="bg-ep-orange/10 border border-ep-orange/40 rounded-lg p-3 mb-4 text-sm text-ep-orange">
            <div className="font-semibold mb-1">Missing scores</div>
            {missingScores.map((m, i) => (
              <div key={i}>{m.player} · Hole {m.hole}</div>
            ))}
          </div>
        )}

        {/* Scorecard table */}
        <div className="card overflow-x-auto mb-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-ep-sand">
                <th className="text-left px-3 py-2 font-medium text-ep-silver">Player</th>
                {allHoleNums.map(n => (
                  <th key={n} className="px-1 py-2 text-center text-ep-silver font-normal">{n}</th>
                ))}
                <th className="px-2 py-2 text-center font-medium text-ep-green/70">Tot</th>
              </tr>
            </thead>
            <tbody>
              {info.players.map(player => {
                const scoredNums = allHoleNums.filter(n => holes[player.id]?.[String(n)] != null);
                const total = scoredNums.reduce((sum, n) => sum + holes[player.id][String(n)], 0);
                const isComplete = scoredNums.length === allHoleNums.length;
                return (
                  <tr key={player.id} className="border-t border-ep-silver/20">
                    <td className="px-3 py-2 font-medium text-ep-green whitespace-nowrap">{player.name}</td>
                    {allHoleNums.map(n => {
                      const s = holes[player.id]?.[String(n)];
                      const hInfo = info.holes.find(h => h.number === n);
                      const diff = s != null && hInfo ? s - hInfo.par : null;
                      return (
                        <td key={n} className="px-1 py-2 text-center">
                          <span className={`inline-block w-5 h-5 rounded text-center leading-5 ${
                            s == null ? 'text-ep-silver/40' :
                            diff != null && diff <= -2 ? 'bg-ep-orange/30 font-bold' :
                            diff === -1 ? 'bg-ep-orange/15' :
                            diff === 0 ? 'bg-ep-green/10' :
                            ''
                          }`}>
                            {s ?? '–'}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-center font-bold text-ep-green">
                      {scoredNums.length === 0 ? '–' : isComplete ? total : `${total}*`}
                    </td>
                  </tr>
                );
              })}
              {/* Par row */}
              <tr className="border-t border-ep-silver/30 bg-ep-sand">
                <td className="px-3 py-1 text-ep-silver text-xs">Par</td>
                {allHoleNums.map(n => {
                  const hInfo = info.holes.find(h => h.number === n);
                  return <td key={n} className="px-1 py-1 text-center text-ep-silver">{hInfo?.par ?? 4}</td>;
                })}
                <td className="px-2 py-1 text-center text-ep-green/70 font-medium">{info.par}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-xs text-ep-silver text-center mb-1">
          Compare with your paper scorecard before submitting. The admin will do a final review.
        </p>
        {info.players.some(p => allHoleNums.some(n => holes[p.id]?.[String(n)] == null)) && (
          <p className="text-xs text-ep-orange text-center mb-4">* Partial total — some holes not yet scored.</p>
        )}
      </div>

      <div className="sticky bottom-0 bg-ep-cream border-t border-ep-silver/20 px-4 py-3 flex gap-2">
        <button onClick={onEdit} className="btn-secondary flex-1">Edit Scores</button>
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="btn-primary flex-1"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Submit Scorecard
        </button>
      </div>
    </div>
  );
}
