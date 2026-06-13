# Reservoir Sampling Visualizer

An educational, full-stack web application that visually demonstrates the Reservoir Sampling algorithm on streaming data. The app feels like a real-time streaming system: uploaded CSV/DAT files are processed one item at a time on the backend, and every accept / replace / reject decision is pushed live to the React frontend over Socket.IO.

The backend is the single source of truth — it owns the reservoir, runs the algorithm, and emits events. The frontend never executes sampling logic; it simply renders what the server sends.

## Architecture overview

```text
CSV/DAT file
     │
     ▼
SimulationEngine  ──▶  ReservoirSamplingService
     │
     ▼ (Node EventEmitter)
Socket.IO server
     │
     ▼ (WebSocket)
React frontend
     │
     ▼
UI components (Control / Stream / Reservoir / Stats / Event Log)
```

## Project Structure

```text
reservoir_sampling_visualizer/
  frontend/   React + TypeScript + Vite + Tailwind CSS
  backend/    Node.js + Express + TypeScript + Socket.IO
  Datasets/   Sample CSV/DAT datasets
```

## Backend (`backend/src/`)

- **`server.ts`** — Express + Socket.IO server on port 3001. Exposes two surfaces:
  - **HTTP**: `POST /api/upload` (Multer, 1 GB cap, `.csv` / `.dat` only). Stores files in `uploads/` and returns an `uploadId`. An in-memory `Map<uploadId, path>` resolves IDs back to file paths when a simulation starts. Also exposes `GET /api/health`.
  - **Socket.IO**: per-connection control plane — `START_SIMULATION { uploadId?, k, speed }`, `PAUSE_SIMULATION`, `RESUME_SIMULATION`, `RESET_SIMULATION`, `SET_SPEED { speed }`.
- **`services/ReservoirSamplingService.ts`** — Generic, standalone algorithm. `processItem()` returns one of `accepted | replaced | rejected`. Memory stays at O(K) — the full dataset is never held in memory.
- **`services/SimulationEngine.ts`** — Extends `EventEmitter`. Streams the file line-by-line via `createReadStream` + `readline`, feeds each line into the reservoir service, and emits `SIMULATION_STARTED`, `ITEM_RECEIVED`, `ITEM_ACCEPTED / REPLACED / REJECTED`, `SIMULATION_PAUSED / RESUMED / COMPLETED / STOPPED`. Pause is implemented with a queue of resolver promises; speed is enforced via a `1000 / speed` ms delay between items and can be changed live.

### Per-socket simulation lifecycle

Each Socket.IO connection lazily creates one `SimulationEngine` on `START_SIMULATION`. Event forwarders re-emit engine events over the socket, piggy-backing the current `processedCount` and full `reservoir` snapshot on every payload. On `RESET_SIMULATION` or disconnect, forwarders are detached **before** `stop()` so no spurious `SIMULATION_STOPPED` leaks out — clients see a clean `SIMULATION_RESET` instead.

If `START_SIMULATION` is called with no `uploadId` (or an unknown one), the engine falls back to `uploads/sample.csv`.

## Frontend (`frontend/src/`)

- React + TypeScript + Vite + Tailwind, with the UI in `App.tsx`.
- Connects via `socket.io-client` to `http://localhost:3001`, subscribes to every simulation event, and renders five panels:
  - **Control Panel** — file picker, K input, Start / Pause / Resume / Reset, live speed selector (0.25× – 100×, including 16× / 32× / 64×), and a Download Sample button with a CSV / DAT format toggle that exports the current reservoir verbatim (no header injected, original delimiter preserved) as `reservoir-sample-k{K}.{csv|dat}`.
  - **Incoming Stream** — rolling window of the most recently processed items.
  - **Reservoir Panel** — current reservoir contents, responsive grid that scales with K. Long records are truncated via `getDisplayLabel()` with hover tooltips showing the full row (MovieLens `19%Title (Year)` records are parsed to a cleaner title).
  - **Statistics Panel** — processed items, reservoir size, current item, simulation status.
  - **Event Log Panel** — recent accept / replace / reject decisions.
- The frontend **never** runs the algorithm. It mirrors the server-sent `reservoir[]` and event stream into local state.

## Key technologies

- **Socket.IO** — bidirectional event channel; the heart of the live streaming feel.
- **Node `EventEmitter`** — decouples the algorithm from the transport. `SimulationEngine` emits domain events; the socket layer forwards them without coupling to algorithm internals.
- **Multer + disk storage** — file uploads keyed by a generated `uploadId`.
- **Node `readline` + `createReadStream`** — line-by-line streaming so 1 GB files never sit in memory.
- **TypeScript everywhere**, with **Jest** unit tests for `ReservoirSamplingService` and `SimulationEngine`.
- **npm workspaces** at the repo root tying `frontend/` and `backend/` together so `npm run dev` boots both.

## Prerequisites

- Node.js 20+
- npm 10+

## Setup

Install dependencies from the repository root:

```bash
npm install
```

## Development

Run both apps:

```bash
npm run dev
```

Run only the frontend:

```bash
npm run dev -w frontend
```

Run only the backend:

```bash
npm run dev -w backend
```

The frontend runs on `http://localhost:5173`.

The backend runs on `http://localhost:3001`.

## Build

Build both apps:

```bash
npm run build
```

## Type Checking

Type-check both apps:

```bash
npm run typecheck
```

## Tests

Run backend unit tests (Jest):

```bash
npm run test -w backend
```
