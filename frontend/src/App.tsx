import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';

type StreamItem = {
  id: number;
  value: string;
  status: 'active' | 'seen';
};

type SimulationStatus = 'Idle' | 'Running' | 'Paused' | 'Completed' | 'Stopped';

type ReservoirItem = {
  slot: number;
  value: string;
  state: 'filled' | 'empty';
  highlight?: SlotHighlight;
};

type SlotHighlight = 'accepted' | 'replaced';

type Stat = {
  label: string;
  value: string;
};

type CurrentItem = {
  index: number;
  value: string;
  decision: string;
  decisionKind: 'received' | 'accepted' | 'replaced' | 'rejected';
};

type EventItem = {
  id: number;
  label: string;
  detail: string;
  kind: 'info' | 'accepted' | 'replaced' | 'rejected';
};

type UploadResult = {
  uploadId: string;
  fileName: string;
  fileSize: number;
};

type UploadMessage = {
  type: 'success' | 'error';
  text: string;
};

type SocketConnectionStatus = 'Connecting' | 'Connected' | 'Disconnected';

type ServerReadyPayload = {
  message: string;
  socketId: string;
};

type SimulationPayload = {
  item?: string;
  processedCount?: number;
  reservoir?: string[];
  reservoirIndex?: number;
  replacedItem?: string;
  k?: number;
  speed?: number;
};

const simulationSocketEvents = [
  'SIMULATION_STARTED',
  'ITEM_RECEIVED',
  'ITEM_ACCEPTED',
  'ITEM_REPLACED',
  'ITEM_REJECTED',
  'SIMULATION_COMPLETED',
  'SIMULATION_PAUSED',
  'SIMULATION_RESUMED',
  'SIMULATION_STOPPED',
  'SIMULATION_RESET'
] as const;

const speedOptions = [0.5, 1, 2, 4, 8] as const;
const defaultSpeed = 4;
const defaultK = 10;
const minK = 1;
const maxK = 1000;
const slotHighlightDurationMs = 700;

const simulationStatusClasses: Record<SimulationStatus, string> = {
  Idle: 'bg-slate-100 text-slate-600 ring-slate-200',
  Running: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Paused: 'bg-amber-50 text-amber-700 ring-amber-200',
  Completed: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  Stopped: 'bg-rose-50 text-rose-700 ring-rose-200'
};

const eventKindClasses: Record<EventItem['kind'], string> = {
  info: 'bg-slate-50 text-slate-600 ring-slate-200',
  accepted: 'bg-mint-50 text-emerald-700 ring-mint-200',
  replaced: 'bg-honey-50 text-amber-700 ring-honey-200',
  rejected: 'bg-slate-100 text-slate-500 ring-slate-200'
};

const decisionKindClasses: Record<CurrentItem['decisionKind'], string> = {
  received: 'text-slate-500',
  accepted: 'text-emerald-700',
  replaced: 'text-amber-700',
  rejected: 'text-slate-500'
};

const displayLabelMaxLength = 28;
const movieLensRecordPattern = /^(\d+)%\s*(.+)$/;

function getDisplayLabel(rawItem: string): string {
  if (!rawItem) {
    return '';
  }

  const normalized = rawItem.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return '';
  }

  const movieLensMatch = normalized.match(movieLensRecordPattern);
  const candidate = movieLensMatch ? movieLensMatch[2].trim() : normalized;

  if (candidate.length <= displayLabelMaxLength) {
    return candidate;
  }

  return `${candidate.slice(0, displayLabelMaxLength - 3).trimEnd()}...`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

async function parseUploadResponse(response: Response) {
  const responseText = await response.text();

  if (!responseText) {
    return {};
  }

  try {
    return JSON.parse(responseText) as Partial<UploadResult> & {
      error?: string;
    };
  } catch {
    return {
      error: response.ok
        ? 'Upload response was not valid JSON.'
        : 'Upload failed. Make sure the backend is running on http://localhost:3001.'
    };
  }
}

