import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { tournamentsApi, playersApi, Tournament, Player } from '../../api/client';
import StatusBadge from '../../components/StatusBadge';
import HelpModal, { HelpSection, HelpStep, HelpTip } from '../../components/HelpModal';
import { Users, Trophy, Plus, HelpCircle } from 'lucide-react';
import { parseLocalDate } from '../../lib/dates';

export default function AdminDashboard() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    Promise.all([tournamentsApi.list(), playersApi.list()])
      .then(([ts, ps]) => { setTournaments(ts); setPlayers(ps); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-stone-500">Loading...</div>;

  const active = tournaments.filter(t => t.status === 'active');
  const upcoming = tournaments.filter(t => t.status === 'upcoming');
  const completed = tournaments.filter(t => t.status === 'completed');

  return (
    <div className="space-y-6">
      {showHelp && <AdminHelp onClose={() => setShowHelp(false)} />}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-900">Dashboard</h1>
        <button
          onClick={() => setShowHelp(true)}
          className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-sage-600 transition-colors"
        >
          <HelpCircle size={15} />
          Admin Guide
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Active', count: active.length, color: 'text-green-600', bg: 'bg-green-50', to: '/admin/tournaments?status=active' },
          { label: 'Upcoming', count: upcoming.length, color: 'text-blue-600', bg: 'bg-blue-50', to: '/admin/tournaments?status=upcoming' },
          { label: 'Completed', count: completed.length, color: 'text-sand-600', bg: 'bg-sand-50', to: '/admin/tournaments?status=completed' },
          { label: 'Players', count: players.length, color: 'text-sage-700', bg: 'bg-sage-50', to: '/admin/players' },
        ].map(s => (
          <Link key={s.label} to={s.to} className={`card p-4 ${s.bg} hover:shadow-md transition-shadow`}>
            <div className={`text-2xl font-bold ${s.color}`}>{s.count}</div>
            <div className="text-sm text-stone-600 mt-1">{s.label}</div>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Link to="/admin/tournaments" className="card p-5 hover:shadow-md transition-shadow group">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-sage-100 rounded-lg flex items-center justify-center">
              <Trophy size={18} className="text-sage-700" />
            </div>
            <h2 className="font-semibold text-stone-900 group-hover:text-sage-700">Tournaments</h2>
          </div>
          <p className="text-sm text-stone-500">Create and manage tournaments, rounds, and scoring</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs text-sage-600 font-medium">
            <Plus size={12} /> New Tournament
          </span>
        </Link>
        <Link to="/admin/players" className="card p-5 hover:shadow-md transition-shadow group">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users size={18} className="text-blue-700" />
            </div>
            <h2 className="font-semibold text-stone-900 group-hover:text-sage-700">Players</h2>
          </div>
          <p className="text-sm text-stone-500">Manage player profiles and handicap indexes</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs text-sage-600 font-medium">
            <Plus size={12} /> Add Player
          </span>
        </Link>
      </div>

      {/* Recent tournaments */}
      {tournaments.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
            <h2 className="font-semibold text-stone-800">Recent Tournaments</h2>
            <Link to="/admin/tournaments" className="text-xs text-sage-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {tournaments.slice(0, 5).map(t => (
              <Link
                key={t.id}
                to={`/admin/tournaments/${t.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-stone-50 transition-colors"
              >
                <div>
                  <div className="font-medium text-sm text-stone-900">{t.name}</div>
                  <div className="text-xs text-stone-400 mt-0.5">
                    {parseLocalDate(t.startDate).toLocaleDateString()} · {t.playerIds.length} players
                  </div>
                </div>
                <StatusBadge status={t.status} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Help ────────────────────────────────────────────────────────────────

function AdminHelp({ onClose }: { onClose: () => void }) {
  return (
    <HelpModal title="Admin Guide" onClose={onClose}>

      <HelpSection title="Managing Players">
        <HelpStep n={1}>Go to <strong>Admin → Players</strong>.</HelpStep>
        <HelpStep n={2}>Click <strong>Add Player</strong> — enter name, optional email, and handicap index (defaults to 0.0 if left blank).</HelpStep>
        <HelpStep n={3}>Click a player's row to edit their details or view handicap history.</HelpStep>
        <HelpTip>Handicap index is recalculated automatically after every scored round — you only need to set the starting value.</HelpTip>
      </HelpSection>

      <HelpSection title="Creating a Tournament">
        <HelpStep n={1}>Go to <strong>Tournaments → New Tournament</strong>.</HelpStep>
        <HelpStep n={2}>Set the name, start date, and format (Stroke Play, Stableford, or Match Play).</HelpStep>
        <HelpStep n={3}>Toggle <strong>Net</strong> and/or <strong>Gross</strong> scoring.</HelpStep>
        <HelpStep n={4}>Set the <strong>Entry Fee</strong> per player.</HelpStep>
        <HelpStep n={5}>Enable <strong>Closest to Pin</strong> or <strong>Longest Drive</strong> side contests and set their per-player fee if applicable.</HelpStep>
        <HelpStep n={6}>Add <strong>Payout Structure</strong> rows (e.g. "1st Place — 60%"). Percentages must total 100%.</HelpStep>
        <HelpStep n={7}>Click <strong>Create Tournament</strong>.</HelpStep>
      </HelpSection>

      <HelpSection title="Adding Players to a Tournament">
        <HelpStep n={1}>Open the tournament → <strong>Players tab</strong>.</HelpStep>
        <HelpStep n={2}>Click a player chip from the <em>All Players</em> list to add them. Click again to remove.</HelpStep>
        <HelpStep n={3}>Need a new player? Use <strong>Create new player</strong> inline — no need to navigate away.</HelpStep>
      </HelpSection>

      <HelpSection title="Creating Rounds">
        <HelpStep n={1}>Open the tournament → <strong>Rounds tab → Add Round</strong>.</HelpStep>
        <HelpStep n={2}>Search for the course by name (pulls from the GHIN database).</HelpStep>
        <HelpStep n={3}>Select the course, then pick a <strong>Tee</strong> — rating and slope fill automatically.</HelpStep>
        <HelpStep n={4}>Set the round date.</HelpStep>
        <HelpStep n={5}>If CTP or LD contests are enabled, enter the hole number for each.</HelpStep>
        <HelpStep n={6}>Click <strong>Add Round</strong>.</HelpStep>
      </HelpSection>

      <HelpSection title="Tee Time Groups & PINs">
        <HelpStep n={1}>On the Rounds tab, click a round row to expand it.</HelpStep>
        <HelpStep n={2}>Choose <strong>Sequential</strong> (tee times from hole 1) or <strong>Shotgun</strong> (each group on a different starting hole).</HelpStep>
        <HelpStep n={3}>Click <strong>Add Group</strong> and set the tee time. For shotgun, also set the starting hole.</HelpStep>
        <HelpStep n={4}>Click unassigned player chips at the bottom and choose their group.</HelpStep>
        <HelpStep n={5}>Click <strong>Save Tee Sheet</strong>. PINs are generated automatically and shown on each group card.</HelpStep>
        <HelpTip>Share each group's PIN with their designated scorekeeper before the round starts.</HelpTip>
      </HelpSection>

      <HelpSection title="Entering Scores (Admin Scorecard)">
        <HelpStep n={1}>From the Rounds tab, click the <strong>Scoring</strong> button next to a round.</HelpStep>
        <HelpStep n={2}>Select which players to display using the player picker. If tee time groups are set, players are organized by group.</HelpStep>
        <HelpStep n={3}>Click any score cell and type the strokes. OUT and IN subtotals calculate automatically.</HelpStep>
        <HelpTip>Score cells are color-coded: yellow = Eagle+, red = Birdie, green = Par.</HelpTip>
      </HelpSection>

      <HelpSection title="CTP / Longest Drive Winners">
        <HelpStep n={1}>On the Round Scoring page, find the <strong>CTP / LD</strong> section.</HelpStep>
        <HelpStep n={2}>Select the winning player from the dropdown.</HelpStep>
        <HelpStep n={3}>The selection saves automatically — no extra Save button needed.</HelpStep>
        <HelpTip>Winners and prize amounts appear on the public tournament view once selected.</HelpTip>
      </HelpSection>

      <HelpSection title="Confirming PIN-Based Scorecards">
        <HelpStep n={1}>On the Round Scoring page, scroll to <strong>Group Submissions</strong>.</HelpStep>
        <HelpStep n={2}>Click a group card to expand and review the submitted scorecard.</HelpStep>
        <HelpStep n={3}>Status badges: <strong>In Progress</strong> (still entering), <strong>Submitted</strong> (ready to confirm), <strong>Confirmed</strong> (done).</HelpStep>
        <HelpStep n={4}>For <em>Submitted</em> cards, review scores and click <strong>✓ Confirm Scores</strong>. This writes the scores and updates handicap indexes.</HelpStep>
        <HelpTip>Confirming is safe at any time during the round — it won't affect other groups. Re-confirming an already-confirmed card is a no-op.</HelpTip>
      </HelpSection>

      <HelpSection title="Completing a Round">
        <HelpStep n={1}>Verify all players have scores entered.</HelpStep>
        <HelpStep n={2}>Click <strong>Complete Round</strong> at the top of the Round Scoring page.</HelpStep>
        <HelpStep n={3}>If players are missing scores you'll see a prompt — you can proceed or go back to fill them in.</HelpStep>
        <HelpStep n={4}>When all rounds in a tournament are completed, the tournament automatically moves to <strong>Completed</strong>.</HelpStep>
        <HelpTip>To correct an error: click <strong>Reopen Round</strong>. This moves the round and tournament back to Active.</HelpTip>
      </HelpSection>

      <HelpSection title="Viewing Results">
        <HelpStep n={1}>Open the public tournament page (link on the tournament setup page, or navigate to the home screen).</HelpStep>
        <HelpStep n={2}>The <strong>Results</strong> tab shows the final leaderboard, payouts, and CTP/LD winners.</HelpStep>
        <HelpTip>Results are public — no login required. Share the tournament URL directly with players.</HelpTip>
      </HelpSection>

    </HelpModal>
  );
}
