import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { adminAuth } from './src/lib/firebase-admin.ts';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import {
  bulkCreateStudents,
  clearSessionAllocations,
  createExamCenter,
  createExamSession,
  createRoom,
  deleteExamCenter,
  deleteRoom,
  deleteStudent,
  getWorkspaceSnapshot,
  lookupStudents,
  runAndSaveSessionAllocation,
  seedInitialWorkspace,
  swapOrMoveSeats,
  toggleRoomActive,
  toggleRoomBlockedSeat,
  toggleSeatCheckIn,
  unassignSeat,
} from './src/db/repository.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = 3000;

app.use(express.json({ limit: '2mb' }));

// WebSocket broadcast hub for real-time multi-center seat availability
const wss = new WebSocketServer({ server, path: '/ws' });
const authenticatedClients = new Set<WebSocket>();

wss.on('connection', async (ws, req) => {
  try {
    const reqUrl = new URL(req.url ?? '/ws', `http://${req.headers.host ?? 'localhost'}`);
    const token = reqUrl.searchParams.get('token');
    if (!token) {
      ws.close(4001, 'Missing authentication token');
      return;
    }

    await adminAuth.verifyIdToken(token);
    authenticatedClients.add(ws);

    ws.send(
      JSON.stringify({
        type: 'ws:connected',
        timestamp: new Date().toISOString(),
      })
    );

    ws.on('close', () => {
      authenticatedClients.delete(ws);
    });

    ws.on('error', () => {
      authenticatedClients.delete(ws);
    });
  } catch {
    ws.close(4001, 'Invalid authentication token');
  }
});

function broadcastUpdate(reason: string, meta: Record<string, unknown> = {}) {
  const payload = JSON.stringify({
    type: 'workspace:updated',
    reason,
    timestamp: new Date().toISOString(),
    ...meta,
  });

  for (const client of authenticatedClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'proctorgrid' });
});

app.get('/api/workspace', requireAuth, async (_req: AuthRequest, res) => {
  try {
    await seedInitialWorkspace();
    const snapshot = await getWorkspaceSnapshot();
    res.json(snapshot);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load workspace' });
  }
});

app.post('/api/seed', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const result = await seedInitialWorkspace();
    const snapshot = await getWorkspaceSnapshot();
    if (result.seeded) {
      broadcastUpdate('workspace:seeded');
    }
    res.json({ ...result, snapshot });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to seed workspace' });
  }
});

app.post('/api/centers', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name, code, campusLocation } = req.body ?? {};
    if (!name || !code || !campusLocation) {
      return res.status(400).json({ error: 'Name, code, and campus location are required.' });
    }
    const center = await createExamCenter({ name, code, campusLocation });
    broadcastUpdate('center:created', { centerId: center.id });
    res.status(201).json(center);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to create exam center' });
  }
});

app.delete('/api/centers/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid center ID' });
    await deleteExamCenter(id);
    broadcastUpdate('center:deleted', { centerId: id });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete exam center' });
  }
});

app.post('/api/rooms', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { centerId, roomNumber, floorWing, rows, cols, blockedSeats } = req.body ?? {};
    const parsedCenterId = Number(centerId);
    const parsedRows = Number(rows);
    const parsedCols = Number(cols);

    if (
      !Number.isInteger(parsedCenterId) ||
      !roomNumber ||
      !floorWing ||
      !Number.isInteger(parsedRows) ||
      !Number.isInteger(parsedCols) ||
      parsedRows < 1 ||
      parsedRows > 15 ||
      parsedCols < 1 ||
      parsedCols > 15
    ) {
      return res.status(400).json({
        error: 'Valid center, room number, floor/wing, and grid dimensions (1–15) are required.',
      });
    }

    const room = await createRoom({
      centerId: parsedCenterId,
      roomNumber,
      floorWing,
      rows: parsedRows,
      cols: parsedCols,
      blockedSeats: Array.isArray(blockedSeats) ? blockedSeats : [],
    });
    broadcastUpdate('room:created', { roomId: room.id });
    res.status(201).json(room);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to create room' });
  }
});

app.patch('/api/rooms/:id/active', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { isActive } = req.body ?? {};
    if (!Number.isInteger(id) || typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'Invalid room ID or active status' });
    }
    const room = await toggleRoomActive(id, isActive);
    broadcastUpdate('room:updated', { roomId: id });
    res.json(room);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update room' });
  }
});

