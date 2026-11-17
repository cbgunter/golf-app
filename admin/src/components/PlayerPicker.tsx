import { useMemo, useState, ReactNode, KeyboardEvent } from 'react';
import { ghinApi, playersApi, Player, GhinGolfer } from '@shared/client';
import toast from 'react-hot-toast';
import { Search, Loader2, Plus, X, RefreshCw, UserPlus, Check } from 'lucide-react';

const STATE_KEY = 'ghin_search_state';

function readStoredState(): string {
  try { return localStorage.getItem(STATE_KEY) ?? ''; } catch { return ''; }
}
function storeState(v: string) {
  try { localStorage.setItem(STATE_KEY, v); } catch { /* ignore */ }
}

/** GHIN sometimes returns names in ALL CAPS — convert those to Title Case. */
function niceName(s: string): string {
  if (s !== s.toUpperCase()) return s.trim();
  return s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, m => m.toUpperCase()).trim();
}

export function formatHandicap(hi: number): string {
  return hi < 0 ? `+${Math.abs(hi).toFixed(1)}` : hi.toFixed(1);
}

function GhinBadge({ player }: { player: Player }) {
  if (!player.ghinNumber) return null;
  const synced = player.ghinSyncedAt ? new Date(player.ghinSyncedAt).toLocaleDateString() : null;
  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-wide bg-ep-green/10 text-ep-green px-1.5 py-0.5 rounded"
      title={`GHIN #${player.ghinNumber}${synced ? ` · synced ${synced}` : ''}`}
    >
      GHIN
    </span>
  );
}

interface Props {
  /** Full player roster (all players in the system). */
  players: Player[];
  selectedIds: string[];
  /** Add a player to the tournament. The player is already saved in the roster. */
  onAdd: (player: Player) => void | Promise<void>;
  onRemove: (playerId: string) => void | Promise<void>;
  /** Called whenever a player record is created or updated so the parent can refresh its roster. */
  onPlayerUpserted: (player: Player) => void;
  withdrawnIds?: string[];
  /** Extra per-row controls for selected players (e.g. WD toggle). */
  renderActions?: (player: Player) => ReactNode;
}

