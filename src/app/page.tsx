'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertCircle, ArrowRight, CheckCircle2, ChevronRight, Clock3, ContactRound, Download, FileSpreadsheet, FileText, FolderOpen, FileUp, Star, Tags, LayoutDashboard, Layers3, LoaderCircle, Menu, Plus, ScanLine, Search, LogOut, ShieldCheck, Sparkles, Trash2, TrendingUp, UploadCloud, X } from 'lucide-react';
import { Uploader } from '@/components/Uploader';
import { TwoSideUploader } from '@/components/TwoSideUploader';
import { DuplicateReview, type ReviewItem } from '@/components/DuplicateReview';
import { findDuplicate, mergeCards } from '@/lib/duplicates';
import { resolveReviewJob } from '@/lib/review-jobs';
import { getReviewHints } from '@/lib/scan-quality';
import { CardTable } from '@/components/CardTable';
import { exportCsv, exportExcel } from '@/lib/export';
import { importContactsFile } from '@/lib/contact-import';
import { addTags, defaultContactFilter, type ContactFilter } from '@/lib/contact-management';
import { prepareImage } from '@/lib/images';
import { AuthGate, type Account } from '@/components/AuthGate';
import { contactDiff } from '@/lib/cloud-sync';
import { uploadOriginals } from '@/lib/cloud-images';
import type { EditableField, ExtractResponse, StoredCard } from '@/types/card';

type Section = 'overview' | 'scan' | 'contacts' | 'exports';
type JobState = 'preparing' | 'extracting' | 'done' | 'error';
interface Job { id: number; name: string; state: JobState | 'review'; error?: string; }
interface ExportLog { id: string; kind: 'CSV' | 'Excel'; count: number; date: string; }
const EXPORT_KEY = 'cardflow:exports:v1';
const REVIEW_KEY = 'cardflow:duplicate-review:v1';
const navigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'scan', label: 'Scan cards', icon: ScanLine },
  { id: 'contacts', label: 'Contacts', icon: ContactRound },
  { id: 'exports', label: 'Exports', icon: Download },
] as const;
const titles: Record<Section, { heading: string; subtitle: string }> = {
  overview: { heading: 'Overview', subtitle: 'Your contacts, scans, and recent activity at a glance.' },
  scan: { heading: 'Scan business cards', subtitle: 'Turn individual cards or an entire batch into editable contacts.' },
  contacts: { heading: 'Contacts', subtitle: 'Find, verify, and manage every extracted contact.' },
  exports: { heading: 'Exports', subtitle: 'Download your contact directory in spreadsheet-ready formats.' },
};
const prettyTime = (value: string) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? 'Unknown date' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };

