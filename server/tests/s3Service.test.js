import {
  buildS3PublicUrl,
  createS3ObjectKey,
  createS3Uploader,
} from '../src/services/s3Service.js';

describe('s3Service', () => {
  it('creates normalized object keys for meeting uploads', () => {
    const key = createS3ObjectKey({
      category: 'files',
      meetingId: 'abc-123-xyz',
      originalName: 'Quarterly Plan (Final).PDF',
      timestamp: 123,
    });

    expect(key).toBe('vync/meetings/ABC-123-XYZ/files/123-Quarterly-Plan-Final.pdf');
  });

  it('builds public URLs with encoded object key segments', () => {
    const url = buildS3PublicUrl({
      bucket: 'vync-uploads',
      key: 'vync/meetings/ABC-123-XYZ/files/123-demo file.pdf',
      region: 'us-east-1',
    });

    expect(url).toBe(
      'https://vync-uploads.s3.us-east-1.amazonaws.com/vync/meetings/ABC-123-XYZ/files/123-demo%20file.pdf',
    );
  });

  it('uploads through a mocked S3 client and returns compatible metadata', async () => {
    const sentCommands = [];
    const uploader = createS3Uploader({
      env: {
        AWS_REGION: 'us-east-1',
        AWS_S3_BUCKET: 'vync-uploads',
        AWS_S3_PUBLIC_BASE_URL: 'https://cdn.example.test',
      },
      s3Client: {
        async send(command) {
          sentCommands.push(command);
          return {};
        },
      },
    });

    const result = await uploader.uploadSharedFileToS3({
      file: {
        buffer: Buffer.from('hello'),
        mimetype: 'application/pdf',
        originalname: 'deck.pdf',
        size: 5,
      },
      meetingId: 'abc-123-xyz',
    });

    expect(sentCommands).toHaveLength(1);
    expect(sentCommands[0].input.Bucket).toBe('vync-uploads');
    expect(sentCommands[0].input.ContentType).toBe('application/pdf');
    expect(sentCommands[0].input.Metadata.originalfilename).toBe('deck.pdf');
    expect(result.storageProvider).toBe('s3');
    expect(result.bucket).toBe('vync-uploads');
    expect(result.s3Key).toMatch(/^vync\/meetings\/ABC-123-XYZ\/files\/\d+-deck\.pdf$/);
    expect(result.fileUrl).toMatch(/^https:\/\/cdn\.example\.test\/vync\/meetings\/ABC-123-XYZ\/files\/\d+-deck\.pdf$/);
  });
});
