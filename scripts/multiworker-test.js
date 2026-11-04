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

const BACKEND_PORT = Number(process.env.TEST_BACKEND_PORT) || 5000;
const FRONTEND_PORT = Number(process.env.TEST_FRONTEND_PORT) || 4173;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

const STABILIZATION_TIME_MS = 8000;
const JOIN_TIMEOUT_MS = 25000;

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

class MultiWorkerTestRunner {
  constructor() {
    this.hardware = getSystemHardware();
    this.serverProcess = null;
    this.previewProcess = null;
    this.browser = null;
  }

  async ensureServers() {
    const backendUp = await checkUrl(`${BACKEND_URL}/api/health`);
    if (!backendUp) {
      console.log(`[MultiWorkerTest] Starting backend server on port ${BACKEND_PORT}...`);
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
            MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vync_multiworker_test',
            JWT_SECRET: 'vync-multiworker-test-secret',
            MEDIASOUP_MIN_PORT: '40000',
            MEDIASOUP_MAX_PORT: '40500',
            MEDIASOUP_NUM_WORKERS: '2', // Force at least 2 workers
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
        throw new Error('Backend server failed to start within 30 seconds');
      }
      console.log('[MultiWorkerTest] Backend server is ready.');
    } else {
      console.log('[MultiWorkerTest] Existing backend server detected.');
    }

