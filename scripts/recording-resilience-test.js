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

// Minimal valid WebM EBML header (1A 45 DF A3) + mock cluster bytes
function createWebMChunk(sizeBytes, isHeader = false) {
  const buf = Buffer.alloc(sizeBytes);
  if (isHeader) {
    // Standard EBML Header: 0x1A, 0x45, 0xDF, 0xA3, ...
    const ebmlMagic = [0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01];
    for (let i = 0; i < ebmlMagic.length; i++) {
      buf[i] = ebmlMagic[i];
    }
    // Segment element header (0x18 0x53 0x80 0x67)
    buf.write('SEGMENT_INFO_AND_TRACKS', ebmlMagic.length);
  } else {
    // Cluster element header (0x1F 0x43 0xB6 0x75)
    buf[0] = 0x1f;
    buf[1] = 0x43;
    buf[2] = 0xb6;
    buf[3] = 0x75;
    buf.write(`CLUSTER_DATA_AT_${Date.now()}`, 4);
  }
  return buf;
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

  console.log('[Test] Starting backend server...');
  const proc = spawn(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'start'],
    {
      cwd: path.join(rootDir, 'server'),
      env: {
        ...process.env,
        PORT: String(BACKEND_PORT),
        NODE_ENV: 'test',
        MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vync_resilience_test',
        JWT_SECRET: 'vync-test-secret',
        LOCAL_UPLOADS_ENABLED: 'true',
        STORAGE_PROVIDER: 'local',
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

async function runResilienceTest() {
  console.log('============================================================');
  console.log('VYNC RECORDING RESILIENCE & MIDWAY CRASH RECOVERY TEST');
  console.log('============================================================\n');

  const serverProc = await ensureBackendRunning();

  try {
    // 1. Create a test meeting
    const meetingCode = `REC-${Date.now().toString(36).slice(-4).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
    console.log(`[1/6] Creating test meeting: ${meetingCode}`);

    const createMeetingRes = await fetch(`${BACKEND_URL}/api/meetings/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Recording Resilience Verification Room',
        meetingId: meetingCode,
        hostName: 'TestHost',
      }),
    });

    if (!createMeetingRes.ok) {
      throw new Error(`Failed to create meeting: ${createMeetingRes.status} ${await createMeetingRes.text()}`);
    }
    const meetingData = await createMeetingRes.json();
    console.log(`      Meeting created: ID=${meetingData.meeting?.meetingId || meetingCode}`);

    // 2. Initialize a recording session
    const recordingId = `rec_${Date.now()}_crash_test`;
    console.log(`\n[2/6] Starting simulated MediaRecorder timeslice session: ${recordingId}`);
    console.log('      Timeslice configuration: 2000ms chunk interval');

    // Generate 5 chunks (chunks 0..4)
    const chunks = [
      { index: 0, buffer: createWebMChunk(65536, true), label: 'EBML Header + Segment Tracks' },
      { index: 1, buffer: createWebMChunk(131072, false), label: 'Cluster 1 (Keyframe)' },
      { index: 2, buffer: createWebMChunk(131072, false), label: 'Cluster 2 (Delta frames)' },
      { index: 3, buffer: createWebMChunk(131072, false), label: 'Cluster 3 (UNTRANSMITTED)' },
      { index: 4, buffer: createWebMChunk(131072, false), label: 'Cluster 4 (UNTRANSMITTED)' },
    ];

    // 3. Upload chunks 0, 1, 2 incrementally
    console.log('\n[3/6] Uploading chunks incrementally as timeslice fires...');
    let totalUploadedBytes = 0;

    for (let i = 0; i < 3; i++) {
      const chunk = chunks[i];
      const formData = new FormData();
      formData.append('chunk', new Blob([chunk.buffer], { type: 'video/webm' }), `chunk-${chunk.index}.webm`);
      formData.append('chunkIndex', String(chunk.index));
      formData.append('isLastChunk', 'false');
      formData.append('fileName', `meeting-${meetingCode}-live.webm`);
      formData.append('durationSeconds', String((i + 1) * 2));
      formData.append('name', 'TestHost');

      const uploadRes = await fetch(`${BACKEND_URL}/api/recordings/chunk/${meetingCode}/${recordingId}`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error(`Chunk ${chunk.index} upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
      }

      const resJson = await uploadRes.json();
      totalUploadedBytes += chunk.buffer.length;
      console.log(`      [+] Chunk ${chunk.index} uploaded (${(chunk.buffer.length / 1024).toFixed(1)} KB, "${chunk.label}") -> Total: ${(totalUploadedBytes / 1024).toFixed(1)} KB`);
      expectTrue(resJson.ok, `Chunk ${chunk.index} response ok`);
      expectEqual(resJson.totalChunks, i + 1, `Total chunks in manifest after chunk ${chunk.index}`);
    }

    // 4. Verify intermediate manifest on server
    const manifestRes = await fetch(`${BACKEND_URL}/api/recordings/manifest/${meetingCode}/${recordingId}`);
    expectTrue(manifestRes.ok, 'Manifest fetch ok');
    const manifestJson = await manifestRes.json();
    console.log(`      Server manifest status: "${manifestJson.manifest?.status}", chunks registered: ${manifestJson.manifest?.chunks?.length}`);
    expectEqual(manifestJson.manifest?.status, 'recording', 'Status before crash is "recording"');
    expectEqual(manifestJson.manifest?.chunks?.length, 3, 'Manifest has exactly 3 uploaded chunks');

    // 5. SIMULATE HARD CRASH / TAB KILL
    console.log('\n[4/6] SIMULATING BROWSER TAB CRASH / SUDDEN DISCONNECT!');
    console.log('      - Chunks 3 & 4 were produced in browser memory but NEVER transmitted');
    console.log('      - No "onstop" event or standard finalize/assemble endpoint called');
    console.log('      - Client process terminated abruptly');

    // Verify session is listed in active/unfinished recordings
    const activeRes = await fetch(`${BACKEND_URL}/api/recordings/active/${meetingCode}`);
    expectTrue(activeRes.ok, 'Active recordings fetch ok');
    const activeData = await activeRes.json();
    const isListed = activeData.activeRecordings?.some((r) => r.recordingId === recordingId);
    console.log(`      Active recordings check: session ${recordingId} listed as unfinalized? ${isListed}`);
    expectTrue(isListed, 'Session is present in unfinalized sessions list');

    // 6. Execute Crash Recovery
    console.log('\n[5/6] Invoking Recovery Endpoint: POST /api/recordings/recover/:meetingId/:recordingId');
    const recoverStart = Date.now();
    const recoverRes = await fetch(`${BACKEND_URL}/api/recordings/recover/${meetingCode}/${recordingId}`, {
      method: 'POST',
    });

    if (!recoverRes.ok) {
      throw new Error(`Recovery endpoint failed: ${recoverRes.status} ${await recoverRes.text()}`);
    }
    const recoverData = await recoverRes.json();
    const recoverDurationMs = Date.now() - recoverStart;

    console.log(`      Recovery successful in ${recoverDurationMs}ms!`);
    console.log(`      - Recovered:       ${recoverData.isRecovery}`);
    console.log(`      - Chunks restored: ${recoverData.totalChunks}/3 available`);
    console.log(`      - Output file:     ${recoverData.recording?.fileName}`);
    console.log(`      - Assembled size:  ${recoverData.totalBytes} bytes (${(recoverData.totalBytes / 1024).toFixed(1)} KB)`);
    console.log(`      - Duration:        ${recoverData.recording?.durationSeconds} seconds`);
    console.log(`      - File URL:        ${recoverData.recording?.fileUrl}`);

    expectTrue(recoverData.ok, 'Recovery response ok');
    expectTrue(recoverData.isRecovery, 'Flagged as recovery');
    expectEqual(recoverData.totalChunks, 3, 'Recovered all 3 uploaded chunks');
    expectEqual(recoverData.totalBytes, totalUploadedBytes, 'Recovered byte size equals sum of chunks 0+1+2');

    // 7. Verify file on disk and container headers
    console.log('\n[6/6] Verifying assembled binary WebM container...');
    const localRelPath = recoverData.recording?.fileUrl.replace(/^\/uploads\//, '');
    const fullFilePath = path.join(rootDir, 'server', 'uploads', localRelPath);

    expectTrue(fs.existsSync(fullFilePath), `Assembled file exists on disk at ${fullFilePath}`);
    const fileBytes = fs.readFileSync(fullFilePath);
    expectEqual(fileBytes.length, totalUploadedBytes, 'Binary file length matches uploaded chunks sum');

    // Verify EBML magic header: 0x1A 0x45 0xDF 0xA3
    const isEbml =
      fileBytes[0] === 0x1a &&
      fileBytes[1] === 0x45 &&
      fileBytes[2] === 0xdf &&
      fileBytes[3] === 0xa3;
    console.log(`      EBML Magic Bytes (0x1A 0x45 0xDF 0xA3): ${isEbml ? 'VALID' : 'INVALID'}`);
    expectTrue(isEbml, 'Valid WebM EBML header magic bytes present');

    // Verify meeting list returns the recovered recording
    const listRes = await fetch(`${BACKEND_URL}/api/recordings/${meetingCode}`);
    const listData = await listRes.json();
    const hasRecoveredRec = listData.recordings?.some((r) => r.fileName?.includes(recordingId));
    console.log(`      Meeting recordings list contains recovered file? ${hasRecoveredRec}`);
    expectTrue(hasRecoveredRec, 'Recovered recording is persisted and listed in meeting history');

    console.log('\n============================================================');
    console.log('RECORDING RESILIENCE VERIFICATION: PASSED (100% RECOVERABLE)');
    console.log('============================================================');
    console.log('Summary metrics:');
    console.log(`  - Total chunks generated:    5`);
    console.log(`  - Chunks sent before crash:  3`);
    console.log(`  - Chunks recovered:          3 (100% of uploaded chunks)`);
    console.log(`  - Un-transmitted chunks:     2 (lost in dead tab memory)`);
    console.log(`  - Raw bytes recovered:       ${fileBytes.length} bytes`);
    console.log(`  - Recovery assembly time:    ${recoverDurationMs} ms`);
    const results = {
      timestamp: new Date().toISOString(),
      meetingId: meetingCode,
      recordingId,
      status: 'PASS',
      totalChunksGenerated: 5,
      chunksUploadedBeforeCrash: 3,
      chunksRecovered: 3,
      untransmittedChunks: 2,
      rawBytesRecovered: fileBytes.length,
      ebmlHeaderValid: isEbml,
      recoveryDurationMs: recoverDurationMs,
      recoveredFile: recoverData.recording?.fileName,
      recoveredFileUrl: recoverData.recording?.fileUrl,
    };
    fs.writeFileSync(
      path.join(rootDir, 'recording-resilience-results.json'),
      JSON.stringify(results, null, 2),
      'utf8',
    );
    console.log('Results saved to recording-resilience-results.json');
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

function expectTrue(val, msg) {
  if (!val) {
    console.error(`[FAIL] Assertion failed: ${msg}`);
    process.exit(1);
  }
}

function expectEqual(actual, expected, msg) {
  if (actual !== expected) {
    console.error(`[FAIL] Expected ${expected}, got ${actual}: ${msg}`);
    process.exit(1);
  }
}

runResilienceTest().catch((err) => {
  console.error('\n[FATAL ERROR]', err);
  process.exit(1);
});
