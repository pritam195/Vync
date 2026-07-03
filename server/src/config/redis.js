import { createClient } from 'redis';

const DEFAULT_DEVELOPMENT_REDIS_URL = 'redis://localhost:6379';
const REDIS_RETRY_AFTER_MS = 30000;

let redisClient = null;
let redisClientPromise = null;
let lastRedisFailureAt = 0;
let hasLoggedMissingProductionUrl = false;

function formatRedisError(error) {
  return error?.message || error?.code || String(error || 'unknown Redis connection error');
}

function getRedisUrl() {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }

  if (process.env.NODE_ENV === 'production') {
    return '';
  }

  if (process.env.NODE_ENV === 'test') {
    return '';
  }

  return DEFAULT_DEVELOPMENT_REDIS_URL;
}

export async function getRedisClient() {
  const redisUrl = getRedisUrl();

  if (!redisUrl) {
    if (process.env.NODE_ENV === 'production' && !hasLoggedMissingProductionUrl) {
      console.error('Redis is not configured. Set REDIS_URL to enable active room state storage.');
      hasLoggedMissingProductionUrl = true;
    }
    return null;
  }

  if (redisClient?.isReady) {
    return redisClient;
  }

  if (redisClientPromise) {
    return redisClientPromise;
  }

  if (Date.now() - lastRedisFailureAt < REDIS_RETRY_AFTER_MS) {
    return null;
  }

  redisClient = createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy: false,
    },
  });

  redisClient.on('error', (error) => {
    console.error('Redis connection error:', formatRedisError(error));
  });

  redisClientPromise = redisClient
    .connect()
    .then(() => {
      console.log(`Redis connected: ${redisUrl}`);
      return redisClient;
    })
    .catch((error) => {
      lastRedisFailureAt = Date.now();
      console.error(
        `Redis unavailable at ${redisUrl}. Falling back to in-process room state: ${formatRedisError(error)}`,
      );
      redisClient = null;
      return null;
    })
    .finally(() => {
      redisClientPromise = null;
    });

  return redisClientPromise;
}

export async function closeRedisClient() {
  if (!redisClient) {
    return;
  }

  const client = redisClient;
  redisClient = null;

  if (client.isOpen) {
    await client.quit();
  }
}
