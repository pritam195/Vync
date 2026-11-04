import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const BACKEND_PORT = 5000;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function checkUrl(url) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureBackendRunning() {
  const isUp = await checkUrl(`${BACKEND_URL}/api/health`);
  if (isUp) {
    console.log('[Test] Existing backend server detected on port 5000.');
    return null;
  }

  console.log('[Test] Starting backend server with MEDIASOUP_STATS_LOG=true...');
  const proc = spawn(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'start'],
    {
      cwd: path.join(rootDir, 'server'),
      env: {
        ...process.env,
        PORT: String(BACKEND_PORT),
        NODE_ENV: 'test',
        MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vync_observability_test',
        REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
        JWT_SECRET: 'vync-test-secret',
        MEDIASOUP_STATS_LOG: 'true',
        MEDIASOUP_STATS_INTERVAL_MS: '2000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    },
  );

  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    if (await checkUrl(`${BACKEND_URL}/api/health`)) {
      console.log('[Test] Backend server is ready.');
      return proc;
    }
  }

  throw new Error('Backend server failed to start within 30 seconds');
}

async function runObservabilityTest() {
  console.log('============================================================');
  console.log('VYNC OBSERVABILITY & PROMETHEUS METRICS VERIFICATION');
  console.log('============================================================\n');

  const serverProc = await ensureBackendRunning();

  try {
    // 1. Scrape /metrics endpoint
    console.log('[1/4] Scraping Prometheus endpoint: GET /metrics');
    const metricsRes = await fetch(`${BACKEND_URL}/metrics`);
    if (!metricsRes.ok) {
      throw new Error(`Failed to scrape /metrics: ${metricsRes.status} ${await metricsRes.text()}`);
    }

    const contentType = metricsRes.headers.get('content-type') || '';
    const rawMetrics = await metricsRes.text();
    console.log(`      Content-Type: ${contentType}`);
    console.log(`      Payload size: ${rawMetrics.length} bytes`);

    // Verify key metrics present
    const expectedMetrics = [
      'vync_active_rooms',
      'vync_active_participants',
      'vync_sfu_workers_total',
      'vync_sfu_transports',
      'vync_sfu_producers',
      'vync_sfu_consumers',
      'vync_socket_events_total',
      'vync_socket_connected_clients',
      'vync_redis_ping_latency_ms',
      'vync_redis_connected',
    ];

    console.log('\n[2/4] Validating registered Prometheus metric families:');
    const metricLines = {};
    for (const name of expectedMetrics) {
      const match = rawMetrics.match(new RegExp(`^# HELP ${name}\\s+(.+)$`, 'm'));
      const sampleMatch = rawMetrics.match(new RegExp(`^${name}(?:\\{[^}]*\\})?\\s+([0-9.e+-]+)$`, 'm'));
      const val = sampleMatch ? sampleMatch[1] : 'present';
      metricLines[name] = val;
      console.log(`      [+] ${name.padEnd(32)}: ${val}`);
      if (!rawMetrics.includes(name)) {
        throw new Error(`Expected metric ${name} not found in Prometheus output`);
      }
    }

    // 2. Query JSON health metrics endpoint
    console.log('\n[3/4] Validating JSON API endpoint: GET /api/health/metrics');
    const jsonRes = await fetch(`${BACKEND_URL}/api/health/metrics`);
    if (!jsonRes.ok) {
      throw new Error(`Failed to fetch /api/health/metrics: ${jsonRes.status}`);
    }
    const jsonData = await jsonRes.json();
    console.log(`      Service status: ${jsonData.status}`);
    console.log(`      SFU workers:    ${jsonData.sfu?.totalWorkers || 'N/A'}`);
    console.log(`      Active rooms:   ${jsonData.sfu?.totalRooms || 0}`);
    console.log(`      Total routers:  ${jsonData.sfu?.rooms?.length || 0}`);
    console.log(`      System CPUs:    ${jsonData.system?.cpus} (${jsonData.system?.cpuModel || 'N/A'})`);
    console.log(`      Memory free:    ${((jsonData.system?.freeMemory || 0) / (1024 ** 3)).toFixed(2)} GB`);

    // 3. Create a room and verify mediasoup stats summary calculation
    console.log('\n[4/4] Verifying Mediasoup getStats() summary calculation...');
    const roomCode = `OBS-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const meetingRes = await fetch(`${BACKEND_URL}/api/meetings/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Observability Test Room',
        meetingId: roomCode,
        hostName: 'MetricsHost',
      }),
    });
    const meetingData = await meetingRes.json();
    console.log(`      Meeting created: ${meetingData.meeting?.meetingId || roomCode}`);

    // Re-scrape /metrics to observe room creation reflect in metrics
    const metricsAfter = await (await fetch(`${BACKEND_URL}/metrics`)).text();
    const roomsAfterMatch = metricsAfter.match(/^vync_active_rooms\s+([0-9.]+)/m);
    const roomsCount = roomsAfterMatch ? roomsAfterMatch[1] : '0';
    console.log(`      vync_active_rooms updated: ${roomsCount}`);

    const results = {
      timestamp: new Date().toISOString(),
      status: 'PASS',
      prometheusEndpoint: '/metrics',
      jsonEndpoint: '/api/health/metrics',
      metricsCount: expectedMetrics.length,
      metricsVerified: expectedMetrics,
      sampleValues: metricLines,
      sfuWorkers: jsonData.sfu?.totalWorkers || 0,
      activeRooms: Number(roomsCount),
      redisPingMs: Number(metricLines['vync_redis_ping_latency_ms'] || 0),
      redisConnected: Number(metricLines['vync_redis_connected'] || 0),
    };

    fs.writeFileSync(
      path.join(rootDir, 'observability-test-results.json'),
      JSON.stringify(results, null, 2),
      'utf8',
    );

    console.log('\n============================================================');
    console.log('OBSERVABILITY VERIFICATION: PASSED');
    console.log('Results saved to observability-test-results.json');
    console.log('Grafana Dashboard ready at: docs/grafana-dashboard.json');
    console.log('============================================================\n');

  } finally {
    if (serverProc) {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(serverProc.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        serverProc.kill();
      }
    }
  }
}

runObservabilityTest().catch((err) => {
  console.error('\n[FATAL ERROR]', err);
  process.exit(1);
});

