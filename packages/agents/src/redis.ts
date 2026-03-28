import Redis from 'ioredis';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const url = process.env['REDIS_URL'];
    if (!url) throw new Error('REDIS_URL is not set');
    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });
  }
  return redis;
}

// Pubsub — canal SSE par projet
export const PCB_CHANNEL = (projectId: string) => `agent:${projectId}`;

// TTL Redis pour l'état PCB et l'historique (24h)
export const PCB_STATE_TTL = 60 * 60 * 24;
export const PCB_STATE_KEY = (projectId: string) => `pcb:state:${projectId}`;
export const PCB_HISTORY_KEY = (projectId: string) => `pcb:history:${projectId}`;
