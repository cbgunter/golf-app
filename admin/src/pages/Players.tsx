import { useEffect, useState, FormEvent } from 'react';
import { playersApi, Player } from '@shared/client';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, X, Check } from 'lucide-react';

export default function AdminPlayers() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', handicapIndex: '' });

  async function load() {
    setPlayers(await playersApi.list());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm({ name: '', email: '', handicapIndex: '' });
    setEditId(null);
    setShowForm(true);
    setExpanded(null);
  }

  function openEdit(p: Player) {
    setForm({ name: p.name, email: p.email ?? '', handicapIndex: String(p.handicapIndex) });
    setEditId(p.id);
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const data = { name: form.name, email: form.email || undefined, handicapIndex: Number(form.handicapIndex) };
    try {
      if (editId) {
        await playersApi.update(editId, data);
        toast.success('Player updated');
      } else {
        await playersApi.create(data);
        toast.success('Player added');
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      toast.error(e.message);
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

  if (loading) return <div className="text-stone-400 text-sm p-4">Loading…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="page-header">Players</h1>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={15} /> Add Player
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-stone-700">{editId ? 'Edit Player' : 'New Player'}</h2>
            <button onClick={() => setShowForm(false)} className="text-stone-300 hover:text-stone-500 p-1"><X size={18} /></button>
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
              <label className="label">Handicap Index *</label>
              <input className="input" type="number" step="0.1" min="0" max="54" value={form.handicapIndex} onChange={e => setForm(f => ({ ...f, handicapIndex: e.target.value }))} required placeholder="12.4" />
              <p className="text-xs text-stone-400 mt-1">Enter current handicap index. It will auto-adjust after each round.</p>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="btn-primary flex-1 justify-center">
                <Check size={15} /> {editId ? 'Save Changes' : 'Add Player'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {players.length === 0 ? (
        <div className="card p-10 text-center text-stone-400 text-sm">No players yet.</div>
      ) : (
        <div className="card divide-y divide-stone-100">
          {players.map(p => (
            <div key={p.id}>
              <div className="flex items-center gap-3 px-4 py-3.5">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-sage-100 text-sage-700 flex items-center justify-center font-semibold text-sm shrink-0">
                  {p.name.charAt(0).toUpperCase()}
                </div>

                {/* Name + email */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-stone-800 truncate">{p.name}</div>
                  {p.email && <div className="text-xs text-stone-400 truncate">{p.email}</div>}
                </div>

                {/* HCP + actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <div className="text-base font-semibold text-sage-700">{p.handicapIndex.toFixed(1)}</div>
                    <div className="text-xs text-stone-400 leading-none">HCP</div>
                  </div>
                  <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="p-1.5 text-stone-300 hover:text-stone-500 rounded-lg hover:bg-stone-50">
                    {expanded === p.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                  <button onClick={() => openEdit(p)} className="p-1.5 text-stone-300 hover:text-sage-600 rounded-lg hover:bg-stone-50">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => handleDelete(p.id, p.name)} className="p-1.5 text-stone-300 hover:text-red-400 rounded-lg hover:bg-stone-50">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Handicap history */}
              {expanded === p.id && (
                <div className="bg-stone-50 px-4 py-4 border-t border-stone-100">
                  <p className="section-title mb-3">Handicap History</p>
                  {p.handicapHistory.length === 0 ? (
                    <p className="text-sm text-stone-400">No rounds recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {[...p.handicapHistory].reverse().map((h, i) => (
                        <div key={i} className="bg-white rounded-lg border border-stone-200 p-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-medium text-stone-800 text-sm">
                              HCP {h.handicapIndex.toFixed(1)}
                              <span className="text-stone-400 font-normal ml-2 text-xs">diff {h.differential}</span>
                            </span>
                            <span className="text-xs text-stone-400">{new Date(h.date).toLocaleDateString()}</span>
                          </div>
                          {h.notes && <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">{h.notes}</p>}
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

      <p className="text-xs text-stone-400">{players.length} / 20 players</p>
    </div>
  );
}
