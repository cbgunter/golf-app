import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Plus, Save, Shuffle, X } from 'lucide-react';
import { roundsApi, Player, Round, Score, Tournament, RoundTeam } from '@shared/client';
import { computeCupStandings, teamsFromStandings } from '@shared/formats';

/**
 * Team setup for best-ball rounds. "Set from standings" pairs the field by
 * the standings going into this round: 1st with last, 2nd with second-to-last…
 */
export default function TeamsEditor({
  round,
  rounds,
  tournament,
  players,
  onSaved,
}: {
  round: Round;
  rounds: Round[];
  tournament: Tournament;
  players: Player[];
  onSaved: (r: Round) => void;
}) {
  const [teams, setTeams] = useState<RoundTeam[]>(
    round.teams?.length ? round.teams.map(t => ({ ...t, playerIds: [...t.playerIds] })) : []
  );
  const [saving, setSaving] = useState(false);
  const [computing, setComputing] = useState(false);
  const [standingsNote, setStandingsNote] = useState<string | null>(null);

  const withdrawn = new Set(tournament.withdrawnPlayerIds ?? []);
  const field = tournament.playerIds.filter(pid => !withdrawn.has(pid));
  const nameOf = (pid: string) => players.find(p => p.id === pid)?.name ?? '?';
  const assigned = new Set(teams.flatMap(t => t.playerIds));

  async function setFromStandings() {
    setComputing(true);
    try {
      const prior = rounds.filter(r => !r.isPracticeRound && r.id !== round.id && r.date <= round.date);
      const scoresByRound: Record<string, Score[]> = {};
      await Promise.all(prior.map(async r => { scoresByRound[r.id] = await roundsApi.scores(r.id); }));

      let order: string[];
      if (tournament.standingsMode === 'points') {
        order = computeCupStandings(prior, scoresByRound, {
          useNet: tournament.isNet,
          pointsTable: tournament.pointsTable,
          excludePlayerIds: withdrawn,
        }).map(e => e.playerId);
      } else {
        const totals = new Map<string, number>();
        for (const s of Object.values(scoresByRound).flat()) {
          if (withdrawn.has(s.playerId)) continue;
          totals.set(s.playerId, (totals.get(s.playerId) ?? 0) + (tournament.isNet ? s.netTotal : s.grossTotal));
        }
        order = [...totals.entries()].sort((a, b) => a[1] - b[1]).map(([pid]) => pid);
      }
      order = order.filter(pid => field.includes(pid));
      const missing = field.filter(pid => !order.includes(pid));
      const full = [...order, ...missing];
      if (full.length < 2) {
        toast.error('Need at least two players in the field');
        return;
      }
      setTeams(teamsFromStandings(full));
      setStandingsNote(
        `Standings: ${full.map((pid, i) => `${i + 1}. ${nameOf(pid)}`).join(' · ')}` +
          (missing.length ? ` (no scores yet: ${missing.map(nameOf).join(', ')})` : '')
      );
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setComputing(false);
    }
  }

  async function save() {
    const cleaned = teams.filter(t => t.playerIds.length > 0);
    const all = cleaned.flatMap(t => t.playerIds);
    if (new Set(all).size !== all.length) {
      toast.error('A player is on more than one team');
      return;
    }
    setSaving(true);
    try {
      const updated = await roundsApi.update(round.id, { teams: cleaned });
      onSaved(updated);
      setTeams(cleaned);
      toast.success('Teams saved');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  function setSlot(teamIdx: number, slot: number, pid: string) {
    setTeams(ts =>
      ts.map((t, i) => {
        if (i !== teamIdx) return t;
        const ids = [...t.playerIds];
        if (pid) ids[slot] = pid;
        else ids.splice(slot, 1);
        return { ...t, playerIds: ids.filter(Boolean) };
      })
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="label mb-0">Best-Ball Teams</p>
        <button type="button" onClick={setFromStandings} disabled={computing} className="btn-secondary text-xs">
          {computing ? <Loader2 size={13} className="animate-spin" /> : <Shuffle size={13} />}
          Set from standings (1st + last vs 2nd + 3rd)
        </button>
      </div>
      {standingsNote && <p className="text-xs text-ep-muted">{standingsNote}</p>}

      {teams.length === 0 && (
        <p className="text-xs text-ep-muted italic">
          No teams yet. Until teams are set, this round is scored as individual stroke play.
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {teams.map((team, tIdx) => (
          <div key={tIdx} className="bg-ep-cream rounded-lg border border-ep-silver/30 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                className="input py-1 text-sm flex-1"
                placeholder={`Team ${tIdx + 1} name (optional)`}
                value={team.name ?? ''}
                onChange={e => setTeams(ts => ts.map((t, i) => (i === tIdx ? { ...t, name: e.target.value || undefined } : t)))}
              />
              <button
                type="button"
                onClick={() => setTeams(ts => ts.filter((_, i) => i !== tIdx))}
                className="p-1 text-ep-muted/80 hover:text-red-400"
                title="Remove team"
              >
                <X size={14} />
              </button>
            </div>
            {[0, 1].map(slot => {
              const current = team.playerIds[slot] ?? '';
              return (
                <select
                  key={slot}
                  className="input py-1 text-sm"
                  value={current}
                  onChange={e => setSlot(tIdx, slot, e.target.value)}
                >
                  <option value="">— Player {slot + 1} —</option>
                  {field
                    .filter(pid => pid === current || !assigned.has(pid))
                    .map(pid => (
                      <option key={pid} value={pid}>{nameOf(pid)}</option>
                    ))}
                </select>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => setTeams(ts => [...ts, { playerIds: [] }])}
          className="btn-secondary text-xs"
        >
          <Plus size={13} /> Add Team
        </button>
        <button type="button" onClick={save} disabled={saving} className="btn-primary">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Teams
        </button>
      </div>
    </div>
  );
}
