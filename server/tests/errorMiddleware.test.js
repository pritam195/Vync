import { errorHandler } from '../src/middleware/errorMiddleware.js';

function createResponse() {
  return {
    body: null,
    statusCode: 200,
    json(payload) {
      this.body = payload;
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
  };
}

describe('errorMiddleware', () => {
  it('returns normalized JSON for oversized shared file uploads', () => {
    const error = new Error('File too large');
    error.code = 'LIMIT_FILE_SIZE';
    const req = { originalUrl: '/api/files/upload/ABC-123-XYZ' };
    const res = createResponse();

    errorHandler(error, req, res, () => {});

    expect(res.statusCode).toBe(413);
    expect(res.body.error).toBe('request_error');
    expect(res.body.message).toBe('File is too large. Maximum upload size is 25 MB.');
  });

  it('returns normalized JSON for oversized recording uploads', () => {
    const error = new Error('File too large');
    error.code = 'LIMIT_FILE_SIZE';
    const req = { originalUrl: '/api/recordings/upload/ABC-123-XYZ' };
    const res = createResponse();

    errorHandler(error, req, res, () => {});

    expect(res.statusCode).toBe(413);
    expect(res.body.error).toBe('request_error');
    expect(res.body.message).toBe('File is too large. Maximum upload size is 500 MB.');
  });
});
