# Project Overview

This project is an educational and portfolio-focused web application that visually demonstrates the Reservoir Sampling algorithm on streaming data.

The objective is not simply to sample data, but to allow users to observe how the algorithm behaves in real time while processing large files one item at a time.

The application should feel like a streaming system, even though the input initially comes from uploaded CSV or DAT files.

---

# Technology Stack

Frontend:

* React
* TypeScript
* Vite
* TailwindCSS
* Socket.IO Client

Backend:

* Node.js
* Express
* TypeScript
* Socket.IO
* Multer
* EventEmitter
* Jest for testing

---

# Current Architecture

```text
CSV/DAT File
      │
      ▼
SimulationEngine
      │
      ▼
ReservoirSamplingService
      │
      ▼
EventEmitter
      │
      ▼
Socket.IO Server
      │
      ▼
React Frontend
      │
      ▼
UI Components
```

The backend owns all simulation state.

The frontend never executes the reservoir sampling algorithm. It simply displays events received from the backend.

---

# Project Structure

There are two main folders:

```text
frontend/
backend/
```

Frontend contains:

* React application
* UI components
* Socket.IO client
* State management

Backend contains:

* Express server
* Upload API
* ReservoirSamplingService
* SimulationEngine
* Socket.IO server

---

# ReservoirSamplingService

This is a standalone algorithm implementation.

Responsibilities:

* Maintain reservoir of size K.
* Process one incoming item at a time.
* Maintain processed item count.
* Return structured events:

  * accepted
  * replaced
  * rejected
* Never store the full dataset.
* Memory complexity should remain O(K).

Public methods:

```typescript
processItem(item)

getReservoir()

getProcessedCount()

reset()
```

This service is already implemented and tested.

---

# SimulationEngine

This simulates streaming data.

Responsibilities:

* Read CSV/DAT files line by line.
* Feed each line into ReservoirSamplingService.
* Support:

  * start()
  * pause()
  * resume()
  * stop()
  * setSpeed()

The engine emits events through EventEmitter.

Available events:

* SIMULATION_STARTED
* ITEM_RECEIVED
* ITEM_ACCEPTED
* ITEM_REPLACED
* ITEM_REJECTED
* SIMULATION_PAUSED
* SIMULATION_RESUMED
* SIMULATION_COMPLETED
* SIMULATION_STOPPED

This component is already implemented.

---

# Socket.IO Layer

Socket.IO is the bidirectional communication layer between backend and frontend.

Server → client:

* SERVER_READY (on connect)
* SIMULATION_STARTED / ITEM_RECEIVED / ITEM_ACCEPTED / ITEM_REPLACED / ITEM_REJECTED
* SIMULATION_PAUSED / SIMULATION_RESUMED
* SIMULATION_COMPLETED / SIMULATION_STOPPED / SIMULATION_RESET

Client → server (control plane):

* START_SIMULATION { uploadId?, k, speed }
* PAUSE_SIMULATION
* RESUME_SIMULATION
* RESET_SIMULATION
* SET_SPEED { speed }

The backend instantiates one SimulationEngine per socket connection on START_SIMULATION, attaches event forwarders, and tears them down on RESET or disconnect. On RESET the forwarders are detached before the engine is stopped so no spurious SIMULATION_STOPPED is emitted.

---

# Upload API

Implemented endpoint:

POST

```text
/api/upload
```

Supports:

* .csv
* .dat

Maximum file size:

* 1 GB

Returns:

```json
{
  "uploadId": "...",
  "fileName": "...",
  "fileSize": ...
}
```

Files are stored temporarily inside the uploads directory. The backend keeps an in-memory uploadId → file path map populated on each successful upload.

When the client emits START_SIMULATION with an uploadId, the backend resolves it to the stored file path and streams from that file. If no uploadId is provided (or it is unknown to this server process), the simulation falls back to sample.csv.

---

# Frontend UI

The UI already contains:

## Control Panel

* File picker
* K input
* Start button
* Pause button
* Resume button
* Reset button
* Speed selector

---

## Incoming Stream Panel

Displays the most recently processed items.

Only a small rolling window should be shown (for example, last 10 items).

---

## Reservoir Panel

Displays the current reservoir contents.

Should dynamically update whenever items are accepted or replaced.

The layout should support larger K values.

---

## Statistics Panel

Displays:

* Processed Items
* Reservoir Size
* Current Item
* Simulation Status

---

## Event Log Panel

Displays recent actions:

Example:

```text
Simulation Started

Accepted 1

Rejected 12

Replaced slot 3 with 21

Simulation Completed
```

