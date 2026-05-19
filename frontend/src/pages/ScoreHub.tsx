import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { scoringApi, ActiveRoundsForScoring } from '../api/client';
import { Loader2, Hash, ChevronRight, HelpCircle } from 'lucide-react';
import { parseLocalDate } from '../lib/dates';
import HelpModal, { HelpSection, HelpStep, HelpTip } from '../components/HelpModal';

export default function ScoreHub() {
  const [rounds, setRounds] = useState<ActiveRoundsForScoring[]>([]);
  const [loading, setLoading] = useState(true);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    scoringApi.activeRounds()
      .then(setRounds)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = pin.trim();
    if (!trimmed) { setPinError('Enter a 4-digit PIN'); return; }
    navigate(`/score/${trimmed}`);
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      {showHelp && <ScorekeeperHelp onClose={() => setShowHelp(false)} />}

      <div className="flex items-start justify-between mb-1">
        <h1 className="text-2xl font-bold text-stone-900">Score Entry</h1>
        <button
          onClick={() => setShowHelp(true)}
          className="flex items-center gap-1 text-xs text-stone-400 hover:text-sage-600 transition-colors mt-1"
        >
          <HelpCircle size={15} />
          How to score
        </button>
      </div>
      <p className="text-stone-500 text-sm mb-6">Enter your group's PIN to start scoring.</p>

      {/* PIN entry */}
      <form onSubmit={handlePinSubmit} className="card p-4 mb-6">
        <label className="label mb-1">Group PIN</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Hash size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setPinError(''); }}
              placeholder="1234"
              className="input pl-8 text-center text-xl tracking-widest font-mono w-full"
              autoFocus
            />
          </div>
          <button type="submit" className="btn-primary px-5">
            <ChevronRight size={18} />
            Go
          </button>
        </div>
        {pinError && <p className="text-red-500 text-xs mt-1">{pinError}</p>}
      </form>

      {/* Active rounds / groups */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-stone-400" /></div>
      ) : rounds.length === 0 ? (
        <p className="text-stone-400 text-sm text-center py-8">No active rounds right now.</p>
      ) : (
        <div className="space-y-4">
          {rounds.map(t => (
            <div key={t.tournamentId}>
              <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">{t.tournamentName}</h2>
              {t.rounds.map(r => (
                <div key={r.roundId} className="card p-3 mb-2">
                  <div className="text-sm font-medium text-stone-800 mb-0.5">{r.courseName}</div>
                  <div className="text-xs text-stone-400 mb-2">
                    {parseLocalDate(r.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                  <div className="divide-y divide-stone-100">
                    {r.groups.map(g => (
                      <button
                        key={g.groupNumber}
                        onClick={() => g.pin && navigate(`/score/${g.pin}`)}
                        disabled={!g.pin}
                        className="w-full flex items-center justify-between py-2 text-left hover:bg-stone-50 disabled:opacity-40 rounded"
                      >
                        <div>
                          <span className="text-sm font-medium text-stone-700">Group {g.groupNumber}</span>
                          {g.teeTime && <span className="text-xs text-stone-400 ml-2">{g.teeTime}</span>}
                          {g.startingHole && <span className="text-xs text-stone-400 ml-1">· Hole {g.startingHole}</span>}
                        </div>
                        {g.pin ? (
                          <span className="text-xs font-mono bg-sage-50 text-sage-700 border border-sage-200 px-2 py-0.5 rounded">
                            PIN {g.pin}
                          </span>
                        ) : (
                          <span className="text-xs text-stone-300">No PIN</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Scorekeeper Help ──────────────────────────────────────────────────────────

function ScorekeeperHelp({ onClose }: { onClose: () => void }) {
  return (
    <HelpModal title="How to Score Your Round" onClose={onClose}>
      <HelpSection title="Getting Started">
        <HelpStep n={1}>Find your group in the list below, or get your 4-digit PIN from your group organizer.</HelpStep>
        <HelpStep n={2}>Tap your group row, or type the PIN above and tap <strong>Go</strong>.</HelpStep>
        <HelpStep n={3}>You'll see a score entry screen for every player in your group.</HelpStep>
      </HelpSection>

      <HelpSection title="Entering Scores">
        <HelpStep n={1}>Type each player's stroke count into their box for the current hole.</HelpStep>
        <HelpStep n={2}>Tap <strong>Next</strong> to advance to the next hole — scores sync automatically.</HelpStep>
        <HelpStep n={3}>
          Use the <strong>hole dots</strong> at the top to jump to any hole:
          <ul className="mt-1 ml-1 space-y-0.5 text-stone-500">
            <li>• <span className="text-sage-600 font-medium">Bright green</span> — all players scored</li>
            <li>• <span className="text-sage-700 font-medium">Dim green</span> — some players scored</li>
            <li>• Dark — not started</li>
          </ul>
        </HelpStep>
        <HelpStep n={4}>
          Score badges show relative to par: <span className="text-yellow-700 font-medium">Eagle+</span>, <span className="text-red-600 font-medium">Birdie</span>, <span className="text-green-700 font-medium">Par</span>, or <span className="text-stone-500">+N</span> over.
        </HelpStep>
      </HelpSection>

      <HelpSection title="Reviewing & Submitting">
        <HelpStep n={1}>After hole 18, tap <strong>Review &amp; Submit</strong>.</HelpStep>
        <HelpStep n={2}>The review screen shows the full scorecard. Any missing holes are highlighted in yellow.</HelpStep>
        <HelpStep n={3}>Compare with your paper scorecard.</HelpStep>
        <HelpStep n={4}>Tap <strong>Submit Scorecard</strong> when everything looks correct.</HelpStep>
        <HelpStep n={5}>You'll see a confirmation screen. The tournament admin will review and confirm your card.</HelpStep>
      </HelpSection>

      <HelpSection title="Tips">
        <HelpTip>
          <strong>Scores save locally as you go.</strong> If the app closes or you lose signal, your progress is preserved — just reopen the app and re-enter your PIN.
        </HelpTip>
        <HelpTip>
          You can jump back to any hole and edit scores before submitting. Once submitted, contact the tournament admin to make corrections.
        </HelpTip>
        <HelpTip>
          If your PIN shows "Invalid PIN", the round may not be active yet or the PIN hasn't been assigned. Check with your organizer.
        </HelpTip>
      </HelpSection>
    </HelpModal>
  );
}
