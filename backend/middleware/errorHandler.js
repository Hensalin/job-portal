import { ApiError } from '../utils/ApiError.js';

export function notFoundHandler(_req, _res, next) {
  next(ApiError.notFound('Route not found.'));
}

/**
 * Single place where every error becomes a consistent JSON response:
 *   { error: "...", code: "...", details?: { field: "message" } }
 */
// eslint-disable-next-line no-unused-vars -- Express needs the 4-arg signature
export function errorHandler(err, _req, res, _next) {
  // 1. Malformed JSON body -> 400, not 500.
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({
      error: 'Malformed JSON in request body.',
      code: 'INVALID_JSON',
    });
  }

  // 2. Body too large.
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.', code: 'PAYLOAD_TOO_LARGE' });
  }

  // 3. Postgres unique violation -> 409 (duplicate application, duplicate email).
  if (err?.code === '23505') {
    return res.status(409).json({
      error: 'That record already exists.',
      code: 'CONFLICT',
    });
  }

  // 4. Postgres foreign key / check-constraint violations.
  if (err?.code === '23503') {
    return res.status(400).json({ error: 'Referenced record does not exist.', code: 'BAD_REFERENCE' });
  }
  if (err?.code === '23514') {
    return res.status(400).json({ error: 'That value is not allowed.', code: 'CHECK_VIOLATION' });
  }

  // 5. PostgREST "no rows returned" from .single()
  if (err?.code === 'PGRST116') {
    return res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' });
  }

  // 6. An ApiError we threw ourselves.
  if (err instanceof ApiError) {
    const body = { error: err.message, code: err.code };
    // Field-level details only in dev, so internals never leak in production.
    if (err.details && process.env.NODE_ENV !== 'production') body.details = err.details;
    return res.status(err.status).json(body);
  }

  // 7. CORS rejection.
  if (/not allowed by CORS/i.test(err?.message || '')) {
    return res.status(403).json({ error: 'This origin is not allowed.', code: 'CORS_DENIED' });
  }

  // 8. Anything unexpected: log it, but never show it to the user.
  console.error('[unhandled]', err);
  return res.status(500).json({ error: 'Something went wrong on the server.', code: 'INTERNAL_ERROR' });
}

/** Wraps an async route handler so rejected promises reach errorHandler. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);