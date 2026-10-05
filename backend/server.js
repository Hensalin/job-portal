import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/authRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import applicationRoutes from './routes/applicationRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import companyRoutes from './routes/companyRoutes.js';
import resumeRoutes from './routes/resumeRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

dotenv.config();

/**
 * CHECK THE ENV BEFORE DOING ANY WORK.
 *
 * WHY: a missing or misspelled variable does not fail here - it fails much
 * later as "Invalid path specified in request URL" or "Profile not found",
 * which looks like a database bug. One check at startup turns a two-hour
 * mystery into a two-second fix.
 */
const envProblems = [];

if (!process.env.SUPABASE_URL) {
  envProblems.push('SUPABASE_URL is missing from backend/.env');
} else if (/\/rest\/v1\/?$/.test(process.env.SUPABASE_URL)) {
  // supabase-js appends /rest/v1 itself. If we pass it in the URL, requests go
  // to /rest/v1/rest/v1/... and Supabase answers "Invalid path specified".
  envProblems.push(
    'SUPABASE_URL must NOT end in /rest/v1 or a trailing slash.\n' +
    '     It should look like: https://xxxxxxxx.supabase.co'
  );
} else if (/\/$/.test(process.env.SUPABASE_URL)) {
  envProblems.push('SUPABASE_URL must NOT end in a trailing slash.');
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  envProblems.push('SUPABASE_SERVICE_ROLE_KEY is missing from backend/.env');
}

if (envProblems.length) {
  console.error('\n  ENVIRONMENT PROBLEMS:\n');
  for (const p of envProblems) console.error(`   - ${p}`);
  console.error(
    '\n  Copy backend/.env.example to backend/.env and fill it in.\n' +
    '  Project URL and service-role key: Supabase dashboard -> your project\n' +
    '  -> Project Settings -> API.\n\n'
  );
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');

// ---------------------------------------------------------------- CORS
// Accept a comma-separated list of allowed origins so 127.0.0.1 and
// localhost both work in development.
const ALLOWED_ORIGINS = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',').map((s) => s.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // no Origin header = curl/Postman/server-to-server, which is fine
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ---------------------------------------------------------------- body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ---------------------------------------------------------------- file uploads
// multer is applied per-route (see middleware/upload.js) so only the resume
// endpoint accepts multipart bodies. Everything else stays pure JSON.

// ---------------------------------------------------------------- routes
app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

// ---------------------------------------------------------------- errors
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = Number(process.env.PORT || 5000);

const server = app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
  console.log(`CORS origins: ${ALLOWED_ORIGINS.join(', ')}`);
});

/**
 * FRIENDLY FAILURES.
 *
 * WHY THIS MATTERS: without these handlers Node prints a raw stack trace and
 * the message ("address already in use") is buried 30 lines down. A beginner
 * cannot tell that the real problem is "another terminal is already running
 * the backend". These handlers say what went wrong AND what to do.
 */

/** Port already taken - almost always a second backend started by mistake. */
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n  CANNOT START: port ${PORT} is already in use.\n\n` +
      `  Something else is already listening there - usually a second copy of\n` +
      `  this backend that you forgot about.\n\n` +
      `  1. Find it:   netstat -ano | findstr :${PORT}\n` +
      `  2. Note the PID (the last column).\n` +
      `  3. Stop it:   taskkill /PID <pid> /F\n\n` +
      `  Then start this one again.\n`
    );
    process.exit(1);
  }

  if (err.code === 'EACCES') {
    console.error(
      `\n  CANNOT START: not allowed to use port ${PORT}.\n` +
      `  Ports below 1024 need Administrator rights. Use 5000 or higher,\n` +
      `  or run the terminal as Administrator.\n`
    );
    process.exit(1);
  }

  console.error('\n  Server failed to start:\n', err, '\n');
  process.exit(1);
});

/**
 * A crash in a request handler is already caught by errorHandler. Reaching
 * here means something failed OUTSIDE the request/response cycle (a bad
 * import, a typo at startup). Log it clearly instead of dumping a bare stack.
 */
process.on('uncaughtException', (err) => {
  console.error('\n  UNCAUGHT EXCEPTION - the server hit a bug:\n', err, '\n');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('\n  UNHANDLED PROMISE REJECTION - a request probably failed silently:\n', reason, '\n');
});

export default app;