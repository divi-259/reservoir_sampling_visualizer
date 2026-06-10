import { EventEmitter } from 'node:events';
import { createReadStream, type ReadStream } from 'node:fs';
import { createInterface, type Interface } from 'node:readline';
import { ReservoirSamplingService, type ReservoirEvent } from './ReservoirSamplingService.js';

export const SimulationEvents = {
  SIMULATION_STARTED: 'SIMULATION_STARTED',
  ITEM_RECEIVED: 'ITEM_RECEIVED',
  ITEM_ACCEPTED: 'ITEM_ACCEPTED',
  ITEM_REPLACED: 'ITEM_REPLACED',
  ITEM_REJECTED: 'ITEM_REJECTED',
  SIMULATION_PAUSED: 'SIMULATION_PAUSED',
  SIMULATION_RESUMED: 'SIMULATION_RESUMED',
  SIMULATION_COMPLETED: 'SIMULATION_COMPLETED',
  SIMULATION_STOPPED: 'SIMULATION_STOPPED'
} as const;

export type SimulationEventName =
  (typeof SimulationEvents)[keyof typeof SimulationEvents];

type SimulationStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'stopped';

type SimulationEngineOptions = {
  filePath: string;
  k: number;
  speed?: number;
  reservoirService?: ReservoirSamplingService<string>;
};

type SimulationStartedPayload = {
  filePath: string;
  k: number;
  speed: number;
};

type ItemReceivedPayload = {
  item: string;
  processedCount: number;
};

type SimulationCompletedPayload = {
  processedCount: number;
  reservoir: string[];
};

type SimulationStoppedPayload = {
  processedCount: number;
  reservoir: string[];
};

type PauseResolver = () => void;

export class SimulationEngine extends EventEmitter {
  private readonly filePath: string;
  private readonly k: number;
  private readonly reservoirService: ReservoirSamplingService<string>;
  private status: SimulationStatus = 'idle';
  private speed: number;
  private lineReader?: Interface;
  private stream?: ReadStream;
  private stopRequested = false;
  private pauseResolvers: PauseResolver[] = [];
  private startPromise?: Promise<void>;

  constructor(options: SimulationEngineOptions) {
    super();

    if (
      options.speed !== undefined &&
      (Number.isNaN(options.speed) || options.speed <= 0)
    ) {
      throw new Error('Simulation speed must be greater than 0.');
    }

    this.filePath = options.filePath;
    this.k = options.k;
    this.speed = options.speed ?? 1;
    this.reservoirService =
      options.reservoirService ?? new ReservoirSamplingService<string>(options.k);
  }

  start(): Promise<void> {
    if (this.status === 'running' || this.status === 'paused') {
      throw new Error('Simulation is already running.');
    }

    this.stopRequested = false;
    this.status = 'running';
    this.reservoirService.reset();
    this.emit(SimulationEvents.SIMULATION_STARTED, {
      filePath: this.filePath,
      k: this.k,
      speed: this.speed
    } satisfies SimulationStartedPayload);

    this.startPromise = this.run();
    return this.startPromise;
  }

  pause(): void {
    if (this.status !== 'running') {
      return;
    }

    this.status = 'paused';
    this.emit(SimulationEvents.SIMULATION_PAUSED);
  }

  resume(): void {
    if (this.status !== 'paused') {
      return;
    }

    this.status = 'running';
    this.resolvePause();
    this.emit(SimulationEvents.SIMULATION_RESUMED);
  }

  stop(): void {
    if (
      this.status === 'idle' ||
      this.status === 'completed' ||
      this.status === 'stopped'
    ) {
      return;
    }

    this.stopRequested = true;
    this.status = 'stopped';
    this.resolvePause();
    this.lineReader?.close();
    this.stream?.destroy();
    this.emitStopped();
  }

  setSpeed(speed: number): void {
    if (Number.isNaN(speed) || speed <= 0) {
      throw new Error('Simulation speed must be greater than 0.');
    }

    this.speed = speed;
  }

  getStatus(): SimulationStatus {
    return this.status;
  }

  getSpeed(): number {
    return this.speed;
  }

  getReservoir(): string[] {
    return this.reservoirService.getReservoir();
  }

  getProcessedCount(): number {
    return this.reservoirService.getProcessedCount();
  }

  private async run(): Promise<void> {
    try {
      this.stream = createReadStream(this.filePath, { encoding: 'utf8' });
      this.lineReader = createInterface({
        input: this.stream,
        crlfDelay: Infinity
      });

      for await (const line of this.lineReader) {
        if (this.stopRequested) {
          break;
        }

        await this.waitWhilePaused();

        if (this.stopRequested) {
          break;
        }

        this.processLine(line);

        if (this.stopRequested) {
          break;
        }

        await this.delayForSpeed();
      }

      if (!this.stopRequested) {
        this.status = 'completed';
        this.emit(SimulationEvents.SIMULATION_COMPLETED, {
          processedCount: this.reservoirService.getProcessedCount(),
          reservoir: this.reservoirService.getReservoir()
        } satisfies SimulationCompletedPayload);
      }
    } finally {
      this.lineReader = undefined;
      this.stream = undefined;
      this.startPromise = undefined;
    }
  }

  private processLine(line: string): void {
    const event = this.reservoirService.processItem(line);

    this.emit(SimulationEvents.ITEM_RECEIVED, {
      item: line,
      processedCount: event.processedCount
    } satisfies ItemReceivedPayload);

    this.emitReservoirEvent(event);
  }

  private emitReservoirEvent(event: ReservoirEvent<string>): void {
    if (event.type === 'accepted') {
      this.emit(SimulationEvents.ITEM_ACCEPTED, event);
      return;
    }

    if (event.type === 'replaced') {
      this.emit(SimulationEvents.ITEM_REPLACED, event);
      return;
    }

    this.emit(SimulationEvents.ITEM_REJECTED, event);
  }

  private waitWhilePaused(): Promise<void> {
    if (this.status !== 'paused') {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.pauseResolvers.push(resolve);
    });
  }

  private resolvePause(): void {
    for (const resolve of this.pauseResolvers) {
      resolve();
    }

    this.pauseResolvers = [];
  }

  private delayForSpeed(): Promise<void> {
    const delayMs = 1000 / this.speed;

    if (delayMs <= 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  private emitStopped(): void {
    this.emit(SimulationEvents.SIMULATION_STOPPED, {
      processedCount: this.reservoirService.getProcessedCount(),
      reservoir: this.reservoirService.getReservoir()
    } satisfies SimulationStoppedPayload);
  }
}
