import { chromium } from '@playwright/test';
import os from 'os';
import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const BACKEND_PORT = process.env.TEST_BACKEND_PORT || 5000;
const FRONTEND_PORT = process.env.TEST_FRONTEND_PORT || 4173;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

// Parse command line arguments
const args = process.argv.slice(2);
let testLevels = [5, 10, 15, 20, 25];

for (const arg of args) {
  if (arg.startsWith('--levels=')) {
    testLevels = arg.split('=')[1].split(',').map((n) => parseInt(n.trim(), 10)).filter(Boolean);
  } else if (arg === '--quick') {
    testLevels = [5, 10, 15];
  } else if (arg.startsWith('--max=')) {
    const max = parseInt(arg.split('=')[1], 10);
    testLevels = testLevels.filter((n) => n <= max);
  }
}

const STABILIZATION_TIME_MS = 12000; // Time to allow media streaming before gathering stats
const JOIN_TIMEOUT_MS = 30000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSystemHardware() {
  const cpus = os.cpus();
  return {
    model: cpus[0]?.model || 'Unknown',
    logicalCores: cpus.length,
    totalMemGB: (os.totalmem() / (1024 ** 3)).toFixed(1),
    freeMemGB: (os.freemem() / (1024 ** 3)).toFixed(1),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
  };
}

