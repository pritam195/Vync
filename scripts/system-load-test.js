import { chromium } from '@playwright/test';
import os from 'os';
import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createClient } from '../server/node_modules/redis/dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const BACKEND_PORT = Number(process.env.TEST_BACKEND_PORT) || 5000;
const FRONTEND_PORT = Number(process.env.TEST_FRONTEND_PORT) || 4173;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Parse command line arguments
const args = process.argv.slice(2);
let testLevels = [5, 10, 15, 20];

for (const arg of args) {
  if (arg.startsWith('--levels=')) {
    testLevels = arg.split('=')[1].split(',').map((n) => parseInt(n.trim(), 10)).filter(Boolean);
  } else if (arg === '--quick') {
    testLevels = [5, 10];
  } else if (arg.startsWith('--max=')) {
    const max = parseInt(arg.split('=')[1], 10);
    testLevels = testLevels.filter((n) => n <= max);
  }
}

const JOIN_TIMEOUT_MS = 30000;
const ACTIVITY_DURATION_MS = 8000;
const CONVERGENCE_SETTLE_MS = 6000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPercentile(arr, p) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return Math.round(sorted[index]);
}

async function evalWithTimeout(page, fn, arg, timeoutMs = 6000) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`evalWithTimeout timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([
      page.evaluate(fn, arg),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timer);
  }
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

function parseRedisInfo(infoStr) {
  const map = {};
  if (!infoStr) return map;
  infoStr.split('\r\n').forEach((line) => {
    const idx = line.indexOf(':');
    if (idx !== -1) {
      map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  });
  return map;
}

class RedisMonitor {
  constructor(url) {
    this.url = url;
    this.client = null;
    this.samples = [];
    this.interval = null;
    this.startCommands = 0;
    this.startTime = 0;
  }

  async connect() {
    try {
      this.client = createClient({ url: this.url });
      this.client.on('error', () => {});
      await this.client.connect();
    } catch {
      this.client = null;
    }
  }

  async start() {
    this.samples = [];
    this.startTime = Date.now();
    if (!this.client || !this.client.isReady) return;

    try {
      const statsRaw = await this.client.info('stats');
      const stats = parseRedisInfo(statsRaw);
      this.startCommands = Number(stats.total_commands_processed) || 0;
    } catch {
      this.startCommands = 0;
    }

    this.interval = setInterval(async () => {
      try {
        const statsRaw = await this.client.info('stats');
        const memRaw = await this.client.info('memory');
        const stats = parseRedisInfo(statsRaw);
        const mem = parseRedisInfo(memRaw);
        this.samples.push({
          opsSec: Number(stats.instantaneous_ops_per_sec) || 0,
          totalCommands: Number(stats.total_commands_processed) || 0,
          usedMemMB: (Number(mem.used_memory) || 0) / (1024 * 1024),
          time: Date.now(),
        });
      } catch {
        // ignore sample error
      }
    }, 1000);
  }

  async stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    const elapsedSec = (Date.now() - this.startTime) / 1000;
    if (!this.client || !this.client.isReady) {
      return { avgOpsSec: 'N/A', peakOpsSec: 'N/A', memoryMB: 'N/A' };
    }

    let endCommands = this.startCommands;
    try {
      const statsRaw = await this.client.info('stats');
      const stats = parseRedisInfo(statsRaw);
      endCommands = Number(stats.total_commands_processed) || this.startCommands;
    } catch {
      // ignore
    }

    const deltaCommands = Math.max(0, endCommands - this.startCommands);
    const measuredOps = elapsedSec > 0 ? Math.round(deltaCommands / elapsedSec) : 0;
    const sampledPeak = this.samples.length > 0 ? Math.max(...this.samples.map((s) => s.opsSec)) : 0;
    const peakOps = Math.max(measuredOps, sampledPeak);
    const maxMem = this.samples.length > 0 ? Math.max(...this.samples.map((s) => s.usedMemMB)).toFixed(2) : '0.00';

    return {
      avgOpsSec: measuredOps,
      peakOpsSec: peakOps,
      memoryMB: `${maxMem} MB`,
    };
  }

  async close() {
    if (this.client && this.client.isOpen) {
      await this.client.quit().catch(() => {});
    }
  }
}

class SystemLoadTestRunner {
  constructor() {
    this.hardware = getSystemHardware();
    this.serverProcess = null;
    this.previewProcess = null;
    this.browser = null;
    this.redisMonitor = new RedisMonitor(REDIS_URL);
    this.results = [];
  }

  async ensureServers() {
    const backendUp = await checkUrl(`${BACKEND_URL}/api/health`);
    if (!backendUp) {
      console.log(`[SystemLoadTest] Starting backend server on port ${BACKEND_PORT}...`);
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
            MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vync_system_load_test',
            REDIS_URL: REDIS_URL,
            JWT_SECRET: 'vync-system-load-test-secret',
            MEDIASOUP_MIN_PORT: '40000',
            MEDIASOUP_MAX_PORT: '40500',
            MEDIASOUP_NUM_WORKERS: process.env.MEDIASOUP_NUM_WORKERS || '2',
            MEDIASOUP_SPLIT_ROOM_WORKERS: 'true',
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
      console.log('[SystemLoadTest] Backend server is ready.');
    } else {
      console.log('[SystemLoadTest] Existing backend server detected.');
    }

    const frontendUp = await checkUrl(FRONTEND_URL);
    if (!frontendUp) {
      console.log(`[SystemLoadTest] Starting frontend preview server on port ${FRONTEND_PORT}...`);
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
      console.log('[SystemLoadTest] Frontend preview is ready.');
    } else {
      console.log('[SystemLoadTest] Existing frontend preview server detected.');
    }
  }

  async createMeetingRoom() {
    const meetingCode = `SYS-${Date.now().toString(36).slice(-4).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
    const res = await postJson(`${BACKEND_URL}/api/meetings/create`, {
      title: `System Load Test ${meetingCode}`,
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
    console.log('[SystemLoadTest] Launching Chromium with fake media flags...');
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
    console.log(`>>> STARTING SYSTEM LOAD TEST FOR N = ${n} CONCURRENT PARTICIPANTS <<<`);
    console.log(`============================================================`);

    const meetingId = await this.createMeetingRoom();
    console.log(`[SystemLoadTest] Meeting room created: ${meetingId}`);

    const initialMetrics = await fetchJson(`${BACKEND_URL}/api/health/metrics`).catch(() => null);
    await this.redisMonitor.start();
    const startTime = Date.now();

    const contexts = [];
    const pages = [];
    const joinedEntries = [];
    let successfulJoins = 0;
    const joinLatencies = [];

    try {
      console.log(`[SystemLoadTest] Joining ${n} participants...`);

      for (let i = 0; i < n; i++) {
        const clientIndex = i + 1;
        const guestName = `User-${clientIndex}`;
        const joinStart = Date.now();

        const context = await this.browser.newContext({
          viewport: { width: 400, height: 300 },
          permissions: ['camera', 'microphone'],
        });

        // Inject WebRTC stats hook
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

        try {
          await page.goto(`${FRONTEND_URL}/meeting/${meetingId}`, {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
          });

          const nameInput = page.getByTestId('prejoin-name-input');
          await nameInput.waitFor({ state: 'visible', timeout: 8000 });
          await nameInput.fill(guestName, { timeout: 5000 });

          const submitBtn = page.getByTestId('prejoin-submit');
          await submitBtn.click({ timeout: 5000 });

          await page.getByTestId('meeting-panel-participants').waitFor({
            state: 'attached',
            timeout: JOIN_TIMEOUT_MS,
          });

          const joinDuration = Date.now() - joinStart;
          joinLatencies.push(joinDuration);
          successfulJoins += 1;
          joinedEntries.push({ page, clientIndex });
          process.stdout.write(`  [+] Client ${clientIndex}/${n} joined (${joinDuration}ms)\n`);
        } catch (err) {
          console.error(`  [-] Client ${clientIndex}/${n} failed to join: ${err.message}`);
        }

        if (i < n - 1) {
          await sleep(400);
        }
      }

      console.log(`[SystemLoadTest] All ${successfulJoins}/${n} participants in room.`);

      // Set up Yjs and Whiteboard instrumentation on all joined clients
      console.log(`[SystemLoadTest] Setting up concurrent Yjs and Whiteboard listeners...`);
      for (const { page, clientIndex } of joinedEntries) {
        try {
          await evalWithTimeout(page, ({ clientIndex }) => {
            window.__yjsLatencies = [];
            window.__whiteboardStrokesReceived = [];
            window.__seenTags = new Set();

            // Listen to Yjs doc updates
            if (window.__vync?.yDoc) {
              const ytext = window.__vync.yDoc.getText('monaco');
              window.__vync.yDoc.on('update', (update, origin) => {
                if (origin === 'server') {
                  const text = ytext.toString();
                  const now = Date.now();
                  const matches = text.matchAll(/\[Y_(\d+)_C(\d+)\]/g);
                  for (const match of matches) {
                    const tag = match[0];
                    const sentTs = Number(match[1]);
                    const sender = Number(match[2]);
                    if (sender !== clientIndex && !window.__seenTags.has(tag)) {
                      window.__seenTags.add(tag);
                      const latency = Math.max(0, now - sentTs);
                      window.__yjsLatencies.push(latency);
                    }
                  }
                }
              });
            }

            // Listen to Whiteboard strokes
            if (window.__vync?.socket) {
              window.__vync.socket.on('whiteboard-draw', ({ stroke }) => {
                if (stroke && stroke.id) {
                  const match = stroke.id.match(/^wb_(\d+)_C(\d+)/);
                  if (match) {
                    const sentTs = Number(match[1]);
                    const sender = Number(match[2]);
                    if (sender !== clientIndex) {
                      const latency = Math.max(0, Date.now() - sentTs);
                      window.__whiteboardStrokesReceived.push({
                        id: stroke.id,
                        latency,
                        authorIndex: sender,
                      });
                    }
                  }
                }
              });
            }
          }, { clientIndex }, 5000);
        } catch {
          // ignore setup error
        }
      }

      // Concurrently run Yjs edits & Whiteboard strokes at fixed rate
      const NUM_CYCLES = 4;
      const CYCLE_INTERVAL_MS = Math.floor(ACTIVITY_DURATION_MS / NUM_CYCLES);
      console.log(`[SystemLoadTest] Running concurrent Yjs editing & Whiteboard strokes (${NUM_CYCLES} cycles over ${ACTIVITY_DURATION_MS / 1000}s)...`);

      let totalStrokesSent = 0;
      for (let cycle = 1; cycle <= NUM_CYCLES; cycle++) {
        await Promise.all(
          joinedEntries.map(async ({ page, clientIndex }) => {
            // 1. Yjs edit
            try {
              await evalWithTimeout(page, ({ clientIndex, cycle }) => {
                if (window.__vync?.yDoc) {
                  const ytext = window.__vync.yDoc.getText('monaco');
                  const line = `[Y_${Date.now()}_C${clientIndex}] // code line ${cycle} by client ${clientIndex}\n`;
                  ytext.insert(ytext.length, line);
                }
              }, { clientIndex, cycle }, 4000);
            } catch {}

            // 2. Whiteboard stroke
            try {
              await evalWithTimeout(page, ({ clientIndex, cycle }) => {
                if (window.__vync?.socket && window.__vync?.roomId) {
                  const strokeId = `wb_${Date.now()}_C${clientIndex}_${cycle}`;
                  const stroke = {
                    id: strokeId,
                    color: '#3b82f6',
                    size: 4,
                    tool: 'pen',
                    points: [
                      { x: (clientIndex * 0.04) % 0.8 + 0.1, y: (cycle * 0.04) % 0.8 + 0.1 },
                      { x: (clientIndex * 0.04) % 0.8 + 0.12, y: (cycle * 0.04) % 0.8 + 0.12 },
                    ],
                  };
                  window.__vync.socket.emit('whiteboard-draw', {
                    roomId: window.__vync.roomId,
                    stroke,
                  });
                }
              }, { clientIndex, cycle }, 4000);
            } catch {}
          }),
        );
        totalStrokesSent += joinedEntries.length;
        await sleep(CYCLE_INTERVAL_MS);
      }

      console.log(`[SystemLoadTest] Activity complete. Waiting ${CONVERGENCE_SETTLE_MS / 1000}s for CRDT convergence & media stabilization...`);
      await sleep(CONVERGENCE_SETTLE_MS);

      // Verify Yjs convergence and collect latencies
      console.log('[SystemLoadTest] Measuring Yjs convergence and edit propagation latencies...');
      const clientDocs = [];
      const allYjsLatencies = [];

      for (const { page } of joinedEntries) {
        try {
          const docData = await evalWithTimeout(page, () => {
            const ytext = window.__vync?.yDoc?.getText('monaco');
            return {
              text: ytext ? ytext.toString() : '',
              latencies: window.__yjsLatencies || [],
            };
          }, null, 5000);
          if (docData && typeof docData.text === 'string') {
            clientDocs.push(docData.text);
            allYjsLatencies.push(...docData.latencies);
          }
        } catch {
          // ignore
        }
      }

      // Check convergence: all clients have non-empty and identical documents
      const uniqueDocs = new Set(clientDocs);
      const isYjsConverged = uniqueDocs.size === 1 && clientDocs.length === n && clientDocs[0].length > 0;
      const yjsP50 = getPercentile(allYjsLatencies, 50);
      const yjsP95 = getPercentile(allYjsLatencies, 95);

      // Collect Whiteboard delivery latencies and dropped strokes
      console.log('[SystemLoadTest] Measuring Whiteboard delivery latency and dropped strokes...');
      const allWbLatencies = [];
      let totalStrokesReceived = 0;

      for (const { page } of joinedEntries) {
        try {
          const wbData = await evalWithTimeout(page, () => {
            const list = window.__whiteboardStrokesReceived || [];
            return {
              count: list.length,
              latencies: list.map((s) => s.latency),
            };
          }, null, 5000);
          if (wbData) {
            totalStrokesReceived += wbData.count;
            allWbLatencies.push(...wbData.latencies);
          }
        } catch {
          // ignore
        }
      }

      const expectedDeliveries = totalStrokesSent * (joinedEntries.length - 1);
      const droppedStrokes = Math.max(0, expectedDeliveries - totalStrokesReceived);
      const droppedStrokePercent =
        expectedDeliveries > 0 ? ((droppedStrokes / expectedDeliveries) * 100).toFixed(2) : '0.00';
      const wbP50 = getPercentile(allWbLatencies, 50);
      const wbP95 = getPercentile(allWbLatencies, 95);

      // Collect WebRTC statistics
      console.log('[SystemLoadTest] Collecting WebRTC media stats...');
      let totalPacketsLost = 0;
      let totalPacketsReceived = 0;
      let totalFramesDropped = 0;
      let totalFramesReceived = 0;
      let totalFramesDecoded = 0;
      let totalBytesReceived = 0;
      let jitterSum = 0;
      let jitterCount = 0;

      for (const { page } of joinedEntries) {
        try {
          const stats = await evalWithTimeout(page, async () => {
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
              try {
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
                      result.jitters.push(report.jitter * 1000);
                    }
                  }
                });
              } catch {}
            }
            return result;
          }, null, 5000);

          if (stats) {
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
          }
        } catch {
          // ignore
        }
      }

      // Collect ending server and Redis metrics
      const finalMetrics = await fetchJson(`${BACKEND_URL}/api/health/metrics`).catch(() => null);
      const redisStats = await this.redisMonitor.stop();
      const elapsedTimeSec = (Date.now() - startTime) / 1000;

      // Mediasoup worker resource usage
      let workerCpuPercent = 0;
      let workerMaxRssMB = '0.0 MB';
      let sfuProducers = 0;
      let sfuConsumers = 0;

      if (finalMetrics?.sfu?.workers) {
        let totalWorkerCpuSec = 0;
        let maxRssBytes = 0;
        for (let w = 0; w < finalMetrics.sfu.workers.length; w++) {
          const wFinal = finalMetrics.sfu.workers[w]?.usage || { ru_utime: 0, ru_stime: 0, ru_maxrss: 0 };
          const wInit = initialMetrics?.sfu?.workers?.[w]?.usage || { ru_utime: 0, ru_stime: 0 };
          const utimeDiff = (wFinal.ru_utime - wInit.ru_utime) / 1000;
          const stimeDiff = (wFinal.ru_stime - wInit.ru_stime) / 1000;
          totalWorkerCpuSec += utimeDiff + stimeDiff;
          maxRssBytes = Math.max(maxRssBytes, wFinal.ru_maxrss * 1024);
        }
        workerCpuPercent = Math.min(100, Math.round((totalWorkerCpuSec / elapsedTimeSec) * 100));
        workerMaxRssMB = `${(maxRssBytes / (1024 * 1024)).toFixed(1)} MB`;
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
        isYjsConverged &&
        parseFloat(packetLossPercent) < 2.5 &&
        parseFloat(frameDropPercent) < 5.0 &&
        workerCpuPercent < 90;

      const levelResult = {
        n,
        successfulJoins,
        joinSuccessRate: `${((successfulJoins / n) * 100).toFixed(0)}%`,
        avgJoinLatencyMs,
        // WebRTC Media
        sfuProducers,
        sfuConsumers,
        workerCpuPercent: `${workerCpuPercent}%`,
        workerMaxRssMB,
        packetLossPercent: `${packetLossPercent}%`,
        frameDropPercent: `${frameDropPercent}%`,
        avgJitterMs: `${avgJitterMs} ms`,
        // Yjs Collaboration
        yjsConverged: isYjsConverged ? 'YES' : 'NO',
        yjsP50Ms: `${yjsP50} ms`,
        yjsP95Ms: `${yjsP95} ms`,
        // Whiteboard
        wbDroppedPercent: `${droppedStrokePercent}%`,
        wbP50Ms: `${wbP50} ms`,
        wbP95Ms: `${wbP95} ms`,
        // Redis
        redisAvgOpsSec: redisStats.avgOpsSec,
        redisPeakOpsSec: redisStats.peakOpsSec,
        redisMemoryMB: redisStats.memoryMB,
        status: isStable ? 'STABLE' : 'DEGRADED',
      };

      console.log(`\n--- SUMMARY FOR N = ${n} ---`);
      console.log(`  WebRTC Video:     ${levelResult.packetLossPercent} loss, ${levelResult.frameDropPercent} drop, ${levelResult.avgJitterMs} jitter`);
      console.log(`  Yjs Editing:      Converged: ${levelResult.yjsConverged}, p50: ${levelResult.yjsP50Ms}, p95: ${levelResult.yjsP95Ms}`);
      console.log(`  Whiteboard:       Drop: ${levelResult.wbDroppedPercent}, p50: ${levelResult.wbP50Ms}, p95: ${levelResult.wbP95Ms}`);
      console.log(`  Redis Workload:   Avg: ${levelResult.redisAvgOpsSec} ops/s, Peak: ${levelResult.redisPeakOpsSec} ops/s, Mem: ${levelResult.redisMemoryMB}`);
      console.log(`  SFU Workers:      CPU: ${levelResult.workerCpuPercent}, Max RSS: ${levelResult.workerMaxRssMB}`);
      console.log(`  System Status:    ${levelResult.status}`);

      this.results.push(levelResult);
    } finally {
      console.log(`[SystemLoadTest] Cleaning up contexts for N = ${n}...`);
      for (const ctx of contexts) {
        await ctx.close().catch(() => {});
        await sleep(150);
      }
      await sleep(3000);
    }
  }

  async run() {
    console.log(`============================================================`);
    console.log(`VYNC WHOLE-SYSTEM CONCURRENT LOAD TEST (SFU + YJS + WHITEBOARD + REDIS)`);
    console.log(`============================================================`);
    console.log(`Hardware Specifications:`);
    console.log(`  CPU: ${this.hardware.model} (${this.hardware.logicalCores} logical cores)`);
    console.log(`  RAM: ${this.hardware.totalMemGB} GB total (${this.hardware.freeMemGB} GB free)`);
    console.log(`  OS:  ${this.hardware.platform} ${this.hardware.release} (${this.hardware.arch})`);
    console.log(`Levels to execute: N = ${testLevels.join(', ')}`);
    console.log(`============================================================\n`);

    await this.ensureServers();
    await this.redisMonitor.connect();
    await this.launchBrowser();

    for (const n of testLevels) {
      await this.runLevel(n);
      await sleep(3000);
    }

    if (this.browser) {
      await this.browser.close().catch(() => {});
    }
    await this.redisMonitor.close();

    if (this.serverProcess) {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(this.serverProcess.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        this.serverProcess.kill();
      }
    }
    if (this.previewProcess) {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(this.previewProcess.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        this.previewProcess.kill();
      }
    }

    this.outputResults();
  }

  outputResults() {
    const jsonPath = path.join(rootDir, 'system-load-test-results.json');
    const csvPath = path.join(rootDir, 'system-load-test-results.csv');

    // Build CSV
    const headers = [
      'N',
      'Status',
      'JoinSuccess',
      'AvgJoinMs',
      'WorkerCPU',
      'WorkerMaxRSS',
      'PacketLoss',
      'FrameDrop',
      'AvgJitter',
      'YjsConverged',
      'YjsP50',
      'YjsP95',
      'WbDropped',
      'WbP50',
      'WbP95',
      'RedisAvgOps',
      'RedisPeakOps',
      'RedisMem',
    ];

    const csvRows = [headers.join(',')];
    for (const r of this.results) {
      csvRows.push([
        r.n,
        r.status,
        r.joinSuccessRate,
        r.avgJoinLatencyMs,
        r.workerCpuPercent,
        r.workerMaxRssMB,
        r.packetLossPercent,
        r.frameDropPercent,
        r.avgJitterMs,
        r.yjsConverged,
        r.yjsP50Ms,
        r.yjsP95Ms,
        r.wbDroppedPercent,
        r.wbP50Ms,
        r.wbP95Ms,
        r.redisAvgOpsSec,
        r.redisPeakOpsSec,
        r.redisMemoryMB,
      ].join(','));
    }

    fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf8');

    // Build JSON
    const outputData = {
      timestamp: new Date().toISOString(),
      hardware: this.hardware,
      levels: this.results,
    };
    fs.writeFileSync(jsonPath, JSON.stringify(outputData, null, 2), 'utf8');

    // Output Markdown Table
    console.log(`\n============================================================`);
    console.log(`FINAL WHOLE-SYSTEM LOAD TEST RESULTS`);
    console.log(`Hardware: ${this.hardware.model} (${this.hardware.logicalCores} cores, ${this.hardware.totalMemGB} GB RAM)`);
    console.log(`============================================================\n`);

    console.log(`| N | Status | WebRTC Loss | Frame Drop | Yjs Converged | Yjs p50/p95 | Whiteboard Drop | Whiteboard p50/p95 | Redis Avg/Peak Ops | Redis Mem | Worker CPU |`);
    console.log(`| :-: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |`);
    for (const r of this.results) {
      console.log(
        `| **${r.n}** | **${r.status}** | ${r.packetLossPercent} | ${r.frameDropPercent} | ${r.yjsConverged} | ${r.yjsP50Ms} / ${r.yjsP95Ms} | ${r.wbDroppedPercent} | ${r.wbP50Ms} / ${r.wbP95Ms} | ${r.redisAvgOpsSec} / ${r.redisPeakOpsSec} ops/s | ${r.redisMemoryMB} | ${r.workerCpuPercent} |`
      );
    }

    console.log(`\nCSV results saved to: ${csvPath}`);
    console.log(`JSON results saved to: ${jsonPath}`);
  }
}

const runner = new SystemLoadTestRunner();
runner.run().catch((err) => {
  console.error('[SystemLoadTest] Fatal error:', err);
  process.exit(1);
});
