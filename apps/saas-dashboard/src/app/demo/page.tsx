'use client';

import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { AlertTriangle, ChevronDown, Zap } from 'lucide-react';
import { Card }   from '@/components/ui/card';
import { Input }  from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// ── Types ─────────────────────────────────────────────────────────────────────

type UserStatus = 'idle' | 'joining' | 'queued' | 'won' | 'sold_out' | 'error';

interface UserState {
  id:        string;
  status:    UserStatus;
  token?:    string;
  position?: number;
}

type LogStatus = 'WON' | 'QUEUED' | 'SOLD_OUT' | 'ERROR';

interface LogEntry {
  id:     number;
  ts:     string;
  userId: string;
  status: LogStatus;
  detail: string;
}

interface Stats {
  joining:       number;
  queued:        number;
  won:           number;
  drainRejected: number;
  doorClosed:    number;
  errors:        number;
  joinRate:      number;
  winRate:       number;
}

interface DotState {
  id:        string;
  status:    UserStatus;
  position?: number;
}

interface TooltipInfo {
  text: string;
  x:    number;
  y:    number;
}

interface StatItem {
  label: string;
  value: string | number;
  color?: string;
}

interface EventInfo {
  stock:     number;
  rateLimit: number;
  queueCap:  number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function padId(n: number): string {
  return String(n).padStart(3, '0');
}

function nowTs(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

let logSeq = 0;

const INITIAL_STATS: Stats = {
  joining: 0, queued: 0, won: 0, drainRejected: 0, doorClosed: 0, errors: 0, joinRate: 0, winRate: 0,
};

// ── Dot colors (inline style — no Tailwind purge risk with dynamic values) ────

const DOT_COLOR: Record<UserStatus, string> = {
  idle:     '#2a2a2a',
  joining:  '#3b82f6',
  queued:   '#facc15',
  won:      '#22c55e',
  sold_out: '#ef4444',
  error:    '#f97316',
};

const LEGEND = [
  { color: '#2a2a2a', label: 'idle'     },
  { color: '#3b82f6', label: 'joining'  },
  { color: '#facc15', label: 'queued'   },
  { color: '#22c55e', label: 'won'      },
  { color: '#ef4444', label: 'sold out' },
  { color: '#f97316', label: 'error'    },
];

// ── UserDot (memoized — only re-renders when status/position actually change) ─

interface DotProps {
  userId:    string;
  status:    UserStatus;
  position?: number;
  onHover:   (info: TooltipInfo | null) => void;
}

const UserDot = memo(function UserDot({ userId, status, position, onHover }: DotProps) {
  const label = (() => {
    const short = userId.replace('demo_', '');
    switch (status) {
      case 'queued':   return `${short}: QUEUED${position != null ? ` (pos: ${position})` : ''}`;
      case 'won':      return `${short}: WON`;
      case 'sold_out': return `${short}: SOLD OUT`;
      case 'joining':  return `${short}: joining…`;
      case 'error':    return `${short}: ERROR`;
      default:         return `${short}: idle`;
    }
  })();

  return (
    <div
      style={{
        width:           12,
        height:          12,
        borderRadius:    '50%',
        flexShrink:      0,
        cursor:          'default',
        backgroundColor: DOT_COLOR[status],
        transition:      'background-color 400ms ease',
        animation:       status === 'joining' ? 'stat-pulse 0.9s ease-in-out infinite' : undefined,
      }}
      onMouseEnter={e => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onHover({ text: label, x: r.left + r.width / 2, y: r.top });
      }}
      onMouseLeave={() => onHover(null)}
    />
  );
});

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DemoPage() {
  // Config
  const [apiUrl,         setApiUrl]        = useState(process.env.NEXT_PUBLIC_API_URL ?? '');
  const [publicKey,      setPublicKey]      = useState('');
  const [numUsers,       setNumUsers]       = useState(50);
  const [rampUpSecs,     setRampUpSecs]     = useState(10);
  const [pollIntervalMs, setPollIntervalMs] = useState(2000);

  const [freeTierOpen, setFreeTierOpen] = useState(false);

  // Display state — driven entirely by the 200ms tick
  const [running,    setRunning]    = useState(false);
  const [elapsed,    setElapsed]    = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [stats,      setStats]      = useState<Stats>({ ...INITIAL_STATS });
  const [dotStates,  setDotStates]  = useState<DotState[]>([]);
  const [log,        setLog]        = useState<LogEntry[]>([]);
  const [tooltip,    setTooltip]    = useState<TooltipInfo | null>(null);
  const [eventInfo,  setEventInfo]  = useState<EventInfo | null>(null);
  const [eventError, setEventError] = useState<string | null>(null);

  // Simulation refs — mutated in place, never trigger re-renders
  const statsRef      = useRef<Stats>({ ...INITIAL_STATS });
  const userStatesRef = useRef<Map<string, UserState>>(new Map());
  const userOrderRef  = useRef<string[]>([]);
  const joinTs        = useRef<number[]>([]);
  const winTs         = useRef<number[]>([]);
  const joinTimers    = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pollTimers    = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const updateTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef  = useRef<number>(0);
  const joinInFlight  = useRef(0);
  const isRunningRef  = useRef(false);

  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log.length]);

  // Clear tooltip on scroll (viewport coords go stale)
  useEffect(() => {
    const hide = () => setTooltip(null);
    window.addEventListener('scroll', hide, { passive: true });
    return () => window.removeEventListener('scroll', hide);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const t of joinTimers.current) clearTimeout(t);
      for (const t of pollTimers.current.values()) clearTimeout(t);
      if (updateTimer.current) clearInterval(updateTimer.current);
    };
  }, []);

  // ── 200ms batch tick ──────────────────────────────────────────────────────
  // Reads all mutable refs once and calls setState once — no per-event renders.

  const startTick = useCallback(() => {
    updateTimer.current = setInterval(() => {
      const now = Date.now();

      joinTs.current = joinTs.current.filter(t => now - t < 5_000);
      winTs.current  = winTs.current.filter(t => now - t < 5_000);

      const joinRate = joinTs.current.filter(t => now - t < 3_000).length / 3;
      const winRate  = winTs.current.filter(t => now - t < 3_000).length / 3;

      setStats({ ...statsRef.current, joinRate, winRate });
      setElapsed(Math.floor((now - startTimeRef.current) / 1000));

      // Rebuild dot array from ref (memo stops individual dots re-rendering
      // if their status/position didn't change)
      const dots: DotState[] = userOrderRef.current.map(id => {
        const u = userStatesRef.current.get(id);
        return u ? { id, status: u.status, position: u.position } : { id, status: 'idle' };
      });
      setDotStates(dots);
    }, 200);
  }, []);

  // ── Log helper (called infrequently — once per HTTP response) ─────────────

  const pushLog = useCallback((userId: string, status: LogStatus, detail: string) => {
    const entry: LogEntry = { id: ++logSeq, ts: nowTs(), userId, status, detail };
    setLog(prev => {
      const next = [...prev, entry];
      return next.length > 200 ? next.slice(next.length - 200) : next;
    });
  }, []);

  // ── Stop ──────────────────────────────────────────────────────────────────

  const stopSimulation = useCallback(() => {
    isRunningRef.current = false;

    for (const t of joinTimers.current) clearTimeout(t);
    joinTimers.current = [];

    pollTimers.current.forEach(t => clearTimeout(t));
    pollTimers.current.clear();

    if (updateTimer.current) {
      clearInterval(updateTimer.current);
      updateTimer.current = null;
    }

    setRunning(false);
  }, []);

  // ── Reset ─────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    stopSimulation();
    userStatesRef.current = new Map();
    userOrderRef.current  = [];
    statsRef.current      = { ...INITIAL_STATS };
    joinTs.current        = [];
    winTs.current         = [];
    joinInFlight.current  = 0;
    setStats({ ...INITIAL_STATS });
    setTotalUsers(0);
    setElapsed(0);
    setLog([]);
    setDotStates([]);
    setTooltip(null);
    setEventInfo(null);
    setEventError(null);
  }, [stopSimulation]);

  // ── Polling (setTimeout-based, self-rescheduling) ─────────────────────────

  const startPolling = useCallback((userId: string, pk: string, baseUrl: string, interval: number) => {
    const jitter = () => Math.floor(Math.random() * 600) - 300; // ±300ms

    const poll = async () => {
      if (!isRunningRef.current) return;

      const user = userStatesRef.current.get(userId);
      if (!user || user.status !== 'queued') return;

      try {
        const res  = await fetch(`${baseUrl}/api/queue/status?pk=${encodeURIComponent(pk)}&userId=${encodeURIComponent(userId)}`, {
          headers: { 'x-demo-bypass': 'true' },
        });
        const data = await res.json() as Record<string, unknown>;

        // Re-check after await in case state changed while fetching
        const current = userStatesRef.current.get(userId);
        if (!current || current.status !== 'queued') return;

        const result = (data.result ?? data.status) as string | undefined;

        if (result === 'WON') {
          userStatesRef.current.set(userId, { ...current, status: 'won', token: data.token as string });
          statsRef.current.queued = Math.max(0, statsRef.current.queued - 1);
          statsRef.current.won++;
          winTs.current.push(Date.now());
          pushLog(userId, 'WON', `token: ${String(data.token ?? '').slice(0, 20)}`);
          pollTimers.current.delete(userId);
          return; // stop polling
        }

        if (result === 'SOLD_OUT') {
          userStatesRef.current.set(userId, { ...current, status: 'sold_out' });
          statsRef.current.queued        = Math.max(0, statsRef.current.queued - 1);
          statsRef.current.drainRejected++;
          pushLog(userId, 'SOLD_OUT', 'drain rejected');
          pollTimers.current.delete(userId);
          return; // stop polling
        }

        if (result === 'QUEUED') {
          const pos = (data.position ?? data.queuePosition) as number | undefined;
          if (pos !== current.position) {
            userStatesRef.current.set(userId, { ...current, position: pos });
          }
        }
      } catch {
        // network error — keep polling
      }

      const timerId = setTimeout(poll, interval + jitter());
      pollTimers.current.set(userId, timerId);
    };

    // Start first poll after one interval
    const timerId = setTimeout(poll, interval + jitter());
    pollTimers.current.set(userId, timerId);
  }, [pushLog]);

  // ── Join ──────────────────────────────────────────────────────────────────

  const joinUser = useCallback(async (userId: string, pk: string, baseUrl: string, interval: number) => {
    while (joinInFlight.current >= 10) await sleep(50);
    if (!isRunningRef.current) return;

    joinInFlight.current++;
    userStatesRef.current.set(userId, { id: userId, status: 'joining' });
    statsRef.current.joining++;
    joinTs.current.push(Date.now());

    try {
      const res  = await fetch(`${baseUrl}/api/queue/join`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'x-demo-bypass': 'true',
        },
        body:    JSON.stringify({ publicKey: pk, userId }),
      });
      const data = await res.json() as Record<string, unknown>;

      statsRef.current.joining = Math.max(0, statsRef.current.joining - 1);
      const result = (data.result ?? data.status) as string | undefined;

      if (result === 'WON') {
        userStatesRef.current.set(userId, { id: userId, status: 'won', token: data.token as string });
        statsRef.current.won++;
        winTs.current.push(Date.now());
        pushLog(userId, 'WON', `token: ${String(data.token ?? '').slice(0, 20)}`);

      } else if (result === 'QUEUED') {
        const pos  = (data.position ?? data.queuePosition) as number | undefined;
        const wait = (data.estimatedWait ?? data.waitSeconds) as number | undefined;
        userStatesRef.current.set(userId, { id: userId, status: 'queued', position: pos });
        statsRef.current.queued++;
        pushLog(userId, 'QUEUED', `position: ${pos ?? '?'}${wait ? `, ~${wait}s wait` : ''}`);
        startPolling(userId, pk, baseUrl, interval);

      } else if (result === 'SOLD_OUT') {
        // queueCap was hit — user never entered the queue
        userStatesRef.current.set(userId, { id: userId, status: 'sold_out' });
        statsRef.current.doorClosed++;
        pushLog(userId, 'SOLD_OUT', 'door closed');

      } else if (result === 'ALREADY_JOINED') {
        userStatesRef.current.set(userId, { id: userId, status: 'queued' });
        statsRef.current.queued++;
        pushLog(userId, 'QUEUED', 'already joined, polling');
        startPolling(userId, pk, baseUrl, interval);

      } else {
        throw new Error(`Unexpected: ${JSON.stringify(data).slice(0, 80)}`);
      }

    } catch (err) {
      statsRef.current.joining = Math.max(0, statsRef.current.joining - 1);
      statsRef.current.errors++;
      userStatesRef.current.set(userId, { id: userId, status: 'error' });
      const msg = err instanceof Error ? err.message : 'Unknown error';
      pushLog(userId, 'ERROR', msg.slice(0, 80));
    } finally {
      joinInFlight.current--;
    }
  }, [pushLog, startPolling]);

  // ── Start ─────────────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    if (!apiUrl || !publicKey) return;

    setEventError(null);

    // Verify event is active and capture config before starting
    try {
      const infoRes  = await fetch(`${apiUrl}/api/queue/info?pk=${encodeURIComponent(publicKey)}`, {
        headers: { 'x-demo-bypass': 'true' },
      });
      const infoData = await infoRes.json() as Record<string, unknown>;

      if (infoData.status !== 'ACTIVE') {
        setEventError(
          `Event is not ACTIVE. Current status: ${String(infoData.status ?? 'unknown')}. Activate it in the dashboard first.`
        );
        return;
      }

      setEventInfo({
        stock:     infoData.stock     as number,
        rateLimit: infoData.rateLimit as number,
        queueCap:  infoData.queueCap  as number,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setEventError(`Failed to fetch event info: ${msg}. Check your API URL and public key.`);
      return;
    }

    const snap = { apiUrl, publicKey, numUsers, rampUpSecs, pollIntervalMs };

    // Clear any previous run
    for (const t of joinTimers.current) clearTimeout(t);
    joinTimers.current = [];
    pollTimers.current.forEach(t => clearTimeout(t));
    pollTimers.current.clear();
    if (updateTimer.current) clearInterval(updateTimer.current);

    const userIds = Array.from({ length: snap.numUsers }, (_, i) => `demo_user_${padId(i + 1)}`);

    userStatesRef.current = new Map();
    userOrderRef.current  = userIds;
    statsRef.current      = { ...INITIAL_STATS };
    joinTs.current        = [];
    winTs.current         = [];
    joinInFlight.current  = 0;
    isRunningRef.current  = true;
    startTimeRef.current  = Date.now();

    setStats({ ...INITIAL_STATS });
    setTotalUsers(snap.numUsers);
    setElapsed(0);
    setLog([]);
    setDotStates(userIds.map(id => ({ id, status: 'idle' as UserStatus })));
    setTooltip(null);
    setRunning(true);

    startTick();

    const rampMs = snap.rampUpSecs * 1_000;
    userIds.forEach((userId, i) => {
      const delay = (i / snap.numUsers) * rampMs;
      const timer = setTimeout(() => {
        joinUser(userId, snap.publicKey, snap.apiUrl, snap.pollIntervalMs);
      }, delay);
      joinTimers.current.push(timer);
    });
  }, [apiUrl, publicKey, numUsers, rampUpSecs, pollIntervalMs, joinUser, startTick]);

  // ── Derived display ───────────────────────────────────────────────────────

  const resolved         = stats.won + stats.drainRejected + stats.doorClosed;
  const wonPct           = totalUsers > 0 ? (stats.won           / totalUsers) * 100 : 0;
  const drainRejectedPct = totalUsers > 0 ? (stats.drainRejected / totalUsers) * 100 : 0;
  const doorClosedPct    = totalUsers > 0 ? (stats.doorClosed    / totalUsers) * 100 : 0;

  const handleDotHover = useCallback((info: TooltipInfo | null) => setTooltip(info), []);

  const statItems: StatItem[] = [
    { label: 'Total',          value: totalUsers },
    { label: 'Joining',        value: stats.joining },
    { label: 'In Queue Now',   value: stats.queued,        color: 'text-yellow-400' },
    { label: 'Won',            value: stats.won,           color: 'text-accent' },
    { label: 'Drain Rejected', value: stats.drainRejected, color: 'text-red-600' },
    { label: 'Door Closed',    value: stats.doorClosed,    color: 'text-red-400' },
    { label: 'Errors',         value: stats.errors,        color: stats.errors > 0 ? 'text-yellow-400' : undefined },
    { label: 'Queue Cap',      value: eventInfo?.queueCap ?? '—' },
    { label: 'Join/s',         value: stats.joinRate.toFixed(1) },
    { label: 'Win/s',          value: stats.winRate.toFixed(1), color: 'text-accent' },
    { label: 'Time',           value: formatElapsed(elapsed) },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-surface-base px-4 py-8 animate-page-in">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Floating tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none fixed z-50 rounded border border-border bg-surface-overlay px-2 py-1 font-mono text-xs text-text-primary shadow-lg"
            style={{
              left:      tooltip.x,
              top:       tooltip.y - 8,
              transform: 'translateX(-50%) translateY(-100%)',
            }}
          >
            {tooltip.text}
          </div>
        )}

        {/* CORS notice */}
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-xs text-yellow-400">
          Make sure your engine has CORS configured for this domain — otherwise browser requests will be blocked.
        </div>

        {/* ── Config panel ─────────────────────────────────────────────────── */}
        <Card
          header={
            <div className="flex items-center gap-3">
              <Zap size={20} className="text-accent" />
              <h1 className="text-lg font-semibold text-text-primary">FlashEngine Demo Simulator</h1>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Free tier limits — collapsible */}
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5">
              <button
                type="button"
                onClick={() => setFreeTierOpen(o => !o)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-xs text-amber-400 transition-colors hover:bg-amber-500/5"
              >
                <AlertTriangle size={13} className="shrink-0" />
                <span className="font-medium">Free Tier Limits</span>
                <ChevronDown
                  size={13}
                  className="ml-auto shrink-0 transition-transform duration-200"
                  style={{ transform: freeTierOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>
              {freeTierOpen && (
                <div className="space-y-2 border-t border-amber-500/20 px-4 pb-4 pt-3 text-xs text-amber-300/80">
                  <p>
                    Upstash free tier allows 10,000 Redis commands/day. Each simulated user costs ~15–20
                    commands (join + polls + drain processing). Budget guide:
                  </p>
                  <ul className="space-y-1 font-mono text-amber-400/70">
                    <li>50 users ≈ 1,000 commands — safe, run 8–10 times per day</li>
                    <li>100 users ≈ 2,000 commands — moderate, run 4–5 times</li>
                    <li>200 users ≈ 4,000 commands — heavy, run 2 times</li>
                    <li>500 users ≈ 10,000 commands — one run, then done for the day</li>
                  </ul>
                  <p>
                    For interview demos, use 50–100 users. That&apos;s visually impressive enough and leaves
                    room for multiple runs.
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="API URL"
                value={apiUrl}
                onChange={e => setApiUrl(e.target.value)}
                placeholder="https://your-engine.example.com"
                disabled={running}
              />
              <Input
                label="Event Public Key"
                value={publicKey}
                onChange={e => setPublicKey(e.target.value)}
                placeholder="Paste from your dashboard"
                disabled={running}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Input
                label="Number of Users"
                type="number"
                min={5}
                max={500}
                value={numUsers}
                onChange={e => setNumUsers(Math.min(500, Math.max(5, Number(e.target.value))))}
                disabled={running}
              />
              <Input
                label="Ramp-up Duration (s)"
                type="number"
                min={1}
                max={60}
                value={rampUpSecs}
                onChange={e => setRampUpSecs(Math.min(60, Math.max(1, Number(e.target.value))))}
                disabled={running}
              />
              <Input
                label="Poll Interval (ms)"
                type="number"
                min={500}
                max={10000}
                step={100}
                value={pollIntervalMs}
                onChange={e => setPollIntervalMs(Math.min(10000, Math.max(500, Number(e.target.value))))}
                disabled={running}
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              {running ? (
                <Button size="lg" variant="danger" onClick={stopSimulation}>
                  Stop
                </Button>
              ) : (
                <Button
                  size="lg"
                  onClick={start}
                  disabled={!apiUrl.trim() || !publicKey.trim()}
                  className="gap-2"
                >
                  <Zap size={16} />
                  Start Simulation
                </Button>
              )}
              <Button size="lg" variant="ghost" onClick={reset}>
                Reset
              </Button>
            </div>

            {/* Event status feedback */}
            {eventError && (
              <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {eventError}
              </p>
            )}
            {eventInfo && (
              <p className="text-xs text-text-tertiary">
                Event:{' '}
                <span className="font-mono text-text-secondary">{eventInfo.stock}</span> items in stock
                {' · '}
                <span className="font-mono text-text-secondary">{eventInfo.rateLimit}</span>/s rate limit
                {' · '}
                Queue cap:{' '}
                <span className="font-mono text-text-secondary">{eventInfo.queueCap}</span> users
              </p>
            )}
          </div>
        </Card>

        {/* ── Stats row (11 cards) ──────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-11">
          {statItems.map(item => (
            <div
              key={item.label}
              className="rounded-lg border border-border-subtle bg-surface-raised p-3"
            >
              <p className="text-xs text-text-tertiary">{item.label}</p>
              <p className={`mt-1 font-mono text-lg font-semibold tabular-nums ${item.color ?? 'text-text-primary'}`}>
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Progress bar ──────────────────────────────────────────────────── */}
        {totalUsers > 0 && (
          <div>
            <div className="relative h-6 w-full overflow-hidden rounded-full bg-surface-overlay">
              <div
                className="absolute left-0 top-0 h-full bg-accent"
                style={{ width: `${wonPct}%`, transition: 'width 300ms ease' }}
              />
              {/* Dark red = drain rejected (was queued, stock ran out) */}
              <div
                className="absolute top-0 h-full bg-red-700"
                style={{ left: `${wonPct}%`, width: `${drainRejectedPct}%`, transition: 'left 300ms ease, width 300ms ease' }}
              />
              {/* Lighter red = door closed (hit queueCap, never entered) */}
              <div
                className="absolute top-0 h-full bg-red-500"
                style={{ left: `${wonPct + drainRejectedPct}%`, width: `${doorClosedPct}%`, transition: 'left 300ms ease, width 300ms ease' }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-semibold text-text-primary drop-shadow">
                  {resolved} / {totalUsers} resolved
                </span>
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs text-text-tertiary">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-accent" />
                {stats.won} won
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-red-700" />
                {stats.drainRejected} drain rejected
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                {stats.doorClosed} door closed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" />
                {stats.queued} queued
              </span>
              {!running && (
                <span className="ml-auto text-text-tertiary">
                  Estimated Redis commands used: ~{Math.ceil(totalUsers * 17).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── User grid ─────────────────────────────────────────────────────── */}
        {dotStates.length > 0 && (
          <Card
            header={
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-text-primary">User Grid</h2>
                <div className="flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
                  {LEGEND.map(({ color, label }) => (
                    <span key={label} className="flex items-center gap-1">
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            }
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {dotStates.map(dot => (
                <UserDot
                  key={dot.id}
                  userId={dot.id}
                  status={dot.status}
                  position={dot.position}
                  onHover={handleDotHover}
                />
              ))}
            </div>
          </Card>
        )}

        {/* ── Activity log ──────────────────────────────────────────────────── */}
        <Card
          header={
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-text-primary">User Activity Log</h2>
              <span className="text-xs text-text-tertiary">
                {log.length > 0 ? `${log.length} entries` : 'waiting for activity'}
              </span>
            </div>
          }
          padding={false}
        >
          <div className="max-h-[400px] overflow-y-auto p-4">
            {log.length === 0 ? (
              <p className="py-8 text-center font-mono text-xs text-text-tertiary">
                No activity yet — start the simulation to see log entries.
              </p>
            ) : (
              <div className="space-y-0.5 font-mono text-xs">
                {log.map(entry => (
                  <div key={entry.id} className="flex min-w-0 gap-2 leading-5">
                    <span className="shrink-0 text-text-tertiary">[{entry.ts}]</span>
                    <span className="shrink-0 text-text-secondary">User {entry.userId}:</span>
                    <span className={
                      entry.status === 'WON'      ? 'shrink-0 font-medium text-accent' :
                      entry.status === 'QUEUED'   ? 'shrink-0 text-blue-400'           :
                      entry.status === 'SOLD_OUT' ? 'shrink-0 text-red-400'            :
                                                    'shrink-0 text-yellow-400'
                    }>
                      {entry.status}
                    </span>
                    {entry.detail && (
                      <span className="truncate text-text-tertiary">({entry.detail})</span>
                    )}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            )}
          </div>
        </Card>

        {/* ── Footer (visible while running) ────────────────────────────────── */}
        {running && publicKey && (
          <p className="pb-2 text-center text-xs text-text-tertiary">
            FlashEngine Demo — simulating{' '}
            <span className="font-mono text-text-secondary">{totalUsers}</span>{' '}
            concurrent users against{' '}
            <span className="font-mono text-text-secondary">{publicKey.slice(0, 8)}…</span>
          </p>
        )}

      </div>
    </div>
  );
}
