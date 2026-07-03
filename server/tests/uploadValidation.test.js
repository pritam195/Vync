import {
  createFileFilter,
  isAllowedRecordingFile,
  isAllowedSharedFile,
  RECORDING_SIZE_LIMIT,
  safeFileName,
  SHARED_FILE_SIZE_LIMIT,
} from '../src/utils/uploadValidation.js';
import {
  buildRecordingDocument,
  buildSharedFileDocument,
} from '../src/services/uploadMetadata.js';

describe('upload validation', () => {
  it('accepts supported shared files only when extension and MIME type match', () => {
    expect(isAllowedSharedFile({ originalname: 'deck.pdf', mimetype: 'application/pdf' })).toBe(true);
    expect(isAllowedSharedFile({ originalname: 'deck.pdf', mimetype: 'image/png' })).toBe(false);
    expect(isAllowedSharedFile({ originalname: 'script.exe', mimetype: 'application/pdf' })).toBe(false);
  });

  it('rejects unsupported recording MIME types', () => {
    expect(isAllowedRecordingFile({ originalname: 'meeting.webm', mimetype: 'video/webm' })).toBe(true);
    expect(isAllowedRecordingFile({ originalname: 'meeting.webm', mimetype: 'application/pdf' })).toBe(false);
  });

  it('returns a 400 validation error for invalid MIME types', async () => {
    const fileFilter = createFileFilter({
      isAllowed: isAllowedSharedFile,
      message: 'Unsupported file type. Upload a PDF, PPT, DOC, or image file.',
    });

    await new Promise((resolve) => {
      fileFilter(
        {},
        { originalname: 'malware.exe', mimetype: 'application/octet-stream' },
        (error) => {
          expect(error.statusCode).toBe(400);
          expect(error.message).toBe('Unsupported file type. Upload a PDF, PPT, DOC, or image file.');
          resolve();
        },
      );
    });
  });

  it('keeps upload size limits unchanged', () => {
    expect(SHARED_FILE_SIZE_LIMIT).toBe(25 * 1024 * 1024);
    expect(RECORDING_SIZE_LIMIT).toBe(500 * 1024 * 1024);
  });

  it('generates safe filenames', () => {
    expect(safeFileName('../../Quarterly Plan (Final).PDF')).toBe('Quarterly-Plan-Final.pdf');
  });
});

describe('upload metadata', () => {
  it('builds successful shared file metadata without changing the API fileUrl field', () => {
    const document = buildSharedFileDocument({
      file: {
        mimetype: 'application/pdf',
        originalname: 'deck.pdf',
        size: 1234,
      },
      meetingId: 'ABC-123-XYZ',
      storageResult: {
        bucket: 'vync-uploads',
        fileUrl: 'https://cdn.example.test/vync/meetings/ABC-123-XYZ/files/1-deck.pdf',
        publicUrl: 'https://cdn.example.test/vync/meetings/ABC-123-XYZ/files/1-deck.pdf',
        s3Key: 'vync/meetings/ABC-123-XYZ/files/1-deck.pdf',
        storageProvider: 's3',
      },
      uploadedBy: { name: 'Ada', socketId: 'socket-1', userId: 'user-1' },
    });

    expect(document.fileUrl).toBe('https://cdn.example.test/vync/meetings/ABC-123-XYZ/files/1-deck.pdf');
    expect(document.fileName).toBe('deck.pdf');
    expect(document.fileType).toBe('application/pdf');
    expect(document.size).toBe(1234);
    expect(document.storageProvider).toBe('s3');
    expect(document.s3Key).toBe('vync/meetings/ABC-123-XYZ/files/1-deck.pdf');
  });

  it('normalizes recording duration metadata', () => {
    const document = buildRecordingDocument({
      durationSeconds: '-10',
      file: {
        mimetype: 'video/webm',
        originalname: 'meeting.webm',
        size: 2048,
      },
      meetingId: 'ABC-123-XYZ',
      recordedBy: { name: 'Ada', socketId: 'socket-1', userId: 'user-1' },
      storageResult: {
        fileUrl: '/uploads/recordings/ABC-123-XYZ/1-meeting.webm',
        storageProvider: 'local',
      },
    });

    expect(document.durationSeconds).toBe(0);
    expect(document.fileUrl).toBe('/uploads/recordings/ABC-123-XYZ/1-meeting.webm');
  });
});
