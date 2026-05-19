import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { scoringApi, ActiveRoundsForScoring } from '../api/client';
import { Loader2, Hash, ChevronRight } from 'lucide-react';
import { parseLocalDate } from '../lib/dates';

export default function ScoreHub() {
  const [rounds, setRounds] = useState<ActiveRoundsForScoring[]>([]);
  const [loading, setLoading] = useState(true);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

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
      <h1 className="text-2xl font-bold text-stone-900 mb-1">Score Entry</h1>
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
