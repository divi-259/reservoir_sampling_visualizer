# Deployment Guide

This guide explains how to deploy the Reservoir Sampling Visualizer so anyone can use it with their own CSV/DAT files.

## Short answer: Render (not Vercel)

Vercel is a poor fit for this app:

- Its serverless functions don't hold stable WebSocket connections, which Socket.IO needs.
- 4.5 MB request body cap on serverless → 1 GB file uploads won't work.
- Ephemeral, per-invocation filesystem → uploaded files vanish.
- Per-socket in-memory state (`SimulationEngine` per connection) can't survive across cold starts.

**Render** (or Railway / Fly.io) gives you a long-lived Node process — exactly what the `SimulationEngine` + Socket.IO design assumes.

## The cleanest deploy: one Render service serving both

The frontend currently uses `io()` (no URL) and `fetch('/api/upload')` (relative). Both work in dev only because of Vite's proxy (`frontend/vite.config.ts`). In production you have two choices:

1. **Single-origin (recommended)** — have Express also serve the built `frontend/dist`. No CORS, no env vars, no code changes to `App.tsx`. One service, one URL.
2. **Two services** — frontend on Vercel/Netlify static hosting, backend on Render. You'd need to make the socket URL and upload URL configurable via `VITE_BACKEND_URL`, and set `CLIENT_URL` on the backend so CORS allows the frontend origin.

The single-origin path is documented below.

## Code changes needed

Add this to `backend/src/server.ts` (after the `/api/upload` route):

```ts
import { existsSync } from 'node:fs';

const frontendDist = path.resolve(currentDirectory, '../../frontend/dist');
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}
```

That's it — `io()` and `/api/upload` keep working because everything is on one origin.

## Render setup

In the Render dashboard → **New → Web Service** → connect your GitHub repo:

- **Root directory**: leave blank (repo root)
- **Build command**:
  ```
  npm install && npm run build
  ```
  (the root `package.json` workspaces build both frontend and backend)
- **Start command**:
  ```
  npm start -w backend
  ```
- **Environment**: `Node`
- **Plan**: Free
- **Env vars**: none required — `PORT` is injected by Render and the code already reads `process.env.PORT`.

Push to GitHub, Render builds and gives you a `https://your-app.onrender.com` URL. Anyone with the URL can upload their own CSV/DAT and watch their data stream through.

## Free-tier gotchas to know

- **Sleeps after 15 min idle** → first hit takes ~30 s to cold-start.
- **512 MB RAM, ephemeral disk** → uploaded files disappear on restart. Fine for the current flow (simulation runs right after upload), but no persistence across deploys.
- **Request timeouts** on free tier make actual 1 GB uploads risky. For a public demo, lower `maxUploadSizeBytes` in `backend/src/server.ts` to something like 50 MB — the algorithm doesn't care about file size, only line count.
- **One instance, no scaling** — fine because each Socket.IO connection's state is tied to that instance anyway.
- **HTTPS auto-provisioned** — Socket.IO will use `wss://` automatically.

## Alternative platforms

If Render doesn't suit you, similar long-lived-process platforms work the same way:

- **Railway** — generous free trial, same Node web-service model.
- **Fly.io** — free allowance for small VMs, Docker-based.
- **Heroku** — paid only now, but the same buildpack pattern applies.

Avoid serverless platforms (Vercel, Netlify Functions, AWS Lambda) for the backend — the per-socket in-memory simulation state and Socket.IO long-lived connections don't fit that model.