    const frontendUp = await checkUrl(FRONTEND_URL);
    if (!frontendUp) {
      console.log(`[MultiWorkerTest] Starting frontend preview server on port ${FRONTEND_PORT}...`);
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
      console.log('[MultiWorkerTest] Frontend preview is ready.');
    } else {
      console.log('[MultiWorkerTest] Existing frontend preview server detected.');
    }
  }

  async createMeetingRoom(prefix = 'MULTI') {
    const meetingCode = `${prefix}-${Date.now().toString(36).slice(-4).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
    const res = await postJson(`${BACKEND_URL}/api/meetings/create`, {
      title: `MultiWorker Test ${meetingCode}`,
      meetingId: meetingCode,
      hostName: 'TestHost',
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
    console.log('[MultiWorkerTest] Launching Chromium with fake media devices...');
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
      ],
    });
  }

  async runScenario({ scenarioName, workerAssignments }) {
    console.log(`\n------------------------------------------------------------`);
    console.log(`Running Scenario: ${scenarioName}`);
    console.log(`Participant worker distribution:`, workerAssignments.map((w, idx) => `Client ${idx + 1} -> Worker #${w}`).join(', '));
    console.log(`------------------------------------------------------------`);

    const meetingId = await this.createMeetingRoom(scenarioName.startsWith('Single') ? 'SNGL' : 'PIPE');
    console.log(`Created room: ${meetingId}`);

    const initialMetrics = await fetchJson(`${BACKEND_URL}/api/health/metrics`).catch(() => null);
    const startTime = Date.now();

    const contexts = [];
    const pages = [];

    try {
      for (let i = 0; i < workerAssignments.length; i++) {
        const clientIndex = i + 1;
        const workerIndex = workerAssignments[i];
        const guestName = `User-${clientIndex}`;

        const context = await this.browser.newContext({
          viewport: { width: 400, height: 300 },
          permissions: ['camera', 'microphone'],
        });

        // Hook RTCPeerConnection to gather inbound and candidate stats
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

        const targetUrl = `${FRONTEND_URL}/meeting/${meetingId}?worker=${workerIndex}`;
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

        const nameInput = page.getByTestId('prejoin-name-input');
        await nameInput.waitFor({ state: 'visible', timeout: 8000 });
        await nameInput.fill(guestName);

        const submitBtn = page.getByTestId('prejoin-submit');
        await submitBtn.click();

        await page.getByTestId('meeting-panel-participants').waitFor({ state: 'attached', timeout: JOIN_TIMEOUT_MS });
        console.log(`  [+] Client ${clientIndex} connected to room on Worker #${workerIndex}`);
      }

      console.log(`Stabilizing media exchange for ${STABILIZATION_TIME_MS / 1000} seconds...`);
      await sleep(STABILIZATION_TIME_MS);

      // Collect WebRTC statistics from each client
      const clientStats = [];
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const stats = await page.evaluate(async () => {
          const pcs = window.__vyncPeerConnections || [];
          const result = {
            audioConsumers: 0,
            videoConsumers: 0,
            audioBytesReceived: 0,
            videoBytesReceived: 0,
            audioPacketsReceived: 0,
            videoPacketsReceived: 0,
            rtts: [],
            jitters: [],
          };

          for (const pc of pcs) {
            if (pc.iceConnectionState === 'closed') continue;
            const reports = await pc.getStats();
            reports.forEach((report) => {
              if (report.type === 'inbound-rtp') {
                if (report.kind === 'video') {
                  result.videoConsumers += 1;
                  result.videoBytesReceived += report.bytesReceived || 0;
                  result.videoPacketsReceived += report.packetsReceived || 0;
                  if (typeof report.jitter === 'number') {
                    result.jitters.push(report.jitter * 1000);
                  }
                } else if (report.kind === 'audio') {
                  result.audioConsumers += 1;
                  result.audioBytesReceived += report.bytesReceived || 0;
                  result.audioPacketsReceived += report.packetsReceived || 0;
                  if (typeof report.jitter === 'number') {
                    result.jitters.push(report.jitter * 1000);
                  }
                }
              } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                if (typeof report.currentRoundTripTime === 'number') {
                  result.rtts.push(report.currentRoundTripTime * 1000); // ms
                }
              }
            });
          }
          return result;
        });

        clientStats.push({ clientIndex: i + 1, ...stats });
      }

      // Collect server metrics
      const finalMetrics = await fetchJson(`${BACKEND_URL}/api/health/metrics`).catch(() => null);
      const elapsedTimeSec = (Date.now() - startTime) / 1000;

      // Extract server-side worker CPU
      let totalWorkerCpuSec = 0;
      const workerUsages = [];
      if (finalMetrics?.sfu?.workers) {
        for (let w = 0; w < finalMetrics.sfu.workers.length; w++) {
          const wFinal = finalMetrics.sfu.workers[w]?.usage || { ru_utime: 0, ru_stime: 0 };
          const wInit = initialMetrics?.sfu?.workers?.[w]?.usage || { ru_utime: 0, ru_stime: 0 };
          const utimeDiff = (wFinal.ru_utime - wInit.ru_utime) / 1000;
          const stimeDiff = (wFinal.ru_stime - wInit.ru_stime) / 1000;
          const cpuSec = utimeDiff + stimeDiff;
          totalWorkerCpuSec += cpuSec;
          workerUsages.push({
            workerIndex: w,
            pid: finalMetrics.sfu.workers[w].pid,
            cpuPercent: Math.min(100, Math.round((cpuSec / elapsedTimeSec) * 100)),
          });
        }
      }

      const roomMetric = finalMetrics?.sfu?.rooms?.find((r) => r.roomId === meetingId) || {};

      return {
        scenarioName,
        meetingId,
        clientStats,
        workerUsages,
        totalWorkerCpuPercent: Math.min(100, Math.round((totalWorkerCpuSec / elapsedTimeSec) * 100)),
        serverTransports: roomMetric.transportsCount || 0,
        serverProducers: roomMetric.producersCount || 0,
        serverConsumers: roomMetric.consumersCount || 0,
        serverPipedProducers: roomMetric.pipedProducersCount || 0,
        workersSpanned: roomMetric.workersSpanned || [],
      };
    } finally {
      for (const page of pages) {
        await page.close().catch(() => {});
      }
      for (const context of contexts) {
        await context.close().catch(() => {});
      }
    }
  }

  async run() {
    console.log(`============================================================`);
    console.log(`>>> VYNC MULTI-WORKER SFU VERIFICATION SUITE <<<`);
    console.log(`System Hardware: ${this.hardware.model} (${this.hardware.logicalCores} cores, ${this.hardware.totalMemGB} GB RAM)`);
    console.log(`============================================================`);

    await this.ensureServers();
    await this.launchBrowser();

    // Check available workers on server
    const serverMetrics = await fetchJson(`${BACKEND_URL}/api/health/metrics`);
    const totalWorkers = serverMetrics?.sfu?.totalWorkers || 1;
    console.log(`[MultiWorkerTest] Mediasoup worker pool count: ${totalWorkers}`);

    if (totalWorkers < 2) {
      console.warn(`[WARNING] Server has ${totalWorkers} worker(s). Restarting with MEDIASOUP_NUM_WORKERS=2 is advised to test piping.`);
    }

    // 1. Single-Worker Baseline (both participants on Worker 0)
    const singleResult = await this.runScenario({
      scenarioName: 'Single-Worker Baseline',
      workerAssignments: [0, 0],
    });

    // 2. Multi-Worker Piped (Participant 1 on Worker 0, Participant 2 on Worker 1)
    const pipedResult = await this.runScenario({
      scenarioName: 'Multi-Worker Piped (Cross-Worker)',
      workerAssignments: [0, 1],
    });

    await this.browser.close();

    if (this.serverProcess) {
      this.serverProcess.kill();
    }
    if (this.previewProcess) {
      this.previewProcess.kill();
    }

    // Calculate latency & CPU comparison
    const singleRtts = singleResult.clientStats.flatMap((c) => c.rtts);
    const pipedRtts = pipedResult.clientStats.flatMap((c) => c.rtts);
    const avgSingleRtt = singleRtts.length > 0 ? (singleRtts.reduce((a, b) => a + b, 0) / singleRtts.length).toFixed(1) : 'N/A';
    const avgPipedRtt = pipedRtts.length > 0 ? (pipedRtts.reduce((a, b) => a + b, 0) / pipedRtts.length).toFixed(1) : 'N/A';
    const addedLatencyMs =
      avgSingleRtt !== 'N/A' && avgPipedRtt !== 'N/A'
        ? (parseFloat(avgPipedRtt) - parseFloat(avgSingleRtt)).toFixed(1)
        : '0.0';

    // Verify requirements:
    // 1. Force a room's participants across at least 2 workers
    const distinctWorkers = new Set(pipedResult.workersSpanned).size >= 2;
    // 2. PipeTransport is exercised (piped producers created)
    const pipeTransportExercised = pipedResult.serverPipedProducers >= 2;
    // 3. Every participant receives every other participant's video and audio
    const allReceivedVideoAndAudio = pipedResult.clientStats.every(
      (c) => c.videoBytesReceived > 0 && c.audioBytesReceived > 0 && c.videoConsumers >= 1 && c.audioConsumers >= 1
    );

    const testPassed = distinctWorkers && pipeTransportExercised && allReceivedVideoAndAudio;

    console.log(`\n============================================================`);
    console.log(`>>> MULTI-WORKER PIPETRANSPORT TEST RESULTS <<<`);
    console.log(`============================================================\n`);

    console.log(`| Metric / Verification Check | Single-Worker (Baseline) | Multi-Worker (Piped) | Differential / Status |`);
    console.log(`| :--- | :--- | :--- | :--- |`);
    console.log(`| **Workers Spanned** | Worker [${singleResult.workersSpanned.join(', ')}] | Worker [${pipedResult.workersSpanned.join(', ')}] | ${distinctWorkers ? 'PASS (>= 2 workers)' : 'FAIL'} |`);
    console.log(`| **PipeTransport Active** | No (0 piped) | Yes (${pipedResult.serverPipedProducers} piped producers) | ${pipeTransportExercised ? 'EXERCISED' : 'NOT EXERCISED'} |`);
    console.log(`| **Transports in Room** | ${singleResult.serverTransports} | ${pipedResult.serverTransports} | - |`);
    console.log(`| **Producers in Room** | ${singleResult.serverProducers} | ${pipedResult.serverProducers} | - |`);
    console.log(`| **Consumers in Room** | ${singleResult.serverConsumers} | ${pipedResult.serverConsumers} | - |`);

    pipedResult.clientStats.forEach((c) => {
      console.log(`| **Client ${c.clientIndex} Video Received** | - | ${c.videoBytesReceived.toLocaleString()} bytes (${c.videoPacketsReceived} pkts) | ${c.videoBytesReceived > 0 ? 'PASS' : 'FAIL'} |`);
      console.log(`| **Client ${c.clientIndex} Audio Received** | - | ${c.audioBytesReceived.toLocaleString()} bytes (${c.audioPacketsReceived} pkts) | ${c.audioBytesReceived > 0 ? 'PASS' : 'FAIL'} |`);
    });

    console.log(`| **Avg Round-Trip Time (RTT)** | ${avgSingleRtt} ms | ${avgPipedRtt} ms | +${addedLatencyMs} ms added latency |`);
    console.log(`| **Worker CPU Utilization** | ${singleResult.totalWorkerCpuPercent}% | ${pipedResult.totalWorkerCpuPercent}% | ${pipedResult.totalWorkerCpuPercent - singleResult.totalWorkerCpuPercent}% diff |`);
    console.log(`| **OVERALL VERDICT** | - | - | **${testPassed ? 'PASS' : 'FAIL'}** |`);

    const outputData = {
      timestamp: new Date().toISOString(),
      hardware: this.hardware,
      pass: testPassed,
      singleResult,
      pipedResult,
      comparison: {
        avgSingleRttMs: avgSingleRtt,
        avgPipedRttMs: avgPipedRtt,
        addedLatencyMs,
        singleWorkerCpuPercent: singleResult.totalWorkerCpuPercent,
        pipedWorkerCpuPercent: pipedResult.totalWorkerCpuPercent,
      },
    };

    fs.writeFileSync(
      path.join(rootDir, 'multiworker-test-results.json'),
      JSON.stringify(outputData, null, 2),
      'utf8'
    );
    console.log(`\nResults saved to multiworker-test-results.json`);

    process.exit(testPassed ? 0 : 1);
  }
}

const runner = new MultiWorkerTestRunner();
runner.run().catch((err) => {
  console.error('[MultiWorkerTest] Fatal error:', err);
  process.exit(1);
});

