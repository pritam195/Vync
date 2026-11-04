import client from 'prom-client';
import { performance } from 'perf_hooks';
import roomStateService from './roomStateService.js';
import mediasoupManager from '../sfu/mediasoupManager.js';
import { getRedisClient } from '../config/redis.js';

// Create Prometheus Registry
export const register = new client.Registry();

// Standard Node.js default process metrics
client.collectDefaultMetrics({
  register,
  prefix: 'vync_',
});

// Custom Gauges and Counters
export const activeRoomsGauge = new client.Gauge({
  name: 'vync_active_rooms',
  help: 'Total number of active meeting rooms',
  registers: [register],
});

export const activeParticipantsGauge = new client.Gauge({
  name: 'vync_active_participants',
  help: 'Total number of active participants connected across all rooms',
  registers: [register],
});

export const sfuWorkersGauge = new client.Gauge({
  name: 'vync_sfu_workers_total',
  help: 'Total number of mediasoup SFU worker processes',
  registers: [register],
});

export const sfuWorkerCpuGauge = new client.Gauge({
  name: 'vync_sfu_worker_cpu_percent',
  help: 'Estimated CPU percentage per mediasoup worker process',
  labelNames: ['worker_id', 'pid'],
  registers: [register],
});

export const sfuWorkerRssGauge = new client.Gauge({
  name: 'vync_sfu_worker_memory_rss_bytes',
  help: 'Resident Set Size (RSS) memory in bytes per mediasoup worker process',
  labelNames: ['worker_id', 'pid'],
  registers: [register],
});

export const sfuTransportsGauge = new client.Gauge({
  name: 'vync_sfu_transports',
  help: 'Total active SFU transports by type',
  labelNames: ['type'],
  registers: [register],
});

export const sfuProducersGauge = new client.Gauge({
  name: 'vync_sfu_producers',
  help: 'Total active SFU media producers by kind',
  labelNames: ['kind'],
  registers: [register],
});

export const sfuConsumersGauge = new client.Gauge({
  name: 'vync_sfu_consumers',
  help: 'Total active SFU media consumers by kind',
  labelNames: ['kind'],
  registers: [register],
});

export const socketEventsCounter = new client.Counter({
  name: 'vync_socket_events_total',
  help: 'Total count of Socket.IO events handled',
  labelNames: ['event', 'direction'],
  registers: [register],
});

export const socketConnectedClientsGauge = new client.Gauge({
  name: 'vync_socket_connected_clients',
  help: 'Current count of connected Socket.IO client connections',
  registers: [register],
});

export const redisLatencyGauge = new client.Gauge({
  name: 'vync_redis_ping_latency_ms',
  help: 'Round-trip latency in milliseconds for Redis PING',
  registers: [register],
});

export const redisConnectedGauge = new client.Gauge({
  name: 'vync_redis_connected',
  help: 'Redis connection status (1 = connected, 0 = fallback to in-memory)',
  registers: [register],
});

export const roomRttGauge = new client.Gauge({
  name: 'vync_room_stats_rtt_ms',
  help: 'Average round trip time in ms per room',
  labelNames: ['room_id'],
  registers: [register],
});

export const roomPacketLossGauge = new client.Gauge({
  name: 'vync_room_stats_loss_percent',
  help: 'Packet loss percentage per room',
  labelNames: ['room_id'],
  registers: [register],
});

export const roomBitrateGauge = new client.Gauge({
  name: 'vync_room_stats_bitrate_kbps',
  help: 'Aggregate bitrate in kbps per room',
  labelNames: ['room_id', 'direction'],
  registers: [register],
});

// Event recording helpers
export function recordSocketEvent(eventName, direction = 'in') {
  try {
    const safeName = String(eventName || 'unknown').slice(0, 50);
    socketEventsCounter.labels(safeName, direction).inc();
  } catch {
    // Ignore metric collection errors
  }
}

export function recordSocketConnection() {
  socketConnectedClientsGauge.inc();
}

export function recordSocketDisconnection() {
  socketConnectedClientsGauge.dec();
}

let lastWorkerCpuTimes = new Map();

