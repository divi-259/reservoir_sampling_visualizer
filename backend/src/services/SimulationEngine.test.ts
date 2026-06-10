import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ReservoirSamplingService } from './ReservoirSamplingService.js';
import { SimulationEngine, SimulationEvents } from './SimulationEngine.js';

function createTempFile(lines: string[], extension = 'csv') {
  const directory = mkdtempSync(path.join(tmpdir(), 'simulation-engine-'));
  const filePath = path.join(directory, `dataset.${extension}`);
  writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');

  return {
    filePath,
    cleanup: () => {
      rmSync(directory, { recursive: true, force: true });
    }
  };
}

describe('SimulationEngine', () => {
  it('reads a CSV file line-by-line and emits completion events', async () => {
    const { filePath, cleanup } = createTempFile(['alpha', 'beta', 'gamma']);
    const reservoirService = new ReservoirSamplingService<string>(2, () => 0.99);
    const engine = new SimulationEngine({
      filePath,
      k: 2,
      speed: Number.POSITIVE_INFINITY,
      reservoirService
    });
    const receivedItems: string[] = [];
    const acceptedItems: string[] = [];
    const rejectedItems: string[] = [];
    const completedPayloads: unknown[] = [];

    engine.on(SimulationEvents.ITEM_RECEIVED, (payload) => {
      receivedItems.push(payload.item);
    });
    engine.on(SimulationEvents.ITEM_ACCEPTED, (payload) => {
      acceptedItems.push(payload.item);
    });
    engine.on(SimulationEvents.ITEM_REJECTED, (payload) => {
      rejectedItems.push(payload.item);
    });
    engine.on(SimulationEvents.SIMULATION_COMPLETED, (payload) => {
      completedPayloads.push(payload);
    });

    try {
      await engine.start();

      expect(receivedItems).toEqual(['alpha', 'beta', 'gamma']);
      expect(acceptedItems).toEqual(['alpha', 'beta']);
      expect(rejectedItems).toEqual(['gamma']);
      expect(completedPayloads).toEqual([
        {
          processedCount: 3,
          reservoir: ['alpha', 'beta']
        }
      ]);
      expect(engine.getStatus()).toBe('completed');
      expect(engine.getProcessedCount()).toBe(3);
      expect(engine.getReservoir()).toEqual(['alpha', 'beta']);
    } finally {
      cleanup();
    }
  });

  it('reads a DAT file and emits replacement events', async () => {
    const { filePath, cleanup } = createTempFile(['first', 'second'], 'dat');
    const reservoirService = new ReservoirSamplingService<string>(1, () => 0);
    const engine = new SimulationEngine({
      filePath,
      k: 1,
      speed: Number.POSITIVE_INFINITY,
      reservoirService
    });
    const replacedItems: string[] = [];

    engine.on(SimulationEvents.ITEM_REPLACED, (payload) => {
      replacedItems.push(`${payload.replacedItem}->${payload.item}`);
    });

    try {
      await engine.start();

      expect(replacedItems).toEqual(['first->second']);
      expect(engine.getReservoir()).toEqual(['second']);
    } finally {
      cleanup();
    }
  });

  it('emits started payload before processing items', async () => {
    const { filePath, cleanup } = createTempFile(['one']);
    const engine = new SimulationEngine({
      filePath,
      k: 1,
      speed: Number.POSITIVE_INFINITY
    });
    const eventOrder: string[] = [];

    engine.on(SimulationEvents.SIMULATION_STARTED, (payload) => {
      eventOrder.push(SimulationEvents.SIMULATION_STARTED);
      expect(payload).toEqual({
        filePath,
        k: 1,
        speed: Number.POSITIVE_INFINITY
      });
    });
    engine.on(SimulationEvents.ITEM_RECEIVED, () => {
      eventOrder.push(SimulationEvents.ITEM_RECEIVED);
    });

    try {
      await engine.start();

      expect(eventOrder).toEqual([
        SimulationEvents.SIMULATION_STARTED,
        SimulationEvents.ITEM_RECEIVED
      ]);
    } finally {
      cleanup();
    }
  });

  it('pauses and resumes processing', async () => {
    const { filePath, cleanup } = createTempFile(['one', 'two', 'three']);
    const engine = new SimulationEngine({
      filePath,
      k: 3,
      speed: 1000
    });
    const receivedItems: string[] = [];
    let paused = false;

    engine.on(SimulationEvents.ITEM_RECEIVED, (payload) => {
      receivedItems.push(payload.item);

      if (!paused) {
        paused = true;
        engine.pause();
      }
    });

    try {
      const run = engine.start();
      await new Promise((resolve) => setTimeout(resolve, 25));

      expect(engine.getStatus()).toBe('paused');
      expect(receivedItems).toEqual(['one']);

      engine.resume();
      await run;

      expect(receivedItems).toEqual(['one', 'two', 'three']);
      expect(engine.getStatus()).toBe('completed');
    } finally {
      cleanup();
    }
  });

  it('stops processing and emits stopped event', async () => {
    const { filePath, cleanup } = createTempFile(['one', 'two', 'three']);
    const engine = new SimulationEngine({
      filePath,
      k: 3,
      speed: 1000
    });
    const stoppedPayloads: unknown[] = [];

    engine.on(SimulationEvents.ITEM_RECEIVED, () => {
      engine.stop();
    });
    engine.on(SimulationEvents.SIMULATION_STOPPED, (payload) => {
      stoppedPayloads.push(payload);
    });

    try {
      await engine.start();

      expect(engine.getStatus()).toBe('stopped');
      expect(engine.getProcessedCount()).toBe(1);
      expect(stoppedPayloads).toEqual([
        {
          processedCount: 1,
          reservoir: ['one']
        }
      ]);
    } finally {
      cleanup();
    }
  });

  it('updates speed', () => {
    const engine = new SimulationEngine({
      filePath: '/not/read/until/start.csv',
      k: 1,
      speed: 1
    });

    engine.setSpeed(4);

    expect(engine.getSpeed()).toBe(4);
  });

  it.each([0, -1, Number.NaN])('throws for invalid speed %p', (speed) => {
    expect(
      () =>
        new SimulationEngine({
          filePath: '/not/read/until/start.csv',
          k: 1,
          speed
        })
    ).toThrow('Simulation speed must be greater than 0.');
  });
});
