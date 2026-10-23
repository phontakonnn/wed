import { isAppError, toAppError } from './errors';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  code?: string;
  status?: number;
  timestamp: number;
  details?: Record<string, unknown>;
}

export type LoggerSink = (entry: LogEntry) => void;

const buffer: LogEntry[] = [];
const MAX_BUFFER = 200;
let sink: LoggerSink | null = null;

/** Plug Crashlytics/Sentry in later without touching call sites. */
export function setLoggerSink(next: LoggerSink | null): void {
  sink = next;
}

export function getRecentLogs(): readonly LogEntry[] {
  return buffer;
}

function write(level: LogLevel, message: string, context?: string, details?: Record<string, unknown>, error?: unknown): void {
  const appError = error === undefined ? null : toAppError(error);
  const entry: LogEntry = {
    level,
    message,
    context,
    code: appError?.code,
    status: appError?.status,
    timestamp: Date.now(),
    details: error === undefined ? details : { ...details, cause: appError?.cause ?? error },
  };

  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();

  if (import.meta.env.DEV) {
    const printer = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
    printer(`[${level}]${context ? ` ${context}` : ''} ${message}`, entry.details ?? '');
  }

  try {
    sink?.(entry);
  } catch {
    // A failing sink must never crash the app.
  }
}

export const logger = {
  debug: (message: string, context?: string, details?: Record<string, unknown>) => write('debug', message, context, details),
  info: (message: string, context?: string, details?: Record<string, unknown>) => write('info', message, context, details),
  warn: (message: string, context?: string, details?: Record<string, unknown>) => write('warn', message, context, details),
  error: (message: string, error?: unknown, context?: string, details?: Record<string, unknown>) => {
    write('error', message, context, details, error);
    // Keep the original stack available for local debugging.
    if (import.meta.env.DEV && error !== undefined) {
      console.error(error);
    }
  },
};

export function isOfflineError(error: unknown): boolean {
  return isAppError(error) && error.code === 'offline';
}
