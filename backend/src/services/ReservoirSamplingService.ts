export type ReservoirEventType = 'accepted' | 'replaced' | 'rejected';

export type ReservoirEvent<T> =
  | {
      type: 'accepted';
      item: T;
      processedCount: number;
      reservoirIndex: number;
    }
  | {
      type: 'replaced';
      item: T;
      processedCount: number;
      reservoirIndex: number;
      replacedItem: T;
    }
  | {
      type: 'rejected';
      item: T;
      processedCount: number;
    };

type RandomSource = () => number;

export class ReservoirSamplingService<T> {
  private reservoir: T[] = [];
  private processedCount = 0;
  private readonly random: RandomSource;

  constructor(
    private readonly k: number,
    random: RandomSource = Math.random
  ) {
    if (!Number.isInteger(k) || k <= 0) {
      throw new Error('Reservoir size k must be a positive integer.');
    }

    this.random = random;
  }

  processItem(item: T): ReservoirEvent<T> {
    this.processedCount += 1;

    if (this.reservoir.length < this.k) {
      this.reservoir.push(item);

      return {
        type: 'accepted',
        item,
        processedCount: this.processedCount,
        reservoirIndex: this.reservoir.length - 1
      };
    }

    const candidateIndex = Math.floor(this.random() * this.processedCount);

    if (candidateIndex < this.k) {
      const replacedItem = this.reservoir[candidateIndex];
      this.reservoir[candidateIndex] = item;

      return {
        type: 'replaced',
        item,
        processedCount: this.processedCount,
        reservoirIndex: candidateIndex,
        replacedItem
      };
    }

    return {
      type: 'rejected',
      item,
      processedCount: this.processedCount
    };
  }

  getReservoir(): T[] {
    return [...this.reservoir];
  }

  getProcessedCount(): number {
    return this.processedCount;
  }

  reset(): void {
    this.reservoir = [];
    this.processedCount = 0;
  }
}
