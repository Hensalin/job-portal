/**
 * Typed API errors so every response has the same shape:
 *   { "error": "human readable", "code": "MACHINE_CODE" }
 * Controllers throw these; errorHandler turns them into JSON.
 */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Invalid request.', details) {
    return new ApiError(400, 'VALIDATION_ERROR', message, details);
  }
  static unauthorized(message = 'Log in to continue.') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have permission to do this.') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Not found.') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message = 'That already exists.') {
    return new ApiError(409, 'CONFLICT', message);
  }
  static unprocessable(message = 'Could not process the request.', details) {
    return new ApiError(422, 'UNPROCESSABLE', message, details);
  }
  static tooMany(message = 'Too many requests. Please slow down.') {
    return new ApiError(429, 'RATE_LIMITED', message);
  }
  static internal(message = 'Something went wrong on the server.') {
    return new ApiError(500, 'INTERNAL_ERROR', message);
  }
}