function Card({
  children,
  className = ''
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-card ${className}`}
    >
      {children}
    </section>
  );
}

function PanelHeader({
  title,
  subtitle,
  accent
}: {
  title: string;
  subtitle?: string;
  accent?: string;
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        ) : null}
      </div>
      {accent ? (
        <span
          className="mt-1 inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: accent }}
          aria-hidden
        />
      ) : null}
    </header>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  tone = 'primary'
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'neutral' | 'danger';
}) {
  const tones: Record<'primary' | 'neutral' | 'danger', string> = {
    primary:
      'bg-slate-800 text-white hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400',
    neutral:
      'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-white',
    danger:
      'bg-white text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50 disabled:text-slate-300 disabled:ring-slate-200 disabled:hover:bg-white'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-10 rounded-xl px-4 text-sm font-medium transition-all duration-150 ${tones[tone]} ${disabled ? 'cursor-not-allowed' : 'shadow-sm hover:shadow'}`}
    >
      {children}
    </button>
  );
}

function ControlBar({
  selectedFile,
  uploadMessage,
  isUploading,
  uploadedFileName,
  socketStatus,
  simulationStatus,
  kInput,
  kEditable,
  speed,
  canStart,
  canPause,
  canResume,
  canReset,
  onFileChange,
  onUpload,
  onKChange,
  onSpeedChange,
  onStart,
  onPause,
  onResume,
  onReset
}: {
  selectedFile: File | null;
  uploadMessage: UploadMessage | null;
  isUploading: boolean;
  uploadedFileName: string | null;
  socketStatus: SocketConnectionStatus;
  simulationStatus: SimulationStatus;
  kInput: number;
  kEditable: boolean;
  speed: number;
  canStart: boolean;
  canPause: boolean;
  canResume: boolean;
  canReset: boolean;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onUpload: () => void;
  onKChange: (value: number) => void;
  onSpeedChange: (value: number) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
}) {
  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-sm font-medium text-slate-700">
          <span>Dataset file</span>
          <input
            type="file"
            accept=".csv,.dat"
            onChange={onFileChange}
            className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:border-slate-300 focus-within:border-slate-400 focus-within:outline-none"
          />
        </label>

        <PrimaryButton
          tone="neutral"
          onClick={onUpload}
          disabled={!selectedFile || isUploading}
        >
          {isUploading ? 'Uploading…' : 'Upload'}
        </PrimaryButton>

        <label className="flex w-28 flex-col gap-1.5 text-sm font-medium text-slate-700">
          <span>Reservoir size K</span>
          <input
            type="number"
            min={minK}
            max={maxK}
            value={kInput}
            disabled={!kEditable}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) {
                onKChange(Math.min(maxK, Math.max(minK, Math.floor(next))));
              }
            }}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-colors hover:border-slate-300 focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          />
        </label>

        <label className="flex w-32 flex-col gap-1.5 text-sm font-medium text-slate-700">
          <span>Speed</span>
          <select
            value={speed}
            onChange={(event) => onSpeedChange(Number(event.target.value))}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-colors hover:border-slate-300 focus:border-slate-400"
          >
            {speedOptions.map((option) => (
              <option key={option} value={option}>
                {option}× / sec
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          <span>Simulation</span>
          <span
            className={`inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold ring-1 ring-inset ${simulationStatusClasses[simulationStatus]}`}
          >
            {simulationStatus}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PrimaryButton tone="primary" onClick={onStart} disabled={!canStart}>
          Start
        </PrimaryButton>
        <PrimaryButton tone="neutral" onClick={onPause} disabled={!canPause}>
          Pause
        </PrimaryButton>
        <PrimaryButton tone="neutral" onClick={onResume} disabled={!canResume}>
          Resume
        </PrimaryButton>
        <PrimaryButton tone="danger" onClick={onReset} disabled={!canReset}>
          Reset
        </PrimaryButton>

        <div className="ml-auto flex items-center gap-3 text-sm text-slate-500">
          {uploadedFileName ? (
            <span>
              Active dataset:{' '}
              <span className="font-medium text-slate-700">{uploadedFileName}</span>
            </span>
          ) : (
            <span>Active dataset: sample.csv</span>
          )}
          <span aria-hidden className="text-slate-300">
            ·
          </span>
          <span>
            Socket: <span className="font-medium text-slate-700">{socketStatus}</span>
          </span>
        </div>
      </div>

      {uploadMessage ? (
        <p
          className={`rounded-xl px-3 py-2 text-sm ring-1 ring-inset ${
            uploadMessage.type === 'success'
              ? 'bg-mint-50 text-emerald-700 ring-mint-200'
              : 'bg-rose-50 text-rose-700 ring-rose-200'
          }`}
        >
          {uploadMessage.text}
        </p>
      ) : null}
    </Card>
  );
}

function IncomingStreamPanel({ items }: { items: StreamItem[] }) {
  return (
    <Card>
      <PanelHeader
        title="Incoming Stream"
        subtitle="Most recent items received from the source."
        accent="#5FA8A6"
      />
      {items.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {items.map((item) => (
            <div
              key={item.id}
              className={`grid aspect-square place-items-center rounded-xl px-2 text-center text-sm font-semibold transition-all duration-300 ${
                item.status === 'active'
                  ? 'bg-stream/15 text-stream-dark ring-1 ring-inset ring-stream/40 scale-[1.04]'
                  : 'bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-200'
              }`}
            >
              <span className="line-clamp-3 break-all">{item.value || '—'}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Waiting for the simulation to start.
        </p>
      )}
    </Card>
  );
}

function CurrentItemPanel({ item }: { item: CurrentItem | null }) {
  const displayLabel = item ? getDisplayLabel(item.value) : '';

  return (
    <Card>
      <PanelHeader title="Current Item" subtitle="The item being processed right now." />
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-6">
        {item ? (
          <div key={item.index} className="animate-fade-in">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Item #{item.index}
            </p>
            <p
              title={item.value || undefined}
              className="mt-3 text-center text-2xl font-semibold leading-[1.3] text-slate-800 break-words [overflow-wrap:anywhere]"
            >
              {displayLabel || '—'}
            </p>
            <p
              className={`mt-4 text-center text-sm font-medium ${decisionKindClasses[item.decisionKind]}`}
            >
              {item.decision}
            </p>
            {item.value ? (
              <details className="mt-5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                <summary className="cursor-pointer select-none font-medium text-slate-600">
                  Raw record
                </summary>
                <p className="mt-2 break-words font-mono text-[11px] leading-relaxed text-slate-600 [overflow-wrap:anywhere]">
                  {item.value}
                </p>
              </details>
            ) : null}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-slate-500">
            Press Start to begin the simulation.
          </p>
        )}
      </div>
    </Card>
  );
}

function ReservoirPanel({
  items,
  targetK
}: {
  items: ReservoirItem[];
  targetK: number;
}) {
  const filledCount = items.filter((item) => item.state === 'filled').length;

  return (
    <Card className="h-full">
      <PanelHeader
        title="Reservoir"
        subtitle={`${filledCount} of ${targetK} slots filled`}
      />
      <div className="max-h-[640px] overflow-y-auto pr-1">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          {items.map((item) => {
            const highlightClasses =
              item.highlight === 'accepted'
                ? 'ring-2 ring-mint-300 bg-mint-50 scale-[1.03]'
                : item.highlight === 'replaced'
                ? 'ring-2 ring-honey-300 bg-honey-50 scale-[1.03]'
                : item.state === 'filled'
                ? 'ring-1 ring-reservoir/40 bg-reservoir/10'
                : 'ring-1 ring-slate-200 bg-slate-50';

            const displayLabel = item.value ? getDisplayLabel(item.value) : '';

            return (
              <div
                key={item.slot}
                title={item.value || undefined}
                className={`relative flex h-28 flex-col overflow-hidden rounded-xl px-3 py-2 ring-inset transition-all duration-300 ${highlightClasses}`}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  #{item.slot}
                </span>
                <span className="flex flex-1 items-center justify-center px-1 text-center text-sm font-semibold leading-[1.3] text-slate-800 break-words [overflow-wrap:anywhere]">
                  {displayLabel || '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function EventLogPanel({ events }: { events: EventItem[] }) {
  return (
    <Card>
      <PanelHeader title="Event Log" subtitle="Recent simulation events." />
      {events.length > 0 ? (
        <ul className="grid max-h-[320px] gap-2 overflow-y-auto pr-1">
          {events.map((event) => (
            <li
              key={event.id}
              className={`rounded-xl px-3 py-2 text-sm ring-1 ring-inset ${eventKindClasses[event.kind]}`}
            >
              <p className="font-medium">{event.label}</p>
              <p className="break-all text-xs opacity-80">{event.detail}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">
          Events will appear here once the simulation starts.
        </p>
      )}
    </Card>
  );
}

function StatisticsPanel({ stats }: { stats: Stat[] }) {
  return (
    <Card>
      <PanelHeader title="Statistics" subtitle="Live counters for the run." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {stat.label}
            </p>
            <p className="mt-2 break-all text-2xl font-semibold text-slate-800">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadMessage, setUploadMessage] = useState<UploadMessage | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const [socketStatus, setSocketStatus] =
    useState<SocketConnectionStatus>('Connecting');
  const [simulationStatus, setSimulationStatus] =
    useState<SimulationStatus>('Idle');

  const [targetK, setTargetK] = useState(defaultK);
  const [speed, setSpeed] = useState<number>(defaultSpeed);

  const [incomingStream, setIncomingStream] = useState<StreamItem[]>([]);
  const [reservoir, setReservoir] = useState<string[]>([]);
  const [processedCount, setProcessedCount] = useState(0);
  const [currentItem, setCurrentItem] = useState<CurrentItem | null>(null);
  const [eventLog, setEventLog] = useState<EventItem[]>([]);
  const [slotHighlights, setSlotHighlights] = useState<Map<number, SlotHighlight>>(
    () => new Map()
  );

  const socketRef = useRef<Socket | null>(null);
  const highlightTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const kEditable =
    simulationStatus === 'Idle' ||
    simulationStatus === 'Completed' ||
    simulationStatus === 'Stopped';
  const canStart = kEditable && socketStatus === 'Connected';
  const canPause = simulationStatus === 'Running';
  const canResume = simulationStatus === 'Paused';
  const canReset = simulationStatus !== 'Idle';

  const reservoirItems: ReservoirItem[] = useMemo(
    () =>
      Array.from(
        { length: Math.max(targetK, reservoir.length) },
        (_, index) => ({
          slot: index + 1,
          value: reservoir[index] ?? '',
          state: reservoir[index] !== undefined ? 'filled' : 'empty',
          highlight: slotHighlights.get(index)
        })
      ),
    [targetK, reservoir, slotHighlights]
  );

  const stats: Stat[] = [
    { label: 'Processed Items', value: processedCount.toLocaleString() },
    {
      label: 'Reservoir Size',
      value: `${reservoir.length} / ${targetK}`
    },
    {
      label: 'Current Item',
      value: currentItem ? `#${currentItem.index}` : '—'
    },
    { label: 'Simulation Status', value: simulationStatus }
  ];

  const flashSlot = (slotIndex: number, kind: SlotHighlight) => {
    setSlotHighlights((previous) => {
      const next = new Map(previous);
      next.set(slotIndex, kind);
      return next;
    });

    const timers = highlightTimers.current;
    const existing = timers.get(slotIndex);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      setSlotHighlights((previous) => {
        if (!previous.has(slotIndex)) {
          return previous;
        }
        const next = new Map(previous);
        next.delete(slotIndex);
        return next;
      });
      timers.delete(slotIndex);
    }, slotHighlightDurationMs);
    timers.set(slotIndex, timer);
  };

  const clearHighlights = () => {
    for (const timer of highlightTimers.current.values()) {
      clearTimeout(timer);
    }
    highlightTimers.current.clear();
    setSlotHighlights(new Map());
  };

  const addEventLogEntry = (
    label: string,
    detail: string,
    kind: EventItem['kind'] = 'info'
  ) => {
    setEventLog((previousEvents) =>
      [
        {
          id: Date.now() + Math.random(),
          label,
          detail,
          kind
        },
        ...previousEvents
      ].slice(0, 20)
    );
  };

  const syncReservoirState = (event: SimulationPayload) => {
    if (event.reservoir) {
      setReservoir(event.reservoir);
    }

    if (event.processedCount !== undefined) {
      setProcessedCount(event.processedCount);
    }
  };

  const resetLocalState = () => {
    setIncomingStream([]);
    setReservoir([]);
    setProcessedCount(0);
    setCurrentItem(null);
    setEventLog([]);
    clearHighlights();
  };

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketStatus('Connected');
    });

    socket.on('disconnect', () => {
      setSocketStatus('Disconnected');
    });

    socket.on('connect_error', () => {
      setSocketStatus('Disconnected');
    });

    socket.on('SERVER_READY', (event: ServerReadyPayload) => {
      console.log('SERVER_READY', event);
    });

    socket.on('SIMULATION_STARTED', (event: SimulationPayload) => {
      setSimulationStatus('Running');
      if (event.k !== undefined) {
        setTargetK(event.k);
      }
      setIncomingStream([]);
      setReservoir(event.reservoir ?? []);
      setProcessedCount(event.processedCount ?? 0);
      setCurrentItem(null);
      setEventLog([]);
      clearHighlights();
      addEventLogEntry(
        'Simulation started',
        `K = ${event.k ?? defaultK} · ${event.speed ?? defaultSpeed}× / sec`,
        'info'
      );
    });

    socket.on('ITEM_RECEIVED', (event: SimulationPayload) => {
      const item = event.item ?? '';
      const index = event.processedCount ?? 0;

      setProcessedCount(index);
      setCurrentItem({
        index,
        value: item,
        decision: 'Received from stream',
        decisionKind: 'received'
      });
      setIncomingStream((previousItems) =>
        [
          ...previousItems.map((streamItem) => ({
            ...streamItem,
            status: 'seen' as const
          })),
          {
            id: index,
            value: item,
            status: 'active' as const
          }
        ].slice(-10)
      );
    });

    socket.on('ITEM_ACCEPTED', (event: SimulationPayload) => {
      syncReservoirState(event);
      const slot = (event.reservoirIndex ?? 0) + 1;
      flashSlot(event.reservoirIndex ?? 0, 'accepted');
      setCurrentItem((previousItem) =>
        previousItem
          ? {
              ...previousItem,
              decision: `Accepted into slot ${slot}`,
              decisionKind: 'accepted'
            }
          : previousItem
      );
      addEventLogEntry(
        'Accepted',
        `${event.item ?? 'Item'} → slot ${slot}`,
        'accepted'
      );
    });

    socket.on('ITEM_REPLACED', (event: SimulationPayload) => {
      syncReservoirState(event);
      const slot = (event.reservoirIndex ?? 0) + 1;
      flashSlot(event.reservoirIndex ?? 0, 'replaced');
      setCurrentItem((previousItem) =>
        previousItem
          ? {
              ...previousItem,
              decision: `Replaced slot ${slot}`,
              decisionKind: 'replaced'
            }
          : previousItem
      );
      addEventLogEntry(
        'Replaced',
        `slot ${slot}: ${event.replacedItem ?? '—'} → ${event.item ?? '—'}`,
        'replaced'
      );
    });

    socket.on('ITEM_REJECTED', (event: SimulationPayload) => {
      syncReservoirState(event);
      setCurrentItem((previousItem) =>
        previousItem
          ? {
              ...previousItem,
              decision: 'Rejected (not added to reservoir)',
              decisionKind: 'rejected'
            }
          : previousItem
      );
      addEventLogEntry('Rejected', event.item ?? 'Item rejected', 'rejected');
    });

    socket.on('SIMULATION_PAUSED', () => {
      setSimulationStatus('Paused');
      addEventLogEntry('Simulation paused', 'Stream halted by user.', 'info');
    });

    socket.on('SIMULATION_RESUMED', () => {
      setSimulationStatus('Running');
      addEventLogEntry('Simulation resumed', 'Stream continuing.', 'info');
    });

    socket.on('SIMULATION_COMPLETED', (event: SimulationPayload) => {
      syncReservoirState(event);
      setSimulationStatus('Completed');
      addEventLogEntry(
        'Simulation completed',
        `${(event.processedCount ?? 0).toLocaleString()} items processed.`,
        'info'
      );
    });

    socket.on('SIMULATION_STOPPED', (event: SimulationPayload) => {
      syncReservoirState(event);
      setSimulationStatus('Stopped');
      addEventLogEntry('Simulation stopped', 'Run halted before completion.', 'info');
    });

    socket.on('SIMULATION_RESET', () => {
      setSimulationStatus('Idle');
      resetLocalState();
      addEventLogEntry('Simulation reset', 'Ready for a new run.', 'info');
    });

    return () => {
      for (const eventName of simulationSocketEvents) {
        socket.off(eventName);
      }
      socket.disconnect();
      socketRef.current = null;
      for (const timer of highlightTimers.current.values()) {
        clearTimeout(timer);
      }
      highlightTimers.current.clear();
    };
  }, []);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] ?? null);
    setUploadMessage(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadMessage({
        type: 'error',
        text: 'Choose a .csv or .dat file before uploading.'
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    setIsUploading(true);
    setUploadMessage(null);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const payload = await parseUploadResponse(response);

      if (!response.ok) {
        throw new Error(
          payload.error ??
            'Upload failed. Make sure the backend is running on http://localhost:3001.'
        );
      }

      if (!payload.uploadId || !payload.fileName || payload.fileSize == null) {
        throw new Error('Upload response was missing file details.');
      }

      setUploadId(payload.uploadId);
      setUploadedFileName(payload.fileName);
      setUploadMessage({
        type: 'success',
        text: `Uploaded ${payload.fileName} (${formatFileSize(payload.fileSize)}). It will be used on the next Start.`
      });
    } catch (error) {
      setUploadMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Upload failed.'
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleStart = () => {
    socketRef.current?.emit('START_SIMULATION', {
      uploadId: uploadId ?? undefined,
      k: targetK,
      speed
    });
  };

  const handlePause = () => {
    socketRef.current?.emit('PAUSE_SIMULATION');
  };

  const handleResume = () => {
    socketRef.current?.emit('RESUME_SIMULATION');
  };

  const handleReset = () => {
    socketRef.current?.emit('RESET_SIMULATION');
  };

  const handleKChange = (value: number) => {
    setTargetK(value);
  };

  const handleSpeedChange = (value: number) => {
    setSpeed(value);
    socketRef.current?.emit('SET_SPEED', { speed: value });
  };

  return (
    <main className="min-h-screen bg-canvas px-6 py-8 text-slate-800">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-slate-800">
            Reservoir Sampling Visualizer
          </h1>
          <p className="text-sm text-slate-500">
            Watch how reservoir sampling decides which streaming items to keep,
            one at a time.
          </p>
        </header>

        <ControlBar
          selectedFile={selectedFile}
          uploadMessage={uploadMessage}
          isUploading={isUploading}
          uploadedFileName={uploadedFileName}
          socketStatus={socketStatus}
          simulationStatus={simulationStatus}
          kInput={targetK}
          kEditable={kEditable}
          speed={speed}
          canStart={canStart}
          canPause={canPause}
          canResume={canResume}
          canReset={canReset}
          onFileChange={handleFileChange}
          onUpload={handleUpload}
          onKChange={handleKChange}
          onSpeedChange={handleSpeedChange}
          onStart={handleStart}
          onPause={handlePause}
          onResume={handleResume}
          onReset={handleReset}
        />

        <StatisticsPanel stats={stats} />

        <div className="grid gap-6 xl:grid-cols-[minmax(320px,440px)_1fr]">
          <div className="grid gap-6">
            <CurrentItemPanel item={currentItem} />
            <IncomingStreamPanel items={incomingStream} />
            <EventLogPanel events={eventLog} />
          </div>
          <ReservoirPanel items={reservoirItems} targetK={targetK} />
        </div>
      </div>
    </main>
  );
}

export default App;