export default function Dashboard() {
  const [section, setSection] = useState<Section>('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [cards, setCards] = useState<StoredCard[]>([]);
  const cardsRef = useRef<StoredCard[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [ready, setReady] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [authError, setAuthError] = useState('');
  const [syncState, setSyncState] = useState<'saved'|'saving'|'error'>('saved');
  const [recoverable, setRecoverable] = useState(false);
  const syncedRef = useRef<StoredCard[]>([]);
  const syncRunning = useRef(false);
  const accountIdRef = useRef<string | null>(null);
  const retrySyncRef = useRef<() => Promise<void>>(async () => {});
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState('');
  const [contactFilter, setContactFilter] = useState<ContactFilter>(defaultContactFilter);
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exports, setExports] = useState<ExportLog[]>([]);
  const running = useRef(false);
  const pending = useRef<Array<{ id: number; file: File; back?: File }>>([]);
  const nextJobId = useRef(0);
  const jobsRef = useRef<Job[]>([]);
  const reviewJobIds = useRef(new Map<string, number>());
  const originalFiles = useRef(new Map<string, { front: File; back?: File }>());
  const [uploadBusy, setUploadBusy] = useState(false);

  const initializeAccount = async (user: Account) => {
    setReady(false); setAuthError(''); setAccount(user); accountIdRef.current = user.id;
    try {
      const response = await fetch('/api/contacts', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load your cloud contacts. Please retry.');
      const data = await response.json() as { cards: StoredCard[] };
      const loaded = data.cards;
      syncedRef.current = loaded;
      cardsRef.current = loaded;
      setCards(loaded);
      try { setRecoverable(localStorage.getItem(`cardflow:unsynced:${user.id}`) !== null); } catch { setRecoverable(false); }
      const reviewKey = `${REVIEW_KEY}:${user.id}`;
      try {
        const queued: unknown = JSON.parse(localStorage.getItem(reviewKey) || '[]');
        setReviews(Array.isArray(queued) ? queued.filter((item): item is ReviewItem =>
          !!item && typeof item === 'object' && !!item.candidate && typeof item.candidate.id === 'string' &&
          !!item.match && typeof item.match.existingId === 'string').slice(0, 100) : []);
      } catch { setReviews([]); }
      try {
        const raw = localStorage.getItem(`${EXPORT_KEY}:${user.id}`);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        setExports(Array.isArray(parsed) ? parsed.filter((item): item is ExportLog =>
          !!item && typeof item.id === 'string' && (item.kind === 'CSV' || item.kind === 'Excel') && typeof item.count === 'number').slice(0, 30) : []);
      } catch { setExports([]); }
      setSyncState('saved'); setReady(true);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Cloud loading failed.');
      setReady(false);
    }
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        if (!response.ok) throw new Error('Unable to connect to MongoDB. Check your server configuration.');
        const result = await response.json() as { user: Account | null };
        if (!cancelled && result.user) await initializeAccount(result.user);
      } catch (error) { if (!cancelled) setAuthError(error instanceof Error ? error.message : 'Session check failed.'); }
      finally { if (!cancelled) setAuthChecked(true); }
    })();
    return () => { cancelled = true; };
  // Only check the session on initial mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const persistChanges = async () => {
    if (syncRunning.current || !ready || !accountIdRef.current || recoverable) return;
    syncRunning.current = true;
    const accountId = accountIdRef.current;
    try {
      while (accountIdRef.current === accountId) {
        const operations = contactDiff(syncedRef.current, cardsRef.current);
        if (!operations.length) {
          try { localStorage.removeItem(`cardflow:unsynced:${accountId}`); } catch { /* no backup was stored */ }
          setRecoverable(false);
          setSyncState('saved');
          break;
        }
        setSyncState('saving');
        try { localStorage.setItem(`cardflow:unsynced:${accountId}`, JSON.stringify(cardsRef.current)); }
        catch { setNotice('Browser recovery backup could not be stored (storage quota). Keep this tab open until MongoDB sync completes.'); }
        for (let i = 0; i < operations.length; i++) {
          const batch = [operations[i]];
          const response = await fetch('/api/contacts', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operations: batch }),
          });
          if (!response.ok) {
            const data = await response.json().catch(() => ({})) as { error?: string };
            if (response.status === 409) throw new Error('Sync conflict: a contact changed in another session. Export your local data as backup, then reload to review remote changes.');
            throw new Error(data.error || `MongoDB sync failed (${response.status}).`);
          }
          const reply = await response.json() as { revision?: number };
          const confirmed = new Map(syncedRef.current.map(card => [card.id, card]));
          for (const operation of batch) {
            if (operation.type === 'upsert') {
              const accepted = { ...operation.card, revision: reply.revision ?? (operation.card.revision ?? 0) + 1 };
              confirmed.set(operation.card.id, accepted);
              // Preserve later local edits; update only the revision field of the same contact.
              cardsRef.current = cardsRef.current.map(card => card.id === accepted.id ? { ...card, revision: accepted.revision } : card);
              setCards(current => current.map(card => card.id === accepted.id ? { ...card, revision: accepted.revision } : card));
            } else confirmed.delete(operation.id);
          }
          syncedRef.current = [...confirmed.values()];
        }
      }
    } catch (error) {
      setSyncState('error');
      setNotice(`${error instanceof Error ? error.message : 'Cloud sync failed.'} Unsynced changes are retained in this browser. Use Retry sync.`);
    } finally { syncRunning.current = false; }
  };
  retrySyncRef.current = persistChanges;
  useEffect(() => { if (ready) void persistChanges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, ready]);
  useEffect(() => {
    if (!ready || !account) return;
    try { localStorage.setItem(`${EXPORT_KEY}:${account.id}`, JSON.stringify(exports)); } catch { /* History is optional. */ }
  }, [exports, ready, account]);
  useEffect(() => {
    if (!ready || !account) return;
    const key = `${REVIEW_KEY}:${account.id}`;
    try { localStorage.setItem(key, JSON.stringify(reviews)); }
    catch {
      try { localStorage.setItem(key, JSON.stringify(reviews.map(item => ({ ...item, candidate: { ...item.candidate, preview: '', backPreview: '' } })))); }
      catch { setNotice('Duplicate review queue could not be saved in this browser.'); }
    }
  }, [reviews, ready, account]);
  const recoverUnsynced = () => {
    if (!account) return;
    const raw = localStorage.getItem(`cardflow:unsynced:${account.id}`);
    if (!raw) { setRecoverable(false); return; }
    if (!window.confirm('Recover unsynced changes from this browser? Records with matching IDs will replace the current cloud version.')) return;
    try {
      const parsed = JSON.parse(raw) as StoredCard[];
      if (!Array.isArray(parsed)) throw new Error();
      const map = new Map(cardsRef.current.map(card => [card.id, card]));
      parsed.forEach(card => { if (card && typeof card.id === 'string') map.set(card.id, card); });
      const restored = [...map.values()];
      cardsRef.current = restored; setCards(restored);
      setRecoverable(false);
    } catch { setNotice('Unsynced browser backup is invalid. Cloud contacts were not changed.'); }
  };
  const discardRecovery = () => {
    if (!account || !window.confirm('Discard the unsynced browser backup for this account? This cannot be undone. Cloud contacts are preserved.')) return;
    try { localStorage.removeItem(`cardflow:unsynced:${account.id}`); } catch { setNotice('Could not clear the browser recovery backup.'); return; }
    setRecoverable(false); setNotice('Browser recovery backup discarded. MongoDB contacts were not changed.');
  };
  const logout = async () => {
    if (uploadBusy || running.current || syncState !== 'saved' || syncRunning.current || contactDiff(syncedRef.current, cardsRef.current).length > 0) {
      setNotice('Cloud changes are not yet saved. Retry sync before signing out.'); return;
    }
    const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) { setNotice('Sign out failed. Please retry.'); return; }
    setReady(false); setAccount(null); accountIdRef.current = null;
    originalFiles.current.clear(); cardsRef.current = []; syncedRef.current = []; setCards([]); setReviews([]); setExports([]); setSection('overview');
  };
  const commitCards = (update: (previous: StoredCard[]) => StoredCard[]) => {
    if (recoverable) { setNotice('Recover or discard your pending browser changes before editing contacts.'); return; }
    const next = update(cardsRef.current);
    cardsRef.current = next;
    setCards(next);
  };
  const setJobList = (next: Job[]) => { jobsRef.current = next; setJobs(next); };
  const updateJob = (id: number, state: Job['state'], error?: string) => setJobList(jobsRef.current.map(job => job.id === id ? { ...job, state, error } : job));

  const processQueue = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (pending.current.length) {
        const { id, file, back } = pending.current.shift()!;
        updateJob(id, 'preparing');
        try {
          const prepared = await prepareImage(file);
          const preparedBack = back ? await prepareImage(back) : undefined;
          updateJob(id, 'extracting');
          const form = new FormData(); form.append('image', prepared.upload);
          if (preparedBack) form.append('backImage', preparedBack.upload);
          const response = await fetch('/api/extract-card', { method: 'POST', body: form });
          const json: ExtractResponse | { error: string } = await response.json();
          if (!response.ok || !('cards' in json) || json.cards.length === 0) {
            const message = 'error' in json ? json.error : json.errors[0]?.message || 'No contacts extracted.';
            throw new Error(message);
          }
          const createdAt = new Date().toISOString();
          const extracted: StoredCard[] = json.cards.map(card => ({ ...card, preview: prepared.preview, backPreview: preparedBack?.preview, createdAt, sourceName: file.name }));
          let flagged = false;
          for (const candidate of extracted) {
            const match = findDuplicate(candidate, cardsRef.current);
            if (match) { originalFiles.current.set(candidate.id, { front: file, back }); reviewJobIds.current.set(candidate.id, id); setReviews(current => [...current, { candidate, match }]); flagged = true; }
            else {
              if (!accountIdRef.current) throw new Error('Please sign in before uploading images.');
              const images = await uploadOriginals(accountIdRef.current, candidate.id, file, back);
              commitCards(previous => [{ ...candidate, images }, ...previous]);
            }
          }
          updateJob(id, flagged ? 'review' : 'done');
        } catch (error) { updateJob(id, 'error', error instanceof Error ? error.message : 'Unable to scan this card.'); }
      }
    } finally { running.current = false; }
  }, []);
  const onFiles = useCallback((files: File[]) => {
    if (recoverable) { setNotice('Resolve unsynced browser recovery before scanning new cards.'); return; }
    const newJobs = files.map(file => ({ id: ++nextJobId.current, name: file.name, state: 'preparing' as const, file }));
    setJobList([...jobsRef.current, ...newJobs.map(({ id, name, state }) => ({ id, name, state }))]);
    pending.current.push(...newJobs.map(({ id, file }) => ({ id, file })));
    void processQueue();
  }, [processQueue, recoverable]);
  const onPair = (front: File, back?: File) => {
    if (recoverable) { setNotice('Resolve unsynced browser recovery before scanning new cards.'); return; }
    const id = ++nextJobId.current;
    setJobList([...jobsRef.current, { id, name: `${front.name}${back ? ' + back' : ''}`, state: 'preparing' }]);
    pending.current.push({ id, file: front, back });
    void processQueue();
  };
  const onDecide = async (candidateId: string, action: 'keep'|'replace'|'merge'|'skip') => {
    if (recoverable || uploadBusy) { setNotice('Complete pending synchronization or image upload before reviewing duplicates.'); return; }
    const item = reviews.find(review => review.candidate.id === candidateId);
    if (!item) return;
    setUploadBusy(true);
    try {
      const originals = originalFiles.current.get(candidateId);
      const targetId = action === 'keep' ? candidateId : item.match.existingId;
      let candidate = item.candidate;
      const existing = cardsRef.current.find(card => card.id === item.match.existingId);
      const needsImage = action !== 'merge' || !existing?.images?.front;
      if (action !== 'skip' && needsImage && originals && accountIdRef.current) {
        const images = await uploadOriginals(accountIdRef.current, targetId, originals.front, originals.back);
        candidate = { ...candidate, images };
      }
      if (action === 'keep') commitCards(previous => [candidate, ...previous]);
      if (action === 'replace') commitCards(previous => previous.some(card => card.id === item.match.existingId)
        ? previous.map(card => card.id === item.match.existingId ? { ...candidate, id: card.id, revision: card.revision, createdAt: card.createdAt } : card)
        : [candidate, ...previous]);
      if (action === 'merge') commitCards(previous => previous.some(card => card.id === item.match.existingId)
        ? previous.map(card => card.id === item.match.existingId ? mergeCards(card, candidate) : card)
        : [candidate, ...previous]);
      originalFiles.current.delete(candidateId);
      setReviews(previous => previous.filter(review => review.candidate.id !== candidateId));
      const completedJobId = resolveReviewJob(reviewJobIds.current, candidateId);
      if (completedJobId !== null) updateJob(completedJobId, 'done');
      setNotice(action === 'skip' ? 'New scan discarded; existing contact preserved.' : `Duplicate review completed: ${action}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save original image; review remains pending.');
    } finally { setUploadBusy(false); }
  };
  const onEdit = (id: string, field: EditableField, value: string) => commitCards(previous => previous.map(card => card.id === id ? { ...card, [field]: value } : card));
  const onDelete = (id: string) => commitCards(previous => previous.filter(card => card.id !== id));
  const onFavorite = (id: string) => commitCards(previous => previous.map(card => card.id === id ? { ...card, favorite: !card.favorite } : card));
  const onTags = (id: string, tags: string[]) => commitCards(previous => previous.map(card => card.id === id ? { ...card, tags } : card));
  const onBulkDelete = (ids: string[]) => { const selected = new Set(ids); commitCards(previous => previous.filter(card => !selected.has(card.id))); };
  const onBulkFavorite = (ids: string[], favorite: boolean) => { const selected = new Set(ids); commitCards(previous => previous.map(card => selected.has(card.id) ? { ...card, favorite } : card)); };
  const onBulkTags = (ids: string[], tags: string[]) => { const selected = new Set(ids); commitCards(previous => previous.map(card => selected.has(card.id) ? addTags(card, tags) : card)); };
  const onImport = async (file?: File) => {
    if (recoverable) { setNotice('Resolve unsynced browser recovery before importing contacts.'); return; }
    if (!file || importing) return;
    setImporting(true);
    try {
      const parsed = await importContactsFile(file);
      const existing = [...cardsRef.current]; const pendingReviews: ReviewItem[] = [];
      let added = 0;
      for (const candidate of parsed.contacts) {
        const match = findDuplicate(candidate, existing);
        if (match) pendingReviews.push({ candidate, match });
        else { existing.unshift(candidate); added++; }
      }
      commitCards(() => existing);
      if (pendingReviews.length) setReviews(old => [...old, ...pendingReviews]);
      setNotice(`Imported ${added} contact${added === 1 ? '' : 's'}. ${pendingReviews.length} possible duplicate${pendingReviews.length === 1 ? '' : 's'} sent to Scan cards for review. ${parsed.skipped} blank rows skipped.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Failed to import contacts.'); }
    finally { setImporting(false); if (importRef.current) importRef.current.value = ''; }
  };
  const onReviewed = (id: string) => commitCards(previous => previous.map(card => card.id === id ? { ...card, reviewedAt: new Date().toISOString() } : card));
  const processingCount = jobs.filter(job => job.state === 'preparing' || job.state === 'extracting').length;
  const completed = jobs.filter(job => job.state === 'done').length;
  const failed = jobs.filter(job => job.state === 'error');
  const today = new Date().toLocaleDateString('en-CA');
  const scannedToday = cards.filter(card => { const date = new Date(card.createdAt); return !Number.isNaN(date.getTime()) && date.toLocaleDateString('en-CA') === today; }).length;
  const needsReview = cards.filter(card => !card.reviewedAt && getReviewHints(card).length > 0).length + reviews.length;
  const companyCount = new Set(cards.map(card => card.companyName.trim().toLowerCase()).filter(Boolean)).size;
  const recent = useMemo(() => [...cards].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5), [cards]);
  const open = (id: Section) => { setSection(id); setMobileNav(false); };
  const logExport = (kind: ExportLog['kind']) => setExports(old => [{ id: crypto.randomUUID(), kind, count: cards.length, date: new Date().toISOString() }, ...old].slice(0, 30));
  const downloadCsv = () => { if (!cards.length) return; try { exportCsv(cards); logExport('CSV'); } catch { setNotice('CSV export failed. Please try again.'); } };
  const downloadExcel = async () => { if (!cards.length || exporting) return; setExporting(true); try { await exportExcel(cards); logExport('Excel'); } catch { setNotice('Excel export failed. Try exporting as CSV.'); } finally { setExporting(false); } };
  const exportButtons = (large = false) => <div className={`flex flex-wrap gap-2 ${large ? 'mt-5' : ''}`}>
    <button disabled={!cards.length} onClick={downloadCsv} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"><FileText className="size-4" /> Export CSV</button>
    <button disabled={!cards.length || exporting} onClick={() => void downloadExcel()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-40">{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}{exporting ? 'Preparing…' : 'Export Excel'}</button>
  </div>;
  const progress = jobs.length ? (completed + failed.length + jobs.filter(job => job.state === 'review').length) / jobs.length * 100 : 0;
  const progressPanel = jobs.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-live="polite">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-slate-900">Processing queue</h3><p className="mt-1 text-xs text-slate-500">{completed} completed · {processingCount} processing · {jobs.filter(job => job.state === 'review').length} awaiting review · {failed.length} failed</p></div><button className="text-xs font-semibold text-blue-600 hover:underline" onClick={() => setJobList(jobsRef.current.filter(j => j.state === 'preparing' || j.state === 'extracting' || j.state === 'review'))}>Dismiss finished</button></div>
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} /></div>
    <div className="mt-3 max-h-40 space-y-2 overflow-y-auto">{jobs.slice(-12).map(job => <div key={job.id} className="flex items-start gap-2 text-xs"><span className="mt-0.5">{job.state === 'done' || job.state === 'review' ? <CheckCircle2 className="size-4 text-emerald-600" /> : job.state === 'error' ? <AlertCircle className="size-4 text-rose-600" /> : <LoaderCircle className="size-4 animate-spin text-blue-600" />}</span><span className="min-w-0 break-words text-slate-600">{job.name} <span className={job.state === 'error' ? 'text-rose-600' : 'text-slate-400'}>— {job.error || job.state}</span></span></div>)}</div>
  </section>;
  const statCards = [
    { label: 'Total contacts', value: cards.length, icon: ContactRound, info: 'Stored in MongoDB', accent: 'text-blue-600 bg-blue-50' },
    { label: 'Scanned today', value: scannedToday, icon: ScanLine, info: 'Based on saved scan dates', accent: 'text-violet-600 bg-violet-50' },
    { label: 'Needs review', value: needsReview, icon: AlertCircle, info: 'Unverified scan warnings + duplicate queue', accent: 'text-amber-600 bg-amber-50' },
    { label: 'Companies', value: companyCount, icon: FolderOpen, info: 'Unique named companies', accent: 'text-emerald-600 bg-emerald-50' },
  ];

  if (!authChecked) return <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB] text-sm font-semibold text-slate-600"><LoaderCircle className="mr-2 size-5 animate-spin" /> Connecting to CardFlow…</div>;
  if (authError) return <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F4F7FB] p-6"><p role="alert" className="max-w-md text-center font-semibold text-rose-700">{authError}</p><button className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white" onClick={() => window.location.reload()}>Retry connection</button></main>;
  if (!account) return <AuthGate onAuthenticated={user => void initializeAccount(user)} />;
  if (!ready) return <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB] text-sm font-semibold text-slate-600"><LoaderCircle className="mr-2 size-5 animate-spin" /> Loading your contacts…</div>;

  return <div className="min-h-screen bg-[#f4f7fb] text-[#172238]">
    {mobileNav && <button aria-label="Close navigation overlay" onClick={() => setMobileNav(false)} className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[76px] items-center justify-between border-b border-slate-100 px-5"><button onClick={() => open('overview')} className="flex items-center gap-3 text-left"><span className="grid size-10 place-items-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-100"><Layers3 className="size-5" /></span><span><span className="block text-xl font-extrabold tracking-tight">Card<span className="text-blue-600">Flow</span></span><span className="block text-[10px] font-bold tracking-[.14em] text-slate-400">CONTACT WORKSPACE</span></span></button><button className="rounded-lg p-2 lg:hidden" onClick={() => setMobileNav(false)} aria-label="Close menu"><X className="size-5" /></button></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-6">
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Workspace</p>
        <nav className="space-y-1" aria-label="Main navigation">{navigation.map(item => <button key={item.id} onClick={() => open(item.id)} aria-current={section === item.id ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${section === item.id ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}><item.icon className="size-[18px]" />{item.label}{item.id === 'contacts' && <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{cards.length}</span>}</button>)}</nav>
      </div>
      <div className="shrink-0 border-t border-slate-100 p-3 pb-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm" aria-label="Signed in account">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-100 text-sm font-extrabold uppercase text-blue-700">{(account.name?.trim() || account.email).slice(0, 1)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900" title={account.name}>{account.name}</p>
              <p className="truncate text-[11px] text-slate-500" title={account.email}>{account.email}</p>
            </div>
          </div>
          <button type="button" onClick={() => void logout()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"><LogOut className="size-4" /> Sign out</button>
        </div>
      </div>
    </aside>
    <div className="min-w-0 lg:pl-[252px]">
      <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md sm:px-8"><div className="flex items-center gap-3"><button onClick={() => setMobileNav(true)} aria-label="Open navigation" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"><Menu className="size-5" /></button><span className="hidden text-xs font-semibold text-slate-400 sm:inline">Workspace</span><ChevronRight className="hidden size-3.5 text-slate-300 sm:inline" /><span className="text-sm font-bold">{titles[section].heading}</span></div><div className="flex items-center gap-3"><span className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 sm:inline-flex"><span className="size-1.5 rounded-full bg-emerald-500" /> {syncState === 'saved' ? 'Cloud saved' : syncState === 'saving' ? 'Syncing…' : 'Sync failed'}</span><button onClick={() => open('scan')} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-blue-700 sm:px-4"><Plus className="size-4" /> Scan cards</button></div></header>
      <main className="mx-auto max-w-[1500px] space-y-6 px-4 py-7 sm:px-8 sm:py-9">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 inline-flex items-center gap-2 text-xs font-bold text-blue-600"><Sparkles className="size-3.5" /> AI-POWERED CONTACT MANAGEMENT</div><h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{titles[section].heading}</h1><p className="mt-2 text-sm text-slate-500">{titles[section].subtitle}</p></div>{section === 'contacts' && exportButtons()}</div>
        {syncState === 'error' && <button className="rounded-xl bg-amber-100 px-4 py-2 text-sm font-bold text-amber-900" onClick={() => void retrySyncRef.current()}>Retry sync with MongoDB</button>}{recoverable && <div className="flex flex-wrap items-center gap-3 rounded-xl bg-blue-50 p-3"><button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white" onClick={recoverUnsynced}>Recover unsynced browser changes</button><button className="text-sm font-semibold text-slate-600 underline" onClick={discardRecovery}>Discard backup and keep cloud data</button></div>}{notice && <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Dismiss alert"><X className="size-4" /></button></div>}
        {section === 'overview' && <>
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">{statCards.map(item => <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-500">{item.label}</span><span className={`rounded-xl p-2.5 ${item.accent}`}><item.icon className="size-5" /></span></div><div className="mt-4 text-3xl font-extrabold tabular-nums">{ready ? item.value.toLocaleString() : '—'}</div><p className="mt-2 text-xs text-slate-400">{item.info}</p></div>)}</div>
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,1fr)]"><div className="space-y-6"><section className="relative overflow-hidden rounded-2xl bg-[#172238] p-7 text-white shadow-sm sm:p-9"><div className="absolute -right-10 -top-16 size-60 rounded-full border-[38px] border-white/5" /><div className="relative"><span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-100"><Sparkles className="size-3.5" /> Powered by Gemini AI</span><h2 className="mt-5 max-w-md text-2xl font-extrabold leading-tight sm:text-3xl">Business cards in. Organized contacts out.</h2><p className="mt-3 max-w-lg text-sm leading-6 text-slate-300">Upload photos of visiting cards and let AI extract the contact details. Review, correct, and export in minutes.</p><button onClick={() => open('scan')} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500"><UploadCloud className="size-4" /> Start scanning <ArrowRight className="size-4" /></button></div></section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="font-bold">Recent contacts</h2><p className="mt-1 text-xs text-slate-500">Latest saved scans</p></div><button onClick={() => open('contacts')} className="inline-flex items-center gap-1 text-xs font-bold text-blue-600">View all <ChevronRight className="size-4" /></button></div>{recent.length ? <div className="mt-4 divide-y divide-slate-100">{recent.map(card => <div key={card.id} className="flex items-center gap-3 py-3"><div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">{card.preview ? <img className="size-full object-contain" src={card.preview} alt="Card preview" /> : <ContactRound className="size-5 text-slate-400" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{card.fullName || 'Unnamed contact'}</p><p className="truncate text-xs text-slate-500">{card.companyName || card.jobTitle || 'No company listed'}</p></div><span className="shrink-0 text-xs text-slate-400">{prettyTime(card.createdAt)}</span></div>)}</div> : <p className="py-10 text-center text-sm text-slate-400">Your recently scanned contacts will appear here.</p>}</section></div>
            <div className="space-y-6"><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-2.5 text-blue-600"><Activity className="size-5" /></span><div><h2 className="font-bold">Quick actions</h2><p className="text-xs text-slate-500">The essentials, one click away</p></div></div><div className="mt-5 space-y-2">{[{ label: 'Scan new cards', description: 'Upload images to Gemini OCR', icon: ScanLine, target: 'scan' as const }, { label: 'Browse contacts', description: 'Search and edit your records', icon: ContactRound, target: 'contacts' as const }, { label: 'Export your data', description: 'Download CSV or Excel', icon: Download, target: 'exports' as const }].map(action => <button key={action.target} onClick={() => open(action.target)} className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left hover:border-blue-100 hover:bg-blue-50/40"><action.icon className="size-5 shrink-0 text-blue-600" /><span className="flex-1"><span className="block text-sm font-semibold">{action.label}</span><span className="mt-0.5 block text-xs text-slate-500">{action.description}</span></span><ChevronRight className="size-4 text-slate-300" /></button>)}</div></section><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="font-bold">Your workflow</h2><div className="mt-5 space-y-5">{[{ n: '01', label: 'Upload', sub: 'Add a photo or a batch of cards' }, { n: '02', label: 'Review', sub: 'Check and correct extracted fields' }, { n: '03', label: 'Export', sub: 'Take contacts to CSV or Excel' }].map(step => <div key={step.n} className="flex items-start gap-3"><span className="rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-extrabold text-slate-500">{step.n}</span><div><p className="text-sm font-semibold">{step.label}</p><p className="mt-0.5 text-xs text-slate-500">{step.sub}</p></div></div>)}</div></section></div></div>
        </>}
        {section === 'scan' && <><Uploader processing={processingCount > 0} onFiles={onFiles} onError={setNotice} /><TwoSideUploader processing={processingCount > 0} onScan={onPair} onError={setNotice} />{progressPanel}<DuplicateReview pending={reviews} cards={cards} onDecide={(id, action) => { void onDecide(id, action); }} /><div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><h3 className="font-bold">Ready to review?</h3><p className="mt-1 text-xs text-slate-500">{cards.length} contact{cards.length === 1 ? '' : 's'} currently saved in your directory.</p></div><button onClick={() => open('contacts')} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold hover:bg-slate-50">View contacts <ArrowRight className="size-4" /></button></div></>}
        {section === 'contacts' && <><div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"><div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, company, email, phone…" aria-label="Search contacts" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none focus:border-blue-400 focus:bg-white" /></div><input ref={importRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" aria-label="Import contacts file" onChange={event => void onImport(event.target.files?.[0])} />
        <button type="button" disabled={importing} onClick={() => importRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"><FileUp className="size-4" /> {importing ? 'Importing…' : 'Import CSV / Excel'}</button>
        <span className="rounded-full bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">{cards.length} contacts</span>{reviews.length>0 && <button onClick={() => open('scan')} className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{reviews.length} duplicate{reviews.length!==1?'s':''} to review</button>}<button disabled={!cards.length} onClick={() => { if (window.confirm(`Permanently delete all ${cards.length} contacts in your MongoDB account?`)) commitCards(() => []); }} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-30"><Trash2 className="size-4" /> Clear all</button></div><div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><Star className="size-4"/><input type="checkbox" checked={contactFilter.favorite} onChange={e => setContactFilter(old => ({ ...old, favorite: e.target.checked }))} /> Favourites only</label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Verification<select aria-label="Filter by review status" value={contactFilter.review} onChange={e => setContactFilter(old => ({ ...old, review: e.target.value as ContactFilter['review'] }))} className="rounded-lg border border-slate-200 bg-white px-3 py-2"><option value="all">All</option><option value="pending">Not reviewed</option><option value="reviewed">Reviewed</option></select></label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Clarity<select aria-label="Filter by clarity" value={contactFilter.confidence} onChange={e => setContactFilter(old => ({ ...old, confidence: e.target.value as ContactFilter['confidence'] }))} className="rounded-lg border border-slate-200 bg-white px-3 py-2"><option value="all">All</option><option>High</option><option>Medium</option><option>Low</option></select></label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Company<select aria-label="Filter by company" value={contactFilter.company} onChange={e => setContactFilter(old => ({ ...old, company: e.target.value }))} className="max-w-44 rounded-lg border border-slate-200 bg-white px-3 py-2"><option value="">All companies</option>{[...new Set(cards.map(card => card.companyName.trim()).filter(Boolean))].sort().map(company => <option key={company} value={company}>{company}</option>)}</select></label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><Tags className="size-4"/>Tag<select aria-label="Filter by tag" value={contactFilter.tag} onChange={e => setContactFilter(old => ({ ...old, tag: e.target.value }))} className="max-w-36 rounded-lg border border-slate-200 bg-white px-3 py-2"><option value="">All tags</option>{[...new Set(cards.flatMap(card => card.tags ?? []))].sort().map(tag => <option key={tag}>{tag}</option>)}</select></label>
          <button type="button" onClick={() => { setSearch(''); setContactFilter(defaultContactFilter); }} className="ml-auto text-xs font-semibold text-blue-600">Reset filters</button>
        </div>
        <CardTable cards={cards} search={search} filter={contactFilter} onEdit={onEdit} onDelete={onDelete} onReviewed={onReviewed} onFavorite={onFavorite} onTags={onTags} onBulkDelete={onBulkDelete} onBulkFavorite={onBulkFavorite} onBulkTags={onBulkTags} processingCount={processingCount} onScan={() => open('scan')} /></>}
        {section === 'exports' && <><div className="grid gap-5 md:grid-cols-2"><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><span className="inline-flex rounded-xl bg-blue-50 p-3 text-blue-600"><FileText className="size-6" /></span><h2 className="mt-5 text-lg font-bold">CSV spreadsheet</h2><p className="mt-2 text-sm leading-6 text-slate-500">A lightweight, Excel-compatible CSV file with all saved contact fields.</p><button disabled={!cards.length} onClick={downloadCsv} className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold hover:bg-slate-50 disabled:opacity-40"><Download className="size-4" /> Download CSV</button></section><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><span className="inline-flex rounded-xl bg-emerald-50 p-3 text-emerald-600"><FileSpreadsheet className="size-6" /></span><h2 className="mt-5 text-lg font-bold">Formatted Excel workbook</h2><p className="mt-2 text-sm leading-6 text-slate-500">An XLSX file with styled headers, adjusted column widths, and filters.</p><button disabled={!cards.length || exporting} onClick={() => void downloadExcel()} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40">{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}{exporting ? 'Preparing…' : 'Download Excel'}</button></section></div>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Export activity on this device</h2><p className="mt-1 text-xs text-slate-500">Recent downloads initiated in this browser, not a cloud backup.</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">{exports.length} recent</span></div>{exports.length ? <div className="mt-5 divide-y divide-slate-100">{exports.map(record => <div key={record.id} className="flex items-center gap-3 py-3"><div className="rounded-xl bg-slate-100 p-2.5">{record.kind === 'CSV' ? <FileText className="size-4" /> : <FileSpreadsheet className="size-4" />}</div><div className="flex-1"><p className="text-sm font-semibold">{record.kind} export</p><p className="text-xs text-slate-500">{record.count} contacts</p></div><span className="text-xs text-slate-400">{prettyTime(record.date)}</span></div>)}</div> : <div className="flex flex-col items-center py-12 text-center"><Clock3 className="size-7 text-slate-300" /><p className="mt-3 text-sm font-semibold">No exports recorded yet</p><p className="mt-1 text-xs text-slate-400">Your export activity will appear here after your first download.</p></div>}</section><p className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="size-4 text-emerald-600" /> Your contacts are stored in MongoDB. Export a separate backup regularly.</p></>}
        <footer className="flex flex-wrap items-center justify-between gap-3 pb-4 pt-2 text-xs text-slate-400"><span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600" />{syncState === 'saved' ? 'Saved to your MongoDB account' : syncState === 'saving' ? 'Saving to MongoDB…' : 'Cloud sync needs attention'}</span><span className="inline-flex items-center gap-2"><TrendingUp className="size-4" /> CardFlow · Smart Contact Extraction</span></footer>
      </main>
    </div>
  </div>;
}