app.post('/api/rooms/:id/toggle-block', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const row = Number(req.body?.row);
    const col = Number(req.body?.col);
    if (!Number.isInteger(id) || !Number.isInteger(row) || !Number.isInteger(col)) {
      return res.status(400).json({ error: 'Valid roomId, row, and col are required' });
    }
    const room = await toggleRoomBlockedSeat(id, row, col);
    broadcastUpdate('room:seat_block_toggled', { roomId: id });
    res.json(room);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to toggle seat block' });
  }
});

app.delete('/api/rooms/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid room ID' });
    await deleteRoom(id);
    broadcastUpdate('room:deleted', { roomId: id });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete room' });
  }
});

app.post('/api/sessions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { title, examDate, timeSlot } = req.body ?? {};
    if (!title || !examDate || !timeSlot) {
      return res.status(400).json({ error: 'Title, date, and time slot are required' });
    }
    const session = await createExamSession({ title, examDate, timeSlot });
    broadcastUpdate('session:created', { sessionId: session.id });
    res.status(201).json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create exam session' });
  }
});

app.post('/api/students/bulk', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { items } = req.body ?? {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one student record is required' });
    }
    const validItems = items.filter(
      (i) =>
        i.rollNumber &&
        i.fullName &&
        i.department &&
        i.courseCode &&
        Number.isInteger(Number(i.examSessionId))
    );
    if (validItems.length === 0) {
      return res.status(400).json({ error: 'No valid student records provided' });
    }
    const inserted = await bulkCreateStudents(
      validItems.map((i) => ({
        rollNumber: String(i.rollNumber),
        fullName: String(i.fullName),
        department: String(i.department),
        courseCode: String(i.courseCode),
        examSessionId: Number(i.examSessionId),
      }))
    );
    broadcastUpdate('roster:updated', { addedCount: inserted.length });
    res.status(201).json({ inserted });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to import students' });
  }
});

app.delete('/api/students/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid student ID' });
    await deleteStudent(id);
    broadcastUpdate('roster:deleted', { studentId: id });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete student' });
  }
});

app.post('/api/allocations/run', requireAuth, async (req: AuthRequest, res) => {
  try {
    const examSessionId = Number(req.body?.examSessionId);
    const roomIds = Array.isArray(req.body?.roomIds)
      ? req.body.roomIds.map(Number).filter(Number.isInteger)
      : undefined;
    const strictDiagonal =
      typeof req.body?.strictDiagonal === 'boolean' ? req.body.strictDiagonal : true;

    if (!Number.isInteger(examSessionId)) {
      return res.status(400).json({ error: 'Valid examSessionId is required' });
    }

    const report = await runAndSaveSessionAllocation({
      examSessionId,
      roomIds,
      strictDiagonal,
    });
    broadcastUpdate('allocations:completed', { examSessionId });
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to run auto-allocation' });
  }
});

app.delete('/api/allocations/session/:sessionId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    if (!Number.isInteger(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }
    await clearSessionAllocations(sessionId);
    broadcastUpdate('allocations:cleared', { examSessionId: sessionId });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to clear allocations' });
  }
});

app.post('/api/allocations/swap', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { examSessionId, roomId, fromRow, fromCol, toRow, toCol } = req.body ?? {};
    if (
      ![examSessionId, roomId, fromRow, fromCol, toRow, toCol].every((n) =>
        Number.isInteger(Number(n))
      )
    ) {
      return res.status(400).json({ error: 'Valid seat coordinates are required for swap' });
    }
    await swapOrMoveSeats({
      examSessionId: Number(examSessionId),
      roomId: Number(roomId),
      fromRow: Number(fromRow),
      fromCol: Number(fromCol),
      toRow: Number(toRow),
      toCol: Number(toCol),
    });
    broadcastUpdate('seat:swapped', { roomId: Number(roomId), examSessionId: Number(examSessionId) });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to swap seats' });
  }
});

app.patch('/api/allocations/:id/checkin', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const checkedIn = Boolean(req.body?.checkedIn);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid allocation ID' });
    await toggleSeatCheckIn(id, checkedIn);
    broadcastUpdate('seat:checkin', { allocationId: id, checkedIn });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update check-in' });
  }
});

app.delete('/api/allocations/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid allocation ID' });
    await unassignSeat(id);
    broadcastUpdate('seat:unassigned', { allocationId: id });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to unassign seat' });
  }
});

app.get('/api/lookup', requireAuth, async (req: AuthRequest, res) => {
  try {
    const q = String(req.query.q ?? '');
    const results = await lookupStudents(q);
    res.json({ results });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to lookup student' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`ProctorGrid server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
