import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { normalizeMeetingId } from '../utils/normalizeMeetingId.js';
import { safeFileName } from '../utils/uploadValidation.js';

function encodeS3Key(key) {
  return key.split('/').map(encodeURIComponent).join('/');
}

function getRequiredConfig(env = process.env) {
  const region = env.AWS_REGION;
  const bucket = env.AWS_S3_BUCKET;

  if (!region || !bucket) {
    const error = new Error('S3 storage is not configured. Set AWS_REGION and AWS_S3_BUCKET.');
    error.statusCode = 503;
    throw error;
  }

  return {
    bucket,
    publicBaseUrl: env.AWS_S3_PUBLIC_BASE_URL,
    region,
  };
}

function createDefaultClient(env = process.env) {
  return new S3Client({
    region: env.AWS_REGION,
  });
}

export function createS3ObjectKey({ category, meetingId, originalName, timestamp = Date.now() }) {
  const normalizedMeetingId = normalizeMeetingId(meetingId) || 'unknown';
  const safeName = safeFileName(originalName || category);

  return `vync/meetings/${normalizedMeetingId}/${category}/${timestamp}-${safeName}`;
}

export function buildS3PublicUrl({ bucket, key, publicBaseUrl, region }) {
  if (publicBaseUrl) {
    return `${publicBaseUrl.replace(/\/+$/, '')}/${encodeS3Key(key)}`;
  }

  return `https://${bucket}.s3.${region}.amazonaws.com/${encodeS3Key(key)}`;
}

export function createS3Uploader({ env = process.env, s3Client = createDefaultClient(env) } = {}) {
  async function uploadBuffer({ category, file, meetingId }) {
    if (!file?.buffer) {
      const error = new Error('Upload file buffer is missing.');
      error.statusCode = 400;
      throw error;
    }

    const { bucket, publicBaseUrl, region } = getRequiredConfig(env);
    const key = createS3ObjectKey({
      category,
      meetingId,
      originalName: file.originalname,
    });

    try {
      await s3Client.send(
        new PutObjectCommand({
          Body: file.buffer,
          Bucket: bucket,
          ContentLength: file.size,
          ContentType: file.mimetype || 'application/octet-stream',
          Key: key,
          Metadata: {
            originalfilename: file.originalname || '',
            meetingid: normalizeMeetingId(meetingId) || '',
          },
        }),
      );
    } catch (cause) {
      const error = new Error('Could not upload file to S3. Please try again.');
      error.statusCode = 502;
      error.cause = cause;
      throw error;
    }

    const publicUrl = buildS3PublicUrl({ bucket, key, publicBaseUrl, region });

    return {
      bucket,
      fileUrl: publicUrl,
      publicUrl,
      s3Key: key,
      storageProvider: 's3',
    };
  }

  return {
    uploadRecordingToS3({ file, meetingId }) {
      return uploadBuffer({ category: 'recordings', file, meetingId });
    },
    uploadSharedFileToS3({ file, meetingId }) {
      return uploadBuffer({ category: 'files', file, meetingId });
    },
  };
}

const uploader = createS3Uploader();

export function uploadSharedFileToS3(options) {
  return uploader.uploadSharedFileToS3(options);
}

export function uploadRecordingToS3(options) {
  return uploader.uploadRecordingToS3(options);
}

export async function createSignedDownloadUrl({ expiresIn = 3600, key }) {
  const { bucket } = getRequiredConfig();
  const client = createDefaultClient();

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn },
  );
}
