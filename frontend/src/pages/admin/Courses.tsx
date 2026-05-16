import { useEffect, useState, FormEvent } from 'react';
import { coursesApi, Course } from '../../api/client';
import toast from 'react-hot-toast';
import { Search, Plus, Trash2, ChevronDown, ChevronUp, X, Check } from 'lucide-react';

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
    const cs = await coursesApi.list();
    setCourses(cs);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (query.length < 2) return;
    setSearching(true);
    try {
      const data = await coursesApi.search(query);
      setResults(data.courses ?? data.data ?? data ?? []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSearching(false);
    }
  }

  async function saveCourseFromApi(c: any) {
    try {
      const tees = c.tees ?? c.ratings ?? [];
      const mapped = tees.map((t: any, i: number) => ({
        name: t.tee_name ?? t.name ?? `Tee ${i + 1}`,
        color: t.tee_color ?? undefined,
        courseRating: Number(t.course_rating ?? t.rating ?? 0),
        slopeRating: Number(t.bogey_rating ? Math.round(t.bogey_rating) : t.slope ?? 113),
        par: Number(t.par ?? 72),
        yardage: t.total_yardage ?? t.yards ?? undefined,
      }));

      await coursesApi.save({
        id: String(c.id ?? c.course_id),
        name: c.club_name ?? c.name ?? c.course_name ?? 'Unknown',
        city: c.location?.split(',')[0]?.trim() ?? c.city ?? undefined,
        state: c.location?.split(',')[1]?.trim() ?? c.state ?? undefined,
        tees: mapped,
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

  if (loading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Courses</h1>
        <button onClick={() => setShowManual(!showManual)} className="btn-secondary text-sm">
          <Plus size={14} /> Add Manually
        </button>
      </div>

      {/* Manual add */}
      {showManual && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">Add Course Manually</h2>
            <button onClick={() => setShowManual(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <form onSubmit={saveManual} className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Course Name *</label>
              <input className="input" value={manualForm.name} onChange={e => setManualForm(f => ({ ...f, name: e.target.value }))} required placeholder="Pebble Beach" />
            </div>
            <div>
              <label className="label">City</label>
              <input className="input" value={manualForm.city} onChange={e => setManualForm(f => ({ ...f, city: e.target.value }))} placeholder="Pebble Beach" />
            </div>
            <div>
              <label className="label">State</label>
              <input className="input" value={manualForm.state} onChange={e => setManualForm(f => ({ ...f, state: e.target.value }))} placeholder="CA" />
            </div>
            <div className="sm:col-span-3 flex gap-2">
              <button type="submit" className="btn-primary"><Check size={14} /> Save</button>
              <button type="button" onClick={() => setShowManual(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-800 mb-3">Search & Import Courses</h2>
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <input
            className="input flex-1"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by course name or city..."
          />
          <button type="submit" className="btn-primary shrink-0" disabled={searching}>
            <Search size={14} /> {searching ? 'Searching...' : 'Search'}
          </button>
        </form>

        {results.length > 0 && (
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
            {results.slice(0, 15).map((c, i) => (
              <div key={i} className="flex items-center justify-between p-3">
                <div>
                  <div className="font-medium text-sm text-gray-900">{c.club_name ?? c.name ?? c.course_name}</div>
                  <div className="text-xs text-gray-400">{c.location ?? c.city ?? ''}</div>
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
        <h2 className="font-semibold text-gray-800 mb-3">Saved Courses ({courses.length})</h2>
        {courses.length === 0 ? (
          <div className="card p-8 text-center text-gray-400 text-sm">No courses saved yet. Search above to import.</div>
        ) : (
          <div className="card divide-y divide-gray-100">
            {courses.map(course => (
              <div key={course.id}>
                <button
                  className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
                  onClick={() => setExpanded(expanded === course.id ? null : course.id)}
                >
                  <div>
                    <div className="font-medium text-gray-900">{course.name}</div>
                    {(course.city || course.state) && (
                      <div className="text-xs text-gray-400 mt-0.5">{[course.city, course.state].filter(Boolean).join(', ')}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    {course.tees.length > 0 && <span>{course.tees.length} tees</span>}
                    {expanded === course.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </div>
                </button>

                {expanded === course.id && course.tees.length > 0 && (
                  <div className="px-5 pb-4 bg-gray-50 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-3 mb-2">Tee Information</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-400">
                            <th className="text-left py-1 font-medium">Tee</th>
                            <th className="text-center py-1 font-medium">Par</th>
                            <th className="text-center py-1 font-medium">Rating</th>
                            <th className="text-center py-1 font-medium">Slope</th>
                            <th className="text-center py-1 font-medium">Yardage</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {course.tees.map((tee, i) => (
                            <tr key={i}>
                              <td className="py-1.5 font-medium text-gray-800">{tee.name}</td>
                              <td className="py-1.5 text-center">{tee.par}</td>
                              <td className="py-1.5 text-center">{tee.courseRating}</td>
                              <td className="py-1.5 text-center">{tee.slopeRating}</td>
                              <td className="py-1.5 text-center text-gray-400">{tee.yardage ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
