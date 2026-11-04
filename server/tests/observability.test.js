import request from 'supertest';
import app from '../src/app.js';
import {
  getPrometheusMetrics,
  recordSocketConnection,
  recordSocketDisconnection,
  recordSocketEvent,
  register,
} from '../src/services/metricsService.js';
import mediasoupManager from '../src/sfu/mediasoupManager.js';

describe('Observability & Prometheus Metrics', () => {
  beforeAll(async () => {
    await mediasoupManager.init();
  });

  afterAll(async () => {
    await mediasoupManager.close();
  });

  it('exposes Prometheus text metrics at GET /metrics with required gauges and counters', async () => {
    const res = await request(app)
      .get('/metrics')
      .expect(200);

    expect(res.headers['content-type']).toContain('text/plain');
    const text = res.text;

    // Verify presence of core Vync business & infrastructure metrics
    expect(text).toContain('vync_active_rooms');
    expect(text).toContain('vync_active_participants');
    expect(text).toContain('vync_sfu_workers_total');
    expect(text).toContain('vync_sfu_transports');
    expect(text).toContain('vync_sfu_producers');
    expect(text).toContain('vync_sfu_consumers');
    expect(text).toContain('vync_socket_events_total');
    expect(text).toContain('vync_socket_connected_clients');
    expect(text).toContain('vync_redis_ping_latency_ms');
    expect(text).toContain('vync_redis_connected');

    // Verify presence of standard NodeJS runtime metrics
    expect(text).toContain('vync_process_cpu');
    expect(text).toContain('vync_nodejs_heap_size_used_bytes');
  });

  it('tracks socket events and connection counts in Prometheus counters', async () => {
    recordSocketConnection();
    recordSocketEvent('join-room', 'in');
    recordSocketEvent('whiteboard-draw', 'in');
    recordSocketEvent('whiteboard-draw', 'in');

    const metricsText = await getPrometheusMetrics();

    expect(metricsText).toContain('vync_socket_events_total{event="join-room",direction="in"} 1');
    expect(metricsText).toContain('vync_socket_events_total{event="whiteboard-draw",direction="in"} 2');
    expect(metricsText).toContain('vync_socket_connected_clients');

    recordSocketDisconnection();
  });

  it('computes room mediasoup stats summary with RTT, packet loss, and bitrate', async () => {
    const roomId = 'OBS-ROOM-TEST';
    await mediasoupManager.getOrCreateRouter(roomId);

    const summary = await mediasoupManager.getRoomStatsSummary(roomId);
    expect(summary).not.toBeNull();
    expect(summary.roomId).toBe(roomId);
    expect(typeof summary.lossPercent).toBe('number');
    expect(typeof summary.avgRttMs).toBe('number');
    expect(typeof summary.inBitrateKbps).toBe('number');
    expect(typeof summary.outBitrateKbps).toBe('number');

    mediasoupManager.closeRoom(roomId);
  });

  it('serves JSON metrics at GET /api/health/metrics and supports Prometheus format via query', async () => {
    // 1. Standard JSON
    const jsonRes = await request(app)
      .get('/api/health/metrics')
      .expect(200);

    expect(jsonRes.body.status).toBe('ok');
    expect(jsonRes.body.system).toBeDefined();
    expect(jsonRes.body.sfu).toBeDefined();

    // 2. Format query parameter
    const promRes = await request(app)
      .get('/api/health/metrics?format=prometheus')
      .expect(200);

    expect(promRes.headers['content-type']).toContain('text/plain');
    expect(promRes.text).toContain('vync_active_rooms');
  });
});

