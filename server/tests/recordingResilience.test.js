import fs from 'fs';
import path from 'path';
import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../src/app.js';
import Meeting from '../src/models/Meeting.js';
import Recording from '../src/models/Recording.js';
import {
  assembleRecording,
  getChunksDir,
  getManifestPath,
  getRecordingSessionDir,
  readManifest,
  recoverAllUnfinishedRecordings,
  saveChunk,
} from '../src/services/recordingChunkService.js';
import { recordingUploadRoot } from '../src/config/storage.js';

// Minimal valid WebM EBML header buffer (1A 45 DF A3)
const WEBM_HEADER = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01]);
const CHUNK_PAYLOAD_1 = Buffer.from('CHUNK_1_VIDEO_FRAMES_CLUSTER_DATA');
const CHUNK_PAYLOAD_2 = Buffer.from('CHUNK_2_VIDEO_FRAMES_CLUSTER_DATA');

describe('Recording Resilience & Chunk Recovery', () => {
  const meetingId = 'REC-TEST-999';
  const recordingId = 'rec_test_resilience_01';

  beforeEach(async () => {
    await Meeting.create({
      meetingId,
      title: 'Recording Test Room',
      host: { name: 'Host Tester', guestId: 'guest_host_1' },
      status: 'live',
    });
  });

  afterEach(() => {
    // Clean up test directories
    const sessionDir = getRecordingSessionDir(meetingId, recordingId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    const meetingDir = path.join(recordingUploadRoot, meetingId);
    if (fs.existsSync(meetingDir)) {
      fs.rmSync(meetingDir, { recursive: true, force: true });
    }
  });

  it('saves chunks incrementally and maintains manifest metadata', async () => {
    const chunk0 = Buffer.concat([WEBM_HEADER, Buffer.from('_INIT_SEGMENT')]);
    const res0 = await request(app)
      .post(`/api/recordings/chunk/${meetingId}/${recordingId}`)
      .field('chunkIndex', '0')
      .field('fileName', 'meeting-rec.webm')
      .attach('chunk', chunk0, 'chunk-0.webm')
      .expect(200);

    expect(res0.body.ok).toBe(true);
    expect(res0.body.chunkIndex).toBe(0);
    expect(res0.body.totalChunks).toBe(1);
    expect(res0.body.totalBytes).toBe(chunk0.length);

    // Upload chunk 1
    const res1 = await request(app)
      .post(`/api/recordings/chunk/${meetingId}/${recordingId}`)
      .field('chunkIndex', '1')
      .attach('chunk', CHUNK_PAYLOAD_1, 'chunk-1.webm')
      .expect(200);

    expect(res1.body.totalChunks).toBe(2);
    expect(res1.body.totalBytes).toBe(chunk0.length + CHUNK_PAYLOAD_1.length);

    // Verify manifest on disk
    const manifest = readManifest(meetingId, recordingId);
    expect(manifest).not.toBeNull();
    expect(manifest.status).toBe('recording');
    expect(manifest.chunks).toHaveLength(2);
    expect(manifest.chunks[0].index).toBe(0);
    expect(manifest.chunks[1].index).toBe(1);
  });

  it('assembles a full recording session into one .webm file and creates DB record', async () => {
    const chunk0 = Buffer.concat([WEBM_HEADER, Buffer.from('_INIT_SEGMENT')]);
    await saveChunk({
      meetingId,
      recordingId,
      chunkIndex: 0,
      chunkBuffer: chunk0,
      fileName: 'assembled-rec.webm',
    });
    await saveChunk({
      meetingId,
      recordingId,
      chunkIndex: 1,
      chunkBuffer: CHUNK_PAYLOAD_1,
    });
    await saveChunk({
      meetingId,
      recordingId,
      chunkIndex: 2,
      chunkBuffer: CHUNK_PAYLOAD_2,
    });

    const res = await request(app)
      .post(`/api/recordings/assemble/${meetingId}/${recordingId}`)
      .expect(201);

    expect(res.body.ok).toBe(true);
    expect(res.body.totalChunks).toBe(3);
    expect(res.body.totalBytes).toBe(chunk0.length + CHUNK_PAYLOAD_1.length + CHUNK_PAYLOAD_2.length);

    // Verify DB
    const recordingInDb = await Recording.findOne({ meetingId });
    expect(recordingInDb).not.toBeNull();
    expect(recordingInDb.size).toBe(res.body.totalBytes);

    // Verify manifest status updated
    const manifest = readManifest(meetingId, recordingId);
    expect(manifest.status).toBe('completed');
  });

  it('recovers recordings when recorder crashes midway (tab crash simulation)', async () => {
    const crashRecId = 'rec_crash_midway_02';

    // 1. Client records and uploads chunks 0 and 1
    const chunk0 = Buffer.concat([WEBM_HEADER, Buffer.from('_HEADER_AND_KEYFRAME')]);
    await request(app)
      .post(`/api/recordings/chunk/${meetingId}/${crashRecId}`)
      .field('chunkIndex', '0')
      .attach('chunk', chunk0, 'chunk-00000.webm')
      .expect(200);

    await request(app)
      .post(`/api/recordings/chunk/${meetingId}/${crashRecId}`)
      .field('chunkIndex', '1')
      .attach('chunk', CHUNK_PAYLOAD_1, 'chunk-00001.webm')
      .expect(200);

    // 2. RECORDER CRASH: tab dies unexpectedly.
    // Chunk 2, 3 were never sent; no graceful 'assemble' endpoint was ever called.
    const manifestBefore = readManifest(meetingId, crashRecId);
    expect(manifestBefore.status).toBe('recording');
    expect(manifestBefore.chunks).toHaveLength(2);

    // 3. Trigger recovery mechanism
    const res = await request(app)
      .post(`/api/recordings/recover/${meetingId}/${crashRecId}`)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.isRecovery).toBe(true);
    expect(res.body.totalChunks).toBe(2);

    // 4. Verify recovered file on disk
    const sessionDir = getRecordingSessionDir(meetingId, crashRecId);
    const recoveredFile = path.join(sessionDir, `recovered-${crashRecId}.webm`);
    expect(fs.existsSync(recoveredFile)).toBe(true);

    const assembledBytes = fs.readFileSync(recoveredFile);
    expect(assembledBytes.length).toBe(chunk0.length + CHUNK_PAYLOAD_1.length);
    // Verify EBML magic header is preserved
    expect(assembledBytes[0]).toBe(0x1a);
    expect(assembledBytes[1]).toBe(0x45);
    expect(assembledBytes[2]).toBe(0xdf);
    expect(assembledBytes[3]).toBe(0xa3);

    // 5. Verify DB record created with recovered status
    const recordingDoc = await Recording.findById(res.body.recording._id);
    expect(recordingDoc).not.toBeNull();
    expect(recordingDoc.fileName).toContain(`recovered-${crashRecId}`);

    const manifestAfter = readManifest(meetingId, crashRecId);
    expect(manifestAfter.status).toBe('recovered');

    // Clean up
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  });

  it('auto-recovers all unfinished recordings for a meeting', async () => {
    const unrecId = 'rec_unfin_03';
    const chunk0 = Buffer.concat([WEBM_HEADER, Buffer.from('_AUTO_RECOVER')]);

    await saveChunk({
      meetingId,
      recordingId: unrecId,
      chunkIndex: 0,
      chunkBuffer: chunk0,
    });

    const recoveredList = await recoverAllUnfinishedRecordings(meetingId);
    expect(recoveredList).toHaveLength(1);
    expect(recoveredList[0].isRecovery).toBe(true);
    expect(recoveredList[0].totalChunks).toBe(1);

    const manifest = readManifest(meetingId, unrecId);
    expect(manifest.status).toBe('recovered');

    // Clean up
    const sessionDir = getRecordingSessionDir(meetingId, unrecId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  });
});