async function checkUrl(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

class LoadTestRunner {
  constructor() {
    this.hardware = getSystemHardware();
    this.serverProcess = null;
    this.previewProcess = null;
    this.browser = null;
    this.results = [];
  }

  async ensureServers() {
    const backendUp = await checkUrl(`${BACKEND_URL}/api/health`);
    if (!backendUp) {
      console.log(`[LoadTest] Starting backend server on port ${BACKEND_PORT}...`);
      this.serverProcess = spawn(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['run', 'start'],
        {
          cwd: path.join(rootDir, 'server'),
          env: {
            ...process.env,
            PORT: String(BACKEND_PORT),
            NODE_ENV: 'test',
            CLIENT_URL: `${FRONTEND_URL},http://localhost:${FRONTEND_PORT},http://127.0.0.1:4173,http://localhost:4173,http://127.0.0.1:5173,http://localhost:5173`,
            MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vync_load_test',
            JWT_SECRET: 'vync-load-test-secret',
            MEDIASOUP_MIN_PORT: '40000',
            MEDIASOUP_MAX_PORT: '40500',
            MEDIASOUP_NUM_WORKERS: process.env.MEDIASOUP_NUM_WORKERS || '1',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,
        },
      );

      this.serverProcess.stdout.on('data', (chunk) => {
        const str = chunk.toString();
        if (str.includes('[mediasoup]') || str.includes('running on port')) {
          console.log(`[Server] ${str.trim()}`);
        }
      });
      this.serverProcess.stderr.on('data', (chunk) => {
        console.error(`[Server Err] ${chunk.toString().trim()}`);
      });

      let ready = false;
      for (let i = 0; i < 30; i++) {
        await sleep(1000);
        if (await checkUrl(`${BACKEND_URL}/api/health`)) {
          ready = true;
          break;
        }
      }
      if (!ready) {
        throw new Error('Backend failed to start within 30 seconds');
      }
      console.log('[LoadTest] Backend server is ready.');
    } else {
      console.log('[LoadTest] Existing backend server detected.');
    }

    const frontendUp = await checkUrl(FRONTEND_URL);
    if (!frontendUp) {
      console.log(`[LoadTest] Starting frontend preview server on port ${FRONTEND_PORT}...`);
      this.previewProcess = spawn(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        ['vite', 'preview', '--host', '127.0.0.1', '--port', String(FRONTEND_PORT)],
        {
          cwd: path.join(rootDir, 'client'),
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,
        },
      );

      let ready = false;
      for (let i = 0; i < 20; i++) {
        await sleep(1000);
        if (await checkUrl(FRONTEND_URL)) {
          ready = true;
          break;
        }
      }
      if (!ready) {
        throw new Error('Frontend preview failed to start within 20 seconds');
      }
      console.log('[LoadTest] Frontend preview is ready.');
    } else {
      console.log('[LoadTest] Existing frontend preview server detected.');
    }
  }

  async createMeetingRoom() {
    const meetingCode = `LOAD-${Date.now().toString(36).slice(-4).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
    const res = await postJson(`${BACKEND_URL}/api/meetings/create`, {
      title: `Mediasoup Load Test ${meetingCode}`,
      meetingId: meetingCode,
      hostName: 'LoadTestHost',
      settings: {
        waitingRoom: false,
        allowChat: true,
        allowScreenShare: true,
        allowWhiteboard: true,
        allowFileShare: true,
      },
    });

    return res.meeting?.meetingId || meetingCode;
  }

  async launchBrowser() {
    console.log('[LoadTest] Launching Chromium with fake media flags...');
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--mute-audio',
        '--autoplay-policy=no-user-gesture-required',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--js-flags=--max-old-space-size=256',
      ],
    });
  }

  async runLevel(n) {
    console.log(`\n============================================================`);
    console.log(`>>> STARTING LOAD TEST FOR N = ${n} PARTICIPANTS <<<`);
    console.log(`============================================================`);

    const meetingId = await this.createMeetingRoom();
    console.log(`[LoadTest] Created test meeting room: ${meetingId}`);

    // Capture initial server metrics
    const initialMetrics = await fetchJson(`${BACKEND_URL}/api/health/metrics`).catch(() => null);
    const startTime = Date.now();

    const contexts = [];
    const pages = [];
    let successfulJoins = 0;
    const joinLatencies = [];

    try {
      console.log(`[LoadTest] Spawning ${n} browser clients...`);

      for (let i = 0; i < n; i++) {
        const clientIndex = i + 1;
        const guestName = `User-${clientIndex}`;
        const joinStart = Date.now();

        const context = await this.browser.newContext({
          viewport: { width: 400, height: 300 },
          permissions: ['camera', 'microphone'],
        });

        // Inject hook to capture all RTCPeerConnections
        await context.addInitScript(() => {
          window.__vyncPeerConnections = [];
          const OrigPC = window.RTCPeerConnection;
          window.RTCPeerConnection = function (...args) {
            const pc = new OrigPC(...args);
            window.__vyncPeerConnections.push(pc);
            return pc;
          };
          window.RTCPeerConnection.prototype = OrigPC.prototype;
          Object.assign(window.RTCPeerConnection, OrigPC);
        });

        contexts.push(context);
        const page = await context.newPage();
        pages.push(page);

        // Join room
        try {
          await page.goto(`${FRONTEND_URL}/meeting/${meetingId}`, { waitUntil: 'domcontentloaded', timeout: 15000 });

          // Fill prejoin form
          const nameInput = page.getByTestId('prejoin-name-input');
          await nameInput.waitFor({ state: 'visible', timeout: 8000 });
          await nameInput.fill(guestName);

          const submitBtn = page.getByTestId('prejoin-submit');
          await submitBtn.click();

          // Wait until participant list or video container is active
          await page.getByTestId('meeting-panel-participants').waitFor({ state: 'attached', timeout: JOIN_TIMEOUT_MS });

          const joinDuration = Date.now() - joinStart;
          joinLatencies.push(joinDuration);
          successfulJoins += 1;
          process.stdout.write(`  [+] Client ${clientIndex}/${n} joined in ${joinDuration}ms\n`);
        } catch (err) {
          console.error(`  [-] Client ${clientIndex}/${n} failed to join: ${err.message}`);
        }

        // Small stagger to simulate realistic arrivals and prevent socket stampede
        if (i < n - 1) {
          await sleep(500);
        }
      }

      console.log(`[LoadTest] Join Phase Complete: ${successfulJoins}/${n} clients joined.`);
      console.log(`[LoadTest] Stabilizing media streams for ${STABILIZATION_TIME_MS / 1000} seconds...`);
      await sleep(STABILIZATION_TIME_MS);

      // Collect WebRTC getStats() across all connected clients
      console.log('[LoadTest] Collecting WebRTC getStats() from clients...');
      let totalPacketsLost = 0;
      let totalPacketsReceived = 0;
      let totalFramesDropped = 0;
      let totalFramesReceived = 0;
      let totalFramesDecoded = 0;
      let totalBytesReceived = 0;
      let jitterSum = 0;
      let jitterCount = 0;

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        try {
          const stats = await page.evaluate(async () => {
            const pcs = window.__vyncPeerConnections || [];
            const result = {
              packetsLost: 0,
              packetsReceived: 0,
              framesDropped: 0,
              framesReceived: 0,
              framesDecoded: 0,
              bytesReceived: 0,
              jitters: [],
            };

            for (const pc of pcs) {
              if (pc.iceConnectionState === 'closed') continue;
              const reports = await pc.getStats();
              reports.forEach((report) => {
                if (report.type === 'inbound-rtp' && report.kind === 'video') {
                  result.packetsLost += report.packetsLost || 0;
                  result.packetsReceived += report.packetsReceived || 0;
                  result.framesDropped += report.framesDropped || 0;
                  result.framesReceived += report.framesReceived || 0;
                  result.framesDecoded += report.framesDecoded || 0;
                  result.bytesReceived += report.bytesReceived || 0;
                  if (typeof report.jitter === 'number') {
                    result.jitters.push(report.jitter * 1000); // ms
                  }
                }
              });
            }
            return result;
          });

          totalPacketsLost += stats.packetsLost;
          totalPacketsReceived += stats.packetsReceived;
          totalFramesDropped += stats.framesDropped;
          totalFramesReceived += stats.framesReceived;
          totalFramesDecoded += stats.framesDecoded;
          totalBytesReceived += stats.bytesReceived;
          stats.jitters.forEach((j) => {
            jitterSum += j;
            jitterCount += 1;
          });
        } catch {
          // page may be closing or errored
        }
      }

      // Collect ending server metrics
      const finalMetrics = await fetchJson(`${BACKEND_URL}/api/health/metrics`).catch(() => null);
      const elapsedTimeSec = (Date.now() - startTime) / 1000;

      // Calculate server CPU and worker resource usage
      let workerCpuPercent = 0;
      let workerMaxRssMB = 0;
      let sfuProducers = 0;
      let sfuConsumers = 0;

      if (finalMetrics?.sfu?.workers?.[0]?.usage) {
        const wFinal = finalMetrics.sfu.workers[0].usage;
        const wInit = initialMetrics?.sfu?.workers?.[0]?.usage || { ru_utime: 0, ru_stime: 0 };
        const utimeDiff = (wFinal.ru_utime - wInit.ru_utime) / 1000; // ms to sec
        const stimeDiff = (wFinal.ru_stime - wInit.ru_stime) / 1000;
        const totalWorkerCpuSec = utimeDiff + stimeDiff;
        workerCpuPercent = Math.min(100, Math.round((totalWorkerCpuSec / elapsedTimeSec) * 100));
        workerMaxRssMB = (wFinal.ru_maxrss / 1024).toFixed(1);
      }

      if (finalMetrics?.sfu) {
        sfuProducers = finalMetrics.sfu.totalProducers || 0;
        sfuConsumers = finalMetrics.sfu.totalConsumers || 0;
      }

      const packetLossPercent =
        totalPacketsReceived + totalPacketsLost > 0
          ? ((totalPacketsLost / (totalPacketsReceived + totalPacketsLost)) * 100).toFixed(2)
          : '0.00';

      const frameDropPercent =
        totalFramesReceived + totalFramesDropped > 0
          ? ((totalFramesDropped / (totalFramesReceived + totalFramesDropped)) * 100).toFixed(2)
          : '0.00';

      const avgJitterMs = jitterCount > 0 ? (jitterSum / jitterCount).toFixed(1) : '0.0';
      const avgJoinLatencyMs =
        joinLatencies.length > 0
          ? Math.round(joinLatencies.reduce((a, b) => a + b, 0) / joinLatencies.length)
          : 0;

      const isStable =
        successfulJoins === n &&
        parseFloat(packetLossPercent) < 2.0 &&
        parseFloat(frameDropPercent) < 5.0 &&
        workerCpuPercent < 90;

      const levelResult = {
        n,
        successfulJoins,
        joinSuccessRate: `${((successfulJoins / n) * 100).toFixed(0)}%`,
        avgJoinLatencyMs,
        sfuProducers,
        sfuConsumers,
        workerCpuPercent: `${workerCpuPercent}%`,
        workerMaxRssMB: `${workerMaxRssMB} MB`,
        totalPacketsReceived,
        totalPacketsLost,
        packetLossPercent: `${packetLossPercent}%`,
        totalFramesReceived,
        totalFramesDropped,
        totalFramesDecoded,
        frameDropPercent: `${frameDropPercent}%`,
        avgJitterMs: `${avgJitterMs} ms`,
        status: isStable ? 'STABLE' : 'DEGRADED',
      };

      console.log(`\n--- RESULTS FOR N = ${n} ---`);
      console.log(`  Join Success Rate: ${levelResult.joinSuccessRate} (${successfulJoins}/${n})`);
      console.log(`  Avg Join Latency:  ${avgJoinLatencyMs} ms`);
      console.log(`  SFU Routing:       ${sfuProducers} producers, ${sfuConsumers} consumers`);
      console.log(`  Worker CPU:        ${levelResult.workerCpuPercent} (Max RSS: ${levelResult.workerMaxRssMB})`);
      console.log(`  Packet Loss:       ${levelResult.packetLossPercent} (${totalPacketsLost}/${totalPacketsReceived + totalPacketsLost})`);
      console.log(`  Frame Drop Rate:   ${levelResult.frameDropPercent} (${totalFramesDropped}/${totalFramesReceived + totalFramesDropped})`);
      console.log(`  Avg Jitter:        ${levelResult.avgJitterMs}`);
      console.log(`  Overall Status:    ${levelResult.status}`);

      this.results.push(levelResult);
    } finally {
      // Clean up browser contexts for this level
      console.log(`[LoadTest] Cleaning up ${contexts.length} contexts...`);
      for (const ctx of contexts) {
        await ctx.close().catch(() => {});
        await sleep(50);
      }
      await sleep(2000);
    }
  }

  async run() {
    console.log(`============================================================`);
    console.log(`VYNC MEDIASOUP SFU WEBRTC LOAD TEST BENCHMARK`);
    console.log(`============================================================`);
    console.log(`Hardware Specs:`);
    console.log(`  CPU: ${this.hardware.model} (${this.hardware.logicalCores} logical cores)`);
    console.log(`  RAM: ${this.hardware.totalMemGB} GB total (${this.hardware.freeMemGB} GB free)`);
    console.log(`  OS:  ${this.hardware.platform} (${this.hardware.arch})`);
    console.log(`Testing levels: ${testLevels.join(', ')} participants`);
    console.log(`============================================================\n`);

    await this.ensureServers();
    await this.launchBrowser();

    for (const n of testLevels) {
      await this.ensureServers();
      await this.runLevel(n);
      // Small cooling period between levels
      await sleep(3000);
    }

    if (this.browser) {
      await this.browser.close().catch(() => {});
    }
    if (process.platform === 'win32') {
      if (this.serverProcess?.pid) {
        spawn('taskkill', ['/pid', String(this.serverProcess.pid), '/T', '/F'], { stdio: 'ignore' });
      }
      if (this.previewProcess?.pid) {
        spawn('taskkill', ['/pid', String(this.previewProcess.pid), '/T', '/F'], { stdio: 'ignore' });
      }
    } else {
      if (this.serverProcess) this.serverProcess.kill();
      if (this.previewProcess) this.previewProcess.kill();
    }

    this.generateSummary();
    process.exit(0);
  }

  generateSummary() {
    const reportPath = path.join(rootDir, 'mediasoup-load-test-results.json');
    let combinedResults = [...this.results];
    if (fs.existsSync(reportPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        if (existing.levels && Array.isArray(existing.levels)) {
          const newMap = new Map();
          for (const item of existing.levels) newMap.set(item.n, item);
          for (const item of this.results) newMap.set(item.n, item);
          combinedResults = Array.from(newMap.values()).sort((a, b) => a.n - b.n);
        }
      } catch {
        // ignore parse error
      }
    }

    console.log(`\n============================================================`);
    console.log(`FINAL BENCHMARK SUMMARY TABLE`);
    console.log(`============================================================\n`);
    console.table(combinedResults);

    const stableLevels = combinedResults.filter((r) => r.status === 'STABLE');
    const highestStable = stableLevels.length > 0 ? stableLevels[stableLevels.length - 1].n : 0;

    console.log(`\n============================================================`);
    console.log(`VERDICT:`);
    console.log(`Highest N where video stayed stable: ${highestStable} participants`);
    console.log(`Test Hardware: ${this.hardware.model} (${this.hardware.logicalCores} vCPU), 1 mediasoup worker`);
    console.log(`============================================================\n`);

    // Write results JSON
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          hardware: this.hardware,
          highestStableN: highestStable,
          levels: combinedResults,
        },
        null,
        2,
      ),
    );
    console.log(`Saved detailed benchmark JSON to: ${reportPath}`);
  }
}

const runner = new LoadTestRunner();
runner.run().catch((err) => {
  console.error('[LoadTest FATAL ERROR]:', err);
  process.exit(1);
});
