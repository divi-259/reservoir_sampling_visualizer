import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SimulationEngine, SimulationEvents } from '../services/SimulationEngine.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultFilePath = path.resolve(
  currentDirectory,
  '../../../Datasets/people-100.csv'
);
const filePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : defaultFilePath;

const engine = new SimulationEngine({
  filePath,
  k: 5,
  speed: 25
});

engine.on(SimulationEvents.SIMULATION_STARTED, (event) => {
  console.log('Simulation Started');
  console.log(`File: ${event.filePath}`);
  console.log(`K: ${event.k}`);
  console.log(`Speed: ${event.speed} items/sec`);
});

engine.on(SimulationEvents.ITEM_RECEIVED, (event) => {
  console.log('Received:', event.item);
});

engine.on(SimulationEvents.ITEM_ACCEPTED, (event) => {
  console.log(`Accepted index ${event.reservoirIndex}:`, event.item);
});

engine.on(SimulationEvents.ITEM_REPLACED, (event) => {
  console.log(
    `Replaced index ${event.reservoirIndex}: ${event.replacedItem} -> ${event.item}`
  );
});

engine.on(SimulationEvents.ITEM_REJECTED, (event) => {
  console.log('Rejected:', event.item);
});

engine.on(SimulationEvents.SIMULATION_COMPLETED, (event) => {
  console.log('Simulation Completed');
  console.log(`Processed: ${event.processedCount}`);
  console.log('Final reservoir:', event.reservoir);
});

engine.on(SimulationEvents.SIMULATION_STOPPED, (event) => {
  console.log('Simulation Stopped');
  console.log(`Processed: ${event.processedCount}`);
});

engine.start().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