Only the most recent events should be kept.

---

# Current Development State

Completed:

* Full project structure
* React UI layout
* Express backend
* File upload API
* ReservoirSamplingService
* Unit tests
* SimulationEngine
* Backend event system
* Socket.IO integration
* Frontend receives live events
* UI updates from Socket.IO events
* User-controlled simulation (Start / Pause / Resume / Reset / live speed)
* K input gated to Idle/Completed/Stopped; Speed editable live
* Per-socket SimulationEngine lifecycle and SIMULATION_RESET event
* Upload-driven simulation source resolution via uploadId
* Light, soft UI theme (Inter, slate/mint/honey palette) with slot-flash animations
* Reservoir / Current Item preview formatting with MovieLens-aware label trimming and full-record tooltips
* Download Sample button (CSV / DAT) for exporting the current reservoir contents
* Extended speed selector (0.25× through 100×, including 16×/32×/64×)

---

# Phase 7 [completed]

Convert the application into a fully user-controlled simulation.

Required features:

1. Start Simulation
2. Pause Simulation
3. Resume Simulation
4. Reset Simulation
5. K input controls reservoir size
6. Speed selector controls simulation speed
7. Status badge updates automatically
8. Event log updates automatically
9. Current item display updates automatically
10. Proper button enable/disable states

The simulation should only start when the user clicks Start.

Redesign the UI of the Reservoir Sampling Visualizer to have a clean, modern, educational appearance.

Design goals:

* Minimalistic
* Soft colors
* Easy on the eyes
* Professional SaaS dashboard aesthetic
* Similar visual style to Notion, Linear, Stripe Dashboard, or modern Apple interfaces

Theme:

Background:

* #F8FAFC

Cards:

* White (#FFFFFF)
* Rounded corners (16px)
* Thin border (#E5E7EB)
* Very subtle shadow

Typography:

* Use Inter font
* Dark gray text (#1F2937)
* Secondary text (#6B7280)

Accent Colors:

* Incoming Stream: #5FA8A6
* Reservoir: #6B8CAF
* Accepted item animation: #A8D5BA
* Replaced item animation: #E9C46A
* Rejected item: #D6D9DC

Remove:

* Neon colors
* Heavy gradients
* Strong glowing effects
* Hacker-style dark dashboard appearance

Layout:

* Light page background
* Each section inside individual white cards
* Generous spacing between components
* Consistent padding and alignment

Animations:

* Smooth fade and scale transitions
* Subtle hover effects

---

# Phase 8 [completed]
Improve the Reservoir panel UI to properly support long dataset records (for example, movie titles).

Current problem:

* Entire raw dataset rows are rendered directly inside small reservoir cards.
* Long strings wrap aggressively and make the layout cluttered.
* Reservoir visualization should emphasize the sampling algorithm, not the raw CSV formatting.

Goals:

* Clean, modern appearance.
* Uniform card sizes.
* Preserve access to the full record.
* Work well for arbitrary CSV/DAT datasets.

Implement the following:

1. Reservoir Card Layout

* Change reservoir cards from tall/narrow to wider landscape cards.

* Use a responsive CSS grid:

  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));

* Keep all cards the same height (approximately 100-120px).

2. Display a Preview Instead of the Full Raw Record

Each card should display:

* Slot number (#1, #2, etc.)
* A shortened label for the item.

Create a helper function:

getDisplayLabel(item: string): string

Rules:

* Trim whitespace.
* Collapse multiple spaces.
* Limit visible text to roughly 24-30 characters.
* If longer, append "...".

Example:

Raw:
19%Ace Ventura: When Nature Calls (1995)

Display:
19% Ace Ventura: When...

3. Full Record Access

Add a tooltip (title attribute is acceptable initially).

Hovering over a card should reveal the complete original record.

Example:

<div title={fullRecord}>
  {displayLabel}
</div>

4. Better Text Styling

For the preview text:

* font-weight: 600
* center aligned
* vertically centered
* line-height around 1.3

Prevent ugly word splitting:

* word-break: break-word;
* overflow-wrap: anywhere;

Do NOT allow text to overflow outside the card.

5. Current Item Panel

Apply the same preview formatting.

Show:

Current Item

19% Ace Ventura: When...

Add a small "Raw Record" expandable section or tooltip containing the full text.

6. Reservoir Header

Keep:

Reservoir
10 of 10 slots filled

Remove any unnecessary decorative elements that do not add value.

7. Preserve Functionality

Do NOT change:

* Reservoir sampling algorithm
* Socket.IO events
* Backend payloads
* Simulation logic

This is purely a presentation-layer improvement.

8. Optional Enhancement

If the incoming record appears to follow the MovieLens format:

19%Ace Ventura: When Nature Calls (1995)

attempt to extract a cleaner title for display:

Ace Ventura: When Nature Calls

while still preserving the original raw record for the tooltip.

Do not fail if parsing is impossible; simply fall back to the truncated raw string.


# Development Guidelines

* Preserve the existing architecture.
* Backend remains the source of truth.
* Frontend should never implement reservoir sampling logic.
* Prefer small, incremental changes.
* Do not perform large refactors unless explicitly requested.
* Keep code modular and maintainable.
* Existing functionality should not be broken while implementing new features.

When making changes, first understand the existing codebase and extend it rather than replacing working implementations.


# Phase 9 (current)

Add export and high-speed playback to the Reservoir Sampling Visualizer.

## Feature 1: Download Current Reservoir Sample

### Goal

Allow the user to download the current contents of the reservoir at any time during or after the simulation.

This should export exactly the items currently present in the reservoir, not the entire dataset.

---

### UI Changes

Add a new button near the simulation controls:

```text
Download Sample
```

The button should be enabled when:

* Reservoir contains at least one item.

The button should be disabled when:

* Reservoir is empty.

---

### Download Format Selection

Add a dropdown next to the Download button:

```text
CSV
DAT
```

Default:

```text
CSV
```

User selects the desired export format before downloading.

---

### Export Behavior

#### CSV / DAT Export

Both formats write the sampled records one per line, exactly as they
arrived from the source file. The frontend does not re-escape, re-quote,
or insert a synthetic header — that would clobber the original
delimiter (`,`, `%`, `|`, `::`, tab, etc.) and collapse multi-column
rows into a single quoted cell.

Example, for a 3-column comma-delimited source:

```text
1,1193,5
2,2762,4
3,1287,5
...
```

Requirements:

* One record per line, verbatim.
* No header row injected by the exporter — if the source had a header
  and it happened to be sampled, it appears like any other record.
* Original delimiter is preserved automatically because the raw line
  is emitted unchanged.

Filename format:

```text
reservoir-sample-k{K}.csv
reservoir-sample-k{K}.dat
```

where `K` is the configured reservoir size (the `K` input value), not
the number of items currently filled. The two formats differ only in
file extension and MIME type (`text/csv` vs `text/plain`).

---

### Implementation

Do NOT send data back to the backend.

Use the existing reservoir state already present in React.

Generate the file entirely in the frontend using:

* Blob
* URL.createObjectURL
* Programmatic download

This feature should work while the simulation is:

* Running
* Paused
* Completed

The exported file should always contain the latest reservoir contents currently displayed.

---

## Feature 2: Additional Speed Levels

### Goal

Add higher playback speeds for large datasets.

Current speeds:

* 0.25x
* 0.5x
* 1x
* 2x
* 5x
* 10x
* 100x

Add:

* 16x
* 32x
* 64x

Updated speed list:

* 0.25x
* 0.5x
* 1x
* 2x
* 5x
* 10x
* 16x
* 32x
* 64x
* 100x

---

### Backend Requirements

Ensure:

```ts
engine.setSpeed(speed)
```

accepts the new values.

No hardcoded speed validation should reject:

```text
16
32
64
```

---

### Frontend Requirements

Update the speed selector.

Display:

```text
0.25× / sec
0.5× / sec
1× / sec
2× / sec
5× / sec
10× / sec
16× / sec
32× / sec
64× / sec
100× / sec
```

Preserve existing speed-change behavior.

---

## UX Requirements

* Download button should visually match existing controls.
* Export format selector should be compact.
* Download action should be instant.
* No page refresh.
* No backend API required.

---

## Testing Requirements

### Download CSV

Run simulation.

Click Download Sample.

Verify:

* CSV downloads successfully.
* Number of rows equals current reservoir size.
* Content matches displayed reservoir.

### Download DAT

Run simulation.

Click Download Sample.

Select DAT.

Verify:

* DAT downloads successfully.
* One record per line.
* Content matches displayed reservoir.

### Speed Validation

Run simulation.

Switch between:

* 16x
* 32x
* 64x

Verify:

* Simulation accelerates correctly.
* No console errors.
* Statistics continue updating normally.

Do not modify the reservoir sampling algorithm.

Do not change Socket.IO event contracts.

Only implement download/export functionality and additional speed levels.