export default function PlayerPicker({
  players, selectedIds, onAdd, onRemove, onPlayerUpserted, withdrawnIds = [], renderActions,
}: Props) {
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState(readStoredState);
  const [ghinResults, setGhinResults] = useState<GhinGolfer[] | null>(null);
  const [ghinError, setGhinError] = useState<string | null>(null);
  const [ghinTruncated, setGhinTruncated] = useState(false);
  const [searching, setSearching] = useState(false);
  const [addingGhin, setAddingGhin] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());

  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({ name: '', handicapIndex: '', ghinNumber: '', email: '' });
  const [savingManual, setSavingManual] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedPlayers = useMemo(
    () => selectedIds.map(id => players.find(p => p.id === id)).filter((p): p is Player => !!p),
    [selectedIds, players],
  );
  const byGhin = useMemo(() => {
    const m = new Map<string, Player>();
    for (const p of players) if (p.ghinNumber) m.set(p.ghinNumber, p);
    return m;
  }, [players]);

  const q = query.trim().toLowerCase();
  const rosterMatches = useMemo(() => {
    const unselected = players.filter(p => !selectedSet.has(p.id));
    if (!q) return unselected;
    return unselected.filter(p => p.name.toLowerCase().includes(q) || (p.ghinNumber ?? '').includes(q));
  }, [players, selectedSet, q]);

  function resetSearch() {
    setQuery('');
    setGhinResults(null);
    setGhinError(null);
  }

  async function searchGhin() {
    const term = query.trim();
    if (term.length < 2) { toast.error('Enter at least 2 characters'); return; }
    setSearching(true);
    setGhinError(null);
    setGhinResults(null);
    storeState(stateFilter.trim().toUpperCase());
    try {
      const { golfers, truncated } = await ghinApi.searchGolfers(term, stateFilter.trim().toUpperCase() || undefined);
      setGhinResults(golfers);
      setGhinTruncated(truncated);
      if (golfers.length === 0) openManual(term);
    } catch (e: any) {
      setGhinError(e.message ?? 'GHIN search failed');
      openManual(term);
    } finally {
      setSearching(false);
    }
  }

  function openManual(prefill: string) {
    const isNumber = /^\d+$/.test(prefill.trim());
    setManual(m => ({
      ...m,
      name: isNumber ? m.name : prefill.trim(),
      ghinNumber: isNumber ? prefill.trim() : m.ghinNumber,
    }));
    setShowManual(true);
  }

  async function addExisting(p: Player) {
    await onAdd(p);
    resetSearch();
    // Linked players: pull their latest official index in the background.
    if (p.ghinNumber) refreshOne(p, true);
  }

  async function addGhinGolfer(g: GhinGolfer) {
    const existing = byGhin.get(g.ghinNumber);
    if (existing) {
      if (!selectedSet.has(existing.id)) await addExisting(existing);
      return;
    }
    setAddingGhin(g.ghinNumber);
    try {
      const created = await playersApi.create({
        name: `${niceName(g.firstName)} ${niceName(g.lastName)}`.trim(),
        handicapIndex: g.handicapIndex ?? 0,
        ghinNumber: g.ghinNumber,
        ghinHandicapIndex: g.handicapIndex ?? undefined,
      });
      onPlayerUpserted(created);
      await onAdd(created);
      resetSearch();
      toast.success(`${created.name} added · HI ${g.handicapDisplay}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingGhin(null);
    }
  }

  async function submitManual() {
    if (!manual.name.trim()) { toast.error('Name is required'); return; }
    setSavingManual(true);
    try {
      const created = await playersApi.create({
        name: manual.name.trim(),
        handicapIndex: Number(manual.handicapIndex) || 0,
        email: manual.email.trim() || undefined,
        ghinNumber: manual.ghinNumber.trim() || undefined,
      });
      onPlayerUpserted(created);
      await onAdd(created);
      setShowManual(false);
      setManual({ name: '', handicapIndex: '', ghinNumber: '', email: '' });
      resetSearch();
      toast.success(`${created.name} added`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingManual(false);
    }
  }

  async function refreshOne(p: Player, quiet = false) {
    setRefreshing(s => new Set(s).add(p.id));
    try {
      const updated = await playersApi.refreshFromGhin(p.id);
      onPlayerUpserted(updated);
      if (!quiet) toast.success(`${updated.name}: HI ${formatHandicap(updated.handicapIndex)}`);
      return true;
    } catch (e: any) {
      if (!quiet) toast.error(`${p.name}: ${e.message}`);
      return false;
    } finally {
      setRefreshing(s => { const n = new Set(s); n.delete(p.id); return n; });
    }
  }

  const linkedSelected = selectedPlayers.filter(p => p.ghinNumber);

  async function refreshAll() {
    const results = await Promise.all(linkedSelected.map(p => refreshOne(p, true)));
    const okCount = results.filter(Boolean).length;
    if (okCount === results.length) toast.success(`Updated ${okCount} handicap${okCount === 1 ? '' : 's'} from GHIN`);
    else toast.error(`Updated ${okCount} of ${results.length} — some GHIN lookups failed`);
  }

  // The picker may live inside a parent <form> (create tournament), so it can't use its own
  // <form>. Enter in the lookup box searches; Enter in the manual fields adds the player.
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Enter' || (e.target as HTMLElement).tagName !== 'INPUT') return;
    e.preventDefault();
    const role = (e.target as HTMLElement).dataset.role;
    if (role === 'lookup') searchGhin();
    else if (role === 'manual') submitManual();
  }

  return (
    <div className="space-y-4" onKeyDown={handleKeyDown}>
      {/* ── Selected players ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="section-title">In this tournament ({selectedPlayers.length})</p>
          {linkedSelected.length > 0 && (
            <button type="button" onClick={refreshAll} disabled={refreshing.size > 0} className="btn-secondary text-xs">
              <RefreshCw size={13} className={refreshing.size > 0 ? 'animate-spin' : ''} /> Update from GHIN
            </button>
          )}
        </div>
        {selectedPlayers.length === 0 ? (
          <p className="text-sm text-ep-silver py-2">No players yet — look someone up below.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-1">
            {selectedPlayers.map(p => {
              const isWD = withdrawnIds.includes(p.id);
              return (
                <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-ep-silver/20 bg-ep-cream">
                  <span className={`flex-1 min-w-0 truncate text-sm font-medium ${isWD ? 'line-through text-ep-silver' : 'text-ep-green'}`}>{p.name}</span>
                  <GhinBadge player={p} />
                  <span className="text-xs text-ep-silver shrink-0">HI {formatHandicap(p.handicapIndex)}</span>
                  {p.ghinNumber && (
                    <button type="button" onClick={() => refreshOne(p)} disabled={refreshing.has(p.id)}
                      className="p-1 text-ep-silver hover:text-ep-orange shrink-0" title="Update handicap from GHIN">
                      <RefreshCw size={13} className={refreshing.has(p.id) ? 'animate-spin' : ''} />
                    </button>
                  )}
                  {renderActions?.(p)}
                  <button type="button" onClick={() => onRemove(p.id)}
                    className="p-1 text-ep-silver/60 hover:text-red-500 shrink-0" title="Remove from tournament">
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Lookup ── */}
      <div className="rounded-lg border border-ep-silver/30 bg-ep-sand/40 p-3 sm:p-4 space-y-3">
        <p className="section-title">Look up a player</p>
        <div className="flex gap-2">
          <input
            className="input flex-1 min-w-0"
            value={query}
            onChange={e => { setQuery(e.target.value); setGhinResults(null); setGhinError(null); }}
            data-role="lookup"
            placeholder="Name (First Last) or GHIN #"
          />
          <input
            data-role="lookup"
            className="input w-16 shrink-0 uppercase text-center"
            value={stateFilter}
            maxLength={2}
            onChange={e => setStateFilter(e.target.value.replace(/[^a-z]/gi, ''))}
            placeholder="ST"
            title="State, e.g. NC (optional) — narrows GHIN results"
            aria-label="State"
          />
          <button type="button" onClick={searchGhin} disabled={searching} className="btn-primary shrink-0">
            {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            <span className="hidden sm:inline">Search GHIN</span>
          </button>
        </div>

        {/* Roster matches (instant, local) */}
        {rosterMatches.length > 0 && (
          <div>
            <p className="text-xs text-ep-silver mb-1.5">{q ? 'Already on your roster' : 'Your roster — tap to add'}</p>
            <div className="flex flex-wrap gap-1.5">
              {rosterMatches.slice(0, q ? 12 : 40).map(p => (
                <button key={p.id} type="button" onClick={() => addExisting(p)}
                  className="flex items-center gap-1.5 bg-ep-cream border border-ep-silver/30 hover:border-ep-orange text-ep-green text-xs px-2.5 py-1 rounded-full transition-colors">
                  <Plus size={11} /> {p.name}
                  <span className="text-ep-silver">{formatHandicap(p.handicapIndex)}</span>
                  {p.ghinNumber && <span className="text-[9px] font-bold text-ep-green/60">GHIN</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* GHIN results */}
        {ghinError && (
          <p className="text-xs text-red-500">GHIN lookup failed ({ghinError}). Enter the player manually below.</p>
        )}
        {ghinResults && ghinResults.length === 0 && (
          <p className="text-xs text-ep-silver">No active GHIN golfers matched “{query.trim()}”{stateFilter ? ` in ${stateFilter.toUpperCase()}` : ''}. Enter them manually below.</p>
        )}
        {ghinResults && ghinResults.length > 0 && (
          <div>
            <p className="text-xs text-ep-silver mb-1.5">GHIN results ({ghinResults.length}{ghinTruncated ? '+ — add a first name or state to narrow' : ''})</p>
            <div className="border border-ep-silver/30 rounded-lg divide-y divide-ep-silver/20 max-h-72 overflow-y-auto bg-ep-cream">
              {ghinResults.map(g => {
                const existing = byGhin.get(g.ghinNumber);
                const already = existing && selectedSet.has(existing.id);
                return (
                  <button key={g.ghinNumber} type="button" disabled={!!already || addingGhin !== null}
                    onClick={() => addGhinGolfer(g)}
                    className="w-full flex items-center gap-3 text-left px-3 py-2.5 hover:bg-ep-sand transition-colors disabled:opacity-60 disabled:hover:bg-transparent">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ep-green truncate">{niceName(g.firstName)} {niceName(g.lastName)}</div>
                      <div className="text-xs text-ep-silver truncate">
                        {[g.clubName, g.state].filter(Boolean).join(' · ')}{g.clubName || g.state ? ' · ' : ''}GHIN #{g.ghinNumber}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold text-ep-orange">{g.handicapDisplay}</div>
                      <div className="text-[10px] text-ep-silver leading-none">HI</div>
                    </div>
                    <span className="shrink-0 w-5 flex justify-center">
                      {addingGhin === g.ghinNumber ? <Loader2 size={14} className="animate-spin text-ep-silver" />
                        : already ? <Check size={14} className="text-ep-green" />
                        : <Plus size={14} className="text-ep-orange" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Manual entry fallback */}
        {showManual ? (
          <div className="rounded-lg border-l-4 border-ep-orange bg-ep-cream p-3 grid sm:grid-cols-4 gap-3">
            <div className="sm:col-span-4 flex items-center justify-between">
              <p className="font-semibold text-ep-green text-sm">Enter player manually</p>
              <button type="button" onClick={() => setShowManual(false)} className="text-ep-silver hover:text-ep-green"><X size={16} /></button>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Name *</label>
              <input data-role="manual" className="input" value={manual.name} autoFocus
                onChange={e => setManual(m => ({ ...m, name: e.target.value }))} placeholder="First Last" />
            </div>
            <div>
              <label className="label">Handicap Index</label>
              <input data-role="manual" className="input" type="number" min="-10" max="54" step="0.1" value={manual.handicapIndex}
                onChange={e => setManual(m => ({ ...m, handicapIndex: e.target.value }))} placeholder="0.0" />
            </div>
            <div>
              <label className="label">GHIN # (optional)</label>
              <input data-role="manual" className="input" inputMode="numeric" value={manual.ghinNumber}
                onChange={e => setManual(m => ({ ...m, ghinNumber: e.target.value.replace(/\D/g, '') }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Email (optional)</label>
              <input data-role="manual" className="input" type="email" value={manual.email}
                onChange={e => setManual(m => ({ ...m, email: e.target.value }))} placeholder="email@example.com" />
            </div>
            <div className="sm:col-span-2 flex items-end gap-2">
              <button type="button" onClick={submitManual} disabled={savingManual} className="btn-primary">
                {savingManual ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Add Player
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => openManual(query)} className="text-xs text-ep-orange hover:underline">
            Not in GHIN? Enter a player manually
          </button>
        )}
      </div>
    </div>
  );
}
