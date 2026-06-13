import { useEffect, useState, FormEvent } from 'react';
import { coursesApi, Course } from '@shared/client';
import toast from 'react-hot-toast';
import { Search, Plus, ChevronDown, ChevronUp, X, Check } from 'lucide-react';

// Map API response tees ({male:[...], female:[...]}) into our flat format
function mapApiTees(rawTees: any): Course['tees'] {
  if (!rawTees || typeof rawTees !== 'object') return [];
  const all: Course['tees'] = [];
  for (const gender of ['male', 'female']) {
    const list = rawTees[gender] ?? [];
    for (const t of list) {
      all.push({
        name: `${t.tee_name ?? 'Unknown'} (${gender === 'female' ? 'W' : 'M'})`,
        courseRating: Number(t.course_rating ?? 0),
        slopeRating: Number(t.slope_rating ?? t.bogey_rating ? Math.round(Number(t.bogey_rating ?? 113)) : 113),
        par: Number(t.par_total ?? 72),
        yardage: t.total_yards ?? undefined,
      });
    }
  }
  return all;
}

export default function AdminCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState({ name: '', city: '', state: '' });

  async function load() {
    setCourses(await coursesApi.list());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (query.length < 2) return;
    setSearching(true);
    setResults([]);
    try {
      const data = await coursesApi.search(query);
      setResults(data.courses ?? []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSearching(false);
    }
  }

  async function saveCourseFromApi(c: any) {
    try {
      await coursesApi.save({
        id: String(c.id),
        name: c.club_name ?? c.course_name ?? 'Unknown',
        city: c.location?.city ?? undefined,
        state: c.location?.state ?? undefined,
        country: c.location?.country ?? undefined,
        tees: mapApiTees(c.tees),
        holes: [],
      });
      toast.success('Course saved');
      setResults([]);
      setQuery('');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function saveManual(e: FormEvent) {
    e.preventDefault();
    try {
      await coursesApi.save({ name: manualForm.name, city: manualForm.city || undefined, state: manualForm.state || undefined, tees: [], holes: [] });
      toast.success('Course saved');
      setShowManual(false);
      setManualForm({ name: '', city: '', state: '' });
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  if (loading) return <div className="text-ep-silver text-sm p-4">Loading…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="page-header">Courses</h1>
        <button onClick={() => setShowManual(!showManual)} className="btn-secondary">
          <Plus size={14} /> Add Manually
        </button>
      </div>

      {/* Manual add */}
      {showManual && (
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-ep-green">Add Course Manually</h2>
            <button onClick={() => setShowManual(false)} className="text-ep-silver hover:text-ep-green p-1"><X size={18} /></button>
          </div>
          <form onSubmit={saveManual} className="space-y-4">
            <div>
              <label className="label">Course Name *</label>
              <input className="input" value={manualForm.name} onChange={e => setManualForm(f => ({ ...f, name: e.target.value }))} required placeholder="Pebble Beach" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">City</label>
                <input className="input" value={manualForm.city} onChange={e => setManualForm(f => ({ ...f, city: e.target.value }))} placeholder="Pebble Beach" />
              </div>
              <div>
                <label className="label">State</label>
                <input className="input" value={manualForm.state} onChange={e => setManualForm(f => ({ ...f, state: e.target.value }))} placeholder="CA" />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1 justify-center"><Check size={14} /> Save</button>
              <button type="button" onClick={() => setShowManual(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      <div className="card p-4 sm:p-5">
        <h2 className="font-semibold text-ep-green mb-3">Search &amp; Import</h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            className="input flex-1"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by course or city name…"
          />
          <button type="submit" className="btn-primary shrink-0" disabled={searching}>
            <Search size={14} /> {searching ? 'Searching…' : 'Search'}
          </button>
        </form>

        {results.length > 0 && (
          <div className="mt-3 border border-ep-silver/30 rounded-lg divide-y divide-ep-silver/20 max-h-72 overflow-y-auto">
            {results.slice(0, 20).map((c, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2.5 gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm text-ep-green truncate">{c.club_name ?? c.course_name}</div>
                  <div className="text-xs text-ep-silver">{[c.location?.city, c.location?.state].filter(Boolean).join(', ')}</div>
                </div>
                <button onClick={() => saveCourseFromApi(c)} className="btn-secondary text-xs shrink-0">
                  <Plus size={12} /> Save
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Saved courses */}
      <div>
        <p className="section-title mb-3">Saved Courses ({courses.length})</p>
        {courses.length === 0 ? (
          <div className="card p-8 text-center text-ep-silver text-sm">No courses saved. Search above to import.</div>
        ) : (
          <div className="card divide-y divide-ep-silver/20">
            {courses.map(course => (
              <div key={course.id}>
                <button
                  className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-ep-sand/50 transition-colors"
                  onClick={() => setExpanded(expanded === course.id ? null : course.id)}
                >
                  <div className="min-w-0">
                    <div className="font-medium text-ep-green truncate">{course.name}</div>
                    {(course.city || course.state) && (
                      <div className="text-xs text-ep-silver mt-0.5">{[course.city, course.state].filter(Boolean).join(', ')}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2 text-xs text-ep-silver">
                    {course.tees.length > 0 && <span>{course.tees.length} tees</span>}
                    {expanded === course.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </button>

                {expanded === course.id && course.tees.length > 0 && (
                  <div className="bg-ep-sand/20 border-t border-ep-silver/20 px-4 py-4">
                    <p className="section-title mb-2">Tee Information</p>
                    <div className="space-y-2">
                      {course.tees.map((tee, i) => (
                        <div key={i} className="bg-ep-cream rounded-lg border border-ep-silver/30 px-3 py-2.5 flex items-center justify-between gap-2 flex-wrap text-sm">
                          <span className="font-medium text-ep-green">{tee.name}</span>
                          <div className="flex items-center gap-3 text-xs text-ep-silver flex-wrap">
                            <span>Par {tee.par}</span>
                            <span>Rating {tee.courseRating}</span>
                            <span>Slope {tee.slopeRating}</span>
                            {tee.yardage && <span>{tee.yardage.toLocaleString()} yds</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
