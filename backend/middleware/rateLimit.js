/**
 * In-memory rate limiter. Good enough for a single-process Node server.
 * For multiple instances you would need a shared store (Redis).
 */
const buckets = new Map();

export function rateLimit({ windowMs = 60_000, max = 30, key = 'default', message } = {}) {
  return (req, res, next) => {
    const id = `${key}:${req.ip}`;
    const now = Date.now();
    const bucket = buckets.get(id);

    if (!bucket || now > bucket.resetAt) {
      buckets.set(id, { count: 1, resetAt: now + windowMs });
      res.set('X-RateLimit-Limit', String(max));
      return next();
    }

    bucket.count += 1;
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));

    if (bucket.count > max) {
      const secs = Math.ceil((bucket.resetAt - now) / 1000);
      res.set('Retry-After', String(secs));
      return res.status(429).json({
        error: message || `Too many attempts. Please try again in ${secs}s.`,
        code: 'RATE_LIMITED',
      });
    }
    return next();
  };
}

// Stop the map growing forever.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
}, 60_000);
sweeper.unref();

/** Test helper: clear all counters. */
export function _resetRateLimits() {
  buckets.clear();
}