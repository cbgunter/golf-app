import { useEffect, useState, FormEvent } from 'react';
import { playersApi, Player } from '../../api/client';
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
    const ps = await playersApi.list();
    setPlayers(ps);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm({ name: '', email: '', handicapIndex: '' });
    setEditId(null);
    setShowForm(true);
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
    if (!confirm(`Remove ${name}? This cannot be undone.`)) return;
    try {
      await playersApi.delete(id);
      toast.success('Player removed');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  if (loading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Players</h1>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} /> Add Player
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">{editId ? 'Edit Player' : 'New Player'}</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <form onSubmit={handleSubmit} className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Full Name *</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="John Smith" />
            </div>
            <div>
              <label className="label">Email (optional)</label>
              <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@example.com" />
            </div>
            <div>
              <label className="label">Handicap Index *</label>
              <input className="input" type="number" step="0.1" min="0" max="54" value={form.handicapIndex} onChange={e => setForm(f => ({ ...f, handicapIndex: e.target.value }))} required placeholder="12.4" />
            </div>
            <div className="sm:col-span-3 flex gap-2">
              <button type="submit" className="btn-primary">
                <Check size={15} /> {editId ? 'Save Changes' : 'Add Player'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Player list */}
      {players.length === 0 ? (
        <div className="card p-10 text-center text-gray-400">No players yet. Add one above.</div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {players.map(p => (
            <div key={p.id}>
              <div className="flex items-center justify-between px-5 py-3.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-fairway-100 text-fairway-700 flex items-center justify-center font-semibold text-sm shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{p.name}</div>
                      {p.email && <div className="text-xs text-gray-400">{p.email}</div>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <div className="text-right">
                    <div className="text-sm font-semibold text-fairway-700">{p.handicapIndex.toFixed(1)}</div>
                    <div className="text-xs text-gray-400">HCP Index</div>
                  </div>
                  <button
                    onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                    className="text-gray-400 hover:text-gray-600 p-1"
                    title="History"
                  >
                    {expanded === p.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <button onClick={() => openEdit(p)} className="text-gray-400 hover:text-fairway-600 p-1" title="Edit">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => handleDelete(p.id, p.name)} className="text-gray-400 hover:text-red-500 p-1" title="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Handicap history */}
              {expanded === p.id && (
                <div className="bg-gray-50 px-5 py-4 border-t border-gray-100">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Handicap History</h3>
                  {p.handicapHistory.length === 0 ? (
                    <p className="text-sm text-gray-400">No rounds recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {[...p.handicapHistory].reverse().map((h, i) => (
                        <div key={i} className="bg-white rounded-lg border border-gray-200 p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-sm">
                              <span className="font-medium text-gray-800">HCP {h.handicapIndex.toFixed(1)}</span>
                              <span className="text-gray-400 ml-2">diff {h.differential}</span>
                            </div>
                            <span className="text-xs text-gray-400">{new Date(h.date).toLocaleDateString()}</span>
                          </div>
                          {h.notes && (
                            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{h.notes}</p>
                          )}
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

      <p className="text-xs text-gray-400">{players.length} / 20 players</p>
    </div>
  );
}
