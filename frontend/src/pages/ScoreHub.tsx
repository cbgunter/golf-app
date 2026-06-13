import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { scoringApi, roundsApi, ActiveRoundsForScoring, Score } from '@shared/client';
import { Loader2, HelpCircle, ChevronLeft, CheckCircle } from 'lucide-react';
import { parseLocalDate } from '@shared/dates';
import HelpModal, { HelpSection, HelpStep, HelpTip } from '../components/HelpModal';

export default function ScoreHub() {
  const { tournamentId } = useParams<{ tournamentId?: string }>();
  const [rounds, setRounds] = useState<ActiveRoundsForScoring[]>([]);
  const [roundScores, setRoundScores] = useState<Record<string, Score[]>>({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    scoringApi.activeRounds(tournamentId)
      .then(async data => {
        setRounds(data);
        const allRoundIds = data.flatMap(t => t.rounds.map(r => r.roundId));
        const results = await Promise.all(
          allRoundIds.map(id => roundsApi.scores(id).then(s => ({ id, s })).catch(() => ({ id, s: [] as Score[] })))
        );
        const map: Record<string, Score[]> = {};
        for (const { id, s } of results) map[id] = s;
        setRoundScores(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tournamentId]);

  return (
    <div className="max-w-lg mx-auto min-h-screen flex flex-col">
      {showHelp && <ScorekeeperHelp onClose={() => setShowHelp(false)} />}

      {/* Sticky header */}
      <div className="bg-ep-green text-ep-cream px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link to="/" className="flex items-center gap-1 text-ep-cream/70 hover:text-ep-cream transition-colors">
          <ChevronLeft size={18} />
          <span className="text-sm">Home</span>
        </Link>
        <span className="font-heading font-semibold text-base">Score Entry</span>
        <button
          onClick={() => setShowHelp(true)}
          className="flex items-center gap-1 text-xs text-ep-cream/70 hover:text-ep-cream transition-colors"
        >
          <HelpCircle size={15} />
          Help
        </button>
      </div>

      <div className="px-4 py-6 flex-1">
      <p className="text-ep-silver text-sm mb-6">Tap your group below to start scoring.</p>

      {/* Active rounds / groups */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-ep-silver" /></div>
      ) : rounds.length === 0 ? (
        <p className="text-ep-silver text-sm text-center py-8">No active rounds right now.</p>
      ) : (
        <div className="space-y-4">
          {rounds.map(t => (
            <div key={t.tournamentId}>
              <h2 className="text-xs font-heading font-semibold text-ep-silver uppercase tracking-wide mb-2">{t.tournamentName}</h2>
              {t.rounds.map(r => {
                const scores = roundScores[r.roundId] ?? [];
                return (
                  <div key={r.roundId} className="card p-3 mb-2">
                    <div className="text-sm font-medium text-ep-green mb-0.5">{r.courseName}</div>
                    <div className="text-xs text-ep-silver mb-2">
                      {parseLocalDate(r.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </div>
                    <div className="divide-y divide-ep-silver/20">
                      {r.groups.map(g => {
                        const groupScores = scores.filter(s => g.playerIds.includes(s.playerId));
                        const allConfirmed = g.playerIds.length > 0 && groupScores.length === g.playerIds.length;

                        if (allConfirmed) {
                          return (
                            <div key={g.groupNumber} className="py-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-ep-green">Group {g.groupNumber}</span>
                                  {g.teeTime && <span className="text-xs text-ep-silver">{g.teeTime}</span>}
                                </div>
                                <span className="flex items-center gap-1 text-xs text-ep-orange font-medium">
                                  <CheckCircle size={13} /> Confirmed
                                </span>
                              </div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-ep-silver">
                                    <th className="text-left font-normal pb-1">Player</th>
                                    <th className="text-center font-normal pb-1 w-10">Out</th>
                                    <th className="text-center font-normal pb-1 w-10">In</th>
                                    <th className="text-center font-semibold pb-1 w-10 text-ep-green/70">Tot</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {groupScores.map(s => {
                                    const front = s.holeScores.filter(h => h.hole <= 9).reduce((sum, h) => sum + h.strokes, 0);
                                    const back = s.holeScores.filter(h => h.hole >= 10).reduce((sum, h) => sum + h.strokes, 0);
                                    return (
                                      <tr key={s.playerId} className="border-t border-ep-silver/10">
                                        <td className="py-1.5 font-medium text-ep-green">{s.playerName}</td>
                                        <td className="py-1.5 text-center text-ep-silver">{front || '—'}</td>
                                        <td className="py-1.5 text-center text-ep-silver">{back || '—'}</td>
                                        <td className="py-1.5 text-center font-bold text-ep-green">{s.grossTotal}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          );
                        }

                        return (
                          <button
                            key={g.groupNumber}
                            onClick={() => g.pin && navigate(`/score/${g.pin}`)}
                            disabled={!g.pin}
                            className="w-full flex items-center justify-between py-2 text-left hover:bg-ep-cream/50 disabled:opacity-40 rounded"
                          >
                            <div>
                              <span className="text-sm font-medium text-ep-green">Group {g.groupNumber}</span>
                              {g.teeTime && <span className="text-xs text-ep-silver ml-2">{g.teeTime}</span>}
                              {g.startingHole && <span className="text-xs text-ep-silver ml-1">· Hole {g.startingHole}</span>}
                            </div>
                            {g.pin ? (
                              <span className="text-xs font-mono bg-ep-green/10 text-ep-green border border-ep-green/30 px-2 py-0.5 rounded">
                                PIN {g.pin}
                              </span>
                            ) : (
                              <span className="text-xs text-ep-silver/50">No PIN</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

// ── Scorekeeper Help ──────────────────────────────────────────────────────────

function ScorekeeperHelp({ onClose }: { onClose: () => void }) {
  return (
    <HelpModal title="How to Score Your Round" onClose={onClose}>
      <HelpSection title="Getting Started">
        <HelpStep n={1}>Open the round schedule link shared by your organizer and tap <strong>Tap to score</strong> next to your group.</HelpStep>
        <HelpStep n={2}>Or find your group in the list below and tap it.</HelpStep>
        <HelpStep n={3}>You'll see a score entry screen for every player in your group.</HelpStep>
      </HelpSection>

      <HelpSection title="Entering Scores">
        <HelpStep n={1}>Type each player's stroke count into their box for the current hole.</HelpStep>
        <HelpStep n={2}>Tap <strong>Next</strong> to advance to the next hole — scores sync automatically.</HelpStep>
        <HelpStep n={3}>
          Use the <strong>hole dots</strong> at the top to jump to any hole:
          <ul className="mt-1 ml-1 space-y-0.5 text-ep-silver">
            <li>• <span className="text-ep-green font-medium">Bright green</span> — all players scored</li>
            <li>• <span className="text-ep-green/60 font-medium">Dim green</span> — some players scored</li>
            <li>• Dark — not started</li>
          </ul>
        </HelpStep>
        <HelpStep n={4}>
          Score badges show relative to par: <span className="text-ep-orange font-medium">Eagle+</span>, <span className="text-ep-orange/70 font-medium">Birdie</span>, <span className="text-ep-green font-medium">Par</span>, or <span className="text-ep-silver">+N</span> over.
        </HelpStep>
      </HelpSection>

      <HelpSection title="Reviewing & Submitting">
        <HelpStep n={1}>After hole 18, tap <strong>Review &amp; Submit</strong>.</HelpStep>
        <HelpStep n={2}>The review screen shows the full scorecard. Any missing holes are highlighted in orange.</HelpStep>
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
          If your group doesn't appear in the list, the round may not be active yet or pairings haven't been saved. Check with your organizer.
        </HelpTip>
      </HelpSection>
    </HelpModal>
  );
}
