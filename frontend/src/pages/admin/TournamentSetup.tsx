import { useEffect, useState, FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { tournamentsApi, playersApi, roundsApi, Tournament, Player, Round } from '../../api/client';
import { coursesApi } from '../../api/client';
import toast from 'react-hot-toast';
import StatusBadge from '../../components/StatusBadge';
import { Plus, Save, ChevronRight, X, Check, Search, Loader2 } from 'lucide-react';

const isNew = (id: string) => id === 'new';

// Map GHIN TeeSets array to flat tee list with hole data
function flattenTees(teeSets: any[]): { label: string; courseRating: number; slopeRating: number; par: number; holes: any[] }[] {
  if (!Array.isArray(teeSets)) return [];
  const out: { label: string; courseRating: number; slopeRating: number; par: number; holes: any[] }[] = [];
  for (const ts of teeSets) {
    const totalRating = (ts.Ratings ?? []).find((r: any) => r.RatingType === 'Total' || r.RatingType === 'Eighteen');
    if (!totalRating) continue;
    const holes = (ts.Holes ?? [])
      .sort((a: any, b: any) => a.Number - b.Number)
      .map((h: any) => ({ number: h.Number, par: h.Par, handicap: h.Allocation, yardage: h.Length }));
    out.push({
      label: ts.TeeSetRatingName ?? ts.TeeColorName ?? 'Unknown',
      courseRating: Number(totalRating.CourseRating ?? 0),
      slopeRating: Number(totalRating.SlopeRating ?? 113),
      par: Number(ts.TotalPar ?? 72),
      holes,
    });
  }
  return out;
}

export default function AdminTournamentSetup() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const creating = isNew(id!);

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(!creating);
  const [tab, setTab] = useState<'details' | 'players' | 'rounds'>('details');

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
    holes: [] as { number: number; par: number; handicap: number; yardage?: number }[],
  });
  const [courseQuery, setCourseQuery] = useState('');
  const [courseResults, setCourseResults] = useState<any[]>([]);
  const [courseTees, setCourseTees] = useState<{ label: string; courseRating: number; slopeRating: number; par: number; holes: any[] }[]>([]);
  const [courseSearching, setCourseSearching] = useState(false);

  useEffect(() => {
    const load = async () => {
      const ps = await playersApi.list();
      setPlayers(ps);
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
    if (courseQuery.length < 2) return;
    setCourseSearching(true);
    setCourseResults([]);
    try {
      const data = await coursesApi.search(courseQuery);
      setCourseResults(data.courses ?? []);
    } catch {
      toast.error('Course search failed');
    } finally {
      setCourseSearching(false);
    }
  }

  async function selectCourseResult(c: any) {
    const name = c.CourseName ?? c.FacilityName ?? c.club_name ?? c.course_name ?? '';
    const courseId = String(c.CourseID ?? c.id ?? '');
    setCourseResults([]);
    setCourseQuery('');
    setRoundForm(f => ({ ...f, courseId, courseName: name }));
    setCourseSearching(true);
    try {
      const full = await coursesApi.getFromApi(String(c.CourseID ?? c.id));
      const course = full.course ?? full;
      const tees = flattenTees(course.TeeSets ?? course.tees ?? []);
      setCourseTees(tees);
      const first = tees[0];
      if (first) {
        setRoundForm(f => ({
          ...f,
          tee: first.label,
          courseRating: String(first.courseRating),
          slopeRating: String(first.slopeRating),
          par: String(first.par),
          holes: first.holes,
        }));
      }
    } catch {
      toast.error('Could not load tee data — enter manually');
    } finally {
      setCourseSearching(false);
    }
  }

  function selectTee(teeLabel: string) {
    const tee = courseTees.find(t => t.label === teeLabel);
    if (!tee) return;
    setRoundForm(f => ({
      ...f,
      tee: teeLabel,
      courseRating: String(tee.courseRating),
      slopeRating: String(tee.slopeRating),
      par: String(tee.par),
      holes: tee.holes,
    }));
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
        courseId: roundForm.courseId || 'manual',
        courseName: roundForm.courseName,
        tee: roundForm.tee,
        courseRating: Number(roundForm.courseRating),
        slopeRating: Number(roundForm.slopeRating),
        par: Number(roundForm.par),
        date: roundForm.date,
        closestToPinHole: roundForm.closestToPinHole ? Number(roundForm.closestToPinHole) : undefined,
        longestDriveHole: roundForm.longestDriveHole ? Number(roundForm.longestDriveHole) : undefined,
        holes: roundForm.holes.length > 0 ? roundForm.holes : undefined,
        notes: roundForm.notes || undefined,
      } as any);
      setRounds(rs => [...rs, r]);
      setShowRoundForm(false);
      setRoundForm({ courseId: '', courseName: '', tee: '', courseRating: '', slopeRating: '', par: '72', date: '', closestToPinHole: '', longestDriveHole: '', notes: '', holes: [] });
      setCourseTees([]);
      setCourseQuery('');
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

  if (loading) return <div className="text-stone-400 text-sm p-4">Loading…</div>;

  const payoutTotal = payoutRows.reduce((s, r) => s + Number(r.percentage || 0), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to="/admin/tournaments" className="text-xs text-stone-400 hover:text-stone-600">← Tournaments</Link>
          <h1 className="page-header mt-1">{creating ? 'New Tournament' : tournament?.name}</h1>
          {tournament && <div className="mt-1"><StatusBadge status={tournament.status} /></div>}
        </div>
        {!creating && tournament?.status === 'completed' && (
          <div className="flex gap-2 shrink-0">
            <Link to={`/tournament/${id}/results`} className="btn-gold">Results</Link>
            <button onClick={handleArchive} className="btn-secondary text-xs">Archive</button>
          </div>
        )}
      </div>

      {/* Tabs */}
      {!creating && (
        <div className="flex border-b border-stone-200 gap-1">
          {(['details', 'players', 'rounds'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 pb-2.5 pt-1 text-sm font-medium capitalize border-b-2 transition-colors -mb-px ${
                tab === t ? 'border-sage-600 text-sage-700' : 'border-transparent text-stone-400 hover:text-stone-600'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* ── Details ── */}
      {(creating || tab === 'details') && (
        <form onSubmit={handleSaveDetails} className="space-y-4">
          <div className="card p-4 sm:p-5 space-y-4">
            <p className="section-title">Tournament Details</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
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
                <label className="label">Entry Fee ($)</label>
                <input className="input" type="number" min="0" step="1" value={form.entryFee} onChange={e => setForm(f => ({ ...f, entryFee: e.target.value }))} />
              </div>
              <div>
                <label className="label">Start Date *</label>
                <input className="input" type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} required />
              </div>
              <div>
                <label className="label">End Date</label>
                <input className="input" type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Scoring Options</label>
                <div className="flex flex-wrap gap-x-6 gap-y-2 mt-1">
                  {[
                    { key: 'isGross', label: 'Gross Scores' },
                    { key: 'isNet', label: 'Net Scores' },
                    { key: 'hasClosestToPin', label: 'Closest to Pin' },
                    { key: 'hasLongestDrive', label: 'Longest Drive' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
                      <input type="checkbox" className="rounded accent-sage-600"
                        checked={form[key as keyof typeof form] as boolean}
                        onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Notes</label>
                <textarea className="input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional notes…" />
              </div>
            </div>
          </div>

          {/* Payout structure */}
          <div className="card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="section-title">Payout Structure</p>
              <button type="button" onClick={() => setPayoutRows(r => [...r, { place: r.length + 1, label: `${r.length + 1}${['st','nd','rd'][r.length] ?? 'th'} Place`, percentage: '' }])} className="btn-secondary text-xs">
                <Plus size={13} /> Add Place
              </button>
            </div>
            {payoutRows.length === 0 ? (
              <p className="text-sm text-stone-400">No payouts configured.</p>
            ) : (
              <div className="space-y-2">
                {payoutRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-5 text-xs text-stone-400 text-center shrink-0">{row.place}</span>
                    <input className="input flex-1 min-w-0" value={row.label} onChange={e => setPayoutRows(r => r.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                    <div className="relative w-24 shrink-0">
                      <input className="input pr-5 text-right" type="number" min="0" max="100" step="0.5" value={row.percentage} onChange={e => setPayoutRows(r => r.map((x, j) => j === i ? { ...x, percentage: e.target.value } : x))} placeholder="0" />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 text-xs">%</span>
                    </div>
                    {Number(form.entryFee) > 0 && selectedPlayerIds.length > 0 && (
                      <span className="text-xs text-sand-600 w-14 text-right shrink-0">
                        ${((Number(row.percentage || 0) / 100) * Number(form.entryFee) * selectedPlayerIds.length).toFixed(0)}
                      </span>
                    )}
                    <button type="button" onClick={() => setPayoutRows(r => r.filter((_, j) => j !== i))} className="text-stone-300 hover:text-red-400 shrink-0"><X size={14} /></button>
                  </div>
                ))}
                <p className={`text-xs mt-1 ${Math.abs(payoutTotal - 100) > 0.01 ? 'text-red-400' : 'text-sage-600'}`}>
                  Total: {payoutTotal}% {Math.abs(payoutTotal - 100) < 0.01 ? '✓' : '— must equal 100%'}
                </p>
              </div>
            )}
          </div>

          {/* Players (on create) */}
          {creating && (
            <div className="card p-4 sm:p-5">
              <p className="section-title mb-3">Players ({selectedPlayerIds.length})</p>
              {players.length === 0 ? (
                <p className="text-sm text-stone-400">No players yet. <Link to="/admin/players" className="text-sage-600 hover:underline">Add players first.</Link></p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-1">
                  {players.map(p => (
                    <label key={p.id} className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-stone-50 cursor-pointer">
                      <input type="checkbox" className="rounded accent-sage-600"
                        checked={selectedPlayerIds.includes(p.id)}
                        onChange={e => setSelectedPlayerIds(ids => e.target.checked ? [...ids, p.id] : ids.filter(x => x !== p.id))} />
                      <span className="flex-1 text-sm text-stone-700">{p.name}</span>
                      <span className="text-xs text-stone-400">HCP {p.handicapIndex.toFixed(1)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <button type="submit" className="btn-primary">
            <Save size={14} /> {creating ? 'Create Tournament' : 'Save Changes'}
          </button>
        </form>
      )}

      {/* ── Players tab ── */}
      {!creating && tab === 'players' && (
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="section-title">Tournament Players ({selectedPlayerIds.length})</p>
            <button onClick={async () => {
              try { await tournamentsApi.update(id!, { playerIds: selectedPlayerIds }); toast.success('Saved'); }
              catch (e: any) { toast.error(e.message); }
            }} className="btn-primary"><Save size={14} /> Save</button>
          </div>
          <div className="grid sm:grid-cols-2 gap-1">
            {players.map(p => (
              <label key={p.id} className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-stone-50 cursor-pointer border border-stone-100">
                <input type="checkbox" className="rounded accent-sage-600"
                  checked={selectedPlayerIds.includes(p.id)}
                  onChange={e => setSelectedPlayerIds(ids => e.target.checked ? [...ids, p.id] : ids.filter(x => x !== p.id))} />
                <span className="flex-1 text-sm font-medium text-stone-700">{p.name}</span>
                <span className="text-xs text-stone-400">HCP {p.handicapIndex.toFixed(1)}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ── Rounds tab ── */}
      {!creating && tab === 'rounds' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="section-title">Rounds ({rounds.length})</p>
            <button onClick={() => { setShowRoundForm(!showRoundForm); setCourseTees([]); setCourseQuery(''); }} className="btn-primary">
              <Plus size={14} /> Add Round
            </button>
          </div>

          {/* Round form */}
          {showRoundForm && (
            <div className="card p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-stone-700">New Round</h3>
                <button type="button" onClick={() => setShowRoundForm(false)} className="text-stone-300 hover:text-stone-500 p-1"><X size={18} /></button>
              </div>
              <form onSubmit={handleAddRound} className="space-y-4">

                {/* Course search */}
                <div>
                  <label className="label">Search for a Course</label>
                  <div className="flex gap-2">
                    <input
                      className="input flex-1"
                      value={courseQuery}
                      onChange={e => setCourseQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), searchCourses())}
                      placeholder="Course name or city…"
                    />
                    <button type="button" onClick={searchCourses} disabled={courseSearching} className="btn-secondary shrink-0">
                      {courseSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    </button>
                  </div>

                  {courseResults.length > 0 && (
                    <div className="mt-1.5 border border-stone-200 rounded-lg divide-y divide-stone-100 max-h-52 overflow-y-auto shadow-sm">
                      {courseResults.slice(0, 15).map((c, i) => (
                        <button key={i} type="button" onClick={() => selectCourseResult(c)}
                          className="w-full text-left px-3 py-2.5 hover:bg-sage-50 transition-colors">
                          <div className="text-sm font-medium text-stone-800">{c.CourseName ?? c.FacilityName ?? c.club_name ?? c.course_name}</div>
                          <div className="text-xs text-stone-400">{[c.City ?? c.location?.city, c.State ?? c.location?.state].filter(Boolean).join(', ')}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tee picker — shown after a course is selected */}
                {courseTees.length > 0 && (
                  <div>
                    <label className="label">Select Tee</label>
                    <select className="input" value={roundForm.tee} onChange={e => selectTee(e.target.value)}>
                      {courseTees.map(t => (
                        <option key={t.label} value={t.label}>{t.label} — Par {t.par} · Rating {t.courseRating} · Slope {t.slopeRating}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Course fields — editable after selection or fully manual */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="label">Course Name *</label>
                    <input className="input" value={roundForm.courseName} onChange={e => setRoundForm(f => ({ ...f, courseName: e.target.value }))} required placeholder="Pebble Beach" />
                  </div>
                  {courseTees.length === 0 && (
                    <div className="col-span-2">
                      <label className="label">Tee Name *</label>
                      <input className="input" value={roundForm.tee} onChange={e => setRoundForm(f => ({ ...f, tee: e.target.value }))} required placeholder="White" />
                    </div>
                  )}
                  <div>
                    <label className="label">Course Rating *</label>
                    <input className="input" type="number" step="0.1" value={roundForm.courseRating} onChange={e => setRoundForm(f => ({ ...f, courseRating: e.target.value }))} required placeholder="71.4" />
                  </div>
                  <div>
                    <label className="label">Slope Rating *</label>
                    <input className="input" type="number" value={roundForm.slopeRating} onChange={e => setRoundForm(f => ({ ...f, slopeRating: e.target.value }))} required placeholder="128" />
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
                      <label className="label">CTP Hole</label>
                      <input className="input" type="number" min="1" max="18" value={roundForm.closestToPinHole} onChange={e => setRoundForm(f => ({ ...f, closestToPinHole: e.target.value }))} placeholder="e.g. 7" />
                    </div>
                  )}
                  {tournament?.hasLongestDrive && (
                    <div>
                      <label className="label">LD Hole</label>
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

          {rounds.length === 0 ? (
            <div className="card p-8 text-center text-stone-400 text-sm">No rounds yet.</div>
          ) : (
            <div className="card divide-y divide-stone-100">
              {rounds.map(r => (
                <Link key={r.id} to={`/admin/rounds/${r.id}/scoring`}
                  className="flex items-center justify-between px-4 py-3.5 hover:bg-stone-50 transition-colors group">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <StatusBadge status={r.status} />
                      <span className="text-xs text-stone-400">{r.tee}</span>
                    </div>
                    <div className="font-medium text-stone-800 group-hover:text-sage-700">{r.courseName}</div>
                    <div className="text-xs text-stone-400 mt-0.5">
                      {new Date(r.date).toLocaleDateString()} · Par {r.par} · {r.courseRating}/{r.slopeRating}
                    </div>
                  </div>
                  <ChevronRight size={15} className="text-stone-300 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
