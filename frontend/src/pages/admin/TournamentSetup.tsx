import { useEffect, useState, FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { tournamentsApi, playersApi, roundsApi, Tournament, Player, Round } from '../../api/client';
import { coursesApi, Course } from '../../api/client';
import toast from 'react-hot-toast';
import StatusBadge from '../../components/StatusBadge';
import { Plus, Trash2, Save, ChevronRight, X, Check, Search } from 'lucide-react';

const isNew = (id: string) => id === 'new';

export default function AdminTournamentSetup() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const creating = isNew(id!);

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(!creating);
  const [tab, setTab] = useState<'details' | 'players' | 'rounds'>('details');

  // Form state
  const [form, setForm] = useState({
    name: '', description: '', startDate: '', endDate: '',
    format: 'stroke_play', isNet: true, isGross: true,
    hasClosestToPin: false, hasLongestDrive: false,
    entryFee: '0', notes: '',
  });
  const [payoutRows, setPayoutRows] = useState<{ place: number; label: string; percentage: string }[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);

  // Round form
  const [showRoundForm, setShowRoundForm] = useState(false);
  const [roundForm, setRoundForm] = useState({
    courseId: '', courseName: '', tee: '', courseRating: '', slopeRating: '', par: '72',
    date: '', closestToPinHole: '', longestDriveHole: '', notes: '',
  });
  const [courseSearch, setCourseSearch] = useState('');
  const [courseResults, setCourseResults] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const [ps, cs] = await Promise.all([playersApi.list(), coursesApi.list()]);
      setPlayers(ps);
      setCourses(cs);
      if (!creating) {
        const [t, rs] = await Promise.all([tournamentsApi.get(id!), tournamentsApi.rounds(id!)]);
        setTournament(t);
        setRounds(rs);
        setForm({
          name: t.name, description: t.description ?? '', startDate: t.startDate,
          endDate: t.endDate ?? '', format: t.format, isNet: t.isNet, isGross: t.isGross,
          hasClosestToPin: t.hasClosestToPin, hasLongestDrive: t.hasLongestDrive,
          entryFee: String(t.entryFee), notes: t.notes ?? '',
        });
        setPayoutRows(t.payoutStructure.map(p => ({ ...p, percentage: String(p.percentage) })));
        setSelectedPlayerIds(t.playerIds);
      }
      setLoading(false);
    };
    load();
  }, [id, creating]);

  async function searchCourses() {
    if (courseSearch.length < 2) return;
    try {
      const data = await coursesApi.search(courseSearch);
      setCourseResults(data.courses ?? data.data ?? data ?? []);
    } catch {
      toast.error('Course search failed');
    }
  }

  function selectCourseResult(c: any) {
    // API returns tees as {male: [...], female: [...]}
    const teeLists = c.tees ?? {};
    const first = (teeLists.male ?? teeLists.female ?? [])[0] ?? {};
    setRoundForm(f => ({
      ...f,
      courseId: String(c.id ?? ''),
      courseName: c.club_name ?? c.course_name ?? '',
      tee: first.tee_name ?? 'White',
      courseRating: String(first.course_rating ?? ''),
      slopeRating: String(first.slope_rating ?? (first.bogey_rating ? Math.round(Number(first.bogey_rating)) : '') ),
      par: String(first.par_total ?? 72),
    }));
    setCourseResults([]);
    setCourseSearch('');
  }

  async function handleSaveDetails(e: FormEvent) {
    e.preventDefault();
    const data = {
      name: form.name, description: form.description || undefined,
      startDate: form.startDate, endDate: form.endDate || undefined,
      format: form.format as any, isNet: form.isNet, isGross: form.isGross,
      hasClosestToPin: form.hasClosestToPin, hasLongestDrive: form.hasLongestDrive,
      entryFee: Number(form.entryFee),
      payoutStructure: payoutRows.map(r => ({ place: r.place, label: r.label, percentage: Number(r.percentage) })),
      playerIds: selectedPlayerIds,
      notes: form.notes || undefined,
    };

    try {
      if (creating) {
        const t = await tournamentsApi.create(data);
        toast.success('Tournament created');
        navigate(`/admin/tournaments/${t.id}`);
      } else {
        await tournamentsApi.update(id!, data);
        toast.success('Saved');
        setTournament(prev => prev ? { ...prev, ...data } : null);
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleAddRound(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await roundsApi.create(id!, {
        courseId: roundForm.courseId,
        courseName: roundForm.courseName,
        tee: roundForm.tee,
        courseRating: Number(roundForm.courseRating),
        slopeRating: Number(roundForm.slopeRating),
        par: Number(roundForm.par),
        date: roundForm.date,
        closestToPinHole: roundForm.closestToPinHole ? Number(roundForm.closestToPinHole) : undefined,
        longestDriveHole: roundForm.longestDriveHole ? Number(roundForm.longestDriveHole) : undefined,
        notes: roundForm.notes || undefined,
      } as any);
      setRounds(rs => [...rs, r]);
      setShowRoundForm(false);
      toast.success('Round added');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleArchive() {
    if (!confirm('Archive this tournament?')) return;
    try {
      await tournamentsApi.update(id!, { status: 'archived' });
      toast.success('Archived');
      navigate('/admin/tournaments');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  if (loading) return <div className="text-stone-500">Loading...</div>;

  const payoutTotal = payoutRows.reduce((s, r) => s + Number(r.percentage || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link to="/admin/tournaments" className="text-xs text-stone-400 hover:text-stone-600">← Tournaments</Link>
          <h1 className="text-2xl font-bold text-stone-900 mt-1">
            {creating ? 'New Tournament' : tournament?.name}
          </h1>
          {tournament && <StatusBadge status={tournament.status} />}
        </div>
        {!creating && tournament?.status === 'completed' && (
          <div className="flex gap-2">
            <Link to={`/tournament/${id}/results`} className="btn-gold">View Results</Link>
            <button onClick={handleArchive} className="btn-secondary text-xs">Archive</button>
          </div>
        )}
      </div>

      {/* Tabs (only when editing) */}
      {!creating && (
        <div className="flex border-b border-stone-200 gap-6">
          {(['details', 'players', 'rounds'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2 text-sm font-medium capitalize border-b-2 transition-colors ${tab === t ? 'border-sage-600 text-sage-700' : 'border-transparent text-stone-500 hover:text-stone-700'}`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Details form */}
      {(creating || tab === 'details') && (
        <form onSubmit={handleSaveDetails} className="space-y-5">
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-stone-800">Tournament Details</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Tournament Name *</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Annual Golf Trip" />
              </div>
              <div>
                <label className="label">Format</label>
                <select className="input" value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value }))}>
                  <option value="stroke_play">Stroke Play</option>
                  <option value="stableford">Stableford</option>
                  <option value="match_play">Match Play</option>
                </select>
              </div>
              <div>
                <label className="label">Start Date *</label>
                <input className="input" type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} required />
              </div>
              <div>
                <label className="label">End Date</label>
                <input className="input" type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
              <div>
                <label className="label">Entry Fee ($)</label>
                <input className="input" type="number" min="0" step="1" value={form.entryFee} onChange={e => setForm(f => ({ ...f, entryFee: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <label className="label">Scoring Options</label>
                {[
                  { key: 'isGross', label: 'Track Gross Scores' },
                  { key: 'isNet', label: 'Track Net Scores' },
                  { key: 'hasClosestToPin', label: 'Closest to Pin' },
                  { key: 'hasLongestDrive', label: 'Longest Drive' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={form[key as keyof typeof form] as boolean}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="sm:col-span-2">
                <label className="label">Description</label>
                <textarea className="input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional notes about this tournament..." />
              </div>
            </div>
          </div>

          {/* Payout structure */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-stone-800">Payout Structure</h2>
              <button
                type="button"
                onClick={() => setPayoutRows(r => [...r, { place: r.length + 1, label: `${r.length + 1}st Place`, percentage: '' }])}
                className="btn-secondary text-xs"
              >
                <Plus size={13} /> Add Place
              </button>
            </div>
            {payoutRows.length === 0 ? (
              <p className="text-sm text-stone-400">No payouts configured. Add places above.</p>
            ) : (
              <div className="space-y-2">
                {payoutRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-6 text-sm text-stone-500 text-center">{row.place}</span>
                    <input className="input flex-1" value={row.label} onChange={e => setPayoutRows(r => r.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="1st Place" />
                    <div className="relative w-28">
                      <input className="input pr-6" type="number" min="0" max="100" step="0.5" value={row.percentage} onChange={e => setPayoutRows(r => r.map((x, j) => j === i ? { ...x, percentage: e.target.value } : x))} placeholder="50" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 text-sm">%</span>
                    </div>
                    {Number(form.entryFee) > 0 && (
                      <span className="text-xs text-sand-600 w-16 text-right">${((Number(row.percentage || 0) / 100) * Number(form.entryFee) * selectedPlayerIds.length).toFixed(0)}</span>
                    )}
                    <button type="button" onClick={() => setPayoutRows(r => r.filter((_, j) => j !== i))} className="text-stone-300 hover:text-red-400">
                      <X size={15} />
                    </button>
                  </div>
                ))}
                <div className={`text-xs mt-2 ${Math.abs(payoutTotal - 100) > 0.01 ? 'text-red-500' : 'text-green-600'}`}>
                  Total: {payoutTotal}% {Math.abs(payoutTotal - 100) < 0.01 ? '✓' : '(must equal 100%)'}
                </div>
              </div>
            )}
          </div>

          {/* Players (inline on create) */}
          {creating && (
            <div className="card p-5">
              <h2 className="font-semibold text-stone-800 mb-3">Players ({selectedPlayerIds.length})</h2>
              {players.length === 0 ? (
                <p className="text-sm text-stone-400">No players yet. <Link to="/admin/players" className="text-sage-600 hover:underline">Add players first.</Link></p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-2">
                  {players.map(p => (
                    <label key={p.id} className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer p-2 rounded-lg hover:bg-stone-50">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={selectedPlayerIds.includes(p.id)}
                        onChange={e => setSelectedPlayerIds(ids => e.target.checked ? [...ids, p.id] : ids.filter(x => x !== p.id))}
                      />
                      <span className="flex-1">{p.name}</span>
                      <span className="text-xs text-stone-400">HCP {p.handicapIndex.toFixed(1)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <button type="submit" className="btn-primary">
            <Save size={15} /> {creating ? 'Create Tournament' : 'Save Changes'}
          </button>
        </form>
      )}

      {/* Players tab */}
      {!creating && tab === 'players' && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-stone-800">Tournament Players ({selectedPlayerIds.length})</h2>
            <button
              onClick={async () => {
                try {
                  await tournamentsApi.update(id!, { playerIds: selectedPlayerIds });
                  toast.success('Players saved');
                } catch (e: any) { toast.error(e.message); }
              }}
              className="btn-primary"
            >
              <Save size={14} /> Save
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {players.map(p => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer p-2.5 rounded-lg hover:bg-stone-50 border border-stone-100">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={selectedPlayerIds.includes(p.id)}
                  onChange={e => setSelectedPlayerIds(ids => e.target.checked ? [...ids, p.id] : ids.filter(x => x !== p.id))}
                />
                <span className="flex-1 font-medium">{p.name}</span>
                <span className="text-xs text-stone-400">HCP {p.handicapIndex.toFixed(1)}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Rounds tab */}
      {!creating && tab === 'rounds' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-stone-800">Rounds ({rounds.length})</h2>
            <button onClick={() => setShowRoundForm(!showRoundForm)} className="btn-primary">
              <Plus size={15} /> Add Round
            </button>
          </div>

          {/* Add round form */}
          {showRoundForm && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-stone-800">New Round</h3>
                <button onClick={() => setShowRoundForm(false)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
              </div>
              <form onSubmit={handleAddRound} className="space-y-4">
                {/* Course search */}
                <div>
                  <label className="label">Course Search</label>
                  <div className="flex gap-2">
                    <input
                      className="input flex-1"
                      value={courseSearch}
                      onChange={e => setCourseSearch(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), searchCourses())}
                      placeholder="Search for a course..."
                    />
                    <button type="button" onClick={searchCourses} className="btn-secondary shrink-0">
                      <Search size={14} />
                    </button>
                  </div>
                  {courseResults.length > 0 && (
                    <div className="mt-1 border border-stone-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto shadow-sm">
                      {courseResults.slice(0, 10).map((c, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => selectCourseResult(c)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-sage-50 transition-colors"
                        >
                          <div className="font-medium">{c.club_name ?? c.name ?? c.course_name}</div>
                          <div className="text-xs text-stone-400">{c.location ?? c.city ?? ''}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Course Name *</label>
                    <input className="input" value={roundForm.courseName} onChange={e => setRoundForm(f => ({ ...f, courseName: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="label">Tee</label>
                    <input className="input" value={roundForm.tee} onChange={e => setRoundForm(f => ({ ...f, tee: e.target.value }))} placeholder="White" required />
                  </div>
                  <div>
                    <label className="label">Course Rating *</label>
                    <input className="input" type="number" step="0.1" value={roundForm.courseRating} onChange={e => setRoundForm(f => ({ ...f, courseRating: e.target.value }))} required placeholder="72.1" />
                  </div>
                  <div>
                    <label className="label">Slope Rating *</label>
                    <input className="input" type="number" value={roundForm.slopeRating} onChange={e => setRoundForm(f => ({ ...f, slopeRating: e.target.value }))} required placeholder="130" />
                  </div>
                  <div>
                    <label className="label">Par *</label>
                    <input className="input" type="number" value={roundForm.par} onChange={e => setRoundForm(f => ({ ...f, par: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="label">Date *</label>
                    <input className="input" type="date" value={roundForm.date} onChange={e => setRoundForm(f => ({ ...f, date: e.target.value }))} required />
                  </div>
                  {tournament?.hasClosestToPin && (
                    <div>
                      <label className="label">Closest to Pin Hole</label>
                      <input className="input" type="number" min="1" max="18" value={roundForm.closestToPinHole} onChange={e => setRoundForm(f => ({ ...f, closestToPinHole: e.target.value }))} placeholder="e.g. 7" />
                    </div>
                  )}
                  {tournament?.hasLongestDrive && (
                    <div>
                      <label className="label">Longest Drive Hole</label>
                      <input className="input" type="number" min="1" max="18" value={roundForm.longestDriveHole} onChange={e => setRoundForm(f => ({ ...f, longestDriveHole: e.target.value }))} placeholder="e.g. 14" />
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button type="submit" className="btn-primary"><Check size={14} /> Add Round</button>
                  <button type="button" onClick={() => setShowRoundForm(false)} className="btn-secondary">Cancel</button>
                </div>
              </form>
            </div>
          )}

          {/* Rounds list */}
          {rounds.length === 0 ? (
            <div className="card p-8 text-center text-stone-400 text-sm">No rounds yet.</div>
          ) : (
            <div className="card divide-y divide-gray-100">
              {rounds.map(r => (
                <Link
                  key={r.id}
                  to={`/admin/rounds/${r.id}/scoring`}
                  className="flex items-center justify-between px-5 py-4 hover:bg-stone-50 transition-colors group"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <StatusBadge status={r.status} />
                      <span className="text-xs text-stone-400">{r.tee} tees</span>
                    </div>
                    <div className="font-medium text-stone-900 group-hover:text-sage-700">{r.courseName}</div>
                    <div className="text-xs text-stone-400 mt-0.5">
                      {new Date(r.date).toLocaleDateString()} · Par {r.par} · Rating {r.courseRating} / Slope {r.slopeRating}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-stone-300" />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
