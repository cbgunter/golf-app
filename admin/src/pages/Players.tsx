import { useEffect, useState, FormEvent } from 'react';
import { playersApi, Player } from '@shared/client';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Pencil, Trash2, ChevronDown, ChevronUp, X, Check, RefreshCw } from 'lucide-react';
import { formatHandicap } from '../components/PlayerPicker';

export default function AdminPlayers() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', handicapIndex: '', ghinNumber: '' });
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  async function load() {
    setPlayers(await playersApi.list());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openEdit(p: Player) {
    setForm({ name: p.name, email: p.email ?? '', handicapIndex: String(p.handicapIndex), ghinNumber: p.ghinNumber ?? '' });
    setEditId(p.id);
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editId) return;
    const data = { name: form.name, email: form.email || undefined, handicapIndex: Number(form.handicapIndex), ghinNumber: form.ghinNumber.trim() };
    try {
      const updated = await playersApi.update(editId, data);
      // Newly linked GHIN number: pull the official index right away.
      if (updated.ghinNumber && updated.ghinNumber !== players.find(p => p.id === editId)?.ghinNumber) {
        try { await playersApi.refreshFromGhin(editId); } catch (err: any) { toast.error(`GHIN: ${err.message}`); }
      }
      toast.success('Player updated');
      setShowForm(false);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleRefresh(p: Player) {
    setRefreshingId(p.id);
    try {
      const updated = await playersApi.refreshFromGhin(p.id);
      setPlayers(ps => ps.map(x => (x.id === p.id ? updated : x)));
      toast.success(`${p.name}: HI ${formatHandicap(updated.handicapIndex)}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRefreshingId(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove ${name}?`)) return;
    try {
      await playersApi.delete(id);
      toast.success('Removed');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  if (loading) return <div className="text-ep-muted text-sm p-4">Loading…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="page-header">Players</h1>
      </div>
      <p className="text-sm text-ep-muted -mt-3">
        Add players from a tournament's Players section — they're looked up in GHIN first.{' '}
        <Link to="/tournaments" className="text-ep-orange hover:underline">Go to tournaments</Link>
      </p>

      {/* Form */}
      {showForm && (
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-ep-green">Edit Player</h2>
            <button onClick={() => setShowForm(false)} className="text-ep-muted hover:text-ep-green p-1"><X size={18} /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Full Name *</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="John Smith" autoFocus />
            </div>
            <div>
              <label className="label">Email (optional)</label>
              <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@example.com" />
            </div>
            <div>
              <label className="label">GHIN Number</label>
              <input className="input" inputMode="numeric" value={form.ghinNumber} onChange={e => setForm(f => ({ ...f, ghinNumber: e.target.value.replace(/\D/g, '') }))} placeholder="Not linked" />
              <p className="text-xs text-ep-muted mt-1">When linked, the official GHIN Handicap Index is used and kept in sync instead of the app's own calculation.</p>
            </div>
            <div>
              <label className="label">Handicap Index *</label>
              <input className="input" type="number" step="0.1" min="-10" max="54" value={form.handicapIndex} onChange={e => setForm(f => ({ ...f, handicapIndex: e.target.value }))} required placeholder="12.4" />
              <p className="text-xs text-ep-muted mt-1">{form.ghinNumber ? 'Overwritten on the next GHIN update.' : 'Enter current handicap index. It will auto-adjust after each round.'}</p>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="btn-primary flex-1 justify-center">
                <Check size={15} /> Save Changes
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {players.length === 0 ? (
        <div className="card p-10 text-center text-ep-muted text-sm">No players yet. Add them while setting up a tournament.</div>
      ) : (
        <div className="card divide-y divide-ep-silver/20">
          {players.map(p => (
            <div key={p.id}>
              <div className="flex items-center gap-3 px-4 py-3.5">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-ep-green/10 text-ep-green flex items-center justify-center font-semibold text-sm shrink-0">
                  {p.name.charAt(0).toUpperCase()}
                </div>

                {/* Name + email */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-ep-green truncate">{p.name}</div>
                  <div className="text-xs text-ep-muted truncate">
                    {[p.ghinNumber && `GHIN #${p.ghinNumber}`, p.email].filter(Boolean).join(' · ')}
                  </div>
                </div>

                {/* HCP + actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <div className="text-base font-semibold text-ep-orange">{formatHandicap(p.handicapIndex)}</div>
                    <div className="text-xs text-ep-muted leading-none">{p.ghinNumber ? 'GHIN HI' : 'HCP'}</div>
                  </div>
                  {p.ghinNumber && (
                    <button onClick={() => handleRefresh(p)} disabled={refreshingId === p.id} title="Update from GHIN"
                      className="p-1.5 text-ep-muted hover:text-ep-orange rounded-lg hover:bg-ep-sand">
                      <RefreshCw size={15} className={refreshingId === p.id ? 'animate-spin' : ''} />
                    </button>
                  )}
                  <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="p-1.5 text-ep-muted hover:text-ep-green rounded-lg hover:bg-ep-sand">
                    {expanded === p.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                  <button onClick={() => openEdit(p)} className="p-1.5 text-ep-muted hover:text-ep-orange rounded-lg hover:bg-ep-sand">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => handleDelete(p.id, p.name)} className="p-1.5 text-ep-muted hover:text-red-400 rounded-lg hover:bg-ep-sand">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Handicap history */}
              {expanded === p.id && (
                <div className="bg-ep-sand/30 px-4 py-4 border-t border-ep-silver/20">
                  <p className="section-title mb-3">Handicap History</p>
                  {p.handicapHistory.length === 0 ? (
                    <p className="text-sm text-ep-muted">No rounds recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {[...p.handicapHistory].reverse().map((h, i) => (
                        <div key={i} className="bg-ep-cream rounded-lg border border-ep-silver/30 p-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-medium text-ep-green text-sm">
                              HCP {h.handicapIndex.toFixed(1)}
                              <span className="text-ep-muted font-normal ml-2 text-xs">diff {h.differential}</span>
                            </span>
                            <span className="text-xs text-ep-muted">{new Date(h.date).toLocaleDateString()}</span>
                          </div>
                          {h.notes && <p className="text-xs text-ep-green/80 mt-1.5 leading-relaxed">{h.notes}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-ep-muted">{players.length} players</p>
    </div>
  );
}
