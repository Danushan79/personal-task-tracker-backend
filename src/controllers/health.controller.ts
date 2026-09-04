import type { Request, Response } from 'express';
import mongoose from 'mongoose';

const DB_STATES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
  99: 'uninitialized',
};

export function getHealth(_req: Request, res: Response): void {
  const dbState = DB_STATES[mongoose.connection.readyState] ?? 'unknown';
  const healthy = dbState === 'connected';

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: dbState,
  });
}