export async function updateAllMetrics() {
  // 1. Room and participant state
  try {
    const roomSummary = await roomStateService.getActiveRoomsSummary();
    activeRoomsGauge.set(roomSummary.activeRooms || 0);
    activeParticipantsGauge.set(roomSummary.totalParticipants || 0);
  } catch {
    activeRoomsGauge.set(0);
    activeParticipantsGauge.set(0);
  }

  // 2. Mediasoup SFU metrics
  try {
    const sfuMetrics = await mediasoupManager.getMetrics();
    sfuWorkersGauge.set(sfuMetrics.totalWorkers || 0);
    sfuTransportsGauge.labels('webrtc').set(sfuMetrics.totalTransports || 0);
    sfuTransportsGauge.labels('pipe').set(sfuMetrics.totalPipedProducers || 0);
    sfuProducersGauge.labels('all').set(sfuMetrics.totalProducers || 0);
    sfuConsumersGauge.labels('all').set(sfuMetrics.totalConsumers || 0);

    const now = Date.now();
    for (const w of sfuMetrics.workers || []) {
      const workerLabel = String(w.index);
      const pidLabel = String(w.pid || 0);

      if (w.usage) {
        // RSS memory in bytes (ru_maxrss is KB on Linux, bytes on Windows/macOS)
        const rssBytes = process.platform === 'win32'
          ? (w.usage.ru_maxrss || 0)
          : (w.usage.ru_maxrss || 0) * 1024;
        sfuWorkerRssGauge.labels(workerLabel, pidLabel).set(rssBytes);

        // CPU percentage estimation
        const totalCpuSec = ((w.usage.ru_utime || 0) + (w.usage.ru_stime || 0)) / 1000000;
        const prev = lastWorkerCpuTimes.get(w.index);

        if (prev && now > prev.time) {
          const deltaSec = (now - prev.time) / 1000;
          const deltaCpu = totalCpuSec - prev.cpu;
          const cpuPercent = Math.max(0, Math.min(100, (deltaCpu / deltaSec) * 100));
          sfuWorkerCpuGauge.labels(workerLabel, pidLabel).set(Math.round(cpuPercent));
        } else {
          sfuWorkerCpuGauge.labels(workerLabel, pidLabel).set(0);
        }

        lastWorkerCpuTimes.set(w.index, { cpu: totalCpuSec, time: now });
      }
    }

    // Room stats
    for (const r of sfuMetrics.rooms || []) {
      const summary = await mediasoupManager.getRoomStatsSummary(r.roomId);
      if (summary) {
        roomRttGauge.labels(r.roomId).set(summary.avgRttMs);
        roomPacketLossGauge.labels(r.roomId).set(summary.lossPercent);
        roomBitrateGauge.labels(r.roomId, 'in').set(summary.inBitrateKbps);
        roomBitrateGauge.labels(r.roomId, 'out').set(summary.outBitrateKbps);
      }
    }
  } catch (err) {
    // SFU metrics error
  }

  // 3. Redis Ping & Connection state
  try {
    const redis = await getRedisClient();
    if (redis && redis.isReady) {
      const t0 = performance.now();
      await redis.ping();
      const latency = performance.now() - t0;
      redisLatencyGauge.set(Math.round(latency * 100) / 100);
      redisConnectedGauge.set(1);
    } else {
      redisConnectedGauge.set(0);
      redisLatencyGauge.set(0);
    }
  } catch {
    redisConnectedGauge.set(0);
    redisLatencyGauge.set(0);
  }
}

export async function getPrometheusMetrics() {
  await updateAllMetrics();
  return register.metrics();
}

export async function getMetricsJson() {
  await updateAllMetrics();
  const roomSummary = await roomStateService.getActiveRoomsSummary().catch(() => ({ activeRooms: 0, totalParticipants: 0 }));
  const sfuMetrics = await mediasoupManager.getMetrics().catch(() => ({}));
  let redisStats = { connected: false, pingMs: 0 };

  try {
    const redis = await getRedisClient();
    if (redis?.isReady) {
      const t0 = performance.now();
      await redis.ping();
      redisStats = { connected: true, pingMs: Math.round((performance.now() - t0) * 100) / 100 };
    }
  } catch {}

  return {
    status: 'ok',
    timestamp: Date.now(),
    rooms: roomSummary,
    sfu: sfuMetrics,
    redis: redisStats,
  };
}

export default {
  register,
  getPrometheusMetrics,
  getMetricsJson,
  recordSocketEvent,
  recordSocketConnection,
  recordSocketDisconnection,
};

