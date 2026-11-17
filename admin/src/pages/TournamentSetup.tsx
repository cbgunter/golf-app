import { useEffect, useState, useMemo, useRef, FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { tournamentsApi, playersApi, roundsApi, scoringApi, Tournament, Player, Round, DraftScorecard } from '@shared/client';
import { coursesApi } from '@shared/client';
import toast from 'react-hot-toast';
import StatusBadge from '../components/StatusBadge';
import { Plus, Save, ChevronRight, ChevronDown, ChevronUp, X, Check, Search, Loader2, Trash2, Users, Pencil } from 'lucide-react';
import { parseLocalDate } from '@shared/dates';
import { computeEventState } from '../lib/eventState';
import TeamsEditor from '../components/TeamsEditor';
import PlayerPicker from '../components/PlayerPicker';
import { ROUND_FORMAT_LABELS, ROUND_FORMAT_DESCRIPTIONS, RoundFormat, defaultPointsTable, ctpContests } from '@shared/formats';

const isNew = (id: string) => id === 'new';

function convertTo24h(display: string): string {
  if (!display) return '';
  const match = display.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return '';
  let h = parseInt(match[1], 10);
  const m = match[2];
  const period = match[3].toUpperCase();
  if (period === 'AM' && h === 12) h = 0;
  if (period === 'PM' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:${m}`;
}

function convertTo12h(time24: string): string {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr} ${period}`;
}

type TeeOption = { label: string; courseRating: number; slopeRating: number; par: number; yardage?: number; holes: any[] };

function flattenTees(teeSets: any[]): TeeOption[] {
  if (!Array.isArray(teeSets)) return [];
  const out: TeeOption[] = [];
  for (const ts of teeSets) {
    const totalRating = (ts.Ratings ?? []).find((r: any) => r.RatingType === 'Total' || r.RatingType === 'Eighteen');
    if (!totalRating) continue;
    const holes = (ts.Holes ?? [])
      .sort((a: any, b: any) => a.Number - b.Number)
      .map((h: any) => ({ number: h.Number, par: h.Par, handicap: h.Allocation, yardage: h.Length }));
    const holeYards = holes.reduce((sum: number, h: any) => sum + (Number(h.yardage) || 0), 0);
    const yardage = Number(ts.TotalYardage) || holeYards || undefined;
    out.push({
      yardage,
      label: ts.TeeSetRatingName ?? ts.TeeColorName ?? 'Unknown',
      courseRating: Number(totalRating.CourseRating ?? 0),
      slopeRating: Number(totalRating.SlopeRating ?? 113),
      par: Number(ts.TotalPar ?? 72),
      holes,
    });
  }
  return out;
}

function AccordionSection({
  title, badge, open, onToggle, children,
}: {
  title: string; badge?: string | number; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="card">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3.5 sm:px-5 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ep-green">{title}</span>
          {badge !== undefined && (
            <span className="text-xs bg-ep-sand text-ep-silver px-1.5 py-0.5 rounded-full">{badge}</span>
          )}
        </div>
        {open
          ? <ChevronUp size={16} className="text-ep-silver shrink-0" />
          : <ChevronDown size={16} className="text-ep-silver shrink-0" />}
      </button>
      {open && <div className="border-t border-ep-silver/20 px-4 py-4 sm:px-5 sm:py-5">{children}</div>}
    </div>
  );
}

export default function AdminTournamentSetup() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const creating = isNew(id!);

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [drafts, setDrafts] = useState<DraftScorecard[]>([]);
  const [loading, setLoading] = useState(!creating);

  // Accordion open states
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [roundsOpen, setRoundsOpen] = useState(false);

  // Mark complete loading
  const [markingComplete, setMarkingComplete] = useState(false);

  // Draft confirmation
  const [confirmingGroup, setConfirmingGroup] = useState<string | null>(null);
  const [expandedDraft, setExpandedDraft] = useState<string | null>(null);
  const confirmPanelRef = useRef<HTMLDivElement>(null);
  const detailsSectionRef = useRef<HTMLDivElement>(null);
  const playersSectionRef = useRef<HTMLDivElement>(null);
  const roundsSectionRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    name: '', description: '', startDate: '', endDate: '',
    isNet: true, isGross: true,
    standingsMode: 'cumulative' as 'cumulative' | 'points', pointsTable: '',
    hasClosestToPin: false, hasLongestDrive: false,
    closestToPinFee: '0', longestDriveFee: '0',
    entryFee: '0', notes: '',
  });
  const [payoutRows, setPayoutRows] = useState<{ place: number; label: string; payoutType: 'percentage' | 'flat'; percentage: string; flatAmount: string }[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);

  // Round form
  const [showRoundForm, setShowRoundForm] = useState(false);
  const [editingRound, setEditingRound] = useState<Round | null>(null);
  const [roundForm, setRoundForm] = useState({
    courseId: '', courseName: '', tee: '', courseRating: '', slopeRating: '', par: '72',
    date: '', ctpHoles: [] as number[], ctpText: '', longestDriveHole: '', notes: '', isPracticeRound: false,
    format: 'stroke_play' as RoundFormat, pointsMultiplier: '1',
    holes: [] as { number: number; par: number; handicap: number; yardage?: number }[],
  });
  const [courseQuery, setCourseQuery] = useState('');
  const [courseResults, setCourseResults] = useState<any[]>([]);
  const [courseTees, setCourseTees] = useState<TeeOption[]>([]);
  const [courseSearching, setCourseSearching] = useState(false);


  // Tee time groups
  const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null);
  type GroupEdit = { groupNumber: number; teeTime: string; playerIds: string[]; startingHole?: number; pin?: string };
  const [editGroups, setEditGroups] = useState<{ startFormat: 'sequential' | 'shotgun'; groups: GroupEdit[] } | null>(null);
  const [savingGroups, setSavingGroups] = useState(false);

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
          endDate: t.endDate ?? '', isNet: t.isNet, isGross: t.isGross,
          standingsMode: t.standingsMode ?? 'cumulative', pointsTable: (t.pointsTable ?? []).join(', '),
          hasClosestToPin: t.hasClosestToPin, hasLongestDrive: t.hasLongestDrive,
          closestToPinFee: String(t.closestToPinFee ?? 0), longestDriveFee: String(t.longestDriveFee ?? 0),
          entryFee: String(t.entryFee), notes: t.notes ?? '',
        });
        setPayoutRows(t.payoutStructure.map(p => ({ ...p, payoutType: p.payoutType ?? 'percentage', percentage: String(p.percentage), flatAmount: p.payoutType === 'flat' ? String(p.amount ?? '') : '' })));
        setSelectedPlayerIds(t.playerIds);

        // Fetch drafts and compute initial accordion open state
        let allDrafts: DraftScorecard[] = [];
        if (t.status !== 'completed' && rs.length > 0) {
          try {
            allDrafts = (await Promise.all(rs.map(r => scoringApi.getDrafts(r.id)))).flat();
            setDrafts(allDrafts);
          } catch { /* silently ignore */ }
        }

        const state = computeEventState(t, rs, allDrafts);
        setDetailsOpen(state.ctaTarget === 'details');
        setPlayersOpen(state.ctaTarget === 'players');
        setRoundsOpen(state.ctaTarget === 'rounds' || state.ctaTarget === 'complete');
      }
      setLoading(false);
    };
    load();
  }, [id, creating]);

  const eventState = useMemo(
    () => tournament ? computeEventState(tournament, rounds, drafts) : null,
    [tournament, rounds, drafts]
  );

  async function reloadDrafts() {
    if (rounds.length === 0) return;
    try {
      const allDrafts = (await Promise.all(rounds.map(r => scoringApi.getDrafts(r.id)))).flat();
      setDrafts(allDrafts);
    } catch { /* silently ignore */ }
  }

  function upsertPlayer(p: Player) {
    setPlayers(ps => {
      const next = ps.some(x => x.id === p.id) ? ps.map(x => (x.id === p.id ? p : x)) : [...ps, p];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  // On an existing tournament, roster changes save immediately; on create they're held until "Create Tournament".
  async function persistPlayerIds(ids: string[]) {
    const prev = selectedPlayerIds;
    setSelectedPlayerIds(ids);
    if (creating) return;
    try {
      await tournamentsApi.update(id!, { playerIds: ids });
      setTournament(t => t ? { ...t, playerIds: ids } : null);
    } catch (e: any) {
      setSelectedPlayerIds(prev);
      toast.error(e.message);
    }
  }

  async function addPlayerToTournament(p: Player) {
    if (selectedPlayerIds.includes(p.id)) return;
    await persistPlayerIds([...selectedPlayerIds, p.id]);
  }

  async function removePlayerFromTournament(playerId: string) {
    const p = players.find(x => x.id === playerId);
    if (!creating && !confirm(`Remove ${p?.name ?? 'this player'} from the tournament?`)) return;
    await persistPlayerIds(selectedPlayerIds.filter(x => x !== playerId));
  }

  async function handleConfirmDraft(roundId: string, groupNumber: number) {
    const key = `${roundId}-${groupNumber}`;
    setConfirmingGroup(key);
    try {
      await scoringApi.confirmDraft(roundId, groupNumber);
      await reloadDrafts();
      toast.success(`Pairing ${groupNumber} scores confirmed`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setConfirmingGroup(null);
    }
  }

  async function handleMarkComplete() {
    if (!confirm('Mark this event as complete? Final results will be published.')) return;
    setMarkingComplete(true);
    try {
      const updated = await tournamentsApi.update(id!, { status: 'completed' });
      setTournament(updated);
      toast.success('Event completed — results are now public');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setMarkingComplete(false);
    }
  }

  // Sections are often already open (auto-opened on load), so opening alone is a
  // no-op — scroll to the section after it renders so the CTA visibly does something.
  function scrollToSection(ref: React.RefObject<HTMLDivElement | null>) {
    requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function handleCtaAction() {
    if (!eventState) return;
    switch (eventState.ctaTarget) {
      case 'details':
        setDetailsOpen(true);
        scrollToSection(detailsSectionRef);
        break;
      case 'players':
        setPlayersOpen(true);
        scrollToSection(playersSectionRef);
        break;
      case 'rounds':
        setRoundsOpen(true);
        if (rounds.length === 0) {
          setEditingRound(null);
          resetRoundForm();
          setShowRoundForm(true);
        }
        scrollToSection(roundsSectionRef);
        break;
      case 'confirm':
        confirmPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      case 'complete':
        handleMarkComplete();
        break;
      case 'results':
        navigate(`/tournament/${id}/results`);
        break;
    }
  }

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
      isNet: form.isNet, isGross: form.isGross,
      standingsMode: form.standingsMode,
      pointsTable: form.standingsMode === 'points' && form.pointsTable.trim()
        ? form.pointsTable.split(/[,\s]+/).filter(Boolean).map(Number).filter(n => !isNaN(n))
        : undefined,
      hasClosestToPin: form.hasClosestToPin, hasLongestDrive: form.hasLongestDrive,
      closestToPinFee: form.hasClosestToPin ? Number(form.closestToPinFee) : undefined,
      longestDriveFee: form.hasLongestDrive ? Number(form.longestDriveFee) : undefined,
      entryFee: Number(form.entryFee),
      payoutStructure: payoutRows.map(r => r.payoutType === 'flat'
        ? { place: r.place, label: r.label, payoutType: 'flat' as const, percentage: 0, amount: Number(r.flatAmount || 0) }
        : { place: r.place, label: r.label, payoutType: 'percentage' as const, percentage: Number(r.percentage) }),
      playerIds: selectedPlayerIds,
      notes: form.notes || undefined,
    };
    try {
      if (creating) {
        const t = await tournamentsApi.create(data);
        toast.success('Tournament created');
        navigate(`/tournaments/${t.id}`);
      } else {
        await tournamentsApi.update(id!, data);
        toast.success('Saved');
        setTournament(prev => prev ? { ...prev, ...data } : null);
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function resetRoundForm() {
    setShowRoundForm(false);
    setEditingRound(null);
    setRoundForm({ courseId: '', courseName: '', tee: '', courseRating: '', slopeRating: '', par: '72', date: '', ctpHoles: [], ctpText: '', longestDriveHole: '', notes: '', isPracticeRound: false, format: 'stroke_play', pointsMultiplier: '1', holes: [] });
    setCourseTees([]);
    setCourseQuery('');
  }

  async function handleAddRound(e: FormEvent) {
    e.preventDefault();
    const payload = {
      courseId: roundForm.courseId || 'manual',
      courseName: roundForm.courseName,
      tee: roundForm.tee,
      courseRating: Number(roundForm.courseRating),
      slopeRating: Number(roundForm.slopeRating),
      par: Number(roundForm.par),
      date: roundForm.date,
      // Keep any winner already picked for a hole that's still selected.
      closestToPinContests: [...roundForm.ctpHoles].sort((a, b) => a - b).map(hole => ({
        hole,
        winnerId: editingRound ? ctpContests(editingRound).find(c => c.hole === hole)?.winnerId : undefined,
      })),
      longestDriveHole: roundForm.longestDriveHole ? Number(roundForm.longestDriveHole) : undefined,
      holes: roundForm.holes.length > 0 ? roundForm.holes : undefined,
      isPracticeRound: roundForm.isPracticeRound || undefined,
      format: roundForm.format,
      pointsMultiplier: Number(roundForm.pointsMultiplier) && Number(roundForm.pointsMultiplier) !== 1
        ? Number(roundForm.pointsMultiplier) : undefined,
      notes: roundForm.notes || undefined,
    } as any;
    try {
      if (editingRound) {
        const r = await roundsApi.update(editingRound.id, payload);
        setRounds(rs => rs.map(x => x.id === editingRound.id ? r : x));
        toast.success('Round updated');
      } else {
        const r = await roundsApi.create(id!, payload);
        setRounds(rs => [...rs, r]);
        toast.success('Round added');
      }
      resetRoundForm();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function handleExpandRound(r: Round) {
    if (expandedRoundId === r.id) {
      setExpandedRoundId(null);
      setEditGroups(null);
      return;
    }
    setExpandedRoundId(r.id);
    setEditGroups({
      startFormat: r.startFormat ?? 'sequential',
      groups: r.teeTimeGroups ? r.teeTimeGroups.map(g => ({ ...g })) : [],
    });
  }

  async function handleSaveGroups(roundId: string) {
    if (!editGroups) return;

    const emptyGroups = editGroups.groups.filter(g => g.playerIds.length === 0);
    if (emptyGroups.length > 0) {
      toast.error(`Group${emptyGroups.length > 1 ? 's' : ''} ${emptyGroups.map(g => g.groupNumber).join(', ')} ${emptyGroups.length > 1 ? 'have' : 'has'} no players`);
      return;
    }
    const allAssigned = editGroups.groups.flatMap(g => g.playerIds);
    const duplicates = allAssigned.filter((id, i) => allAssigned.indexOf(id) !== i);
    if (duplicates.length > 0) {
      const names = duplicates.map(pid => players.find(p => p.id === pid)?.name ?? pid).join(', ');
      toast.error(`Players assigned to multiple groups: ${names}`);
      return;
    }

    const usedPins = new Set(editGroups.groups.map(g => g.pin).filter(Boolean));
    const groupsWithPins = editGroups.groups.map(g => {
      if (g.pin) return g;
      let pin: string;
      do { pin = String(Math.floor(1000 + Math.random() * 9000)); } while (usedPins.has(pin));
      usedPins.add(pin);
      return { ...g, pin };
    });

    setSavingGroups(true);
    try {
      const updated = await roundsApi.update(roundId, {
        startFormat: editGroups.startFormat,
        teeTimeGroups: groupsWithPins,
      } as any);
      setRounds(rs => rs.map(r => r.id === roundId ? updated : r));
      toast.success('Tee sheet saved');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingGroups(false);
    }
  }

  async function handleArchive() {
    if (!confirm('Archive this tournament?')) return;
    try {
      await tournamentsApi.update(id!, { status: 'archived' });
      toast.success('Archived');
      navigate('/tournaments');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  if (loading) return <div className="text-ep-silver text-sm p-4">Loading…</div>;

  const payoutPctRows = payoutRows.filter(r => r.payoutType === 'percentage');
  const payoutTotal = payoutPctRows.reduce((s, r) => s + Number(r.percentage || 0), 0);

  // ── Details form content (shared between create and accordion) ──
  const detailsFormContent = (
    <div className="space-y-4">
      <div className="card p-4 sm:p-5 space-y-4">
        <p className="section-title">Tournament Details</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Tournament Name *</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Annual Golf Trip" />
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
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm text-ep-green/80 cursor-pointer">
                  <input type="checkbox" className="rounded accent-[#004C54]"
                    checked={form[key as keyof typeof form] as boolean}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Overall Standings</label>
            <p className="text-xs text-ep-silver mb-1">Each round's format (stroke play, Stableford, best ball) is chosen when you add the round.</p>
            <select className="input" value={form.standingsMode}
              onChange={e => setForm(f => ({ ...f, standingsMode: e.target.value as 'cumulative' | 'points' }))}>
              <option value="cumulative">Lowest total score across rounds</option>
              <option value="points">Cup points — earn points for your finish in each round</option>
            </select>
            <p className="text-xs text-ep-silver mt-1">
              {form.standingsMode === 'points'
                ? 'Use this when rounds have different formats (stroke play, Stableford, best ball). Each round ranks players by its own format; ties split the points. Team rounds: both partners share their team\'s finish.'
                : 'Adds up each player\'s net (or gross) score from every round.'}
            </p>
            {form.standingsMode === 'points' && (
              <div className="mt-2">
                <label className="label">Points for 1st, 2nd, 3rd…</label>
                <input className="input" value={form.pointsTable}
                  onChange={e => setForm(f => ({ ...f, pointsTable: e.target.value }))}
                  placeholder={`Default: ${defaultPointsTable(Math.max(selectedPlayerIds.length, 2)).join(', ')}`} />
              </div>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className="label">Side Contests</label>
            <div className="space-y-2 mt-1">
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-ep-green/80 cursor-pointer">
                  <input type="checkbox" className="rounded accent-[#004C54]"
                    checked={form.hasClosestToPin}
                    onChange={e => setForm(f => ({ ...f, hasClosestToPin: e.target.checked }))} />
                  Closest to Pin
                </label>
                {form.hasClosestToPin && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-ep-silver">Ante per player</span>
                    <div className="relative w-24">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ep-silver text-xs">$</span>
                      <input className="input pl-5" type="number" min="0" step="1" value={form.closestToPinFee}
                        onChange={e => setForm(f => ({ ...f, closestToPinFee: e.target.value }))} placeholder="0" />
                    </div>
                    {Number(form.closestToPinFee) > 0 && selectedPlayerIds.length > 0 && (
                      <span className="text-xs text-ep-orange">${(Number(form.closestToPinFee) * selectedPlayerIds.length).toFixed(0)} prize</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-ep-green/80 cursor-pointer">
                  <input type="checkbox" className="rounded accent-[#004C54]"
                    checked={form.hasLongestDrive}
                    onChange={e => setForm(f => ({ ...f, hasLongestDrive: e.target.checked }))} />
                  Longest Drive
                </label>
                {form.hasLongestDrive && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-ep-silver">Ante per player</span>
                    <div className="relative w-24">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ep-silver text-xs">$</span>
                      <input className="input pl-5" type="number" min="0" step="1" value={form.longestDriveFee}
                        onChange={e => setForm(f => ({ ...f, longestDriveFee: e.target.value }))} placeholder="0" />
                    </div>
                    {Number(form.longestDriveFee) > 0 && selectedPlayerIds.length > 0 && (
                      <span className="text-xs text-ep-orange">${(Number(form.longestDriveFee) * selectedPlayerIds.length).toFixed(0)} prize</span>
                    )}
                  </div>
                )}
              </div>
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
          <button type="button" onClick={() => setPayoutRows(r => [...r, { place: r.length + 1, label: `${r.length + 1}${['st','nd','rd'][r.length] ?? 'th'} Place`, payoutType: 'percentage', percentage: '', flatAmount: '' }])} className="btn-secondary text-xs">
            <Plus size={13} /> Add Place
          </button>
        </div>
        {payoutRows.length === 0 ? (
          <p className="text-sm text-ep-silver">No payouts configured.</p>
        ) : (
          <div className="space-y-2">
            {payoutRows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 text-xs text-ep-silver text-center shrink-0">{row.place}</span>
                <input className="input flex-1 min-w-0" value={row.label} onChange={e => setPayoutRows(r => r.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                <div className="flex rounded-md border border-ep-silver/30 overflow-hidden shrink-0 text-xs">
                  <button type="button"
                    className={`px-2 py-1 ${row.payoutType === 'percentage' ? 'bg-ep-green text-ep-cream' : 'bg-ep-cream text-ep-silver hover:bg-ep-sand'}`}
                    onClick={() => setPayoutRows(r => r.map((x, j) => j === i ? { ...x, payoutType: 'percentage' } : x))}>%</button>
                  <button type="button"
                    className={`px-2 py-1 ${row.payoutType === 'flat' ? 'bg-ep-green text-ep-cream' : 'bg-ep-cream text-ep-silver hover:bg-ep-sand'}`}
                    onClick={() => setPayoutRows(r => r.map((x, j) => j === i ? { ...x, payoutType: 'flat' } : x))}>$</button>
                </div>
                {row.payoutType === 'flat' ? (
                  <div className="relative w-24 shrink-0">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ep-silver text-xs">$</span>
                    <input className="input pl-5 text-right" type="number" min="0" step="1" value={row.flatAmount} onChange={e => setPayoutRows(r => r.map((x, j) => j === i ? { ...x, flatAmount: e.target.value } : x))} placeholder="0" />
                  </div>
                ) : (
                  <div className="relative w-24 shrink-0">
                    <input className="input pr-5 text-right" type="number" min="0" max="100" step="0.5" value={row.percentage} onChange={e => setPayoutRows(r => r.map((x, j) => j === i ? { ...x, percentage: e.target.value } : x))} placeholder="0" />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ep-silver text-xs">%</span>
                  </div>
                )}
                {Number(form.entryFee) > 0 && selectedPlayerIds.length > 0 && (
                  <span className="text-xs text-ep-orange w-14 text-right shrink-0">
                    {row.payoutType === 'flat'
                      ? `$${Number(row.flatAmount || 0).toFixed(0)}`
                      : `$${((Number(row.percentage || 0) / 100) * Number(form.entryFee) * selectedPlayerIds.length).toFixed(0)}`}
                  </span>
                )}
                <button type="button" onClick={() => setPayoutRows(r => r.filter((_, j) => j !== i))} className="text-ep-silver/40 hover:text-red-400 shrink-0"><X size={14} /></button>
              </div>
            ))}
            {payoutPctRows.length > 0 && (
              <p className={`text-xs mt-1 ${Math.abs(payoutTotal - 100) > 0.01 ? 'text-red-400' : 'text-ep-orange'}`}>
                % total: {payoutTotal}% {Math.abs(payoutTotal - 100) < 0.01 ? '✓' : '— must equal 100%'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ── Rounds section content ──
  const roundsSectionContent = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="section-title">Rounds ({rounds.length})</p>
        <button onClick={() => { setEditingRound(null); setShowRoundForm(!showRoundForm); setCourseTees([]); setCourseQuery(''); }} className="btn-primary">
          <Plus size={14} /> Add Round
        </button>
      </div>

      {/* Round form */}
      {showRoundForm && (
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-ep-green">{editingRound ? 'Edit Round' : 'New Round'}</h3>
            <button type="button" onClick={() => setShowRoundForm(false)} className="text-ep-silver hover:text-ep-green p-1"><X size={18} /></button>
          </div>
          <form onSubmit={handleAddRound} className="space-y-4">
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
                <div className="mt-1.5 border border-ep-silver/30 rounded-lg divide-y divide-ep-silver/20 max-h-52 overflow-y-auto shadow-sm">
                  {courseResults.slice(0, 15).map((c, i) => (
                    <button key={i} type="button" onClick={() => selectCourseResult(c)}
                      className="w-full text-left px-3 py-2.5 hover:bg-ep-sand transition-colors">
                      <div className="text-sm font-medium text-ep-green">{c.CourseName ?? c.FacilityName ?? c.club_name ?? c.course_name}</div>
                      <div className="text-xs text-ep-silver">{[c.City ?? c.location?.city, c.State ?? c.location?.state].filter(Boolean).join(', ')}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {courseTees.length > 0 && (
              <div>
                <label className="label">Select Tee</label>
                <select className="input" value={roundForm.tee} onChange={e => selectTee(e.target.value)}>
                  {courseTees.map(t => (
                    <option key={t.label} value={t.label}>{t.label} — {t.yardage ? `${t.yardage.toLocaleString()} yds · ` : ''}Par {t.par} · Rating {t.courseRating} · Slope {t.slopeRating}</option>
                  ))}
                </select>
              </div>
            )}

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
                <div className="col-span-2">
                  <label className="label">CTP Holes</label>
                  {roundForm.holes.length > 0 ? (() => {
                    // Offer the course's par 3s, plus any already-selected hole that isn't one.
                    const options = roundForm.holes
                      .filter(h => h.par === 3 || roundForm.ctpHoles.includes(h.number))
                      .sort((a, b) => a.number - b.number);
                    if (options.length === 0) return <p className="text-xs text-ep-silver">This course has no par 3s.</p>;
                    return (
                      <div className="flex flex-wrap gap-2">
                        {options.map(h => {
                          const on = roundForm.ctpHoles.includes(h.number);
                          return (
                            <button
                              key={h.number}
                              type="button"
                              onClick={() => setRoundForm(f => ({
                                ...f,
                                ctpHoles: on ? f.ctpHoles.filter(x => x !== h.number) : [...f.ctpHoles, h.number],
                              }))}
                              className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${on
                                ? 'bg-ep-green border-ep-green text-ep-cream'
                                : 'bg-ep-cream border-ep-silver/40 text-ep-green hover:border-ep-orange'}`}
                            >
                              <span className="font-semibold">Hole {h.number}</span>
                              {h.yardage ? <span className={`ml-1.5 text-xs ${on ? 'text-ep-cream/80' : 'text-ep-silver'}`}>{h.yardage} yds</span> : null}
                              {h.par !== 3 && <span className={`ml-1.5 text-xs ${on ? 'text-ep-cream/80' : 'text-ep-silver'}`}>par {h.par}</span>}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })() : (
                    <input
                      className="input"
                      value={roundForm.ctpText}
                      onChange={e => {
                        const text = e.target.value;
                        const ctpHoles = [...new Set(text.split(/[,\s]+/).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 18))];
                        setRoundForm(f => ({ ...f, ctpText: text, ctpHoles }));
                      }}
                      placeholder="e.g. 3, 7, 12, 16"
                    />
                  )}
                </div>
              )}
              {tournament?.hasLongestDrive && (
                <div>
                  <label className="label">LD Hole</label>
                  <input className="input" type="number" min="1" max="18" value={roundForm.longestDriveHole} onChange={e => setRoundForm(f => ({ ...f, longestDriveHole: e.target.value }))} placeholder="e.g. 14" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className={tournament?.standingsMode === 'points' ? '' : 'col-span-2'}>
                <label className="label">Round Format</label>
                <select className="input" value={roundForm.format}
                  onChange={e => setRoundForm(f => ({ ...f, format: e.target.value as RoundFormat }))}>
                  {(Object.keys(ROUND_FORMAT_LABELS) as RoundFormat[]).map(fmt => (
                    <option key={fmt} value={fmt}>{ROUND_FORMAT_LABELS[fmt]}</option>
                  ))}
                </select>
              </div>
              {tournament?.standingsMode === 'points' && (
                <div>
                  <label className="label">Cup Points Multiplier</label>
                  <input className="input" type="number" min="0" step="0.5" value={roundForm.pointsMultiplier}
                    onChange={e => setRoundForm(f => ({ ...f, pointsMultiplier: e.target.value }))} />
                </div>
              )}
              <p className="col-span-2 text-xs text-ep-silver -mt-1">
                {ROUND_FORMAT_DESCRIPTIONS[roundForm.format]}
                {roundForm.format === 'best_ball' && ' Set teams from the round\'s Pairings panel.'}
              </p>
            </div>

            <div className="col-span-2">
              <label className="flex items-center gap-2 text-sm text-ep-green/80 cursor-pointer">
                <input type="checkbox" className="rounded accent-[#004C54]"
                  checked={roundForm.isPracticeRound}
                  onChange={e => setRoundForm(f => ({ ...f, isPracticeRound: e.target.checked }))} />
                Practice Round
                <span className="text-xs text-ep-silver">(counts toward handicap, excluded from standings)</span>
              </label>
            </div>

            <div className="flex gap-2">
              <button type="submit" className="btn-primary"><Check size={14} /> {editingRound ? 'Save Changes' : 'Add Round'}</button>
              <button type="button" onClick={resetRoundForm} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {rounds.length === 0 ? (
        <div className="card p-8 text-center text-ep-silver text-sm">No rounds yet.</div>
      ) : (
        <div className="card divide-y divide-ep-silver/20">
          {rounds.map(r => {
            const isExpanded = expandedRoundId === r.id;
            const assignedIds = new Set((editGroups?.groups ?? []).flatMap(g => g.playerIds));
            const unassigned = isExpanded
              ? (tournament?.playerIds ?? selectedPlayerIds).filter(pid => !assignedIds.has(pid))
              : [];
            return (
              <div key={r.id}>
                <div className="flex items-center justify-between px-4 py-3.5 hover:bg-ep-sand/50 transition-colors group">
                  <Link to={`/rounds/${r.id}/scoring`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <StatusBadge status={r.status} />
                      <span className="text-xs text-ep-silver">{r.tee}</span>
                      {r.isPracticeRound && (
                        <span className="text-xs bg-ep-sand text-ep-green font-medium px-1.5 py-0.5 rounded">Practice</span>
                      )}
                      <span className="text-xs bg-ep-green/10 text-ep-green font-medium px-1.5 py-0.5 rounded">
                        {ROUND_FORMAT_LABELS[r.format ?? 'stroke_play']}
                        {r.pointsMultiplier && r.pointsMultiplier !== 1 ? ` · ${r.pointsMultiplier}× pts` : ''}
                      </span>
                      {r.format === 'best_ball' && !r.teams?.length && (
                        <span className="text-xs text-red-500 font-medium">Teams not set</span>
                      )}
                      {r.teeTimeGroups && r.teeTimeGroups.length > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-ep-orange font-medium">
                          <Users size={11} /> {r.teeTimeGroups.length} pairing{r.teeTimeGroups.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="font-medium text-ep-green group-hover:text-ep-orange transition-colors">{r.courseName}</div>
                    <div className="text-xs text-ep-silver mt-0.5">
                      {parseLocalDate(r.date).toLocaleDateString()} · Par {r.par} · {r.courseRating}/{r.slopeRating}
                    </div>
                  </Link>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleExpandRound(r)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                        isExpanded
                          ? 'bg-ep-green/10 text-ep-green'
                          : 'text-ep-silver hover:text-ep-orange hover:bg-ep-sand/50'
                      }`}
                      title="Manage tee time pairings"
                    >
                      <Users size={13} /> Pairings
                    </button>
                    <button
                      onClick={() => {
                        setEditingRound(r);
                        setRoundForm({
                          courseId: r.courseId,
                          courseName: r.courseName,
                          tee: r.tee,
                          courseRating: String(r.courseRating),
                          slopeRating: String(r.slopeRating),
                          par: String(r.par),
                          date: r.date,
                          ctpHoles: ctpContests(r).map(c => c.hole),
                          ctpText: ctpContests(r).map(c => c.hole).join(', '),
                          longestDriveHole: r.longestDriveHole ? String(r.longestDriveHole) : '',
                          notes: r.notes ?? '',
                          isPracticeRound: r.isPracticeRound ?? false,
                          format: r.format ?? 'stroke_play',
                          pointsMultiplier: String(r.pointsMultiplier ?? 1),
                          holes: r.holes ?? [],
                        });
                        setShowRoundForm(true);
                      }}
                      className="p-1.5 text-ep-silver hover:text-ep-orange transition-colors rounded"
                      title="Edit round"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Delete round at ${r.courseName}? This cannot be undone.`)) return;
                        try {
                          await roundsApi.delete(r.id);
                          setRounds(rs => rs.filter(x => x.id !== r.id));
                          if (expandedRoundId === r.id) { setExpandedRoundId(null); setEditGroups(null); }
                          toast.success('Round deleted');
                        } catch (e: any) { toast.error(e.message); }
                      }}
                      className="p-1.5 text-ep-silver/40 hover:text-red-400 transition-colors rounded"
                      title="Delete round"
                    >
                      <Trash2 size={15} />
                    </button>
                    <ChevronRight size={15} className="text-ep-silver/40" />
                  </div>
                </div>

                {/* Tee time groups accordion */}
                {isExpanded && editGroups && (
                  <div className="border-t border-ep-silver/20 bg-ep-sand/20 px-4 py-4 space-y-4">
                    {r.format === 'best_ball' && tournament && (
                      <div className="pb-4 border-b border-ep-silver/20">
                        <TeamsEditor
                          key={r.id}
                          round={r}
                          rounds={rounds}
                          tournament={tournament}
                          players={players}
                          onSaved={updated => setRounds(rs => rs.map(x => x.id === updated.id ? updated : x))}
                        />
                      </div>
                    )}
                    <div>
                      <p className="label mb-1.5">Start Format</p>
                      <div className="flex rounded-lg border border-ep-silver/30 overflow-hidden w-fit text-sm">
                        {(['sequential', 'shotgun'] as const).map(fmt => (
                          <button
                            key={fmt}
                            type="button"
                            onClick={() => setEditGroups(g => g ? { ...g, startFormat: fmt } : g)}
                            className={`px-4 py-1.5 font-medium capitalize transition-colors ${
                              editGroups.startFormat === fmt
                                ? 'bg-ep-green text-ep-cream'
                                : 'bg-ep-cream text-ep-silver hover:bg-ep-sand'
                            }`}
                          >
                            {fmt}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      {editGroups.groups.map((group, gIdx) => (
                        <div key={gIdx} className="bg-ep-cream rounded-lg border border-ep-silver/30 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-ep-green">Pairing {group.groupNumber}</span>
                              {group.pin && (
                                <span className="text-xs font-mono bg-ep-sand text-ep-silver px-1.5 py-0.5 rounded">PIN: {group.pin}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="time"
                                className="input py-1 text-sm w-32"
                                value={convertTo24h(group.teeTime)}
                                onChange={e => {
                                  const display = convertTo12h(e.target.value);
                                  setEditGroups(g => {
                                    if (!g) return g;
                                    const updated = [...g.groups];
                                    updated[gIdx] = { ...updated[gIdx], teeTime: display };
                                    return { ...g, groups: updated };
                                  });
                                }}
                              />
                              {editGroups.startFormat === 'shotgun' && (
                                <input
                                  type="number" min="1" max="18"
                                  placeholder="Hole #"
                                  className="input py-1 text-sm w-24"
                                  value={group.startingHole ?? ''}
                                  onChange={e => {
                                    const val = e.target.value ? Number(e.target.value) : undefined;
                                    setEditGroups(g => {
                                      if (!g) return g;
                                      const updated = [...g.groups];
                                      updated[gIdx] = { ...updated[gIdx], startingHole: val };
                                      return { ...g, groups: updated };
                                    });
                                  }}
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => setEditGroups(g => {
                                  if (!g) return g;
                                  return { ...g, groups: g.groups.filter((_, i) => i !== gIdx).map((grp, i) => ({ ...grp, groupNumber: i + 1 })) };
                                })}
                                className="p-1 text-ep-silver/40 hover:text-red-400"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                            {group.playerIds.map(pid => {
                              const p = players.find(pl => pl.id === pid);
                              if (!p) return null;
                              return (
                                <button
                                  key={pid}
                                  type="button"
                                  title="Remove from group"
                                  onClick={() => setEditGroups(g => {
                                    if (!g) return g;
                                    const updated = [...g.groups];
                                    updated[gIdx] = { ...updated[gIdx], playerIds: updated[gIdx].playerIds.filter(x => x !== pid) };
                                    return { ...g, groups: updated };
                                  })}
                                  className="flex items-center gap-1 bg-ep-green/10 text-ep-green text-xs px-2 py-0.5 rounded-full hover:bg-red-100 hover:text-red-700 transition-colors"
                                >
                                  {p.name} <X size={10} />
                                </button>
                              );
                            })}
                            {group.playerIds.length === 0 && (
                              <span className="text-xs text-ep-silver italic">No players yet</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setEditGroups(g => g ? { ...g, groups: [...g.groups, { groupNumber: g.groups.length + 1, teeTime: '', playerIds: [] }] } : g)}
                      className="btn-secondary text-xs"
                    >
                      <Plus size={13} /> Add Pairing
                    </button>

                    {unassigned.length > 0 && (
                      <div>
                        <p className="label mb-1.5">Unassigned Players — click to add to a pairing</p>
                        <div className="flex flex-wrap gap-1.5">
                          {unassigned.map(pid => {
                            const p = players.find(pl => pl.id === pid);
                            if (!p) return null;
                            return (
                              <UnassignedChip
                                key={pid}
                                name={p.name}
                                groups={editGroups.groups}
                                onAssign={gIdx => setEditGroups(g => {
                                  if (!g) return g;
                                  const updated = [...g.groups];
                                  updated[gIdx] = { ...updated[gIdx], playerIds: [...updated[gIdx].playerIds, pid] };
                                  return { ...g, groups: updated };
                                })}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end pt-1 border-t border-ep-silver/20">
                      <button
                        type="button"
                        onClick={() => handleSaveGroups(r.id)}
                        disabled={savingGroups}
                        className="btn-primary"
                      >
                        {savingGroups ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save Tee Sheet
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to="/tournaments" className="text-xs text-ep-silver hover:text-ep-green">← Tournaments</Link>
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

      {/* ── Create flow ── */}
      {creating && (
        <form onSubmit={handleSaveDetails} className="space-y-4">
          {detailsFormContent}

          {/* Players picker on create */}
          <div className="card p-4 sm:p-5">
            <PlayerPicker
              players={players}
              selectedIds={selectedPlayerIds}
              onAdd={addPlayerToTournament}
              onRemove={removePlayerFromTournament}
              onPlayerUpserted={upsertPlayer}
            />
          </div>

          <button type="submit" className="btn-primary">
            <Save size={14} /> Create Tournament
          </button>
        </form>
      )}

      {/* ── Existing tournament: next-action layout ── */}
      {!creating && tournament && (
        <>
          {/* Next-action card */}
          {eventState && (
            <div className={`rounded-xl border p-4 sm:p-5 flex items-start sm:items-center justify-between gap-4 ${
              eventState.urgent
                ? 'border-amber-300 bg-amber-50'
                : 'border-ep-silver/30 bg-ep-cream'
            }`}>
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-semibold uppercase tracking-widest mb-1 ${
                  eventState.urgent ? 'text-amber-600' : 'text-ep-silver'
                }`}>
                  {eventState.label}
                </div>
                <p className="text-sm text-ep-green/80">{eventState.description}</p>
              </div>
              {eventState.ctaTarget && (
                <button
                  type="button"
                  onClick={handleCtaAction}
                  disabled={markingComplete}
                  className={`shrink-0 ${eventState.urgent ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {markingComplete && <Loader2 size={14} className="animate-spin" />}
                  {eventState.cta}
                </button>
              )}
            </div>
          )}

          {/* Score confirmation panel — shown when any groups have submitted */}
          {drafts.some(d => d.status === 'submitted' || d.status === 'confirmed') && (
            <div ref={confirmPanelRef} className="card p-5">
              <h2 className="font-semibold text-ep-green mb-3 text-sm uppercase tracking-wide">Scorecard Submissions</h2>
              <div className="space-y-2">
                {drafts.map(draft => {
                  const round = rounds.find(r => r.id === draft.roundId);
                  const group = round?.teeTimeGroups?.find(g => g.groupNumber === draft.groupNumber);
                  const groupPlayers = players.filter(p => group?.playerIds.includes(p.id));
                  const allHoleNums = round?.holes?.length
                    ? round.holes.map(h => h.number)
                    : Array.from({ length: 18 }, (_, i) => i + 1);
                  const draftKey = `${draft.roundId}-${draft.groupNumber}`;
                  const isExpanded = expandedDraft === draftKey;
                  const isSubmitted = draft.status === 'submitted';
                  const isConfirmed = draft.status === 'confirmed';
                  const confirming = confirmingGroup === draftKey;

                  return (
                    <div key={draftKey} className={`border rounded-lg ${isSubmitted ? 'border-ep-green/20 bg-ep-green/5' : 'border-ep-silver/30'}`}>
                      <button
                        type="button"
                        onClick={() => setExpandedDraft(isExpanded ? null : draftKey)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-ep-green">Pairing {draft.groupNumber}</span>
                          {rounds.length > 1 && round && (
                            <span className="text-xs text-ep-silver">{round.courseName}</span>
                          )}
                          {group?.teeTime && <span className="text-xs text-ep-silver">{group.teeTime}</span>}
                          {isConfirmed ? (
                            <span className="text-xs bg-ep-green/10 text-ep-green px-2 py-0.5 rounded-full">Confirmed</span>
                          ) : isSubmitted ? (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Submitted — awaiting review</span>
                          ) : (
                            <span className="text-xs bg-ep-sand text-ep-silver px-2 py-0.5 rounded-full">In progress</span>
                          )}
                        </div>
                        {isExpanded
                          ? <ChevronUp size={15} className="text-ep-silver shrink-0" />
                          : <ChevronDown size={15} className="text-ep-silver shrink-0" />}
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-ep-silver/20">
                          <div className="overflow-x-auto mt-3">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-ep-sand/50">
                                  <th className="text-left px-2 py-1.5 font-medium text-ep-green/70">Player</th>
                                  {allHoleNums.slice(0, 9).map(n => (
                                    <th key={n} className="px-1 py-1.5 text-center text-ep-silver font-normal w-6">{n}</th>
                                  ))}
                                  <th className="px-2 py-1.5 text-center font-medium text-ep-green/70 bg-ep-sand">Out</th>
                                  {allHoleNums.slice(9).map(n => (
                                    <th key={n} className="px-1 py-1.5 text-center text-ep-silver font-normal w-6">{n}</th>
                                  ))}
                                  <th className="px-2 py-1.5 text-center font-medium text-ep-green/70 bg-ep-sand">In</th>
                                  <th className="px-2 py-1.5 text-center font-medium text-ep-green bg-ep-sand/70">Tot</th>
                                </tr>
                              </thead>
                              <tbody>
                                {groupPlayers.map(player => {
                                  const front = allHoleNums.slice(0, 9).reduce((sum, n) => sum + (draft.holes[player.id]?.[String(n)] ?? 0), 0);
                                  const back = allHoleNums.slice(9).reduce((sum, n) => sum + (draft.holes[player.id]?.[String(n)] ?? 0), 0);
                                  const total = front + back;
                                  return (
                                    <tr key={player.id} className="border-t border-ep-silver/20">
                                      <td className="px-2 py-2 font-medium text-ep-green whitespace-nowrap">{player.name}</td>
                                      {allHoleNums.slice(0, 9).map(n => {
                                        const s = draft.holes[player.id]?.[String(n)];
                                        const hInfo = round?.holes?.find(h => h.number === n);
                                        const diff = s != null && hInfo ? s - hInfo.par : null;
                                        return (
                                          <td key={n} className="px-1 py-2 text-center">
                                            <span className={`inline-block w-5 h-5 rounded text-center leading-5 ${
                                              s == null ? 'text-ep-silver/50' :
                                              diff != null && diff <= -2 ? 'bg-yellow-200 font-bold' :
                                              diff === -1 ? 'bg-red-200' :
                                              diff === 0 ? 'bg-green-100' : ''
                                            }`}>{s ?? '–'}</span>
                                          </td>
                                        );
                                      })}
                                      <td className="px-2 py-2 text-center font-semibold text-ep-green bg-ep-sand">{front || '–'}</td>
                                      {allHoleNums.slice(9).map(n => {
                                        const s = draft.holes[player.id]?.[String(n)];
                                        const hInfo = round?.holes?.find(h => h.number === n);
                                        const diff = s != null && hInfo ? s - hInfo.par : null;
                                        return (
                                          <td key={n} className="px-1 py-2 text-center">
                                            <span className={`inline-block w-5 h-5 rounded text-center leading-5 ${
                                              s == null ? 'text-ep-silver/50' :
                                              diff != null && diff <= -2 ? 'bg-yellow-200 font-bold' :
                                              diff === -1 ? 'bg-red-200' :
                                              diff === 0 ? 'bg-green-100' : ''
                                            }`}>{s ?? '–'}</span>
                                          </td>
                                        );
                                      })}
                                      <td className="px-2 py-2 text-center font-semibold text-ep-green bg-ep-sand">{back || '–'}</td>
                                      <td className="px-2 py-2 text-center font-bold text-ep-green bg-ep-sand/70">{total || '–'}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          {isSubmitted && !isConfirmed && (
                            <button
                              type="button"
                              onClick={() => handleConfirmDraft(draft.roundId, draft.groupNumber)}
                              disabled={!!confirmingGroup}
                              className="btn-primary mt-3 text-sm"
                            >
                              {confirming ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                              {confirming ? 'Confirming…' : '✓ Confirm Scores'}
                            </button>
                          )}
                          {isConfirmed && (
                            <p className="text-xs text-ep-orange mt-2">Scores have been confirmed and finalized.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
          )}

          {/* Accordion sections */}
          <div ref={detailsSectionRef} className="scroll-mt-4">
          <AccordionSection title="Event Details" open={detailsOpen} onToggle={() => setDetailsOpen(o => !o)}>
            <form onSubmit={handleSaveDetails} className="space-y-4">
              {detailsFormContent}
              <button type="submit" className="btn-primary">
                <Save size={14} /> Save Changes
              </button>
            </form>
          </AccordionSection>
          </div>

          <div ref={playersSectionRef} className="scroll-mt-4">
          <AccordionSection title="Players" badge={selectedPlayerIds.length} open={playersOpen} onToggle={() => setPlayersOpen(o => !o)}>
            <PlayerPicker
              players={players}
              selectedIds={selectedPlayerIds}
              onAdd={addPlayerToTournament}
              onRemove={removePlayerFromTournament}
              onPlayerUpserted={upsertPlayer}
              withdrawnIds={tournament?.withdrawnPlayerIds ?? []}
              renderActions={p => {
                const isWD = tournament?.withdrawnPlayerIds?.includes(p.id) ?? false;
                return (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!tournament) return;
                      const current = tournament.withdrawnPlayerIds ?? [];
                      const updated = isWD ? current.filter(x => x !== p.id) : [...current, p.id];
                      try {
                        const t = await tournamentsApi.update(id!, { withdrawnPlayerIds: updated });
                        setTournament(t);
                      } catch (err: any) { toast.error(err.message); }
                    }}
                    className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${isWD ? 'bg-ep-sand text-ep-green hover:bg-ep-sand/70' : 'bg-ep-silver/20 text-ep-silver hover:bg-red-100 hover:text-red-600'}`}
                    title={isWD ? 'Remove WD' : 'Mark as withdrawn'}
                  >
                    {isWD ? 'WD ✕' : 'WD'}
                  </button>
                );
              }}
            />
          </AccordionSection>
          </div>

          <div ref={roundsSectionRef} className="scroll-mt-4">
          <AccordionSection title="Rounds & Tee Sheets" badge={rounds.length} open={roundsOpen} onToggle={() => setRoundsOpen(o => !o)}>
            {roundsSectionContent}
          </AccordionSection>
          </div>
        </>
      )}
    </div>
  );
}

function UnassignedChip({
  name,
  groups,
  onAssign,
}: {
  name: string;
  groups: { groupNumber: number; teeTime: string }[];
  onAssign: (groupIdx: number) => void;
}) {
  const [open, setOpen] = useState(false);
  if (groups.length === 0) {
    return <span className="text-xs text-ep-silver bg-ep-sand px-2 py-0.5 rounded-full">{name}</span>;
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 bg-ep-sand text-ep-green text-xs px-2 py-0.5 rounded-full hover:bg-ep-green/10 hover:text-ep-green transition-colors"
      >
        {name} <Plus size={10} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-ep-cream border border-ep-silver/30 rounded-lg shadow-md min-w-[130px]">
          {groups.map((g, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => { onAssign(idx); setOpen(false); }}
              className="block w-full text-left px-3 py-2 text-xs hover:bg-ep-sand text-ep-green first:rounded-t-lg last:rounded-b-lg"
            >
              Group {g.groupNumber}{g.teeTime ? ` · ${g.teeTime}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
