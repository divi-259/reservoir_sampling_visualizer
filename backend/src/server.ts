import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import {
  SimulationEngine,
  SimulationEvents,
  type SimulationEventName
} from './services/SimulationEngine.js';

const port = Number(process.env.PORT ?? 3001);
const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
const corsOrigin: string | boolean = process.env.CLIENT_URL ? clientUrl : true;
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const uploadDirectory = path.resolve(currentDirectory, '../uploads');
const sampleCsvPath = path.join(uploadDirectory, 'sample.csv');
const maxUploadSizeBytes = 50 * 1024 * 1024;
const allowedExtensions = new Set(['.csv', '.dat']);
const simulationSocketEvents = Object.values(SimulationEvents);

const defaultSpeed = 4;
const minSpeed = 0.25;
const maxSpeed = 64;
const defaultK = 10;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin
  }
});

mkdirSync(uploadDirectory, { recursive: true });

const uploadIdToPath = new Map<string, string>();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadDirectory);
    },
    filename: (req, file, cb) => {
      const uploadId = randomUUID();
      req.uploadId = uploadId;
      cb(null, `${uploadId}${path.extname(file.originalname).toLowerCase()}`);
    }
  }),
  limits: {
    fileSize: maxUploadSizeBytes
  },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!allowedExtensions.has(extension)) {
      cb(new Error('Only .csv and .dat files are allowed.'));
      return;
    }

    cb(null, true);
  }
});

app.use(
  cors({
    origin: corsOrigin
  })
);
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? 'File is too large. Maximum size is 50 MB.'
          : error.message;

      res.status(400).json({ error: message });
      return;
    }

    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }

    if (!req.file || !req.uploadId) {
      res.status(400).json({ error: 'A .csv or .dat file is required.' });
      return;
    }

    uploadIdToPath.set(req.uploadId, req.file.path);

    res.json({
      uploadId: req.uploadId,
      fileName: req.file.originalname,
      fileSize: req.file.size
    });
  });
});

const frontendDist = path.resolve(currentDirectory, '../../frontend/dist');
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

type StartPayload = {
  uploadId?: string;
  k?: number;
  speed?: number;
};

type SetSpeedPayload = {
  speed?: number;
};

function clampSpeed(value: number): number {
  return Math.min(maxSpeed, Math.max(minSpeed, value));
}

function resolveSourcePath(uploadId: string | undefined): string {
  if (uploadId) {
    const matched = uploadIdToPath.get(uploadId);
    if (matched) {
      return matched;
    }
  }

  return sampleCsvPath;
}

io.on('connection', (socket) => {
  console.log(`Socket.IO client connected: ${socket.id}`);
  socket.emit('SERVER_READY', {
    message: 'Server ready',
    socketId: socket.id
  });

  let engine: SimulationEngine | undefined;
  const forwarders = new Map<SimulationEventName, (payload: unknown) => void>();

  const attachForwarders = (target: SimulationEngine) => {
    for (const eventName of simulationSocketEvents) {
      const handler = (payload: unknown) => {
        socket.emit(eventName, {
          ...(payload as object | undefined),
          processedCount: target.getProcessedCount(),
          reservoir: target.getReservoir()
        });
      };
      target.on(eventName, handler);
      forwarders.set(eventName, handler);
    }
  };

  const detachForwarders = (target: SimulationEngine) => {
    for (const [eventName, handler] of forwarders.entries()) {
      target.off(eventName, handler);
    }
    forwarders.clear();
  };

  const teardownEngine = () => {
    if (!engine) {
      return;
    }
    const previous = engine;
    engine = undefined;
    detachForwarders(previous);
    previous.stop();
  };

  socket.on('START_SIMULATION', (payload: StartPayload = {}) => {
    const requestedK = Number.isFinite(payload.k) ? Math.floor(Number(payload.k)) : defaultK;
    const k = Math.max(1, requestedK);
    const speed = clampSpeed(
      Number.isFinite(payload.speed) ? Number(payload.speed) : defaultSpeed
    );
    const filePath = resolveSourcePath(payload.uploadId);
    //console.log("Resolved file:", filePath);

    teardownEngine();

    const nextEngine = new SimulationEngine({ filePath, k, speed });
    attachForwarders(nextEngine);
    engine = nextEngine;

    nextEngine.start().catch((error: unknown) => {
      console.error(
        `Simulation failed for ${socket.id}:`,
        error instanceof Error ? error.message : error
      );
    });
  });

  socket.on('PAUSE_SIMULATION', () => {
    engine?.pause();
  });

  socket.on('RESUME_SIMULATION', () => {
    engine?.resume();
  });

  socket.on('RESET_SIMULATION', () => {
    teardownEngine();
    socket.emit('SIMULATION_RESET', {});
  });

  socket.on('SET_SPEED', (payload: SetSpeedPayload = {}) => {
    if (!engine || !Number.isFinite(payload.speed)) {
      return;
    }
    engine.setSpeed(clampSpeed(Number(payload.speed)));
  });

  socket.on('disconnect', (reason) => {
    console.log(`Socket.IO client disconnected: ${socket.id} (${reason})`);
    teardownEngine();
  });
});

httpServer.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
