import { ReservoirSamplingService } from './ReservoirSamplingService.js';

describe('ReservoirSamplingService', () => {
  it('accepts items while initially filling the reservoir', () => {
    const service = new ReservoirSamplingService<number>(3);

    const first = service.processItem(10);
    const second = service.processItem(20);
    const third = service.processItem(30);

    expect(first).toEqual({
      type: 'accepted',
      item: 10,
      processedCount: 1,
      reservoirIndex: 0
    });
    expect(second.type).toBe('accepted');
    expect(third.type).toBe('accepted');
    expect(service.getReservoir()).toEqual([10, 20, 30]);
  });

  it('keeps reservoir size from exceeding k', () => {
    const service = new ReservoirSamplingService<number>(3, () => 0.99);

    for (const item of [1, 2, 3, 4, 5, 6, 7]) {
      service.processItem(item);
    }

    expect(service.getReservoir()).toHaveLength(3);
  });

  it('tracks processed count for every processed item', () => {
    const service = new ReservoirSamplingService<string>(2, () => 0.99);

    expect(service.getProcessedCount()).toBe(0);

    service.processItem('a');
    service.processItem('b');
    service.processItem('c');

    expect(service.getProcessedCount()).toBe(3);
  });

  it('resets reservoir and processed count', () => {
    const service = new ReservoirSamplingService<number>(2);

    service.processItem(1);
    service.processItem(2);
    service.reset();

    expect(service.getReservoir()).toEqual([]);
    expect(service.getProcessedCount()).toBe(0);
  });

  it('handles k=1 replacement and rejection events', () => {
    const randomValues = [0, 0.99];
    const service = new ReservoirSamplingService<string>(1, () => {
      return randomValues.shift() ?? 0.99;
    });

    expect(service.processItem('first')).toMatchObject({
      type: 'accepted',
      item: 'first',
      reservoirIndex: 0
    });
    expect(service.processItem('second')).toEqual({
      type: 'replaced',
      item: 'second',
      processedCount: 2,
      reservoirIndex: 0,
      replacedItem: 'first'
    });
    expect(service.processItem('third')).toEqual({
      type: 'rejected',
      item: 'third',
      processedCount: 3
    });
    expect(service.getReservoir()).toEqual(['second']);
  });

  it('accepts all items when k equals dataset size', () => {
    const service = new ReservoirSamplingService<number>(4);
    const events = [1, 2, 3, 4].map((item) => service.processItem(item));

    expect(events.map((event) => event.type)).toEqual([
      'accepted',
      'accepted',
      'accepted',
      'accepted'
    ]);
    expect(service.getReservoir()).toEqual([1, 2, 3, 4]);
    expect(service.getProcessedCount()).toBe(4);
  });

  it('returns a copy of the reservoir', () => {
    const service = new ReservoirSamplingService<number>(2);

    service.processItem(1);
    service.processItem(2);

    const reservoir = service.getReservoir();
    reservoir.push(3);

    expect(service.getReservoir()).toEqual([1, 2]);
  });

  it.each([0, -1, Number.NEGATIVE_INFINITY, 1.5, Number.NaN])(
    'throws for invalid k value %p',
    (k) => {
      expect(() => new ReservoirSamplingService(k)).toThrow(
        'Reservoir size k must be a positive integer.'
      );
    }
  );
});
