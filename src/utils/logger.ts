import { env } from '@/config/env';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;

type Level = keyof typeof LEVELS;

const threshold = LEVELS[env.LOG_LEVEL];

function write(level: Level, message: string, meta?: unknown): void {
  if (LEVELS[level] > threshold) return;

  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;

  if (meta === undefined) sink(line);
  else sink(line, meta);
}

/**
 * Minimal level-aware console logger. Swap the `write` implementation for
 * pino/winston later without touching call sites.
 */
export const logger = {
  error: (message: string, meta?: unknown) => write('error', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  info: (message: string, meta?: unknown) => write('info', message, meta),
  debug: (message: string, meta?: unknown) => write('debug', message, meta),
};
