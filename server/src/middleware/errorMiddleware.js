export function notFound(req, res, next) {
  const error = new Error(`Not found - ${req.originalUrl}`);
  res.status(404);
  next(error);
}

export function errorHandler(error, req, res, next) {
  let statusCode = error.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);
  let message = error.message;

  if (error.code === 11000) {
    statusCode = 409;
    if (error.keyPattern?.email) {
      message = 'Email is already registered';
    } else if (error.keyPattern?.meetingId) {
      message = 'A meeting with that ID already exists';
    } else {
      message = 'Duplicate field value entered';
    }
  } else if (error instanceof SyntaxError && error.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Request body contains invalid JSON';
  } else if (error.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(error.errors)
      .map((validationError) => validationError.message)
      .join(', ');
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid request data';
  } else if (error.code === 'LIMIT_FILE_SIZE') {
    const uploadLimit = req.originalUrl?.includes('/recordings/') ? '500 MB' : '25 MB';
    statusCode = 413;
    message = `File is too large. Maximum upload size is ${uploadLimit}.`;
  } else if (
    error.name === 'MongooseError' &&
    /buffering timed out|server selection timed out/i.test(error.message)
  ) {
    statusCode = 503;
    message = 'Database is not reachable. Check the MongoDB connection and try again.';
  }

  if (statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).json({
    error: statusCode >= 500 ? 'server_error' : 'request_error',
    message,
    stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
  });
}
