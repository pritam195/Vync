import fs from 'fs';
import path from 'path';
import { isS3StorageEnabled, recordingUploadRoot } from '../config/storage.js';
import Meeting from '../models/Meeting.js';
import Recording from '../models/Recording.js';
import { uploadRecordingToS3 } from './s3Service.js';
import { buildRecordingDocument } from './uploadMetadata.js';
import { logActivity } from '../utils/activityLog.js';
import { normalizeMeetingId } from '../utils/normalizeMeetingId.js';

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function getRecordingSessionDir(meetingId, recordingId) {
  const normMeeting = normalizeMeetingId(meetingId) || 'unknown';
  const safeRecId = String(recordingId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(recordingUploadRoot, normMeeting, safeRecId);
}

export function getChunksDir(meetingId, recordingId) {
  return path.join(getRecordingSessionDir(meetingId, recordingId), 'chunks');
}

export function getManifestPath(meetingId, recordingId) {
  return path.join(getRecordingSessionDir(meetingId, recordingId), 'manifest.json');
}

export function readManifest(meetingId, recordingId) {
  const manifestPath = getManifestPath(meetingId, recordingId);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[recordingChunkService] Error reading manifest at ${manifestPath}:`, err);
    return null;
  }
}

export function writeManifest(meetingId, recordingId, manifest) {
  const sessionDir = getRecordingSessionDir(meetingId, recordingId);
  ensureDir(sessionDir);
  const manifestPath = getManifestPath(meetingId, recordingId);
  const data = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(manifestPath, data, 'utf8');
}

export async function saveChunk({
  meetingId,
  recordingId,
  chunkIndex,
  chunkBuffer,
  fileName,
  mimeType = 'video/webm',
  durationSeconds = 0,
  recordedBy = {},
}) {
  const normMeeting = normalizeMeetingId(meetingId);
  if (!normMeeting) throw new Error('Invalid meeting ID');
  if (!recordingId) throw new Error('Invalid recording ID');

  const idx = parseInt(chunkIndex, 10);
  if (isNaN(idx) || idx < 0) throw new Error('Invalid chunkIndex');
  if (!chunkBuffer || !chunkBuffer.length) throw new Error('Empty chunk buffer');

  const chunksDir = getChunksDir(normMeeting, recordingId);
  ensureDir(chunksDir);

  const chunkFileName = `chunk-${String(idx).padStart(5, '0')}.webm`;
  const chunkFilePath = path.join(chunksDir, chunkFileName);

  fs.writeFileSync(chunkFilePath, chunkBuffer);

  // Update manifest
  let manifest = readManifest(normMeeting, recordingId);
  const now = new Date().toISOString();

  if (!manifest) {
    manifest = {
      recordingId,
      meetingId: normMeeting,
      status: 'recording',
      mimeType,
      fileName: fileName || `meeting-${normMeeting}-${Date.now()}.webm`,
      startedAt: now,
      updatedAt: now,
      recordedBy: {
        userId: String(recordedBy.userId || ''),
        name: String(recordedBy.name || 'Guest'),
        socketId: String(recordedBy.socketId || ''),
      },
      chunks: [],
      totalChunks: 0,
      totalBytes: 0,
      durationSeconds: Number(durationSeconds) || 0,
      assembledAt: null,
      recordingUrl: null,
    };
  }

  // Update or insert chunk record
  const existingIdx = manifest.chunks.findIndex((c) => c.index === idx);
  const chunkInfo = {
    index: idx,
    fileName: chunkFileName,
    size: chunkBuffer.length,
    receivedAt: now,
  };

  if (existingIdx !== -1) {
    manifest.chunks[existingIdx] = chunkInfo;
  } else {
    manifest.chunks.push(chunkInfo);
  }

  // Keep chunks sorted by index
  manifest.chunks.sort((a, b) => a.index - b.index);
  manifest.totalChunks = manifest.chunks.length;
  manifest.totalBytes = manifest.chunks.reduce((sum, c) => sum + c.size, 0);
  manifest.updatedAt = now;
  if (durationSeconds) {
    manifest.durationSeconds = Math.max(manifest.durationSeconds, Number(durationSeconds));
  }

  writeManifest(normMeeting, recordingId, manifest);

  return {
    recordingId,
    chunkIndex: idx,
    fileName: chunkFileName,
    size: chunkBuffer.length,
    totalChunks: manifest.totalChunks,
    totalBytes: manifest.totalBytes,
  };
}

export async function assembleRecording({ meetingId, recordingId, isRecovery = false }) {
  const normMeeting = normalizeMeetingId(meetingId);
  if (!normMeeting) throw new Error('Invalid meeting ID');
  if (!recordingId) throw new Error('Invalid recording ID');

  let manifest = readManifest(normMeeting, recordingId);
  const chunksDir = getChunksDir(normMeeting, recordingId);

  // If manifest is missing, attempt to reconstruct from chunks on disk
  if (!manifest) {
    if (!fs.existsSync(chunksDir)) {
      throw new Error(`No recording session found for ID ${recordingId}`);
    }
    const files = fs.readdirSync(chunksDir).filter((f) => f.startsWith('chunk-') && f.endsWith('.webm'));
    if (!files.length) {
      throw new Error(`No chunks found on disk for recording ID ${recordingId}`);
    }
    const chunks = files.map((fileName) => {
      const match = fileName.match(/chunk-(\d+)\.webm/);
      const index = match ? parseInt(match[1], 10) : 0;
      const stat = fs.statSync(path.join(chunksDir, fileName));
      return { index, fileName, size: stat.size, receivedAt: new Date().toISOString() };
    });
    chunks.sort((a, b) => a.index - b.index);
    manifest = {
      recordingId,
      meetingId: normMeeting,
      status: 'recording',
      mimeType: 'video/webm',
      fileName: `meeting-${normMeeting}-${Date.now()}.webm`,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      recordedBy: { userId: '', name: 'Guest', socketId: '' },
      chunks,
      totalChunks: chunks.length,
      totalBytes: chunks.reduce((sum, c) => sum + c.size, 0),
      durationSeconds: chunks.length * 2,
      assembledAt: null,
      recordingUrl: null,
    };
  }

  if (manifest.status === 'completed' && manifest.recordingUrl) {
    const existing = await Recording.findOne({ meetingId: normMeeting, fileUrl: manifest.recordingUrl });
    if (existing) {
      return { recording: existing, manifest, alreadyAssembled: true };
    }
  }

  if (!manifest.chunks || manifest.chunks.length === 0) {
    throw new Error('Cannot assemble recording with 0 chunks');
  }

  const sortedChunks = [...manifest.chunks].sort((a, b) => a.index - b.index);

  // Assemble into one .webm file
  const baseName = isRecovery
    ? `recovered-${recordingId}.webm`
    : (manifest.fileName || `meeting-${normMeeting}-${Date.now()}.webm`);
  const sessionDir = getRecordingSessionDir(normMeeting, recordingId);
  const outputFilePath = path.join(sessionDir, baseName);

  const writeStream = fs.createWriteStream(outputFilePath);

  for (const chunk of sortedChunks) {
    const chunkPath = path.join(chunksDir, chunk.fileName);
    if (fs.existsSync(chunkPath)) {
      const chunkData = fs.readFileSync(chunkPath);
      writeStream.write(chunkData);
    }
  }

  await new Promise((resolve, reject) => {
    writeStream.end(resolve);
    writeStream.on('error', reject);
  });

  const finalStat = fs.statSync(outputFilePath);
  if (finalStat.size === 0) {
    throw new Error('Assembled recording file has 0 bytes');
  }

  // Storage handling (local or S3)
  const relativeFileUrl = `/uploads/recordings/${normMeeting}/${String(recordingId).replace(/[^a-zA-Z0-9_-]/g, '_')}/${baseName}`;
  let storageResult = {
    fileUrl: relativeFileUrl,
    storageProvider: 'local',
  };

  if (isS3StorageEnabled()) {
    try {
      const fileBuffer = fs.readFileSync(outputFilePath);
      storageResult = await uploadRecordingToS3({
        file: {
          buffer: fileBuffer,
          originalname: baseName,
          mimetype: manifest.mimeType || 'video/webm',
          size: finalStat.size,
        },
        meetingId: normMeeting,
      });
    } catch (err) {
      console.error('[recordingChunkService] S3 upload failed, falling back to local fileUrl:', err);
    }
  }

  // Create Recording DB document
  const durationSeconds = manifest.durationSeconds > 0
    ? manifest.durationSeconds
    : Math.max(1, Math.round(sortedChunks.length * 2));

  const recordingDoc = buildRecordingDocument({
    durationSeconds,
    file: {
      originalname: baseName,
      mimetype: manifest.mimeType || 'video/webm',
      size: finalStat.size,
    },
    meetingId: normMeeting,
    recordedBy: manifest.recordedBy,
    storageResult,
  });

  const recording = await Recording.create(recordingDoc);

  // Update Meeting with recordingUrl
  await Meeting.updateOne(
    { meetingId: normMeeting },
    {
      $set: {
        recordingUrl: recording.fileUrl,
      },
    },
  );

  manifest.status = isRecovery ? 'recovered' : 'completed';
  manifest.assembledAt = new Date().toISOString();
  manifest.recordingUrl = recording.fileUrl;
  manifest.totalBytes = finalStat.size;
  writeManifest(normMeeting, recordingId, manifest);

  await logActivity(
    normMeeting,
    manifest.recordedBy,
    isRecovery
      ? `Recovered midway recording ${baseName} (${manifest.totalChunks} chunks)`
      : `Assembled recording ${baseName} (${manifest.totalChunks} chunks)`,
  );

  return {
    recording,
    manifest,
    isRecovery,
    totalChunks: manifest.totalChunks,
    totalBytes: finalStat.size,
  };
}

export async function recoverAllUnfinishedRecordings(meetingId) {
  const normMeeting = normalizeMeetingId(meetingId);
  if (!normMeeting) return [];

  const meetingDir = path.join(recordingUploadRoot, normMeeting);
  if (!fs.existsSync(meetingDir)) return [];

  const entries = fs.readdirSync(meetingDir, { withFileTypes: true });
  const recoveredList = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const recordingId = entry.name;
      const manifest = readManifest(normMeeting, recordingId);
      if (manifest && manifest.status === 'recording' && manifest.chunks?.length > 0) {
        try {
          console.log(`[recordingChunkService] Auto-recovering unfinished recording ${recordingId} for meeting ${normMeeting}...`);
          const result = await assembleRecording({
            meetingId: normMeeting,
            recordingId,
            isRecovery: true,
          });
          recoveredList.push(result);
        } catch (err) {
          console.error(`[recordingChunkService] Failed to auto-recover recording ${recordingId}:`, err);
        }
      }
    }
  }

  return recoveredList;
}

export function listActiveRecordings(meetingId) {
  const normMeeting = normalizeMeetingId(meetingId);
  if (!normMeeting) return [];

  const meetingDir = path.join(recordingUploadRoot, normMeeting);
  if (!fs.existsSync(meetingDir)) return [];

  const entries = fs.readdirSync(meetingDir, { withFileTypes: true });
  const active = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const manifest = readManifest(normMeeting, entry.name);
      if (manifest && manifest.status === 'recording') {
        active.push({
          recordingId: entry.name,
          chunksReceived: manifest.chunks?.length || 0,
          totalBytes: manifest.totalBytes || 0,
          startedAt: manifest.startedAt,
          updatedAt: manifest.updatedAt,
          recordedBy: manifest.recordedBy,
        });
      }
    }
  }

  return active;
}
