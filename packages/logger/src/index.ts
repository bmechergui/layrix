import pino from 'pino';

// pino-pretty uses worker_threads which webpack (Next.js) cannot bundle.
// Omit the transport option entirely — Next.js RSC routes get plain JSON logs.
// For readable dev output: pipe the dev server → pino-pretty in a terminal.
export const logger = pino({
  level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
});

export type Logger = typeof logger;
