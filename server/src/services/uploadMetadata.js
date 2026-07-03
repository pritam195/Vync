export function buildSharedFileDocument({ file, meetingId, storageResult, uploadedBy }) {
  return {
    bucket: storageResult.bucket,
    fileName: file.originalname,
    fileType: file.mimetype || 'application/octet-stream',
    fileUrl: storageResult.fileUrl,
    meetingId,
    publicUrl: storageResult.publicUrl,
    s3Key: storageResult.s3Key,
    size: file.size,
    storageProvider: storageResult.storageProvider,
    uploadedBy,
  };
}

export function buildRecordingDocument({
  durationSeconds = 0,
  file,
  meetingId,
  recordedBy,
  storageResult,
}) {
  return {
    bucket: storageResult.bucket,
    durationSeconds: Math.max(Number(durationSeconds) || 0, 0),
    fileName: file.originalname,
    fileType: file.mimetype || 'video/webm',
    fileUrl: storageResult.fileUrl,
    meetingId,
    publicUrl: storageResult.publicUrl,
    recordedBy,
    s3Key: storageResult.s3Key,
    size: file.size,
    storageProvider: storageResult.storageProvider,
  };
}
